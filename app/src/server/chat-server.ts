/**
 * Hono server for handling chat API requests with OpenAI
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { initializeAgents } from "./agents";
import agentRouter from "./api/agent";
import appRouter from "./api/app";
import chatRouter from "./api/chat";
import mcpRouter from "./api/mcp";
import toolsRouter from "./api/tools";

const app = new Hono();
export type AppType = typeof app;
app.use("*", cors());

app.get("/api/health", (c) =>
  c.json({ status: "ok", message: "FoxyChat API server is running" }),
);

const PORT = 38000;

function startChatServer() {
  // Mount the routers to the app
  app.route("/", agentRouter);
  app.route("/", appRouter);
  app.route("/", chatRouter);
  app.route("/", mcpRouter);
  app.route("/", toolsRouter);

  initializeAgents()
    .then(() => console.log("Agent system initialized successfully"))
    .catch((error) =>
      console.error("Failed to initialize agent system:", error),
    );

  const server = serve({ fetch: app.fetch, port: PORT });
  console.log(`Chat server running on port ${PORT}`);
  console.log(`Chat API endpoint: http://localhost:${PORT}/api/chat`);
  console.log(`Health check endpoint: http://localhost:${PORT}/api/health`);

  return server;
}

export default startChatServer;
export { app };
