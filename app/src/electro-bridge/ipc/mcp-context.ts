import type { MCPServerConfig } from "@/shared/types/mcp";
import { contextBridge, ipcMain, ipcRenderer } from "electron";
import { getMCPHub } from "../../electron/mcp";

/**
 * Setup MCP IPC handlers in main process
 */
export function setupMCPIPC() {
  // Get all server statuses
  ipcMain.handle("mcp:getServers", async () => {
    try {
      const hub = getMCPHub();
      if (!hub) {
        return { success: false, error: "MCP Hub not initialized" };
      }

      const servers = hub.getAllServerStatuses();
      return { success: true, data: servers };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Start specific server
  ipcMain.handle("mcp:startServer", async (_, serverId: string) => {
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
  ipcMain.handle("mcp:stopServer", async (_, serverId: string) => {
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
  ipcMain.handle("mcp:getConfigurations", async () => {
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
  ipcMain.handle(
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
  ipcMain.handle(
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
  ipcMain.handle("mcp:removeServer", async (_, serverId: string) => {
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
  ipcMain.handle(
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

  console.log("MCP IPC handlers registered");
}

/**
 * Expose MCP context to renderer process
 */
export function exposeMCPContext() {
  contextBridge.exposeInMainWorld("mcpAPI", {
    getServers: () => ipcRenderer.invoke("mcp:getServers"),
    startServer: (serverId: string) =>
      ipcRenderer.invoke("mcp:startServer", serverId),
    stopServer: (serverId: string) =>
      ipcRenderer.invoke("mcp:stopServer", serverId),
    getConfigurations: () => ipcRenderer.invoke("mcp:getConfigurations"),
    addServer: (serverId: string, config: MCPServerConfig) =>
      ipcRenderer.invoke("mcp:addServer", serverId, config),
    updateServer: (serverId: string, config: MCPServerConfig) =>
      ipcRenderer.invoke("mcp:updateServer", serverId, config),
    removeServer: (serverId: string) =>
      ipcRenderer.invoke("mcp:removeServer", serverId),
    callTool: (
      serverId: string,
      toolName: string,
      args: Record<string, unknown>,
    ) => ipcRenderer.invoke("mcp:callTool", serverId, toolName, args),
  });
}
