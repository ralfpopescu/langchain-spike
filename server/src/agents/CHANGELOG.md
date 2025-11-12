# Agent Framework Abstraction - Changelog

## v1.1.0 - Explicit Zod Schema Requirement

### Changes

#### `types.ts`
- **Updated `AgentTool` interface** to explicitly require `z.ZodType<TInput>` for schema
- Added generic type parameter `<TInput>` for better type inference
- Added JSDoc comments explaining Zod schema requirement
- Imported `z` type from `zod` package

```typescript
// Before (implicit any)
interface AgentTool {
  schema: any;
  func: (input: any) => Promise<string>;
}

// After (explicit Zod schema with generics)
interface AgentTool<TInput = any> {
  schema: z.ZodType<TInput>;
  func: (input: TInput) => Promise<string>;
}
```

#### `langchain-agent.ts`
- Added comment clarifying that LangChain's `DynamicStructuredTool` accepts Zod schemas directly
- No code changes needed - already compatible

#### `langgraph-agent.ts`
- Added comment clarifying that LangGraph tools accept Zod schemas natively
- No code changes needed - already compatible

#### `agent.ts`
- Updated `createAddNodeTool` return type from `AgentTool` to `AgentTool<AddNodeArgs>`
- Added inline comment marking schema as Zod schema

#### `agents/README.md`
- Expanded "Tool Format" section with detailed explanation of Zod requirement
- Added "Why Zod?" section explaining benefits
- Added comprehensive example of tool definition
- Added "Framework Translation" section explaining how each wrapper handles Zod schemas

### Benefits

1. **Type Safety**: TypeScript now enforces that schemas must be Zod schemas
2. **Better IntelliSense**: IDE can provide better autocomplete and type hints
3. **Clear Contracts**: Developers know exactly what's expected
4. **Runtime Validation**: Zod provides automatic input validation
5. **Framework Agnostic**: Both LangChain and LangGraph support Zod natively

### Migration

If you have existing tools:

```typescript
// ✅ Correct - Already using Zod
const myTool: AgentTool = {
  schema: z.object({ foo: z.string() }),
  func: async (input) => { /* ... */ }
};

// ❌ Wrong - Generic object schema
const badTool: AgentTool = {
  schema: { foo: "string" }, // Type error!
  func: async (input) => { /* ... */ }
};
```

### No Breaking Changes

All existing code continues to work since Zod schemas were already being used throughout the codebase. This change just makes the requirement explicit at the type level.

