import { ChatOpenAI } from "@langchain/openai";
import { StateGraph, MessagesAnnotation, START, END } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { addNodeTool, AddNodeArgsSchema, AddNodeArgs } from "./tools/addNode.js";
import { pubsub, topics } from "./pubsub.js";
import { appendMessage, listMessages } from "./store.js";

const SYSTEM_PROMPT = `You are a UI builder assistant. You chat with the user and can add HTML nodes using the add_node tool to build an HTML document seen by the user. 
Rules:
- Only use the add_node tool to modify the document. It appends to <body>.
- Keep nodes small and incremental so the user can see progress.
- Prefer semantic tags. Include helpful attributes like class or id when useful.
- When done, reply with a short summary of what was built.`;

function createAddNodeTool(sessionId: string): any {
  return {
    name: "add_node",
    description: "Append an HTML element to the end of the <body> of the current document. Use for adding UI elements. Accepts tag, optional text, and attributes.",
    schema: AddNodeArgsSchema,
    invoke: async (input: AddNodeArgs) => {
      console.log(`[${new Date().toISOString()}] 🔧 Tool called: add_node (session: ${sessionId})`);
      console.log(`[${new Date().toISOString()}] 🔧 Tool args:`, JSON.stringify(input, null, 2));
      const result = await addNodeTool(sessionId, input);
      console.log(`[${new Date().toISOString()}] 🔧 Tool result: index=${result.index}, html=${result.html.substring(0, 50)}...`);
      return JSON.stringify({ ok: true, index: result.index });
    },
    call: async function (input: string) {
      const parsed = JSON.parse(input);
      return this.invoke(parsed);
    },
  };
}

export async function runAgentStreaming(sessionId: string, userInput: string) {
  let tokenCount = 0;
  let allTokens = "";

  const model = new ChatOpenAI({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0,
    streaming: true,
  });

  const tools = [createAddNodeTool(sessionId)];
  console.log(`[${new Date().toISOString()}] 🔧 Available tools:`, tools.map(t => t.name));

  // Bind tools to the model
  const modelWithTools = model.bindTools(tools);

  // Get all messages EXCEPT the current user input (which is passed separately as 'input')
  // The current message was already appended to the store before this function was called
  const allMessages = listMessages(sessionId);
  const history = allMessages
    .slice(0, -1) // Exclude the last message (current user input)
    .map((m) =>
      m.role === "USER"
        ? new HumanMessage(m.content)
        : new AIMessage(m.content)
    );

  console.log(`[${new Date().toISOString()}] 🔄 Executing LangGraph agent (session: ${sessionId}, history length: ${history.length})`);
  console.log(`[${new Date().toISOString()}] 📋 Chat history:`, JSON.stringify(history, null, 2));

  // Define the function that calls the model
  const callModel = async (state: typeof MessagesAnnotation.State) => {
    const systemMessage = new SystemMessage(SYSTEM_PROMPT);
    const messages = [systemMessage, ...state.messages];

    console.log(`[${new Date().toISOString()}] 🤖 Calling model with ${messages.length} messages`);

    const response = await modelWithTools.invoke(messages, {
      callbacks: [
        {
          handleLLMNewToken: async (token: string) => {
            tokenCount++;
            allTokens += token;
            console.log(`[${new Date().toISOString()}] 🔄 Token #${tokenCount}: "${token}"`);

            // Publish token to subscription
            await pubsub.publish(topics.messageDelta(sessionId), {
              messageDelta: { contentDelta: token },
            });
          },
        },
      ],
    });

    console.log(`[${new Date().toISOString()}] 🤖 Model response:`, JSON.stringify(response, null, 2));
    return { messages: [response] };
  };

  // Define the conditional edge logic
  const shouldContinue = (state: typeof MessagesAnnotation.State) => {
    const lastMessage = state.messages[state.messages.length - 1];
    console.log(`[${new Date().toISOString()}] 🔀 Checking if should continue. Last message type:`, lastMessage._getType());

    // If the LLM makes a tool call, then we route to the "tools" node
    if (lastMessage._getType() === "ai" && "tool_calls" in lastMessage) {
      const aiMessage = lastMessage as AIMessage;
      if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
        console.log(`[${new Date().toISOString()}] 🔀 Routing to tools node (${aiMessage.tool_calls.length} tool calls)`);
        return "tools";
      }
    }
    // Otherwise, we stop (reply to the user)
    console.log(`[${new Date().toISOString()}] 🔀 Routing to END`);
    return END;
  };

  // Create the graph
  const workflow = new StateGraph(MessagesAnnotation)
    .addNode("agent", callModel)
    .addNode("tools", new ToolNode(tools))
    .addEdge(START, "agent")
    .addConditionalEdges("agent", shouldContinue)
    .addEdge("tools", "agent");

  const graph = workflow.compile();

  console.log(`[${new Date().toISOString()}] ⏳ Starting LangGraph execution...`);

  try {
    // Initialize state with chat history and new user input
    const initialMessages = [...history, new HumanMessage(userInput)];

    const result = await graph.invoke({
      messages: initialMessages,
    });

    console.log(`[${new Date().toISOString()}] ⏳ LangGraph execution completed`);
    console.log(`[${new Date().toISOString()}] 🔍 Raw result:`, JSON.stringify(result, null, 2));

    // Extract the final AI response
    const finalMessages = result.messages;
    const lastAIMessage = [...finalMessages].reverse().find((m: BaseMessage) => m._getType() === "ai");

    const content = lastAIMessage?.content?.toString() || "";

    console.log(`[${new Date().toISOString()}] ✅ LLM call completed (session: ${sessionId}, total tokens: ${tokenCount})`);
    console.log(`[${new Date().toISOString()}] 📥 All accumulated tokens: "${allTokens}"`);
    console.log(`[${new Date().toISOString()}] 📤 LLM response content type: ${typeof content}, length: ${content?.length || 0}`);
    console.log(`[${new Date().toISOString()}] 📤 LLM response: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`);

    appendMessage(sessionId, { sessionId, role: "MODEL", content });
    await pubsub.publish(topics.modelMessageCompleted(sessionId), { modelMessageCompleted: { done: true } });

    return content;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ LangGraph execution error:`, error);
    throw error;
  }
}
