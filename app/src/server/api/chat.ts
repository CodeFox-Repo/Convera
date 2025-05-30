/* eslint-disable @typescript-eslint/no-explicit-any */
import { standardErrors } from "@/renderer/libs/utils/error-handler";
import express, { NextFunction, Request, Response } from "express";
import { processAgentChat, processChatRequest } from "../agents";

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
router.post("/api/chat", async (req: Request, res: Response) => {
  const { messages, config, agentId, modelId, id } = await req.body;
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

export default router;
