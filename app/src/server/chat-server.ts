/* eslint-disable */
/**
 * Express server for handling chat API requests with OpenAI
 */
import { standardErrors } from "@/renderer/libs/utils/error-handler";
import cors from "cors";
import dotenv from "dotenv";
import express, { NextFunction, Request, Response } from "express";
import { initializeAgents } from "./agents";
import apiRoutes from "./api";
import { initializeMCP, startMCPServers } from "./mcp";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

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
app.use("/api/chat", authenticateRequest);

// Mount the API routes
app.use("/api", apiRoutes);

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    status: "error",
    message: "Internal server error",
  });
});

async function startChatServer() {
  const PORT = process.env.PORT || 38000;

  // Initialize MCP and agents
  try {
    initializeMCP();
    console.log("MCP initialized successfully");

    await startMCPServers();
    console.log("MCP servers started successfully");
    await initializeAgents();
    console.log("Agents initialized successfully");

    app.listen(PORT, () => {
      console.log(`FoxyChat API server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to initialize MCP:", error);
    process.exit(1);
  }
}

export { startChatServer };
