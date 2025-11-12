/**
 * Agent framework types and interfaces
 */

import type { z } from "zod";

export type AgentFramework = "langchain" | "langgraph";

export interface AgentConfig {
  framework: AgentFramework;
  model?: string;
  temperature?: number;
  maxIterations?: number;
}

export interface StreamingCallbacks {
  onToken?: (token: string) => Promise<void>;
  onToolCall?: (toolName: string, args: any) => Promise<void>;
  onComplete?: () => Promise<void>;
}

/**
 * Tool definition with Zod schema for input validation
 * The schema will be translated to framework-specific formats by each wrapper
 */
export interface AgentTool<TInput = any> {
  name: string;
  description: string;
  schema: z.ZodType<TInput>;
  func: (input: TInput) => Promise<string>;
}

export interface AgentResponse {
  content: string;
  toolCalls?: Array<{
    name: string;
    args: any;
    result: string;
  }>;
}

/**
 * Common interface for both LangChain and LangGraph implementations
 */
export interface AgentWrapper {
  /**
   * Execute the agent with streaming support
   */
  executeStreaming(
    userInput: string,
    chatHistory: Array<{ role: "USER" | "MODEL"; content: string }>,
    callbacks: StreamingCallbacks
  ): Promise<AgentResponse>;
}

