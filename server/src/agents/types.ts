/**
 * Agent framework types and interfaces
 */

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

export interface AgentTool {
  name: string;
  description: string;
  schema: any;
  func: (input: any) => Promise<string>;
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

