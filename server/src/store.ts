import { HtmlDocument, Message } from "./types.js";
import { v4 as uuid } from "uuid";

type SessionState = {
  document: HtmlDocument;
  messages: Message[];
};

const sessions = new Map<string, SessionState>();

export function ensureSession(sessionId?: string) {
  const id = sessionId ?? uuid();
  if (!sessions.has(id)) {
    sessions.set(id, {
      document: { sessionId: id, bodyHtml: "" },
      messages: [],
    });
  }
  return id;
}

export function getSessionState(sessionId: string): SessionState | undefined {
  return sessions.get(sessionId);
}

export function getOrCreateSessionState(sessionId: string): SessionState {
  ensureSession(sessionId);
  return sessions.get(sessionId)!;
}

export function appendMessage(sessionId: string, msg: Omit<Message, "id" | "createdAt"> & Partial<Pick<Message, "id" | "createdAt">>): Message {
  const state = getOrCreateSessionState(sessionId);
  const message: Message = {
    id: msg.id ?? uuid(),
    createdAt: msg.createdAt ?? new Date(),
    ...msg,
  } as Message;
  state.messages.push(message);
  return message;
}

export function listMessages(sessionId: string): Message[] {
  return getOrCreateSessionState(sessionId).messages;
}

export function getDocument(sessionId: string): HtmlDocument {
  return getOrCreateSessionState(sessionId).document;
}

export function appendToBody(sessionId: string, html: string): { index: number } {
  const state = getOrCreateSessionState(sessionId);
  const prev = state.document.bodyHtml;
  state.document.bodyHtml = `${prev}${html}`;
  const index = (prev.match(/<[^>]+>/g)?.length ?? 0);
  return { index };
}

