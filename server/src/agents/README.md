# Agent Framework Abstraction

This directory contains an abstraction layer that allows switching between LangChain and LangGraph agent implementations without changing the core application logic.

## Architecture

```
agents/
├── types.ts              # Common interfaces and types
├── langchain-agent.ts    # LangChain implementation
├── langgraph-agent.ts    # LangGraph implementation
└── index.ts              # Factory function and exports
```

## Usage

### Basic Usage

```typescript
import { createAgent } from "./agents/index.js";

const agent = createAgent({
  framework: "langgraph", // or "langchain"
  systemPrompt: "You are a helpful assistant...",
  tools: [myTool],
  modelName: "gpt-4o-mini",
  temperature: 0,
});

const result = await agent.executeStreaming(
  "Build me a login form",
  chatHistory,
  {
    onToken: async (token) => {
      console.log("Token:", token);
    },
    onComplete: async () => {
      console.log("Done!");
    },
  }
);
```

### Switching Frameworks

Change the framework by setting an environment variable:

```bash
# Use LangGraph (default)
export AGENT_FRAMEWORK=langgraph

# Use LangChain
export AGENT_FRAMEWORK=langchain
```

Or pass it directly to the factory:

```typescript
const agent = createAgent({
  framework: "langchain", // Explicitly use LangChain
  // ... other options
});
```

## AgentWrapper Interface

Both implementations conform to the same `AgentWrapper` interface:

```typescript
interface AgentWrapper {
  executeStreaming(
    userInput: string,
    chatHistory: Array<{ role: "USER" | "MODEL"; content: string }>,
    callbacks: StreamingCallbacks
  ): Promise<AgentResponse>;
}
```

## Implementation Differences

### LangChain
- Uses `AgentExecutor` and `createToolCallingAgent`
- Returns detailed intermediate steps (tool calls)
- Traditional agent loop with explicit prompt templates
- Supports `maxIterations` configuration

### LangGraph
- Uses `StateGraph` with explicit nodes and edges
- More transparent agent flow with visual graph structure
- State-based architecture with `MessagesAnnotation`
- Better control over agent routing logic

## Adding a New Framework

To add a new framework implementation:

1. Create a new file (e.g., `my-framework-agent.ts`)
2. Implement the `AgentWrapper` interface
3. Add the framework to the `AgentFramework` type in `types.ts`
4. Update the factory function in `index.ts`

```typescript
// types.ts
export type AgentFramework = "langchain" | "langgraph" | "my-framework";

// index.ts
case "my-framework":
  return new MyFrameworkAgent(/* ... */);
```

## Tool Format

Tools must conform to the `AgentTool` interface:

```typescript
interface AgentTool {
  name: string;
  description: string;
  schema: ZodSchema; // Zod schema for validation
  func: (input: any) => Promise<string>;
}
```

Each framework implementation handles converting this generic format to its specific tool format.

