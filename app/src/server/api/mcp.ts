import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import {
  getAvailablePredefinedServers,
  getMCPManager,
  isPredefinedServerInstalled,
} from "../mcp";
import { serverTools } from "../mcp/dev-mcp/tools";
import { getPredefinedServerById } from "../mcp/predefined-servers";
import {
  DisabledToolsSchema,
  GeneralMCPConfig,
  GeneralMCPConfigSchema,
  IdSchema,
  MCPServerConfig,
  MCPServerType,
  UpdateMcpConfigSchema,
} from "../mcp/types";

const router = new Hono();

// MCP servers endpoint
router.get("/api/mcp/servers", async (c) => {
  const manager = getMCPManager();
  const servers = manager.getAllServerStatus();
  return c.json({ status: "success", servers });
});

// Start specific MCP server endpoint
router.post("/api/mcp/servers/:id/start", async (c) => {
  const id = c.req.param("id");
  const manager = getMCPManager();
  const success = await manager.startServer(id);

  const status = success ? 200 : 400;
  const message = success
    ? `Server ${id} started successfully`
    : `Failed to start server ${id}`;

  return c.json({ status: success ? "success" : "error", message }, status);
});

// Stop specific MCP server endpoint
router.post("/api/mcp/servers/:id/stop", async (c) => {
  const id = c.req.param("id");
  const manager = getMCPManager();
  const success = await manager.stopServer(id);

  const status = success ? 200 : 400;
  const message = success
    ? `Server ${id} stopped successfully`
    : `Failed to stop server ${id}`;

  return c.json({ status: success ? "success" : "error", message }, status);
});

// MCP marketplace endpoint
router.get("/api/mcp/marketplace", async (c) => {
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

  return c.json({ status: "success", catalog });
});

// Get all MCP server configurations
router.get("/api/mcp/configurations", async (c) => {
  const manager = getMCPManager();
  const configs = manager.getAllServerConfigs();
  const configsWithTools = { ...configs };

  if (configsWithTools["Dev-MCP"]) {
    const allDevMCPTools = Object.keys(serverTools);
    configsWithTools["Dev-MCP"].builtInToolsList = allDevMCPTools;
  }

  return c.json({ status: "success", configurations: configsWithTools });
});

// Update a specific MCP server configuration
router.put(
  "/api/mcp/configurations/:id",
  zValidator("json", UpdateMcpConfigSchema),
  async (c) => {
    const id = c.req.param("id");
    const updatedConfig: Partial<MCPServerConfig> = c.req.valid("json");
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
    return c.json({
      status: "success",
      message: `Configuration for ${id} updated.`,
    });
  },
);

// Manual MCP configuration installation endpoint
router.post(
  "/api/mcp/configurations/manual",
  zValidator("json", GeneralMCPConfigSchema),
  async (c) => {
    const generalConfigData: GeneralMCPConfig = c.req.valid("json");

    const manager = getMCPManager();
    const serverIds = Object.keys(generalConfigData.mcpServers);

    if (serverIds.length === 0) {
      return c.json(
        { status: "error", message: "No MCP servers found in configuration" },
        400,
      );
    }

    for (const id of serverIds) {
      const generalServerConfig = generalConfigData.mcpServers[id];
      const dbServerConfig: MCPServerConfig = {
        ...generalServerConfig,
        name: id,
        enabled: true,
        env: generalServerConfig.env || {},
      };

      if (manager.getServerConfig(id)) {
        manager.updateServerConfig(id, dbServerConfig);
      } else {
        manager.registerServer(id, dbServerConfig);
      }

      manager.startServer(id).catch((err) => {
        console.error(`Error auto-starting MCP server ${id}:`, err);
      });
    }

    return c.json({
      status: "success",
      message: `Manually configured ${serverIds.length} MCP server(s)`,
      serverIds,
    });
  },
);

