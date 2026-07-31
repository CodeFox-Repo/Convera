import { contextBridge, ipcMain, ipcRenderer, type IpcMain } from "electron";
import type { MCPServerConfig } from "@/shared/types/mcp";
import { createMcpAPI } from "./mcp-api";
import { getAllTools, getMCPHub } from "../../electron/mcp";

/**
 * Setup MCP IPC handlers in main process
 */
export function setupMCPIPC(
  mainIPC: Pick<IpcMain, "handle" | "removeHandler"> = ipcMain,
) {
  // Get all server statuses including builtin tools
  mainIPC.handle("mcp:getServers", async () => {
    try {
      const hub = getMCPHub();
      if (!hub) {
        return { success: false, error: "MCP Hub not initialized" };
      }

      const servers = hub.getAllServerStatusesWithBuiltin();
      return { success: true, data: servers };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Get all tools in simplified format for chat functionality
  mainIPC.handle("mcp:getAllTools", async () => {
    try {
      const tools = getAllTools();
      return { success: true, data: tools };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Start specific server
  mainIPC.handle("mcp:startServer", async (_, serverId: string) => {
    try {
      const hub = getMCPHub();
      if (!hub) {
        return { success: false, error: "MCP Hub not initialized" };
      }

      const serverInfo = await hub.startServer(serverId);
      return { success: true, data: serverInfo };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Stop specific server
  mainIPC.handle("mcp:stopServer", async (_, serverId: string) => {
    try {
      const hub = getMCPHub();
      if (!hub) {
        return { success: false, error: "MCP Hub not initialized" };
      }

      const serverInfo = await hub.stopServer(serverId);
      return { success: true, data: serverInfo };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Get server configurations
  mainIPC.handle("mcp:getConfigurations", async () => {
    try {
      const hub = getMCPHub();
      if (!hub) {
        return { success: false, error: "MCP Hub not initialized" };
      }

      const config = hub.getConfig();
      return { success: true, data: config };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Update server configuration
  mainIPC.handle(
    "mcp:updateServer",
    async (_, serverId: string, config: MCPServerConfig) => {
      try {
        const hub = getMCPHub();
        if (!hub) {
          return { success: false, error: "MCP Hub not initialized" };
        }

        const serverInfo = await hub.updateServer(serverId, config);
        return { success: true, data: serverInfo };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  );

  // Add new server (manual configuration)
  mainIPC.handle(
    "mcp:addServer",
    async (_, serverId: string, config: MCPServerConfig) => {
      try {
        const hub = getMCPHub();
        if (!hub) {
          return { success: false, error: "MCP Hub not initialized" };
        }

        const serverInfo = await hub.addServer(serverId, config);
        return { success: true, data: serverInfo };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  );

  // Remove server
  mainIPC.handle("mcp:removeServer", async (_, serverId: string) => {
    try {
      const hub = getMCPHub();
      if (!hub) {
        return { success: false, error: "MCP Hub not initialized" };
      }

      await hub.removeServer(serverId);
      return { success: true, data: null };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Call tool on server
  mainIPC.handle(
    "mcp:callTool",
    async (
      _,
      serverId: string,
      toolName: string,
      args: Record<string, unknown>,
    ) => {
      try {
        const hub = getMCPHub();
        if (!hub) {
          return { success: false, error: "MCP Hub not initialized" };
        }

        const result = await hub.callTool(serverId, toolName, args);
        return { success: true, data: result };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  );

  // Simplified tool call - finds first server with the tool
  mainIPC.handle(
    "mcp:mcpToolCall",
    async (_, toolName: string, args: Record<string, unknown>) => {
      try {
        const hub = getMCPHub();
        if (!hub) {
          return { success: false, error: "MCP Hub not initialized" };
        }

        const result = await hub.mcpToolCall(toolName, args);
        return { success: true, data: result };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  );

  // Get all tools that don't require input parameters
  mainIPC.handle("mcp:getAllNonInputParamTool", async () => {
    try {
      const hub = getMCPHub();
      if (!hub) {
        return { success: false, error: "MCP Hub not initialized" };
      }

      const tools = hub.getAllNonInputParamTool();
      return { success: true, data: tools };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  console.log("MCP IPC handlers registered");
}

/**
 * Expose MCP context to renderer process
 */
export function exposeMCPContext() {
  contextBridge.exposeInMainWorld("mcpAPI", createMcpAPI(ipcRenderer));
}
