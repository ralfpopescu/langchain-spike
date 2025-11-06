import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import { AgentExecutor, createOpenAIFunctionsAgent } from "langchain/agents";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { addNodeTool, AddNodeArgsSchema } from "./tools/addNode.js";
import { pubsub, topics } from "./pubsub.js";
import { appendMessage, listMessages } from "./store.js";

const SYSTEM_PROMPT = `You are a UI builder assistant. You chat with the user and can add HTML nodes using the add_node tool to build an HTML document seen by the user. 
Rules:
- Only use the add_node tool to modify the document. It appends to <body>.
- Keep nodes small and incremental so the user can see progress.
- Prefer semantic tags. Include helpful attributes like class or id when useful.
- When done, reply with a short summary of what was built.`;

class AddNodeLangChainTool extends StructuredTool {
  name = "add_node" as const;
  description = "Append an HTML element to the end of the <body> of the current document. Use for adding UI elements. Accepts tag, optional text, and attributes.";
  schema = AddNodeArgsSchema;
  private sessionId: string;
  constructor(sessionId: string) {
    super();
    this.sessionId = sessionId;
  }
  async _call(input: z.infer<typeof AddNodeArgsSchema>): Promise<string> {
    console.log(`[${new Date().toISOString()}] 🔧 Tool called: add_node (session: ${this.sessionId})`);
    console.log(`[${new Date().toISOString()}] 🔧 Tool args:`, JSON.stringify(input, null, 2));
    const result = await addNodeTool(this.sessionId, input);
    console.log(`[${new Date().toISOString()}] 🔧 Tool result: index=${result.index}, html=${result.html.substring(0, 50)}...`);
    return JSON.stringify({ ok: true, index: result.index });
  }
}

export async function runAgentStreaming(sessionId: string, userInput: string) {
  let tokenCount = 0;
  let allTokens = "";

  const model = new ChatOpenAI({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0,
    streaming: true,
  });

  const tools = [new AddNodeLangChainTool(sessionId)];

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", SYSTEM_PROMPT],
    new MessagesPlaceholder("chat_history"),
    ["human", "{input}"],
    new MessagesPlaceholder("agent_scratchpad"),
  ]);

  const agent = await createOpenAIFunctionsAgent({ llm: model, tools, prompt });

  console.log(`[${new Date().toISOString()}] 🔧 Available tools:`, tools.map(t => t.name));

  const executor = new AgentExecutor({
    agent,
    tools,
    maxIterations: 25,
    returnIntermediateSteps: true, // Enable to see intermediate steps
  });

  const history = listMessages(sessionId).map((m) =>
    m.role === "USER"
      ? new HumanMessage(m.content)
      : new AIMessage(m.content)
  );

  console.log(`[${new Date().toISOString()}] 🔄 Executing LLM agent (session: ${sessionId}, history length: ${history.length})`);

  // Streamed model response will be emitted via callbacks.
  // When response completes, emit a completion event.
  const result = await executor.invoke(
    {
      input: userInput,
      chat_history: history,
    },
    {
      callbacks: [
        {
          handleLLMNewToken: async (token: string) => {
            tokenCount++;
            allTokens += token;
            console.log(`[${new Date().toISOString()}] 📥 Token #${tokenCount}: "${token}"`);
            if (tokenCount % 10 === 0) {
              console.log(`[${new Date().toISOString()}] 📥 Received ${tokenCount} tokens from LLM (session: ${sessionId})`);
              console.log(`[${new Date().toISOString()}] 📥 Accumulated text so far: "${allTokens}"`);
            }
            await pubsub.publish(topics.messageDelta(sessionId), { messageDelta: { contentDelta: token } });
          },
          handleLLMStart: async (llm: any, prompts: string[]) => {
            console.log(`[${new Date().toISOString()}] 🎬 LLM Start (session: ${sessionId})`);
          },
          handleLLMEnd: async (output: any) => {
            console.log(`[${new Date().toISOString()}] 🎬 LLM End (session: ${sessionId})`);
            console.log(`[${new Date().toISOString()}] 🎬 LLM End output:`, JSON.stringify(output, null, 2));
          },
          handleLLMError: async (err: Error) => {
            console.error(`[${new Date().toISOString()}] ❌ LLM Error (session: ${sessionId}):`, err);
          },
          handleToolStart: async (tool: any, input: string) => {
            console.log(`[${new Date().toISOString()}] 🔧 Tool START: ${tool.name}`);
            console.log(`[${new Date().toISOString()}] 🔧 Tool input:`, input);
          },
          handleToolEnd: async (output: string) => {
            console.log(`[${new Date().toISOString()}] 🔧 Tool END`);
            console.log(`[${new Date().toISOString()}] 🔧 Tool output:`, output);
          },
          handleToolError: async (err: Error) => {
            console.error(`[${new Date().toISOString()}] ❌ Tool Error:`, err);
          },
          handleAgentAction: async (action: any) => {
            console.log(`[${new Date().toISOString()}] 🤖 Agent Action:`, JSON.stringify(action, null, 2));
          },
          handleAgentEnd: async (action: any) => {
            console.log(`[${new Date().toISOString()}] 🤖 Agent End:`, JSON.stringify(action, null, 2));
          },
          handleChainStart: async (chain: any) => {
            console.log(`[${new Date().toISOString()}] 🔗 Chain Start (session: ${sessionId})`);
          },
          handleChainEnd: async (outputs: any) => {
            console.log(`[${new Date().toISOString()}] 🔗 Chain End (session: ${sessionId})`);
          },
          handleChainError: async (err: Error) => {
            console.error(`[${new Date().toISOString()}] ❌ Chain Error (session: ${sessionId}):`, err);
          },
        },
      ],
    }
  );

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
