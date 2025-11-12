# GraphQL Streaming LLM Chat UI Builder

LLM-powered chat that incrementally builds and renders an HTML document via a single tool `add_node`. Apollo Server + Apollo Client with streaming over GraphQL subscriptions. Implemented in TypeScript with LangGraph.

## Features

- Streaming model tokens to the client via `messageDelta` subscription.
- Tool calls surfaced immediately as events (`STARTED` → `PROGRESS` → `COMPLETED`).
- `add_node` tool appends elements to `<body>` and streams `documentUpdated` events.
- **Pluggable agent framework**: Switch between LangChain and LangGraph implementations via configuration.
- Agent iterates tool calls in a loop until completion.

## Repo Layout

- `server/`: Apollo Server (TypeScript), GraphQL schema, agent abstraction layer, tool, in-memory store.
  - `src/agents/`: Abstraction layer supporting both LangChain and LangGraph implementations
  - `src/tools/`: Reusable tools (e.g., `add_node`)
- `web/`: Vite React app with Apollo Client; shows chat, tool events, and rendered document.

## Run Locally

1. Server
   - `cd server`
   - `npm install`
   - Set `OPENAI_API_KEY` in your environment. 
   - **Optional**: Set `AGENT_FRAMEWORK=langchain` or `AGENT_FRAMEWORK=langgraph` (defaults to `langgraph`)
   - **Optional**: Set `OPENAI_MODEL` (defaults to `gpt-4o-mini`)
   - `npm run dev`
   - GraphQL HTTP: `http://localhost:4000/graphql` (subscriptions on same path via `graphql-ws`).

2. Web
   - `cd ../web`
   - `npm install`
   - `npm run dev`
   - Open the printed local URL (e.g., `http://localhost:5173`).

## GraphQL Overview

- Query
  - `session(sessionId)` → session with messages and document
  - `document(sessionId)` → HTML body
  - `messages(sessionId)` → history
- Mutation
  - `ensureSession(sessionId?)` → returns a session ID (generated if not provided)
  - `sendMessage(sessionId, input)` → records user input and starts agent (streaming via subscriptions)
- Subscription
  - `messageDelta(sessionId)` → streamed model tokens
  - `toolEvent(sessionId)` → tool lifecycle events
  - `documentUpdated(sessionId)` → emitted when a node is appended
  - `modelMessageCompleted(sessionId)` → marks end of model turn

## Agent Framework

This project includes an abstraction layer that supports multiple AI agent frameworks:

- **LangGraph** (default): Modern state-based architecture with explicit graph nodes and edges
- **LangChain**: Traditional agent executor with prompt-based routing

Switch between frameworks by setting the `AGENT_FRAMEWORK` environment variable:

```bash
# Use LangGraph (default)
export AGENT_FRAMEWORK=langgraph
npm run dev

# Use LangChain
export AGENT_FRAMEWORK=langchain
npm run dev
```

Both implementations provide identical functionality and API. See `server/src/agents/README.md` for implementation details.

## Notes

- The tool strictly appends to `<body>`. Extend `add_node` to support parent selectors if needed.
- Storage is in-memory for simplicity; swap `store.ts` for a DB-backed implementation in production.
- Agent prompt nudges small, incremental changes to show progress.
- The agent wrapper abstraction makes it easy to add support for other frameworks in the future.

