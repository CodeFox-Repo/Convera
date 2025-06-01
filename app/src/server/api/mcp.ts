import express, { Request, RequestHandler, Response } from "express";
import {
  getAvailablePredefinedServers,
  getMCPManager,
  isPredefinedServerInstalled,
} from "../mcp";
import { serverTools } from "../mcp/dev-mcp/tools";
import { MCPServerConfig } from "../mcp/types";

const router = express.Router();

// MCP servers endpoint
router.get("/api/mcp/servers", async (req: Request, res: Response) => {
  const manager = getMCPManager();
  const servers = manager.getAllServerStatus();
  res.json({ status: "success", servers });
});

// Start specific MCP server endpoint
router.post("/api/mcp/servers/:id/start", (async (req, res) => {
  const { id } = req.params;
  const manager = getMCPManager();
  const success = await manager.startServer(id);

  const status = success ? 200 : 400;
  const message = success
    ? `Server ${id} started successfully`
    : `Failed to start server ${id}`;

  res.status(status).json({ status: success ? "success" : "error", message });
}) as RequestHandler);

// Stop specific MCP server endpoint
router.post("/api/mcp/servers/:id/stop", (async (req, res) => {
  const { id } = req.params;
  const manager = getMCPManager();
  const success = await manager.stopServer(id);

  const status = success ? 200 : 400;
  const message = success
    ? `Server ${id} stopped successfully`
    : `Failed to stop server ${id}`;

  res.status(status).json({ status: success ? "success" : "error", message });
}) as RequestHandler);

