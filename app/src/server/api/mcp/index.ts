import express, { Request, RequestHandler, Response } from "express";
import {
  getAvailablePredefinedServers,
  getMCPManager,
  installPredefinedMCPServer,
  isPredefinedServerInstalled,
  uninstallPredefinedMCPServer,
} from "../../mcp";
import { MCPServerConfig } from "../../mcp/types";

const router = express.Router();

// Get MCP servers status
router.get("/servers", async (req: Request, res: Response) => {
  const manager = getMCPManager();
  const servers = manager.getAllServerStatus();
  res.json({ status: "success", servers });
});

// Start MCP server
router.post("/servers/:id/start", (async (req, res) => {
  const { id } = req.params;
  const manager = getMCPManager();

  try {
    await manager.startServer(id);
    res.json({ status: "success", message: `Server ${id} started` });
  } catch (error) {
    console.error(`Error starting server ${id}:`, error);
    res
      .status(500)
      .json({ status: "error", message: `Failed to start server ${id}` });
  }
}) as RequestHandler);

// Stop MCP server
router.post("/servers/:id/stop", (async (req, res) => {
  const { id } = req.params;
  const manager = getMCPManager();

  try {
    await manager.stopServer(id);
    res.json({ status: "success", message: `Server ${id} stopped` });
  } catch (error) {
    console.error(`Error stopping server ${id}:`, error);
    res
      .status(500)
      .json({ status: "error", message: `Failed to stop server ${id}` });
  }
}) as RequestHandler);

// Get MCP marketplace data
router.get("/marketplace", async (req: Request, res: Response) => {
  try {
    const response = await fetch("https://api.cline.bot/v1/mcp/marketplace");

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    res.json({ status: "success", data });
  } catch (error) {
    console.error("Error fetching marketplace data:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch marketplace data",
    });
  }
});

// Update MCP settings
router.post("/settings", (async (req: Request, res: Response) => {
  const { settings } = req.body;

  if (!settings) {
    res.status(400).json({
      status: "error",
      message: "Settings are required",
    });
    return;
  }

  // Here you would typically save the settings to a file or database
  // For now, we'll just return success
  res.json({
    status: "success",
    message: "Settings updated successfully",
    settings,
  });
}) as RequestHandler);

// Get MCP configurations
router.get("/configurations", async (req: Request, res: Response) => {
  const manager = getMCPManager();

  try {
    const configurations = manager.getAllServerConfigs();
    res.json({ status: "success", configurations });
  } catch (error) {
    console.error("Error getting configurations:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to get configurations",
    });
  }
});

// Update MCP configuration
router.put("/configurations/:serverId", (async (
  req: Request,
  res: Response,
) => {
  const { serverId } = req.params;
  const { configuration } = req.body;

  if (!configuration) {
    res.status(400).json({
      status: "error",
      message: "Configuration is required",
    });
    return;
  }

  const manager = getMCPManager();

  try {
    manager.updateServerConfig(serverId, configuration);
    res.json({
      status: "success",
      message: `Configuration for ${serverId} updated successfully`,
    });
  } catch (error) {
    console.error("Error updating configuration:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to update configuration",
    });
  }
}) as RequestHandler);

// Get predefined servers
router.get("/predefined-servers", (req, res) => {
  try {
    const servers = getAvailablePredefinedServers();
    const serversWithInstallStatus = servers.map((server) => ({
      ...server,
      isInstalled: isPredefinedServerInstalled(server.name),
    }));

    res.json({
      status: "success",
      servers: serversWithInstallStatus,
    });
  } catch (error) {
    console.error("Error getting predefined servers:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to get predefined servers",
    });
  }
});

// Get installed servers
router.get("/installed-servers", (req, res) => {
  try {
    const allServers = getAvailablePredefinedServers();
    const installedServers = allServers.filter((server) =>
      isPredefinedServerInstalled(server.name),
    );

    const manager = getMCPManager();
    const serverStatuses = manager.getAllServerStatus();

    const installedServersWithStatus = installedServers.map((server) => {
      const status = serverStatuses.find((s) => s.id === server.name);
      return {
        ...server,
        isInstalled: true,
        status: status?.running ? "running" : "stopped",
        isRunning: status?.running || false,
      };
    });

    res.json({
      status: "success",
      servers: installedServersWithStatus,
    });
  } catch (error) {
    console.error("Error getting installed servers:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to get installed servers",
    });
  }
});

// Install predefined server
router.post("/predefined-servers/install", (async (req, res) => {
  const { serverName } = req.body;

  if (!serverName) {
    res.status(400).json({
      status: "error",
      message: "Server name is required",
    });
    return;
  }

  try {
    const success = installPredefinedMCPServer(serverName);

    if (success) {
      res.json({
        status: "success",
        message: `Server ${serverName} installed successfully`,
      });
    } else {
      res.status(500).json({
        status: "error",
        message: `Failed to install server ${serverName}`,
      });
    }
  } catch (error) {
    console.error("Error installing server:", error);
    res.status(500).json({
      status: "error",
      message: `Failed to install server ${serverName}`,
    });
  }
}) as RequestHandler);

// Uninstall predefined server
router.post("/predefined-servers/uninstall", (async (req, res) => {
  const { serverName } = req.body;

  if (!serverName) {
    res.status(400).json({
      status: "error",
      message: "Server name is required",
    });
    return;
  }

  try {
    const success = uninstallPredefinedMCPServer(serverName);

    if (success) {
      res.json({
        status: "success",
        message: `Server ${serverName} uninstalled successfully`,
      });
    } else {
      res.status(500).json({
        status: "error",
        message: `Failed to uninstall server ${serverName}`,
      });
    }
  } catch (error) {
    console.error("Error uninstalling server:", error);
    res.status(500).json({
      status: "error",
      message: `Failed to uninstall server ${serverName}`,
    });
  }
}) as RequestHandler);

// Get server tools
router.get("/servers/:id/tools", (async (req, res) => {
  const { id } = req.params;
  const manager = getMCPManager();

  try {
    const serverStatus = manager.getServerStatus(id);
    const tools = serverStatus?.tools || [];
    res.json({ status: "success", tools });
  } catch (error) {
    console.error(`Error getting tools for server ${id}:`, error);
    res.status(500).json({
      status: "error",
      message: `Failed to get tools for server ${id}`,
    });
  }
}) as RequestHandler);

// Add custom MCP server
router.post("/servers/custom", (async (req: Request, res: Response) => {
  const { name, command, args, env } = req.body;

  if (!name || !command) {
    res.status(400).json({
      status: "error",
      message: "Name and command are required",
    });
    return;
  }

  try {
    const manager = getMCPManager();
    const serverConfig: MCPServerConfig = {
      name,
      command,
      args: args || [],
      env: env || {},
      enabled: true,
    };

    manager.registerServer(name, serverConfig);

    res.json({
      status: "success",
      message: `Custom server ${name} added successfully`,
      server: serverConfig,
    });
  } catch (error) {
    console.error("Error adding custom server:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to add custom server",
    });
  }
}) as RequestHandler);

export default router;
