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

Tools must conform to the `AgentTool` interface with a **Zod schema**:

```typescript
import { z } from "zod";

interface AgentTool<TInput = any> {
  name: string;
  description: string;
  schema: z.ZodType<TInput>; // Zod schema for input validation
  func: (input: TInput) => Promise<string>;
}
```

### Why Zod?

Using Zod schemas provides:
- **Type safety**: TypeScript types are inferred from the schema
- **Runtime validation**: Input is validated before execution
- **Framework compatibility**: Both LangChain and LangGraph accept Zod schemas natively
- **Single source of truth**: Schema defines both types and validation rules

### Example Tool Definition

```typescript
import { z } from "zod";

const AddNodeSchema = z.object({
  tag: z.string().min(1).describe("HTML tag name"),
  text: z.string().optional().describe("Text content"),
  attributes: z.record(z.string()).optional().describe("HTML attributes"),
});

type AddNodeInput = z.infer<typeof AddNodeSchema>;

const addNodeTool: AgentTool<AddNodeInput> = {
  name: "add_node",
  description: "Append an HTML element to the document body",
  schema: AddNodeSchema,
  func: async (input) => {
    // input is typed as AddNodeInput
    const html = `<${input.tag}>${input.text || ""}</${input.tag}>`;
    return JSON.stringify({ success: true, html });
  },
};
```

### Framework Translation

Each wrapper automatically translates the Zod schema to the framework's format:

- **LangChain**: `DynamicStructuredTool` accepts Zod schemas directly
- **LangGraph**: Tools use Zod schemas for parameter validation

No manual conversion is needed - just provide the Zod schema!

