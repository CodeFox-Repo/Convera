import { Hono } from "hono";
import os from "os";
import path from "path";

const app = new Hono();

const mcpDir = path.join(os.homedir(), ".foxychat", "mcp.json");
const appDir = path.join(os.homedir(), ".foxychat", "app.json");

// Types for app management
interface App {
  id: string;
  name: string;
  description: string;
  type: "web" | "mcp";
  version?: string;
  source: "remote" | "marketplace";
  category: string;
  icon?: string;
  isConnected?: boolean;
  lastConnected?: string;
}

interface ConnectedApp extends App {
  isConnected: true;
  lastConnected: string;
  connectionConfig?: Record<string, any>;
}

// In-memory storage for demo (in production, this would be a database)
let connectedApps: ConnectedApp[] = [];

// Available apps from different sources - designed to be scalable
const appSources = {
  // Remote MCP apps - hardcoded for now but structured for scalability
  remote: [
    {
      id: "Gmail",
      name: "Gmail",
      description: "Connect to gmail workspaces and manage messages",
      type: "mcp" as const,
      version: "2.1.0",
      source: "remote" as const,
      category: "communication",
      mcpConfig: {
        command: "npx",
        args: ["mcp-remote", "http://localhost:8788/sse"],
        name: "Gmail",
      },
    },
  ],

  // Marketplace apps - for future extensibility
  marketplace: [],
};

// Helper function to get all available apps
function getAllAvailableApps(): App[] {
  const allApps: App[] = [];

  // Aggregate apps from all sources
  Object.entries(appSources).forEach(([sourceType, apps]) => {
    allApps.push(...apps);
  });

  return allApps;
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
app.get("/api/apps", (c) => {
  try {
    const availableApps = getAllAvailableApps();

    // Format connected apps for frontend
    const formattedConnectedApps = connectedApps.map((app) => ({
      ...app,
      lastConnected: formatTimeAgo(app.lastConnected),
    }));

    // Get apps that are available but not connected
    const availableNotConnected = availableApps.filter(
      (app) => !connectedApps.some((connected) => connected.id === app.id),
    );

    return c.json({
      success: true,
      data: {
        connected: formattedConnectedApps,
        available: availableNotConnected,
        sources: Object.keys(appSources), // For debugging/info
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
    const { appId, config } = body;

    if (!appId) {
      return c.json(
        {
          success: false,
          error: "App ID is required",
        },
        400,
      );
    }

    // Check if app is already connected
    if (connectedApps.some((app) => app.id === appId)) {
      return c.json(
        {
          success: false,
          error: "App is already connected",
        },
        400,
      );
    }

    // Find the app in available apps
    const availableApps = getAllAvailableApps();
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

    // TODO: Implement actual connection logic based on app type and source
    // For MCP apps: install package, start server, configure
    // For integrations: OAuth flow, API setup, etc.
    console.log(`Connecting app: ${appId}`, { config });

    if (appToConnect.type === "mcp") {
    }

    // For now, just add to connected apps
    const connectedApp: ConnectedApp = {
      ...appToConnect,
      isConnected: true,
      lastConnected: new Date().toISOString(),
      connectionConfig: config,
    };

    connectedApps.push(connectedApp);

    return c.json({
      success: true,
      message: `${appToConnect.name} connected successfully`,
      data: {
        ...connectedApp,
        lastConnected: formatTimeAgo(connectedApp.lastConnected),
      },
    });
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

    // Find the connected app
    const appIndex = connectedApps.findIndex((app) => app.id === appId);

    if (appIndex === -1) {
      return c.json(
        {
          success: false,
          error: "App is not connected",
        },
        400,
      );
    }

    const appToDisconnect = connectedApps[appIndex];

    // TODO: Implement actual disconnection logic
    // For MCP apps: stop server, cleanup resources
    // For integrations: revoke tokens, cleanup webhooks, etc.
    console.log(`Disconnecting app: ${appId}`);

    // Remove from connected apps
    connectedApps.splice(appIndex, 1);

    return c.json({
      success: true,
      message: `${appToDisconnect.name} disconnected successfully`,
    });
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
