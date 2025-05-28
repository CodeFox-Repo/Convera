import { standardErrors } from "@/renderer/libs/utils/error-handler";
import express, { Request, Response } from "express";
import { processAgentChat, processChatRequest } from "../../agents";
import { deleteChat, getChatById, getChats } from "../../service/chat";

const router = express.Router();

// Chat endpoint
router.post("/", async (req: Request, res: Response) => {
  const { messages, config, agentId, modelId, id } = await req.body;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// Get all chats
router.get("/", async (req, res) => {
  try {
    const chats = await getChats();
    res.json({
      status: "success",
      chats,
    });
  } catch (error) {
    console.error("Error fetching chats:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch chats",
    });
  }
});

// Get specific chat by ID
router.get("/:chatId", async (req, res) => {
  try {
    const { chatId } = req.params;
    const chat = await getChatById(chatId);

    if (!chat) {
      res.status(404).json({
        status: "error",
        message: "Chat not found",
      });
      return;
    }

    res.json({
      status: "success",
      chat,
    });
  } catch (error) {
    console.error("Error fetching chat:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch chat",
    });
  }
});

// Delete specific chat by ID
router.delete("/:chatId", async (req, res) => {
  try {
    const { chatId } = req.params;
    await deleteChat(chatId);

    res.json({
      status: "success",
      message: "Chat deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting chat:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to delete chat",
    });
  }
});

export default router;
