/* eslint-disable */
/**
 * Express server for handling chat API requests with OpenAI
 */
import { standardErrors } from "@/renderer/libs/utils/error-handler";
import cors from "cors";
import dotenv from "dotenv";
import express, {
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from "express";
import {
  deleteCustomAgent,
  getAgentById,
  getAgentList,
  processAgentChat,
  processChatRequest,
  saveCustomAgent,
} from "./agents";
import { AgentDefinition, ToolReference } from "./agents/types";
import {
  getAvailablePredefinedServers,
  getMCPManager,
  initializeMCP,
  isPredefinedServerInstalled,
  startMCPServers,
} from "./mcp";
import { getToolsByNames, serverTools } from "./mcp/dev-mcp/tools";
import { MCPServerConfig } from "./mcp/types";
import { deleteChat, getChatById, getChats } from "./service/chat";

dotenv.config();

const app = express();
const router = express.Router();
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

app.post("/api/agents/create", (async (req: Request, res: Response) => {
  try {
    const {
      id,
      name,
      description,
      systemPrompt,
      toolNames,
      toolReferences,
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
      (!toolNames && !toolReferences) ||
      (toolNames && !Array.isArray(toolNames)) ||
      (toolReferences && !Array.isArray(toolReferences))
    ) {
      return res.status(400).json({ error: "Missing required agent fields" });
    }

    // Use toolReferences if available, otherwise convert toolNames to toolReferences
    let finalToolReferences = toolReferences;
    if (!finalToolReferences && toolNames) {
      finalToolReferences = toolNames.map((name: string) => {
        const parts = name.split(":");
        if (parts.length > 1) {
          return {
            mcpName: parts[0],
            toolName: parts[1],
            isBuiltIn: parts[0] === "Dev-MCP" || parts[0] === "codefox-mcp",
          };
        }
        return {
          mcpName: "Dev-MCP",
          toolName: name,
          isBuiltIn: true,
        };
      });
    }

    // Log the tool references for debugging
    console.log(
      `Creating agent '${name}' with ${finalToolReferences.length} tool references`,
    );

    // Map tool references to ToolSet
    const tools = getToolsByNames(finalToolReferences);

    // Format tool names for display in system prompt
    const formattedToolNames = finalToolReferences.map(
      (ref: ToolReference) => `${ref.toolName} (${ref.mcpName})`,
    );

    // Construct AgentDefinition
    const agent: AgentDefinition = {
      id,
      name,
      description,
      tools, // Include tools for runtime usage
      toolReferences: finalToolReferences, // This is the primary field now
      modelId,
      iconUrl,
      avatar,
      category,
      type,
      systemPrompt:
        typeof systemPrompt === "string"
          ? `${systemPrompt}\n\nAvailable tools: ${formattedToolNames.join(", ")}`
          : "",
    };

    // Save agent (you can define your own storage logic in `saveCustomAgent`)
    await saveCustomAgent(agent);

    res.status(200).json({ success: true, agent });
  } catch (error) {
    console.error("Error creating agent:", error);
    res.status(500).json({ error: "Failed to create agent" });
  }
}) as RequestHandler);

// Chat endpoint
router.post("/api/chat", async (req: Request, res: Response) => {
  try {
    const { messages, config, agentId, modelId, id } = await req.body;

    console.log("message length:", messages.length, "id:", id);

    // Use token from middleware
    const apiKey = (req as any).apiToken;

    if (!apiKey) {
      res.status(401).json(standardErrors.authFailed);
      return;
    }

    // Check if messages are empty
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      res.status(400).json(standardErrors.emptyMessage);
      return;
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
        id,
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
        id,
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
      res.status(400).json({
        error:
          "Missing required parameters. 'toolId' and 'settings' are required.",
      });
      return;
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

    console.log(
      "Agents from storage:",
      agents.map((a) => ({
        id: a.id,
        name: a.name,
        toolCount: a.toolReferences.length,
      })),
    );

    // Make sure agents have consistent toolReferences format
    const enrichedAgents = agents.map((agent) => {
      // toolNames are kept for backward compatibility only
      const toolNames = agent.toolReferences.map(
        (t) => `${t.mcpName}:${t.toolName}`,
      );

      return {
        ...agent,
        toolNames: toolNames,
      };
    });

    res.json({ status: "success", agents: enrichedAgents });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error fetching agents:", errorMessage);
    res.status(500).json({ status: "error", message: errorMessage });
  }
});

// Manual MCP configuration installation endpoint
router.post(
  "/api/mcp/configurations/manual",
  async (req: Request, res: Response) => {
    try {
      const configData = req.body;

      // Validate the configuration structure
      if (
        !configData ||
        !configData.mcpServers ||
        typeof configData.mcpServers !== "object"
      ) {
        res.status(400).json({
          status: "error",
          message: "Invalid configuration format. Expected {mcpServers: {...}}",
        });
        return;
      }

      const manager = getMCPManager();

      // Process each server in the configuration
      const serverIds = Object.keys(configData.mcpServers);
      if (serverIds.length === 0) {
        res.status(400).json({
          status: "error",
          message: "No MCP servers found in configuration",
        });
        return;
      }

      // Register each server with the manager
      for (const id of serverIds) {
        const serverConfig = configData.mcpServers[id];
        console.log(
          `Registering MCP server from manual config: ${id}`,
          serverConfig,
        );

        try {
          // Check if server already exists
          if (manager.getServerConfig(id)) {
            // Update existing server config
            manager.updateServerConfig(id, serverConfig);
            console.log(`Updated existing MCP server configuration: ${id}`);
          } else {
            // Register new server
            manager.registerServer(id, serverConfig);
            console.log(`Registered new MCP server: ${id}`);
          }

          // If the server is configured to be enabled, start it automatically
          console.log(`Auto-starting manually configured MCP server: ${id}`);
          manager.startServer(id).catch((err) => {
            console.error(`Error auto-starting MCP server ${id}:`, err);
          });
        } catch (err) {
          console.error(`Error registering MCP server ${id}:`, err);
          // Continue with other servers even if one fails
        }
      }

      res.json({
        status: "success",
        message: `Manually configured ${serverIds.length} MCP server(s)`,
        serverIds,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("Error installing manual MCP configuration:", errorMessage);
      res.status(500).json({ status: "error", message: errorMessage });
    }
  },
);

// Add endpoint for getting specific agent details
router.get("/api/agents/:agentId", (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const agent = getAgentById(agentId);

    if (!agent) {
      res.status(404).json({
        status: "error",
        message: `Agent with ID '${agentId}' not found`,
      });
      return;
    }

    res.json({ status: "success", agent });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error fetching agent ${req.params.agentId}:`, errorMessage);
    res.status(500).json({ status: "error", message: errorMessage });
  }
});

// Add endpoint for deleting an agent
router.delete("/api/agents/:agentId", async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;

    // Call the deleteCustomAgent function
    const success = await deleteCustomAgent(agentId);

    if (!success) {
      res.status(404).json({
        status: "error",
        message: `Agent with ID '${agentId}' not found or cannot be deleted`,
      });
      return;
    }

    res.json({
      status: "success",
      message: `Agent '${agentId}' deleted successfully`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error deleting agent ${req.params.agentId}:`, errorMessage);
    res.status(500).json({ status: "error", message: errorMessage });
  }
});

// Add endpoint for updating an agent
router.put("/api/agents/:agentId", async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const {
      id,
      name,
      description,
      systemPrompt,
      toolNames,
      toolReferences,
      modelId,
      iconUrl,
      avatar,
      category,
      type,
    } = req.body;

    // Validate that the ID in the URL matches the ID in the body
    if (id !== agentId) {
      res.status(400).json({
        status: "error",
        message: "Agent ID mismatch between URL and request body",
      });
      return;
    }

    // Check that the agent exists
    const existingAgent = getAgentById(agentId);
    if (!existingAgent) {
      res.status(404).json({
        status: "error",
        message: `Agent with ID '${agentId}' not found`,
      });
      return;
    }

    // Determine which tools to use - prioritize those from the request, fall back to existing tools
    let finalToolReferences = toolReferences;
    if (!finalToolReferences && toolNames) {
      // Convert toolNames to toolReferences
      finalToolReferences = toolNames.map((name: string) => {
        const parts = name.split(":");
        if (parts.length > 1) {
          return {
            mcpName: parts[0],
            toolName: parts[1],
            isBuiltIn: parts[0] === "Dev-MCP" || parts[0] === "codefox-mcp",
          };
        }
        return {
          mcpName: "Dev-MCP",
          toolName: name,
          isBuiltIn: true,
        };
      });
    } else if (!finalToolReferences && !toolNames) {
      // If no tools provided in the request, use the existing ones
      finalToolReferences = existingAgent.toolReferences || [];
    }

    console.log(
      `Updating agent '${agentId}' with ${finalToolReferences.length} tool references`,
    );

    // Map tool references to ToolSet
    const tools = getToolsByNames(finalToolReferences);

    // Format tool names for display in system prompt
    const formattedToolNames = finalToolReferences.map(
      (ref: ToolReference) => `${ref.toolName} (${ref.mcpName})`,
    );

    // Create updated agent with new fields and re-mapped tools
    const updatedAgent: AgentDefinition = {
      ...existingAgent,
      id: agentId, // Keep the original ID
      name: name || existingAgent.name,
      description: description || existingAgent.description,
      tools, // Use the re-mapped tools
      toolReferences: finalToolReferences, // Update tool references
      modelId: modelId || existingAgent.modelId,
      iconUrl: iconUrl || existingAgent.iconUrl,
      avatar: avatar || existingAgent.avatar,
      category: category || existingAgent.category,
      type: type || existingAgent.type,
      systemPrompt:
        typeof systemPrompt === "string"
          ? `${systemPrompt}\n\nAvailable tools: ${formattedToolNames.join(", ")}`
          : existingAgent.systemPrompt,
    };

    // First delete the existing agent
    const deleteSuccess = await deleteCustomAgent(agentId);
    if (!deleteSuccess) {
      res.status(500).json({
        status: "error",
        message: "Failed to update agent: could not remove old version",
      });
      return;
    }

    // Then save the updated agent with the same ID
    await saveCustomAgent(updatedAgent);

    res.json({ status: "success", agent: updatedAgent });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error updating agent ${req.params.agentId}:`, errorMessage);
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
      kind: "predefined",
      isInstalled: isPredefinedServerInstalled(server.id),
    }));

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

// Get all installed MCP servers endpoint (both predefined and manually added)
app.get("/api/mcp/installed-servers", (req, res) => {
  try {
    const manager = getMCPManager();
    const serverConfigs = manager.getAllServerConfigs();
    const serverStatuses = manager.getAllServerStatus();

    const statusMap = new Map(
      serverStatuses.map((status) => [status.id, status]),
    );

    // Combine configuration and status data
    const installedServers = Object.keys(serverConfigs).map((id) => {
      const config = serverConfigs[id];
      const status = statusMap.get(id) || { id, running: false };
      const isPredefined = isPredefinedServerInstalled(id);

      // 获取额外的预定义服务器信息
      let predefinedInfo = null;
      if (isPredefined) {
        const allPredefined = getAvailablePredefinedServers();
        predefinedInfo =
          allPredefined.find((server) => server.id === id) || null;
      }

      return {
        id,
        name: config.name || id,
        description: config.description || "",
        kind: "installed",
        enabled: config.enabled || false,
        running: status.running || false,
        isPredefined,
        toolCount: status.tools?.length || 0,
        serverUrl: null,
        repoUrl: predefinedInfo?.repoUrl || null,
        logoUrl: predefinedInfo?.logoUrl || null,
        installInstructions: predefinedInfo?.installInstructions || null,
      };
    });

    res.json({
      status: "success",
      servers: installedServers,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error fetching installed MCP servers:", errorMessage);
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

// Uninstall predefined MCP server endpoint
app.post("/api/mcp/predefined-servers/uninstall", (async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({
        status: "error",
        message: "Server ID is required",
      });
    }

    const manager = getMCPManager();

    // First, check if the server is running and stop it if needed
    const serverStatus = manager.getServerStatus(id);
    if (serverStatus && serverStatus.running) {
      await manager.stopServer(id);
      console.log(`Stopped MCP server ${id} before uninstalling`);
    }

    // Unregister the server
    const success = manager.unregisterServer(id);

    if (success) {
      res.json({
        status: "success",
        message: `Server ${id} uninstalled successfully`,
      });
    } else {
      res.status(400).json({
        status: "error",
        message: `Failed to uninstall server ${id}`,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error uninstalling predefined MCP server:", errorMessage);
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
              enabled: !disabledTools.includes(name),
            })),
            serverId: id,
            disabledTools,
          });
        }
        console.log("serverTools", serverTools);
        const allTools = Object.keys(serverTools).map((name) => ({
          name,
          description: serverTools[name]?.description || `Tool: ${name}`,
          enabled: !disabledTools.includes(name),
        }));

        return res.json({
          status: "success",
          tools: allTools,
          serverId: id,
          disabledTools,
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
        res.status(400).json({
          status: "error",
          message: "disabledTools must be an array of tool names",
        });
        return;
      }

      const manager = getMCPManager();
      const serverStatus = manager.getServerStatus(id);

      if (!serverStatus) {
        res.status(404).json({
          status: "error",
          message: `Server with id ${id} not found`,
        });
        return;
      }

      const availableTools = serverStatus.tools || [];
      const totalTools = availableTools.length;
      const disabledCount = disabledTools.length;

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

  console.log("Starting all enabled MCP servers...");
  startMCPServers()
    .then((results) => {
      const startedCount = Array.from(results.values()).filter(Boolean).length;
      const totalCount = results.size;
      console.log(`Started ${startedCount}/${totalCount} enabled MCP servers`);
      if (startedCount > 0) {
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
      `MCP installed servers endpoint: http://localhost:${PORT}/api/mcp/installed-servers`,
    );
    console.log(
      `MCP marketplace endpoint: http://localhost:${PORT}/api/mcp/marketplace`,
    );
    console.log(`API authentication required for chat endpoint`);
  });

  server.on("error", (error) => {
    console.error("Chat server error:", error);
  });

  return server;
}

router.get("/api/tools", (req, res) => {
  try {
    const tools = Object.keys(serverTools);
    res.json({ tools });
  } catch (error) {
    console.error("Error fetching tools:", error);
    res.status(500).json({ error: "Failed to fetch tools" });
  }
});

router.get("/api/chats", async (req, res) => {
  try {
    const chats = await getChats();

    // Return a simplified list for the overview
    const chatList = chats.map((chat) => ({
      id: chat.id,
      title: chat.title,
      createdAt: chat.createdAt,
      lastUpdated: chat.lastUpdated,
      messageCount: chat.messages.length,
    }));

    res.json({ status: "success", chats: chatList });
  } catch (error) {
    console.error("Error fetching chat list:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ status: "error", message: errorMessage });
  }
});

router.get("/api/chats/:chatId", async (req, res) => {
  try {
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
  } catch (error) {
    console.error(`Error fetching chat ${req.params.chatId}:`, error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ status: "error", message: errorMessage });
  }
});

router.delete("/api/chats/:chatId", async (req, res) => {
  try {
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
  } catch (error) {
    console.error(`Error deleting chat ${req.params.chatId}:`, error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ status: "error", message: errorMessage });
  }
});

// Use the router
app.use(router);
