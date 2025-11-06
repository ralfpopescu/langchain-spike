import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { addNodeTool, AddNodeArgsSchema, AddNodeArgs } from "./tools/addNode.js";
import { pubsub, topics } from "./pubsub.js";
import { appendMessage, listMessages } from "./store.js";

const SYSTEM_PROMPT = `You are a UI builder assistant. You chat with the user and can add HTML nodes using the add_node tool to build an HTML document seen by the user. 
Rules:
- Only use the add_node tool to modify the document. It appends to <body>.
- Keep nodes small and incremental so the user can see progress.
- Prefer semantic tags. Include helpful attributes like class or id when useful.
- When done, reply with a short summary of what was built.`;

function createAddNodeTool(sessionId: string) {
  const tool = new DynamicStructuredTool({
    name: "add_node",
    description: "Append an HTML element to the end of the <body> of the current document. Use for adding UI elements. Accepts tag, optional text, and attributes.",
    schema: AddNodeArgsSchema,
    func: async (input: AddNodeArgs): Promise<string> => {
      console.log(`[${new Date().toISOString()}] 🔧 Tool called: add_node (session: ${sessionId})`);
      console.log(`[${new Date().toISOString()}] 🔧 Tool args:`, JSON.stringify(input, null, 2));
      const result = await addNodeTool(sessionId, input);
      console.log(`[${new Date().toISOString()}] 🔧 Tool result: index=${result.index}, html=${result.html.substring(0, 50)}...`);
      return JSON.stringify({ ok: true, index: result.index });
    },
  });
  return tool;
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

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", SYSTEM_PROMPT],
    new MessagesPlaceholder("chat_history"),
    ["human", "{input}"],
    new MessagesPlaceholder("agent_scratchpad"),
  ]);

  const agent = await createToolCallingAgent({ llm: model, tools, prompt });

  console.log(`[${new Date().toISOString()}] 🔧 Available tools:`, tools.map(t => t.name));

  const executor = new AgentExecutor({
    agent,
    tools,
    maxIterations: 25,
    returnIntermediateSteps: true,
    verbose: true, // Enable verbose logging
  });

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

  console.log(`[${new Date().toISOString()}] 🔄 Executing LLM agent (session: ${sessionId}, history length: ${history.length})`);
  console.log(`[${new Date().toISOString()}] 📋 Chat history:`, JSON.stringify(history, null, 2));

  // Execute agent with streaming callbacks
  console.log(`[${new Date().toISOString()}] ⏳ Starting agent execution...`);

  // Track LLM call state to distinguish tool-planning from final response
  let currentLLMStart: any = null;
  let hasToolCalls = false;

  let result;
  try {
    result = await executor.invoke(
      {
        input: userInput,
        chat_history: history,
      },
      {
        callbacks: [
          {
            handleLLMStart: async (llm, prompts, runId) => {
              // Track start of new LLM call
              currentLLMStart = { runId, hasStreamedTokens: false };
              console.log(`[${new Date().toISOString()}] 🤖 LLM call started (runId: ${runId})`);
            },
            handleLLMEnd: async (output, runId) => {
              // Check if this LLM call resulted in tool calls
              const hasToolCallsInOutput = output?.generations?.[0]?.[0]?.message?.additional_kwargs?.tool_calls;
              if (hasToolCallsInOutput) {
                hasToolCalls = true;
                console.log(`[${new Date().toISOString()}] 🔧 LLM call ended with tool calls (runId: ${runId})`);
              } else {
                console.log(`[${new Date().toISOString()}] ✅ LLM call ended without tool calls (runId: ${runId})`);
              }
              currentLLMStart = null;
            },
            handleAgentAction: async (action) => {
              console.log(`[${new Date().toISOString()}] 🔧 Agent executing tool: ${action.tool}`);
            },
            handleToolEnd: async (output) => {
              console.log(`[${new Date().toISOString()}] 🔧 Tool completed, output length: ${output.length}`);
            },
            handleLLMNewToken: async (token) => {
              // Stream all tokens - OpenAI function calling returns either:
              // - Tool calls (no content tokens, or minimal/structured tokens we can filter)
              // - Text response (content tokens we want to stream)
              // We'll stream everything and let the natural flow work
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
      }
    );

    console.log(`[${new Date().toISOString()}] ⏳ Agent execution completed`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Agent execution error:`, error);
    throw error;
  }

  console.log(`[${new Date().toISOString()}] 🔍 Raw result object:`, JSON.stringify(result, null, 2));

  // Log intermediate steps if available
  if (result.intermediateSteps && result.intermediateSteps.length > 0) {
    console.log(`[${new Date().toISOString()}] 🔧 Intermediate steps count: ${result.intermediateSteps.length}`);
    result.intermediateSteps.forEach((step: any, idx: number) => {
      console.log(`[${new Date().toISOString()}] 🔧 Step ${idx + 1}: action=${step.action?.tool}, output=${JSON.stringify(step.observation).substring(0, 100)}`);
    });
  }

  const content = typeof result.output === "string" ? result.output : JSON.stringify(result.output);
  console.log(`[${new Date().toISOString()}] ✅ LLM call completed (session: ${sessionId}, total tokens: ${tokenCount})`);
  console.log(`[${new Date().toISOString()}] 📥 All accumulated tokens: "${allTokens}"`);
  console.log(`[${new Date().toISOString()}] 📤 LLM response content type: ${typeof content}, length: ${content?.length || 0}`);
  console.log(`[${new Date().toISOString()}] 📤 LLM response: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`);

  appendMessage(sessionId, { sessionId, role: "MODEL", content });
  await pubsub.publish(topics.modelMessageCompleted(sessionId), { modelMessageCompleted: { done: true } });

  return content;
}
