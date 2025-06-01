/**
 * Express server for handling chat API requests with OpenAI
 */
import cors from "cors";
import dotenv from "dotenv";
import express, { Request, Response } from "express";
import { initializeAgents } from "./agents";
import agentRouter from "./api/agent";
import chatRouter from "./api/chat";
import mcpRouter from "./api/mcp";
import toolsRouter from "./api/tools";
import { initializeMCP, startMCPServers } from "./mcp";

dotenv.config();

const app = express();
const router = express.Router();
app.use(express.json());
app.use(cors());

router.get("/api/health", (req: Request, res: Response) => {
  res.json({ status: "ok", message: "FoxyChat API server is running" });
});

const PORT = 38000;

function startChatServer() {
  // Mount the routers to the app
  app.use(router);
  app.use(agentRouter);
  app.use(chatRouter);
  app.use(mcpRouter);
  app.use(toolsRouter);

  initializeAgents()
    .then(() => console.log("Agent system initialized successfully"))
    .catch((error) =>
      console.error("Failed to initialize agent system:", error),
    );

  initializeMCP();

  startMCPServers()
    .then((results) => {
      const startedCount = Array.from(results.values()).filter(Boolean).length;
      const totalCount = results.size;
      console.log(`Started ${startedCount}/${totalCount} enabled MCP servers`);
    })
    .catch((error) =>
      console.error("Error starting enabled MCP servers:", error),
    );

  const server = app.listen(PORT, () => {
    console.log(`Chat server running on port ${PORT}`);
    console.log(`Chat API endpoint: http://localhost:${PORT}/api/chat`);
    console.log(`Health check endpoint: http://localhost:${PORT}/api/health`);
  });

  server.on("error", (error) => {
    console.error("Chat server error:", error);
  });

  return server;
}

export default startChatServer;
