import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ApolloClient,
  InMemoryCache,
  ApolloProvider,
  split,
  HttpLink,
  useMutation,
  useQuery,
  useSubscription,
  gql,
} from "@apollo/client";
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import { createClient } from "graphql-ws";

const httpUri = (import.meta as any).env?.VITE_GRAPHQL_HTTP || "http://localhost:4000/graphql";
const wsUri = (import.meta as any).env?.VITE_GRAPHQL_WS || "ws://localhost:4000/graphql";

const httpLink = new HttpLink({ uri: httpUri });
const wsLink = new GraphQLWsLink(createClient({ url: wsUri }));

const link = split(
  ({ query }) => {
    const definition = query.definitions.find((d) => d.kind === "OperationDefinition");
    return (definition as any)?.operation === "subscription";
  },
  wsLink,
  httpLink
);

const client = new ApolloClient({ link, cache: new InMemoryCache() });

const ENSURE_SESSION = gql`
  mutation Ensure($sessionId: ID) { ensureSession(sessionId: $sessionId) }
`;
const GET_SESSION = gql`
  query Session($sessionId: ID!) { session(sessionId: $sessionId) { id document { bodyHtml } messages { id role content createdAt } } }
`;
const SEND_MESSAGE = gql`
  mutation Send($sessionId: ID!, $input: String!) { sendMessage(sessionId: $sessionId, input: $input) { id } }
`;
const SUB_MESSAGE_DELTA = gql`
  subscription MsgDelta($sessionId: ID!) { messageDelta(sessionId: $sessionId) { contentDelta } }
`;
const SUB_TOOL = gql`
  subscription Tool($sessionId: ID!) { toolEvent(sessionId: $sessionId) { id name type args timestamp } }
`;
const SUB_DOC = gql`
  subscription Doc($sessionId: ID!) { documentUpdated(sessionId: $sessionId) { id html index } }
`;
const SUB_COMPLETE = gql`
  subscription Done($sessionId: ID!) { modelMessageCompleted(sessionId: $sessionId) }
`;

function App() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("make a simple todo list");
  const [modelBuffer, setModelBuffer] = useState("");
  const toolEventsRef = useRef<any[]>([]);
  const docRef = useRef<string>("");

  const [ensureSession] = useMutation(ENSURE_SESSION, {
    onCompleted: (d) => setSessionId(d.ensureSession),
  });

  useEffect(() => {
    ensureSession();
  }, []);

  const { data: sessionData, refetch } = useQuery(GET_SESSION, {
    variables: { sessionId },
    skip: !sessionId,
    onCompleted: (d) => {
      docRef.current = d.session.document.bodyHtml;
    },
  });

  useSubscription(SUB_MESSAGE_DELTA, {
    variables: { sessionId },
    skip: !sessionId,
    onData: ({ data }) => {
      const tok = data.data?.messageDelta?.contentDelta ?? "";
      setModelBuffer((b) => b + tok);
    },
  });

  useSubscription(SUB_TOOL, {
    variables: { sessionId },
    skip: !sessionId,
    onData: ({ data }) => {
      const ev = data.data?.toolEvent;
      if (ev) {
        toolEventsRef.current = [...toolEventsRef.current, ev];
        // force rerender
        setInput((v) => v);
      }
    },
  });

  useSubscription(SUB_DOC, {
    variables: { sessionId },
    skip: !sessionId,
    onData: ({ data }) => {
      const upd = data.data?.documentUpdated;
      if (upd) {
        docRef.current = docRef.current + upd.html;
        setInput((v) => v); // force rerender
      }
    },
  });

  useSubscription(SUB_COMPLETE, {
    variables: { sessionId },
    skip: !sessionId,
    onData: () => {
      // model message finished
      setModelBuffer("");
      refetch();
    },
  });

  const [send] = useMutation(SEND_MESSAGE, {
    variables: { sessionId, input },
    onCompleted: () => setInput("")
  });

  return (
    <div style={{ display: "contents" }}>
      <div className="sidebar">
        <h3>Chat</h3>
        <div className="messages">
          {(sessionData?.session?.messages ?? []).map((m: any) => (
            <div key={m.id}><b>{m.role}</b>: {m.content}</div>
          ))}
          {modelBuffer && (
            <div><b>MODEL</b>: <span>{modelBuffer}</span></div>
          )}
        </div>
        <div>
          <h4>Tool Calls</h4>
          <div>
            {toolEventsRef.current.map((t, i) => (
              <div key={i} className="tool">
                <div>{t.type} {t.name}</div>
                {t.args && <pre>{JSON.stringify(t.args)}</pre>}
                <small>{new Date(t.timestamp).toLocaleTimeString()}</small>
              </div>
            ))}
          </div>
        </div>
        <div className="input">
          <input placeholder="Ask to build UI..." value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
          <button onClick={() => send()} disabled={!input || !sessionId}>Send</button>
        </div>
      </div>
      <div className="doc">
        <h3>Rendered Document</h3>
        <div className="canvas" dangerouslySetInnerHTML={{ __html: docRef.current }} />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <ApolloProvider client={client}>
    <App />
  </ApolloProvider>
);

