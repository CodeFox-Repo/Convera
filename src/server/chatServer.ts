/* eslint-disable */
/**
 * Express server for handling chat API requests with OpenAI
 */
import express, { Request, Response, RequestHandler } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { AppSettings } from "@/types/settings";
import {
  startMCPServers,
  getAvailablePredefinedServers,
  installPredefinedMCPServer,
  isPredefinedServerInstalled,
  initializeMCP,
  getMCPManager,
} from "./mcp";
import {
  getAgentList,
  getAgentById,
  processAgentChat,
  processChatRequest,
  saveCustomAgent,
} from "./agents";
import { AgentDefinition } from "./agents/types";
import { getToolsByNames, serverTools } from "./mcp/dev-mcp/tools";
import { MCPServerConfig } from "./mcp/types";

// Initialize dotenv
dotenv.config();

// Create Express app
const app = express();
const router = express.Router();

// Middleware
app.use(express.json());
app.use(cors());

// Get API key from environment variable
const DEFAULT_OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
if (!DEFAULT_OPENROUTER_API_KEY) {
  console.warn(
    "⚠️ OPENROUTER_API_KEY is not set in .env file. Chat functionality will need custom API key from frontend.",
  );
}

// Add this route handler to router:
router.post("/api/agents/create", async (req: Request, res: Response) => {
  try {
    const {
      id,
      name,
      description,
      systemPrompt,
      toolNames,
      modelId,
      iconUrl,
      avatar,
      category,
      type,
    } = req.body;

    if (
      !id ||
      !name ||
      !description ||
      !toolNames ||
      !Array.isArray(toolNames)
    ) {
      return res.status(400).json({ error: "Missing required agent fields" });
    }

    // Map toolNames to ToolSet
    const tools = getToolsByNames(toolNames);

    // Construct AgentDefinition
    const agent: AgentDefinition = {
      id,
      name,
      description,
      tools,
      modelId,
      iconUrl,
      avatar,
      category,
      type,
      systemPrompt:
        typeof systemPrompt === "string"
          ? `${systemPrompt}\n\nAvailable tools: ${tools.map((tool) => tool.name).join(", ")}`
          : "",
    };

    // Save agent (you can define your own storage logic in `saveCustomAgent`)
    await saveCustomAgent(agent);

    res.status(200).json({ success: true, agent });
  } catch (error) {
    console.error("Error creating agent:", error);
    res.status(500).json({ error: "Failed to create agent" });
  }
});

// Chat endpoint
router.post("/api/chat", async (req: Request, res: Response) => {
  try {
    const { messages, config, agentId, modelId } = req.body;

    console.log("Request received:", {
      messagesCount: messages.length,
      customConfig: !!config,
      agentId: agentId || "default",
      modelId: modelId || config?.openai?.modelId || "default",
    });

    const apiKey = DEFAULT_OPENROUTER_API_KEY;

    if (!apiKey) {
      return res.status(400).json({
        error: "No API key provided. Please set your API key in settings.",
      });
    }

    // Set necessary headers for streaming
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // If agent is specified, use agent-powered chat
    if (agentId) {
      console.log(`Using agent with ID: ${agentId}`);
      // Use processAgentChat from ./agents/index.js
      const response = await processAgentChat(
        messages,
        apiKey,
        { agentId, modelId: modelId || config?.openai?.modelId },
        config?.openai?.endpoint,
      );

      // Get the response stream from AI SDK and pipe it to Express response
      if (response.body) {
        const reader = response.body.getReader();

        const processStream = async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();

              if (done) {
                res.end();
                return;
              }

              // Write the chunk to the response
              res.write(value);
            }
          } catch (error) {
            console.error("Error processing stream:", error);
            res.write(
              `data: ${JSON.stringify({ error: "Error processing stream" })}\n\n`,
            );
            res.end();
          }
        };

        processStream();
      } else {
        res.write(`data: ${JSON.stringify({ error: "No response body" })}\n\n`);
        res.end();
      }
    } else {
      // Use standard chat processing
      const response = await processChatRequest(messages, apiKey, {
        modelId: modelId || config?.openai?.modelId,
        endpoint: config?.openai?.endpoint,
        config,
      });

      // Get the response stream from AI SDK and pipe it to Express response
      if (response.body) {
        const reader = response.body.getReader();

        const processStream = async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();

              if (done) {
                res.end();
                return;
              }

              // Write the chunk to the response
              res.write(value);
            }
          } catch (error) {
            console.error("Error processing stream:", error);
            res.write(
              `data: ${JSON.stringify({ error: "Error processing stream" })}\n\n`,
            );
            res.end();
          }
        };

        processStream();
      } else {
        res.write(`data: ${JSON.stringify({ error: "No response body" })}\n\n`);
        res.end();
      }
    }
  } catch (error) {
    console.error("Error handling chat request:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
    res.end();
  }
});

