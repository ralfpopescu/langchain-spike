export type Role = "USER" | "MODEL";

export interface Message {
  id: string;
  sessionId: string;
  role: Role;
  content: string;
  createdAt: Date;
}

export interface ToolCallEvent {
  id: string;
  sessionId: string;
  name: string;
  args: unknown;
  type: "STARTED" | "PROGRESS" | "COMPLETED" | "ERROR";
  timestamp: Date;
}

export interface DocumentNodeAdded {
  id: string;
  sessionId: string;
  html: string;
  index: number;
}

export interface HtmlDocument {
  sessionId: string;
  bodyHtml: string; // innerHTML of <body>
}

export interface ChatSession {
  id: string;
}

