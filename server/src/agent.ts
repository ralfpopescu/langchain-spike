/**
 * Main agent module - uses the abstracted agent wrapper
 */

import { createAgent, type AgentFramework, type AgentTool } from "./agents/index.js";
import { addNodeTool, AddNodeArgsSchema, AddNodeArgs } from "./tools/addNode.js";
import { pubsub, topics } from "./pubsub.js";
import { appendMessage, listMessages } from "./store.js";

// Configuration - change this to switch between frameworks
const AGENT_FRAMEWORK: AgentFramework = (process.env.AGENT_FRAMEWORK as AgentFramework) || "langgraph";

const SYSTEM_PROMPT = `You are a UI builder assistant. You chat with the user and can add HTML nodes using the add_node tool to build an HTML document seen by the user. 
Rules:
- Only use the add_node tool to modify the document. It appends to <body>.
- Keep nodes small and incremental so the user can see progress.
- Prefer semantic tags. Include helpful attributes like class or id when useful.
- When done, reply with a short summary of what was built.`;

function createAddNodeTool(sessionId: string): AgentTool<AddNodeArgs> {
  return {
    name: "add_node",
    description: "Append an HTML element to the end of the <body> of the current document. Use for adding UI elements. Accepts tag, optional text, and attributes.",
    schema: AddNodeArgsSchema, // Zod schema
    func: async (input: AddNodeArgs) => {
      console.log(`[${new Date().toISOString()}] 🔧 Tool called: add_node (session: ${sessionId})`);
      console.log(`[${new Date().toISOString()}] 🔧 Tool args:`, JSON.stringify(input, null, 2));
      const result = await addNodeTool(sessionId, input);
      console.log(`[${new Date().toISOString()}] 🔧 Tool result: index=${result.index}, html=${result.html.substring(0, 50)}...`);
      return JSON.stringify({ ok: true, index: result.index });
    },
  };
}

export async function runAgentStreaming(sessionId: string, userInput: string) {
  let tokenCount = 0;
  let allTokens = "";

  console.log(`[${new Date().toISOString()}] 🤖 Using ${AGENT_FRAMEWORK} framework`);

  // Create agent with the configured framework
  const agent = createAgent({
    framework: AGENT_FRAMEWORK,
    systemPrompt: SYSTEM_PROMPT,
    tools: [createAddNodeTool(sessionId)],
  });

  // Get chat history (excluding the current user input which was already appended)
  const allMessages = listMessages(sessionId);
  const chatHistory = allMessages
    .slice(0, -1)
    .map((m) => ({
      role: m.role,
      content: m.content,
    }));

  console.log(`[${new Date().toISOString()}] 🔄 Executing ${AGENT_FRAMEWORK} agent (session: ${sessionId}, history length: ${chatHistory.length})`);
  console.log(`[${new Date().toISOString()}] 📋 Chat history:`, JSON.stringify(chatHistory, null, 2));
  console.log(`[${new Date().toISOString()}] ⏳ Starting agent execution...`);

  try {
    const result = await agent.executeStreaming(userInput, chatHistory, {
      onToken: async (token: string) => {
        tokenCount++;
        allTokens += token;
        console.log(`[${new Date().toISOString()}] 🔄 Token #${tokenCount}: "${token}"`);

        // Publish token to subscription
        await pubsub.publish(topics.messageDelta(sessionId), {
          messageDelta: { contentDelta: token },
        });
      },
      onComplete: async () => {
        console.log(`[${new Date().toISOString()}] ⏳ Agent execution completed`);
      },
    });

    const content = result.content;

    console.log(`[${new Date().toISOString()}] ✅ LLM call completed (session: ${sessionId}, total tokens: ${tokenCount})`);
    console.log(`[${new Date().toISOString()}] 📥 All accumulated tokens: "${allTokens}"`);
    console.log(`[${new Date().toISOString()}] 📤 LLM response content type: ${typeof content}, length: ${content?.length || 0}`);
    console.log(`[${new Date().toISOString()}] 📤 LLM response: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`);

    if (result.toolCalls && result.toolCalls.length > 0) {
      console.log(`[${new Date().toISOString()}] 🔧 Tool calls made: ${result.toolCalls.length}`);
      result.toolCalls.forEach((call, idx) => {
        console.log(`[${new Date().toISOString()}] 🔧 Tool call ${idx + 1}: ${call.name}`);
      });
    }

    appendMessage(sessionId, { sessionId, role: "MODEL", content });
    await pubsub.publish(topics.modelMessageCompleted(sessionId), { modelMessageCompleted: { done: true } });

    return content;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Agent execution error:`, error);
    throw error;
  }
}
