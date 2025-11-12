/**
 * Agent factory and exports
 */

import { LangChainAgent } from "./langchain-agent.js";
import { LangGraphAgent } from "./langgraph-agent.js";
import type { AgentWrapper, AgentTool, AgentFramework } from "./types.js";

export * from "./types.js";

export interface CreateAgentOptions {
  framework: AgentFramework;
  systemPrompt: string;
  tools: AgentTool[];
  modelName?: string;
  temperature?: number;
  maxIterations?: number;
}

/**
 * Factory function to create an agent with the specified framework
 */
export function createAgent(options: CreateAgentOptions): AgentWrapper {
  const {
    framework,
    systemPrompt,
    tools,
    modelName = process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature = 0,
    maxIterations = 25,
  } = options;

  switch (framework) {
    case "langchain":
      return new LangChainAgent(
        systemPrompt,
        tools,
        modelName,
        temperature,
        maxIterations
      );
    
    case "langgraph":
      return new LangGraphAgent(
        systemPrompt,
        tools,
        modelName,
        temperature
      );
    
    default:
      throw new Error(`Unknown agent framework: ${framework}`);
  }
}

// Re-export implementations for direct use if needed
export { LangChainAgent } from "./langchain-agent.js";
export { LangGraphAgent } from "./langgraph-agent.js";

