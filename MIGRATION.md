# Migration Guide: Agent Framework Abstraction

This document explains the refactoring from a single LangGraph implementation to a pluggable framework abstraction.

## What Changed

### Before
The project was tightly coupled to LangGraph:
- `agent.ts` directly imported and used LangGraph's `StateGraph`
- No easy way to switch between different agent frameworks
- Agent implementation logic mixed with application logic

### After
Clean separation with framework abstraction:
- `agents/` directory contains all framework-specific code
- Common `AgentWrapper` interface for all implementations
- Factory function to create agents based on configuration
- Easy to add new frameworks in the future

## File Structure

```
server/src/
├── agent.ts                    # Main agent module (uses factory)
├── agents/
│   ├── types.ts               # Common interfaces and types
│   ├── langchain-agent.ts     # LangChain implementation
│   ├── langgraph-agent.ts     # LangGraph implementation
│   ├── index.ts               # Factory and exports
│   └── README.md              # Implementation docs
├── tools/
│   └── addNode.ts             # Tool implementation (unchanged)
└── ...
```

## Breaking Changes

### None for end users!
The GraphQL API and functionality remain identical. The abstraction is completely internal.

### For developers extending the code

If you were importing from `agent.ts` directly, you might need to update imports:

**Old:**
```typescript
import { runAgentStreaming } from "./agent.js";
```

**New (same):**
```typescript
import { runAgentStreaming } from "./agent.js"; // Still works!
```

**New (if you want to use the factory directly):**
```typescript
import { createAgent } from "./agents/index.js";

const agent = createAgent({
  framework: "langgraph",
  systemPrompt: "...",
  tools: [...],
});
```

## Configuration

Set the agent framework via environment variable:

```bash
# .env file or shell
AGENT_FRAMEWORK=langgraph  # or "langchain"
```

## Benefits

1. **Flexibility**: Switch frameworks without code changes
2. **Testing**: Test with different frameworks to compare performance
3. **Future-proof**: Easy to add new frameworks (e.g., AutoGen, CrewAI, etc.)
4. **Clean separation**: Framework code isolated from business logic
5. **Type safety**: Common interface ensures consistent behavior

## Adding a New Framework

See `server/src/agents/README.md` for instructions on adding support for additional frameworks.

## Rollback

If needed, you can always set `AGENT_FRAMEWORK=langgraph` (or `langchain`) to use a specific implementation. The default is `langgraph`.

