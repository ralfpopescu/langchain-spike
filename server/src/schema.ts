import { makeExecutableSchema } from "@graphql-tools/schema";
import { GraphQLScalarType, Kind } from "graphql";
import { pubsub, topics } from "./pubsub.js";
import { appendMessage, ensureSession, getDocument, getSessionState, listMessages } from "./store.js";
import { runAgentStreaming } from "./agent.js";

const typeDefs = /* GraphQL */ `
  scalar DateTime

  enum Role {
    USER
    MODEL
  }

  enum ToolEventType {
    STARTED
    PROGRESS
    COMPLETED
    ERROR
  }

  type Message {
    id: ID!
    sessionId: ID!
    role: Role!
    content: String!
    createdAt: DateTime!
  }

  type MessageDelta {
    contentDelta: String!
  }

  type ToolCallEvent {
    id: ID!
    sessionId: ID!
    name: String!
    args: JSON
    type: ToolEventType!
    timestamp: DateTime!
  }

  scalar JSON

  type DocumentNodeAdded {
    id: ID!
    sessionId: ID!
    html: String!
    index: Int!
  }

  type HtmlDocument {
    sessionId: ID!
    bodyHtml: String!
  }

  type ChatSession {
    id: ID!
    messages: [Message!]!
    document: HtmlDocument!
  }

  type Query {
    session(sessionId: ID!): ChatSession!
    document(sessionId: ID!): HtmlDocument!
    messages(sessionId: ID!): [Message!]!
  }

  type Mutation {
    sendMessage(sessionId: ID!, input: String!): Message!
    ensureSession(sessionId: ID): ID!
  }

  type Subscription {
    messageDelta(sessionId: ID!): MessageDelta!
    toolEvent(sessionId: ID!): ToolCallEvent!
    documentUpdated(sessionId: ID!): DocumentNodeAdded!
    modelMessageCompleted(sessionId: ID!): JSON!
  }
`;

const DateTimeScalar = new GraphQLScalarType({
  name: "DateTime",
  serialize(value: unknown) {
    return value instanceof Date ? value.toISOString() : value;
  },
  parseValue(value: unknown) {
    return typeof value === "string" ? new Date(value) : value;
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      return new Date(ast.value);
    }
    return null;
  },
});

// Simple JSON scalar using identity
const JSONScalar = new GraphQLScalarType({
  name: "JSON",
  serialize: (v) => v as any,
  parseValue: (v) => v as any,
  parseLiteral(ast) {
    switch (ast.kind) {
      case Kind.STRING:
      case Kind.BOOLEAN:
      case Kind.INT:
      case Kind.FLOAT:
        return (ast as any).value;
      case Kind.OBJECT: {
        const value: Record<string, any> = {};
        (ast.fields || []).forEach((f) => {
          value[f.name.value] = (f.value as any).value;
        });
        return value;
      }
      case Kind.LIST:
        return (ast.values || []).map((v) => (v as any).value);
      default:
        return null;
    }
  },
});

const resolvers = {
  DateTime: DateTimeScalar,
  JSON: JSONScalar,
  Query: {
    session: (_: any, { sessionId }: { sessionId: string }) => {
      ensureSession(sessionId);
      return {
        id: sessionId,
        messages: listMessages(sessionId),
        document: getDocument(sessionId),
      };
    },
    document: (_: any, { sessionId }: { sessionId: string }) => getDocument(sessionId),
    messages: (_: any, { sessionId }: { sessionId: string }) => listMessages(sessionId),
  },
  ChatSession: {
    messages: (parent: any) => listMessages(parent.id),
    document: (parent: any) => getDocument(parent.id),
  },
  Mutation: {
    ensureSession: (_: any, { sessionId }: { sessionId?: string }) => ensureSession(sessionId),
    sendMessage: async (_: any, { sessionId, input }: { sessionId: string; input: string }) => {
      // Record and kick off agent processing
      const msg = appendMessage(sessionId, { sessionId, role: "USER", content: input });
      console.log(`[${new Date().toISOString()}] 🚀 Initiating LLM call for session: ${sessionId}`);
      console.log(`[${new Date().toISOString()}] 📝 User input: ${input}`);
      // Fire and forget agent execution; streaming is handled via subscriptions
      runAgentStreaming(sessionId, input).catch((err) => {
        console.error(`[${new Date().toISOString()}] ❌ Agent error for session ${sessionId}:`, err);
      });
      return msg;
    },
  },
  Subscription: {
    messageDelta: {
      subscribe: (_: any, { sessionId }: { sessionId: string }) => pubsub.asyncIterableIterator(topics.messageDelta(sessionId)),
    },
    toolEvent: {
      subscribe: (_: any, { sessionId }: { sessionId: string }) => pubsub.asyncIterableIterator(topics.toolEvent(sessionId)),
    },
    documentUpdated: {
      subscribe: (_: any, { sessionId }: { sessionId: string }) => pubsub.asyncIterableIterator(topics.documentUpdated(sessionId)),
    },
    modelMessageCompleted: {
      subscribe: (_: any, { sessionId }: { sessionId: string }) => pubsub.asyncIterableIterator(topics.modelMessageCompleted(sessionId)),
    },
  },
};

export const schema = makeExecutableSchema({ typeDefs, resolvers });

