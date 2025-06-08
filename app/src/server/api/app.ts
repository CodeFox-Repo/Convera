import { Hono } from "hono";
import { MCPManager } from "../mcp/mcp-manager";
import { PredefinedMCPServer } from "../mcp/types";

const app = new Hono();

// Types for app management
interface App {
  id: string;
  name: string;
  description: string;
  type: "web" | "mcp";
  source: "predefined" | "marketplace" | "custom";
  category: string;
  icon?: string;
  isConnected?: boolean;
  lastConnected?: string;
  // MCP-specific fields
  mcpConfig?: {
    command?: string;
    args?: string[];
    name?: string;
    url?: string;
    enabled?: boolean;
  };
  // Future marketplace fields
  marketplaceInfo?: {
    publisher: string;
    rating: number;
    downloads: number;
    verified: boolean;
  };
}

interface ConnectedApp extends App {
  isConnected: true;
  lastConnected: string;
  connectionConfig?: Record<string, any>;
}

// App sources registry - designed for extensibility
interface AppSource {
  id: string;
  name: string;
  type: "predefined" | "marketplace" | "custom";
  enabled: boolean;
  fetcher: () => Promise<App[]>;
}

// Get MCP Manager instance
function getMCPManager(): MCPManager {
  return MCPManager.getInstance();
}

// Helper function to convert predefined MCP server to App format
function convertMCPServerToApp(
  mcpServer: PredefinedMCPServer,
  isConnected: boolean = false,
): App {
  return {
    id: mcpServer.id,
    name: mcpServer.name,
    description: mcpServer.description,
    type: "mcp",
    source: "predefined",
    category: "Tools", // Default category for MCP servers
    mcpConfig: {
      ...mcpServer.defaultConfig,
      enabled: isConnected,
    },
    isConnected,
  };
}

// App sources registry
const appSources: AppSource[] = [
  // Predefined MCP servers source
  {
    id: "predefined-mcp",
    name: "Predefined MCP Servers",
    type: "predefined",
    enabled: true,
    fetcher: async (): Promise<App[]> => {
      const mcpManager = getMCPManager();
      const predefinedServers = mcpManager.getAllPredefinedServers();
      const connectedConfigs = mcpManager.getAllServerConfigs();

      return predefinedServers.map((server) => {
        const isConnected = !!connectedConfigs[server.id];
        return convertMCPServerToApp(server, isConnected);
      });
    },
  },

  // Future marketplace source (placeholder)
  {
    id: "marketplace",
    name: "App Marketplace",
    type: "marketplace",
    enabled: false, // Will be enabled when marketplace is ready
    fetcher: async (): Promise<App[]> => {
      // TODO: Implement marketplace API integration
      // This could fetch from a remote marketplace API
      return [];
    },
  },

  // Custom apps source (for user-added apps)
  {
    id: "custom",
    name: "Custom Apps",
    type: "custom",
    enabled: true,
    fetcher: async (): Promise<App[]> => {
      // TODO: Load custom apps from local storage
      // This could read from appDir file
      return [];
    },
  },
];

// Helper function to get all available apps from all sources
async function getAllAvailableApps(): Promise<App[]> {
  const allApps: App[] = [];

  for (const source of appSources) {
    if (source.enabled) {
      try {
        const apps = await source.fetcher();
        allApps.push(...apps);
      } catch (error) {
        console.error(`Error fetching apps from source ${source.id}:`, error);
      }
    }
  }

  return allApps;
}

// Helper function to get connected apps
function getConnectedApps(): ConnectedApp[] {
  const mcpManager = getMCPManager();
  const connectedConfigs = mcpManager.getAllServerConfigs();
  const serverStatuses = mcpManager.getAllServerStatus();

  const connectedApps: ConnectedApp[] = [];

  for (const [id, config] of Object.entries(connectedConfigs)) {
    const status = serverStatuses.find((s) => s.id === id);
    const predefinedServer = mcpManager.getPredefinedServerById(id);

    if (predefinedServer) {
      const app = convertMCPServerToApp(predefinedServer, true);
      connectedApps.push({
        ...app,
        isConnected: true,
        lastConnected: new Date().toISOString(), // TODO: Store actual connection time
        connectionConfig: config,
      });
    }
  }

  return connectedApps;
}

