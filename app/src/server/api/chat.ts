/* eslint-disable @typescript-eslint/no-explicit-any */
import { standardErrors } from "@/renderer/libs/utils/error-handler";
import { Hono } from "hono";
import { processAgentChat, processChatRequest } from "../agents";
import { deleteChat, getChatById, getChats } from "../service/chat";

const router = new Hono();

// Updated authentication middleware using standardized error responses
const authenticateRequest = async (c: any, next: () => Promise<void>) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json(standardErrors.authFailed, 401);
  }

  // Extract token from header
  const token = authHeader.split(" ")[1];

  if (!token) {
    return c.json(standardErrors.authFailed, 401);
  }

  // Store token in request for use in downstream handlers
  (c as any).apiToken = token;
  await next();
};

// Chat endpoint - only this route requires authentication
router.post("/api/chat", authenticateRequest, async (c) => {
  const { messages, config, agentId, modelId, id } = await c.req.json();
  const apiKey = (c as any).apiToken;

  if (!apiKey) {
    return c.json(standardErrors.authFailed, 401);
  }

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return c.json(standardErrors.emptyMessage, 400);
  }

  const headers = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  };

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
    return new Response(
      `data: ${JSON.stringify({ error: "No response body" })}\n\n`,
      { headers },
    );
  }

  return new Response(response.body, { headers });
});

// These routes don't require authentication
router.get("/api/chat", async (c) => {
  const chats = await getChats();
  const chatList = chats.map((chat) => ({
    id: chat.id,
    title: chat.title,
    createdAt: chat.createdAt,
    lastUpdated: chat.lastUpdated,
    messageCount: chat.messages.length,
  }));

  return c.json({ status: "success", chats: chatList });
});

router.get("/api/chat/:id", async (c) => {
  const id = c.req.param("id");
  const chat = await getChatById(id);

  if (!chat) {
    return c.json(
      { status: "error", message: `Chat with ID '${id}' not found` },
      404,
    );
  }

  return c.json({ status: "success", chat });
});

router.delete("/api/chat/:id", async (c) => {
  const id = c.req.param("id");
  const success = await deleteChat(id);

  if (!success) {
    return c.json(
      {
        status: "error",
        message: `Chat with ID '${id}' not found or could not be deleted`,
      },
      404,
    );
  }

  return c.json({
    status: "success",
    message: `Chat '${id}' deleted successfully`,
  });
});

export default router;
