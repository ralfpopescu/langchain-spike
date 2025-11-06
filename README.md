# GraphQL Streaming LLM Chat UI Builder

LLM-powered chat that incrementally builds and renders an HTML document via a single tool `add_node`. Apollo Server + Apollo Client with streaming over GraphQL subscriptions. Implemented in TypeScript with LangChain.js.

## Features

- Streaming model tokens to the client via `messageDelta` subscription.
- Tool calls surfaced immediately as events (`STARTED` → `PROGRESS` → `COMPLETED`).
- `add_node` tool appends elements to `<body>` and streams `documentUpdated` events.
- Agent iterates tool calls in a loop until completion (max 25 iterations).

## Repo Layout

- `server/`: Apollo Server (TypeScript), GraphQL schema, LangChain agent, tool, in-memory store.
- `web/`: Vite React app with Apollo Client; shows chat, tool events, and rendered document.

## Run Locally

1. Server
   - `cd server`
   - `npm install`
   - Set `OPENAI_API_KEY` in your environment. Optionally set `OPENAI_MODEL`.
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

## Notes

- The tool strictly appends to `<body>`. Extend `add_node` to support parent selectors if needed.
- Storage is in-memory for simplicity; swap `store.ts` for a DB-backed implementation in production.
- Agent prompt nudges small, incremental changes to show progress.

