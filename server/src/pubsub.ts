import { PubSub } from "graphql-subscriptions";

export const pubsub = new PubSub();

export const topics = {
  messageDelta: (sessionId: string) => `MESSAGE_DELTA_${sessionId}`,
  toolEvent: (sessionId: string) => `TOOL_EVENT_${sessionId}`,
  documentUpdated: (sessionId: string) => `DOCUMENT_UPDATED_${sessionId}`,
  modelMessageCompleted: (sessionId: string) => `MODEL_MSG_COMPLETED_${sessionId}`,
};