router.get("/api/health", (req: Request, res: Response) => {
  res.json({ status: "ok", message: "FoxyChat API server is running" });
});

// MCP servers endpoint
router.get("/api/mcp/servers", async (req: Request, res: Response) => {
  try {
    const manager = getMCPManager();
    const servers = manager.getAllServerStatus();

    res.json({ status: "success", servers });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error fetching MCP servers:", errorMessage);
    res.status(500).json({ status: "error", message: errorMessage });
  }
});

// Start specific MCP server endpoint
app.post("/api/mcp/servers/:id/start", (async (req, res) => {
  try {
    const { id } = req.params;
    const manager = getMCPManager();

    const success = await manager.startServer(id);

    if (success) {
      res.json({
        status: "success",
        message: `Server ${id} started successfully`,
      });
    } else {
      res
        .status(400)
        .json({ status: "error", message: `Failed to start server ${id}` });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error starting MCP server:", errorMessage);
    res.status(500).json({ status: "error", message: errorMessage });
  }
}) as RequestHandler);

// Stop specific MCP server endpoint
app.post("/api/mcp/servers/:id/stop", (async (req, res) => {
  try {
    const { id } = req.params;
    const manager = getMCPManager();

    const success = await manager.stopServer(id);

    if (success) {
      res.json({
        status: "success",
        message: `Server ${id} stopped successfully`,
      });
    } else {
      res
        .status(400)
        .json({ status: "error", message: `Failed to stop server ${id}` });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error stopping MCP server:", errorMessage);
    res.status(500).json({ status: "error", message: errorMessage });
  }
}) as RequestHandler);

// MCP marketplace endpoint
router.get("/api/mcp/marketplace", async (req: Request, res: Response) => {
  try {
    const response = await fetch("https://api.cline.bot/v1/mcp/marketplace", {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch marketplace data: ${response.status} ${response.statusText}`,
      );
    }

    const externalData = await response.json();

    if (Array.isArray(externalData)) {
      const catalog = {
        items: externalData,
      };
      res.json({ status: "success", catalog });
    } else {
      res.json({ status: "success", catalog: externalData });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error fetching MCP marketplace:", errorMessage);
    res.status(500).json({ status: "error", message: errorMessage });
  }
});

// MCP settings endpoint
router.post("/api/mcp/settings", (req: Request, res: Response) => {
  try {
    const { toolId, settings } = req.body;

    if (!toolId || !settings) {
      return res.status(400).json({
        error:
          "Missing required parameters. 'toolId' and 'settings' are required.",
      });
    }

    // Here you would save the settings for the specific MCP tool
    // This is a placeholder for the actual implementation
    console.log(`Saving settings for MCP tool: ${toolId}`, settings);

    // Return success
    res.json({
      success: true,
      message: `Settings for ${toolId} saved successfully`,
    });
  } catch (error: unknown) {
    console.error("Error saving MCP settings:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({
      error: "Failed to save MCP settings",
      details: errorMessage,
    });
  }
});

// Get all MCP server configurations
router.get("/api/mcp/configurations", async (req: Request, res: Response) => {
  try {
    const manager = getMCPManager();
    const configs = manager.getAllServerConfigs();

    const configsWithTools = { ...configs };

    if (configsWithTools["Dev-MCP"]) {
      const allDevMCPTools = Object.keys(serverTools);
      configsWithTools["Dev-MCP"].builtInToolsList = allDevMCPTools;
    }

    res.json({ status: "success", configurations: configsWithTools });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error fetching MCP configurations:", errorMessage);
    res.status(500).json({ status: "error", message: errorMessage });
  }
});

// Update a specific MCP server configuration
router.put(
  "/api/mcp/configurations/:id",
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const updatedConfig: Partial<MCPServerConfig> = req.body;

    try {
      const manager = getMCPManager();
      if (id === "Dev-MCP") {
        const allDevMCPTools = Object.keys(serverTools);
        if (updatedConfig.enabledTools) {
          updatedConfig.enabledTools = updatedConfig.enabledTools.filter(
            (tool) => allDevMCPTools.includes(tool),
          );
        }

        updatedConfig.builtInToolsList = allDevMCPTools;
      }

      manager.updateServerConfig(id, updatedConfig);
      res.json({
        status: "success",
        message: `Configuration for ${id} updated.`,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `Error updating MCP configuration for ${id}:`,
        errorMessage,
      );
      res.status(500).json({ status: "error", message: errorMessage });
    }
  },
);

// Add new endpoint for agent list
router.get("/api/agents", (req: Request, res: Response) => {
  try {
    const agents = getAgentList();
    res.json({ status: "success", agents });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error fetching agents:", errorMessage);
    res.status(500).json({ status: "error", message: errorMessage });
  }
});

// Add endpoint for getting specific agent details
router.get("/api/agents/:agentId", (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const agent = getAgentById(agentId);

    if (!agent) {
      return res.status(404).json({
        status: "error",
        message: `Agent with ID '${agentId}' not found`,
      });
    }

    res.json({ status: "success", agent });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error fetching agent ${req.params.agentId}:`, errorMessage);
    res.status(500).json({ status: "error", message: errorMessage });
  }
});

// MCP predefined servers endpoint
app.get("/api/mcp/predefined-servers", (req, res) => {
  try {
    const predefinedServers = getAvailablePredefinedServers();

    // Add installation status to each server
    const serversWithStatus = predefinedServers.map((server) => ({
      ...server,
      isInstalled: isPredefinedServerInstalled(server.id),
    }));

    console.log("Predefined servers:", serversWithStatus);
    res.json({
      status: "success",
      servers: serversWithStatus,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error fetching predefined MCP servers:", errorMessage);
    res.status(500).json({ status: "error", message: errorMessage });
  }
});

// Install predefined MCP server endpoint
app.post("/api/mcp/predefined-servers/install", (async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({
        status: "error",
        message: "Server ID is required",
      });
    }

    const manager = getMCPManager();
    const success = manager.installPredefinedServer(id);

    if (success) {
      // Get the server config to check if it's enabled
      const serverConfig = manager.getServerConfig(id);

      // If the server is configured to be enabled, start it automatically
      if (serverConfig && serverConfig.enabled) {
        console.log(`Auto-starting newly installed MCP server: ${id}`);
        manager
          .startServer(id)
          .then((startSuccess) => {
            if (startSuccess) {
              console.log(`Successfully auto-started MCP server: ${id}`);
            } else {
              console.warn(`Failed to auto-start MCP server: ${id}`);
            }
          })
          .catch((err) => {
            console.error(`Error auto-starting MCP server ${id}:`, err);
          });
      }

      res.json({
        status: "success",
        message: `Server ${id} installed successfully`,
      });
    } else {
      res.status(400).json({
        status: "error",
        message: `Failed to install server ${id}`,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error installing predefined MCP server:", errorMessage);
    res.status(500).json({ status: "error", message: errorMessage });
  }
}) as RequestHandler);

// Get tools for a specific MCP server
app.get("/api/mcp/servers/:id/tools", (async (req, res) => {
  try {
    const { id } = req.params;
    const manager = getMCPManager();

    // Get the server status to check if it's running
    const serverStatus = manager.getServerStatus(id);

    if (!serverStatus) {
      return res.status(404).json({
        status: "error",
        message: `Server with id ${id} not found`,
      });
    }

    // 获取服务器配置
    const serverConfig = manager.getServerConfig(id);
    const disabledTools = serverConfig?.disabledTools || [];

    if (id === "Dev-MCP") {
      const config = manager.getServerConfig(id);
      if (config) {
        if (config.builtInToolsList && config.builtInToolsList.length > 0) {
          return res.json({
            status: "success",
            tools: config.builtInToolsList.map((name) => ({
              name,
              description: serverTools[name]?.description || `Tool: ${name}`,
              enabled: !disabledTools.includes(name), // 使用disabledTools判断是否启用
            })),
            serverId: id,
            disabledTools, // 返回禁用的工具列表
          });
        }
        const allTools = Object.keys(serverTools).map((name) => ({
          name,
          description: serverTools[name]?.description || `Tool: ${name}`,
          enabled: !disabledTools.includes(name), // 使用disabledTools判断是否启用
        }));
        return res.json({
          status: "success",
          tools: allTools,
          serverId: id,
          disabledTools, // 返回禁用的工具列表
        });
      }
    }

    if (!serverStatus.running) {
      return res.status(400).json({
        status: "error",
        message: `Server ${id} is not running`,
      });
    }

    // 对于运行中的服务器，返回其工具并标记是否启用
    const availableTools = serverStatus.tools || [];

    return res.json({
      status: "success",
      tools: availableTools.map((tool) => ({
        ...tool,
        enabled: !disabledTools.includes(tool.name), // 使用disabledTools判断是否启用
      })),
      serverId: id,
      disabledTools, // 返回禁用的工具列表
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `Error fetching tools for MCP server ${req.params.id}:`,
      errorMessage,
    );
    res.status(500).json({ status: "error", message: errorMessage });
  }
}) as RequestHandler);

// Update MCP server enabled tools
router.post(
  "/api/mcp/servers/:id/tools",
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { disabledTools } = req.body;

      if (!Array.isArray(disabledTools)) {
        return res.status(400).json({
          status: "error",
          message: "disabledTools must be an array of tool names",
        });
      }

      const manager = getMCPManager();
      const serverStatus = manager.getServerStatus(id);

      if (!serverStatus) {
        return res.status(404).json({
          status: "error",
          message: `Server with id ${id} not found`,
        });
      }

      // 统计有多少可用工具
      const availableTools = serverStatus.tools || [];
      const totalTools = availableTools.length;
      const disabledCount = disabledTools.length;

      // 更新服务器配置，设置已禁用的工具
      const success = manager.updateServerConfig(id, { disabledTools });

      // If the server is running, restart it to apply the changes
      if (serverStatus.running) {
        await manager.stopServer(id);
        await manager.startServer(id);
      }

      res.json({
        status: "success",
        message: `Disabled ${disabledCount} tools for server ${id}. ${totalTools - disabledCount} tools are now available.`,
        disabledTools,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("Error updating MCP server tools:", errorMessage);
      res.status(500).json({ status: "error", message: errorMessage });
    }
  },
);

const PORT = 38000;

export function startChatServer() {
  initializeMCP();

  // Start all enabled MCP servers
  console.log("Starting all enabled MCP servers...");
  startMCPServers()
    .then((results) => {
      const startedCount = Array.from(results.values()).filter(Boolean).length;
      const totalCount = results.size;
      console.log(`Started ${startedCount}/${totalCount} enabled MCP servers`);

      if (startedCount > 0) {
        // Log which servers were started successfully and which failed
        Array.from(results.entries()).forEach(([id, success]) => {
          if (success) {
            console.log(`MCP server '${id}' started successfully`);
          } else {
            console.warn(`Failed to start MCP server '${id}'`);
          }
        });
      }
    })
    .catch((error) => {
      console.error("Error starting enabled MCP servers:", error);
    });

  const server = app.listen(PORT, () => {
    console.log(`Chat server running on port ${PORT}`);
    console.log(`Chat API endpoint: http://localhost:${PORT}/api/chat`);
    console.log(`Health check endpoint: http://localhost:${PORT}/api/health`);
    console.log(
      `MCP servers endpoint: http://localhost:${PORT}/api/mcp/servers`,
    );
    console.log(
      `MCP server tools endpoint: http://localhost:${PORT}/api/mcp/servers/:id/tools`,
    );
    console.log(
      `MCP server start endpoint: http://localhost:${PORT}/api/mcp/servers/:id/start`,
    );
    console.log(
      `MCP server stop endpoint: http://localhost:${PORT}/api/mcp/servers/:id/stop`,
    );
    console.log(
      `MCP predefined servers endpoint: http://localhost:${PORT}/api/mcp/predefined-servers`,
    );
    console.log(
      `MCP marketplace endpoint: http://localhost:${PORT}/api/mcp/marketplace`,
    );
    console.log(
      `OpenRouter API key configured: ${!!DEFAULT_OPENROUTER_API_KEY}`,
    );
  });

  // Add error handling for server
  server.on("error", (error) => {
    console.error("Chat server error:", error);
  });

  return server;
}

router.get("/api/tools", (req, res) => {
  try {
    const tools = Object.keys(serverTools); // 获取工具名称数组
    res.json({ tools });
  } catch (error) {
    console.error("Error fetching tools:", error);
    res.status(500).json({ error: "Failed to fetch tools" });
  }
});

// Use the router
app.use(router);
