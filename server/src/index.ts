import "dotenv/config";
import http from "http";
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { schema } from "./schema.js";
import { useServer } from "graphql-ws/lib/use/ws";
import { WebSocketServer } from "ws";

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

async function start() {
  const app = express();
  app.use(cors());
  app.use(bodyParser.json());

  const httpServer = http.createServer(app);

  // GraphQL WS server for subscriptions
  const wsServer = new WebSocketServer({ server: httpServer, path: "/graphql" });
  const serverCleanup = useServer({ schema }, wsServer);

  const apollo = new ApolloServer({ schema });
  await apollo.start();

  app.use("/graphql", expressMiddleware(apollo));

  httpServer.listen(PORT, () => {
    console.log(`GraphQL server running on http://localhost:${PORT}/graphql`);
    console.log(`Subscriptions over ws://localhost:${PORT}/graphql`);
  });

  // Ensure proper shutdown
  const shutdown = async () => {
    await apollo.stop();
    await serverCleanup.dispose();
    httpServer.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});