// MCP predefined servers endpoint
router.get("/api/mcp/predefined-servers", (c) => {
  const predefinedServers = getAvailablePredefinedServers();
  const serversWithStatus = predefinedServers.map((server) => ({
    ...server,
    kind: "predefined",
    isInstalled: isPredefinedServerInstalled(server.id),
  }));

  return c.json({
    status: "success",
    servers: serversWithStatus,
  });
});

// Get all installed MCP servers endpoint (both predefined and manually added)
router.get("/api/mcp/installed-servers", (c) => {
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

  return c.json({
    status: "success",
    servers: installedServers,
  });
});

// Install predefined MCP server endpoint
router.post(
  "/api/mcp/predefined-servers/install",
  zValidator("json", IdSchema),
  async (c) => {
    const { id } = c.req.valid("json");

    const manager = getMCPManager();
    const success = manager.installPredefinedServer(id, MCPServerType.LOCAL);

    if (success) {
      const serverConfig = manager.getServerConfig(id);
      if (serverConfig?.enabled) {
        manager.startServer(id).catch((err) => {
          console.error(`Error auto-starting MCP server ${id}:`, err);
        });
      }

      return c.json({
        status: "success",
        message: `Server ${id} installed successfully`,
      });
    } else {
      return c.json(
        { status: "error", message: `Failed to install server ${id}` },
        400,
      );
    }
  },
);

// Uninstall MCP server endpoint
router.post("/api/mcp/uninstall", zValidator("json", IdSchema), async (c) => {
  const { id } = c.req.valid("json");

  // Check if server is a built-in predefined server
  const localPredefined = getPredefinedServerById(id, MCPServerType.LOCAL);
  const remotePredefined = getPredefinedServerById(id, MCPServerType.REMOTE);

  if (localPredefined?.builtIn || remotePredefined?.builtIn) {
    return c.json(
      {
        status: "error",
        message: `Cannot uninstall built-in server ${id}`,
      },
      400,
    );
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

  return c.json({ status: success ? "success" : "error", message }, status);
});

// Get tools for a specific MCP server
router.get("/api/mcp/servers/:id/tools", async (c) => {
  const id = c.req.param("id");
  const manager = getMCPManager();
  const serverStatus = manager.getServerStatus(id);

  if (!serverStatus) {
    return c.json(
      { status: "error", message: `Server with id ${id} not found` },
      404,
    );
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
      return c.json({
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

    const allDevMCPTools = Object.keys(serverTools).map((name) => ({
      name,
      description: serverTools[name]?.description || `Tool: ${name}`,
      enabled: !disabledTools.includes(name),
    }));

    return c.json({
      status: "success",
      tools: allDevMCPTools,
      serverId: id,
      disabledTools,
    });
  }

  if (!serverStatus.running) {
    return c.json(
      { status: "error", message: `Server ${id} is not running` },
      400,
    );
  }

  const availableTools = serverStatus.tools || [];

  return c.json({
    status: "success",
    tools: availableTools.map((tool) => ({
      ...tool,
      enabled: !disabledTools.includes(tool.name),
    })),
    serverId: id,
    disabledTools,
  });
});

// Update MCP server enabled tools
router.post(
  "/api/mcp/servers/:id/tools",
  zValidator("json", DisabledToolsSchema),
  async (c) => {
    const id = c.req.param("id");
    const { disabledTools } = c.req.valid("json");

    const manager = getMCPManager();
    const serverStatus = manager.getServerStatus(id);

    if (!serverStatus) {
      return c.json(
        { status: "error", message: `Server with id ${id} not found` },
        404,
      );
    }

    const availableTools = serverStatus.tools || [];
    const totalTools = availableTools.length;
    const disabledCount = disabledTools.length;

    if (serverStatus.running) {
      await manager.stopServer(id);
      await manager.startServer(id);
    }

    return c.json({
      status: "success",
      message: `Disabled ${disabledCount} tools for server ${id}. ${totalTools - disabledCount} tools are now available.`,
      disabledTools,
    });
  },
);

export default router;