// MCP marketplace endpoint
router.get("/api/mcp/marketplace", async (req: Request, res: Response) => {
  const response = await fetch("https://api.cline.bot/v1/mcp/marketplace", {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch marketplace data: ${response.status} ${response.statusText}`,
    );
  }

  const externalData = await response.json();
  const catalog = Array.isArray(externalData)
    ? { items: externalData }
    : externalData;

  res.json({ status: "success", catalog });
});

// MCP settings endpoint
router.post("/api/mcp/settings", (req: Request, res: Response) => {
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
});

// Get all MCP server configurations
router.get("/api/mcp/configurations", async (req: Request, res: Response) => {
  const manager = getMCPManager();
  const configs = manager.getAllServerConfigs();
  const configsWithTools = { ...configs };

  if (configsWithTools["Dev-MCP"]) {
    const allDevMCPTools = Object.keys(serverTools);
    configsWithTools["Dev-MCP"].builtInToolsList = allDevMCPTools;
  }

  res.json({ status: "success", configurations: configsWithTools });
});

// Update a specific MCP server configuration
router.put(
  "/api/mcp/configurations/:id",
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const updatedConfig: Partial<MCPServerConfig> = req.body;
    const manager = getMCPManager();

    if (id === "Dev-MCP") {
      const allDevMCPTools = Object.keys(serverTools);
      if (updatedConfig.enabledTools) {
        updatedConfig.enabledTools = updatedConfig.enabledTools.filter((tool) =>
          allDevMCPTools.includes(tool),
        );
      }
      updatedConfig.builtInToolsList = allDevMCPTools;
    }

    manager.updateServerConfig(id, updatedConfig);
    res.json({
      status: "success",
      message: `Configuration for ${id} updated.`,
    });
  },
);

// Manual MCP configuration installation endpoint
router.post(
  "/api/mcp/configurations/manual",
  async (req: Request, res: Response) => {
    const configData = req.body;

    if (!configData?.mcpServers || typeof configData.mcpServers !== "object") {
      res.status(400).json({
        status: "error",
        message: "Invalid configuration format. Expected {mcpServers: {...}}",
      });
      return;
    }

    const manager = getMCPManager();
    const serverIds = Object.keys(configData.mcpServers);

    if (serverIds.length === 0) {
      res.status(400).json({
        status: "error",
        message: "No MCP servers found in configuration",
      });
      return;
    }

    for (const id of serverIds) {
      const serverConfig = configData.mcpServers[id];

      if (manager.getServerConfig(id)) {
        manager.updateServerConfig(id, serverConfig);
      } else {
        manager.registerServer(id, serverConfig);
      }

      manager.startServer(id).catch((err) => {
        console.error(`Error auto-starting MCP server ${id}:`, err);
      });
    }

    res.json({
      status: "success",
      message: `Manually configured ${serverIds.length} MCP server(s)`,
      serverIds,
    });
  },
);

// MCP predefined servers endpoint
router.get("/api/mcp/predefined-servers", (req, res) => {
  const predefinedServers = getAvailablePredefinedServers();
  const serversWithStatus = predefinedServers.map((server) => ({
    ...server,
    kind: "predefined",
    isInstalled: isPredefinedServerInstalled(server.id),
  }));

  res.json({
    status: "success",
    servers: serversWithStatus,
  });
});

// Get all installed MCP servers endpoint (both predefined and manually added)
router.get("/api/mcp/installed-servers", (req, res) => {
  const manager = getMCPManager();
  const serverConfigs = manager.getAllServerConfigs();
  const serverStatuses = manager.getAllServerStatus();

  const statusMap = new Map(
    serverStatuses.map((status) => [status.id, status]),
  );

  const installedServers = Object.keys(serverConfigs).map((id) => {
    const config = serverConfigs[id];
    const status = statusMap.get(id) || { id, running: false };
    const isPredefined = isPredefinedServerInstalled(id);

    let predefinedInfo = null;
    if (isPredefined) {
      const allPredefined = getAvailablePredefinedServers();
      predefinedInfo = allPredefined.find((server) => server.id === id) || null;
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
});

// Install predefined MCP server endpoint
router.post("/api/mcp/predefined-servers/install", (async (req, res) => {
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
    const serverConfig = manager.getServerConfig(id);
    if (serverConfig?.enabled) {
      manager.startServer(id).catch((err) => {
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
}) as RequestHandler);

// Uninstall predefined MCP server endpoint
router.post("/api/mcp/predefined-servers/uninstall", (async (req, res) => {
  const { id } = req.body;

  if (!id) {
    return res.status(400).json({
      status: "error",
      message: "Server ID is required",
    });
  }

  const manager = getMCPManager();
  const serverStatus = manager.getServerStatus(id);

  if (serverStatus?.running) {
    await manager.stopServer(id);
  }

  const success = manager.unregisterServer(id);
  const status = success ? 200 : 400;
  const message = success
    ? `Server ${id} uninstalled successfully`
    : `Failed to uninstall server ${id}`;

  res.status(status).json({ status: success ? "success" : "error", message });
}) as RequestHandler);

// Get tools for a specific MCP server
router.get("/api/mcp/servers/:id/tools", (async (req, res) => {
  const { id } = req.params;
  const manager = getMCPManager();
  const serverStatus = manager.getServerStatus(id);

  if (!serverStatus) {
    res.status(404).json({
      status: "error",
      message: `Server with id ${id} not found`,
    });
    return;
  }

  const serverConfig = manager.getServerConfig(id);
  const disabledTools = serverConfig?.disabledTools || [];

  if (id === "Dev-MCP") {
    const config = manager.getServerConfig(id);
    if (
      config &&
      config.builtInToolsList &&
      config.builtInToolsList.length > 0
    ) {
      res.json({
        status: "success",
        tools: config.builtInToolsList.map((name) => ({
          name,
          description: serverTools[name]?.description || `Tool: ${name}`,
          enabled: !disabledTools.includes(name),
        })),
        serverId: id,
        disabledTools,
      });
      return;
    }

    const allTools = Object.keys(serverTools).map((name) => ({
      name,
      description: serverTools[name]?.description || `Tool: ${name}`,
      enabled: !disabledTools.includes(name),
    }));

    res.json({
      status: "success",
      tools: allTools,
      serverId: id,
      disabledTools,
    });
    return;
  }

  if (!serverStatus.running) {
    res.status(400).json({
      status: "error",
      message: `Server ${id} is not running`,
    });
    return;
  }

  const availableTools = serverStatus.tools || [];

  res.json({
    status: "success",
    tools: availableTools.map((tool) => ({
      ...tool,
      enabled: !disabledTools.includes(tool.name),
    })),
    serverId: id,
    disabledTools,
  });
}) as RequestHandler);

// Update MCP server enabled tools
router.post(
  "/api/mcp/servers/:id/tools",
  async (req: Request, res: Response) => {
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
  },
);

export default router;
