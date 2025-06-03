/* eslint-disable @typescript-eslint/no-explicit-any */
import { standardErrors } from "@/renderer/libs/utils/error-handler";
import express, { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { validateBody } from "../middleware/validation";

const chatRequestSchema = z.object({
  messages: z.array(z.any()).min(1),
  config: z.any().optional(),
  agentId: z.string().optional(),
  modelId: z.string().optional(),
  id: z.string().optional(),
});
import { processAgentChat, processChatRequest } from "../agents";
import { deleteChat, getChatById, getChats } from "../service/chat";

const router = express.Router();

// Updated authentication middleware using standardized error responses
const authenticateRequest = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json(standardErrors.authFailed);
    return;
  }

  // Extract token from header
  const token = authHeader.split(" ")[1];

  if (!token) {
    res.status(401).json(standardErrors.authFailed);
    return;
  }

  // Store token in request for use in downstream handlers
  (req as any).apiToken = token;

  next();
};

// Apply authentication to routes that need it
router.use("/api/chat", authenticateRequest);

// Chat endpoint
router.post(
  "/api/chat",
  validateBody(chatRequestSchema),
  async (req: Request, res: Response) => {
    const { messages, config, agentId, modelId, id } = req.body;
  const apiKey = (req as any).apiToken;

  if (!apiKey) {
    res.status(401).json(standardErrors.authFailed);
    return;
  }

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json(standardErrors.emptyMessage);
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const response = agentId
    ? await processAgentChat(
        messages,
        apiKey,
        { agentId, modelId: modelId || config?.openai?.modelId },
        config?.openai?.endpoint,
        id,
      )
    : await processChatRequest(messages, apiKey, {
        modelId: modelId || config?.openai?.modelId,
        endpoint: config?.openai?.endpoint,
        config,
        id,
      });

  if (!response.body) {
    res.write(`data: ${JSON.stringify({ error: "No response body" })}\n\n`);
    res.end();
    return;
  }

  const reader = response.body.getReader();

  const processStream = async () => {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        res.end();
        return;
      }

      res.write(value);
    }
  };

  processStream().catch(() => {
    res.write(
      `data: ${JSON.stringify({ error: "Error processing stream" })}\n\n`,
    );
    res.end();
  });
});

router.get("/api/chat", async (req, res) => {
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

router.get("/api/chat/:id", async (req, res) => {
  const { id } = req.params;
  const chat = await getChatById(id);

  if (!chat) {
    res.status(404).json({
      status: "error",
      message: `Chat with ID '${id}' not found`,
    });
    return;
  }

  res.json({ status: "success", chat });
});

router.delete("/api/chat/:id", async (req, res) => {
  const { id } = req.params;
  const success = await deleteChat(id);

  if (!success) {
    res.status(404).json({
      status: "error",
      message: `Chat with ID '${id}' not found or could not be deleted`,
    });
    return;
  }

  res.json({
    status: "success",
    message: `Chat '${id}' deleted successfully`,
  });
});

export default router;
