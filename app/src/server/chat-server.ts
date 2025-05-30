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
import { initializeMCP, startMCPServers } from "./mcp";
import { serverTools } from "./mcp/dev-mcp/tools";
import { deleteChat, getChatById, getChats } from "./service/chat";

dotenv.config();

const app = express();
const router = express.Router();
app.use(express.json());
app.use(cors());

router.get("/api/health", (req: Request, res: Response) => {
  res.json({ status: "ok", message: "FoxyChat API server is running" });
});

router.get("/api/tools", (req, res) => {
  const tools = Object.keys(serverTools);
  res.json({ tools });
});

router.get("/api/chats", async (req, res) => {
  const chats = await getChats();
  const chatList = chats.map((chat) => ({
    id: chat.id,
    title: chat.title,
    createdAt: chat.createdAt,
    lastUpdated: chat.lastUpdated,
    messageCount: chat.messages.length,
  }));

  res.json({ status: "success", chats: chatList });
});

router.get("/api/chats/:chatId", async (req, res) => {
  const { chatId } = req.params;
  const chat = await getChatById(chatId);

  if (!chat) {
    res.status(404).json({
      status: "error",
      message: `Chat with ID '${chatId}' not found`,
    });
    return;
  }

  res.json({ status: "success", chat });
});

router.delete("/api/chats/:chatId", async (req, res) => {
  const { chatId } = req.params;
  const success = await deleteChat(chatId);

  if (!success) {
    res.status(404).json({
      status: "error",
      message: `Chat with ID '${chatId}' not found or could not be deleted`,
    });
    return;
  }

  res.json({
    status: "success",
    message: `Chat '${chatId}' deleted successfully`,
  });
});

const PORT = 38000;

function startChatServer() {
  // Mount the routers to the app
  app.use(router);
  app.use(agentRouter);
  app.use(chatRouter);
  app.use(mcpRouter);

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