// Helper function to format time ago
function formatTimeAgo(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60)
    return `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24)
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

// GET /api/apps - Get all apps (connected and available)
app.get("/api/apps", async (c) => {
  try {
    const [availableApps, connectedApps] = await Promise.all([
      getAllAvailableApps(),
      Promise.resolve(getConnectedApps()),
    ]);

    // Format connected apps for frontend
    const formattedConnectedApps = connectedApps.map((app) => ({
      ...app,
      lastConnected: formatTimeAgo(app.lastConnected),
    }));

    // Get apps that are available but not connected
    const connectedIds = new Set(connectedApps.map((app) => app.id));
    const availableNotConnected = availableApps.filter(
      (app) => !connectedIds.has(app.id),
    );

    return c.json({
      success: true,
      data: {
        connected: formattedConnectedApps,
        available: availableNotConnected,
        sources: appSources.map((source) => ({
          id: source.id,
          name: source.name,
          type: source.type,
          enabled: source.enabled,
        })),
      },
    });
  } catch (error) {
    console.error("Error fetching apps:", error);
    return c.json(
      {
        success: false,
        error: "Failed to fetch apps",
      },
      500,
    );
  }
});

// POST /api/apps/connect - Connect an app
app.post("/api/apps/connect", async (c) => {
  try {
    const body = await c.req.json();
    const { appId, config = {} } = body;

    if (!appId) {
      return c.json(
        {
          success: false,
          error: "App ID is required",
        },
        400,
      );
    }

    const mcpManager = getMCPManager();

    // Check if app is already connected (for MCP apps)
    const existingConfig = mcpManager.getServerConfig(appId);
    if (existingConfig) {
      return c.json(
        {
          success: false,
          error: "App is already connected",
        },
        400,
      );
    }

    // Get all available apps to find the one to connect
    const availableApps = await getAllAvailableApps();
    const appToConnect = availableApps.find((app) => app.id === appId);

    if (!appToConnect) {
      return c.json(
        {
          success: false,
          error: "App not found",
        },
        404,
      );
    }

    // Handle different app types
    if (appToConnect.type === "mcp" && appToConnect.source === "predefined") {
      // Handle predefined MCP server installation
      console.log(`Installing predefined MCP server: ${appId}`);

      const installResult = mcpManager.installPredefinedServer(appId);

      if (!installResult) {
        return c.json(
          {
            success: false,
            error: "Failed to install MCP server",
          },
          500,
        );
      }

      // Start the server after installation
      try {
        await mcpManager.startServer(appId);
        console.log(`Successfully started MCP server: ${appId}`);
      } catch (error) {
        console.warn(
          `MCP server ${appId} installed but failed to start:`,
          error,
        );
        // Don't fail the connection if server can't start immediately
      }

      return c.json({
        success: true,
        message: `${appToConnect.name} connected successfully`,
        data: {
          id: appId,
          name: appToConnect.name,
          type: appToConnect.type,
          source: appToConnect.source,
          connectedAt: new Date().toISOString(),
        },
      });
    } else if (
      appToConnect.type === "mcp" &&
      appToConnect.source === "marketplace"
    ) {
      // Handle marketplace MCP app installation
      // TODO: Implement marketplace app installation logic
      return c.json(
        {
          success: false,
          error: "Marketplace apps not yet supported",
        },
        501,
      );
    } else if (appToConnect.type === "web") {
      // Handle web app connections (OAuth, API keys, etc.)
      // TODO: Implement web app connection logic
      return c.json(
        {
          success: false,
          error: "Web app connections not yet supported",
        },
        501,
      );
    }

    return c.json(
      {
        success: false,
        error: "Unsupported app type or source",
      },
      400,
    );
  } catch (error) {
    console.error("Error connecting app:", error);
    return c.json(
      {
        success: false,
        error: "Failed to connect app",
      },
      500,
    );
  }
});

// POST /api/apps/disconnect - Disconnect an app
app.post("/api/apps/disconnect", async (c) => {
  try {
    const body = await c.req.json();
    const { appId } = body;

    if (!appId) {
      return c.json(
        {
          success: false,
          error: "App ID is required",
        },
        400,
      );
    }

    const mcpManager = getMCPManager();

    // Check if app is connected (for MCP apps)
    const existingConfig = mcpManager.getServerConfig(appId);
    if (!existingConfig) {
      return c.json(
        {
          success: false,
          error: "App is not connected",
        },
        400,
      );
    }

    // Get app info
    const predefinedServer = mcpManager.getPredefinedServerById(appId);
    if (predefinedServer) {
      // Handle predefined MCP server uninstallation
      console.log(`Uninstalling predefined MCP server: ${appId}`);

      const uninstallResult = mcpManager.uninstallPredefinedServer(appId);

      if (!uninstallResult) {
        return c.json(
          {
            success: false,
            error: "Failed to uninstall MCP server",
          },
          500,
        );
      }

      return c.json({
        success: true,
        message: `${predefinedServer.name} disconnected successfully`,
      });
    } else {
      // Handle other app types (marketplace, web apps, etc.)
      // TODO: Implement other app disconnection logic
      return c.json(
        {
          success: false,
          error: "App type not supported for disconnection",
        },
        501,
      );
    }
  } catch (error) {
    console.error("Error disconnecting app:", error);
    return c.json(
      {
        success: false,
        error: "Failed to disconnect app",
      },
      500,
    );
  }
});

export default app;
