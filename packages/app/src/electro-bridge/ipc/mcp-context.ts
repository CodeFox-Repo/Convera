import {
  contextBridge,
  ipcMain,
  ipcRenderer,
  type IpcMain,
  type MessageBoxOptions,
} from "electron";
import type { MCPServerConfig } from "@/shared/types/mcp";
import { createMcpAPI } from "./mcp-api";
import { getAllTools, getMCPHub } from "../../electron/mcp";

/**
 * Ask the person at the keyboard before letting a config spawn a process.
 *
 * An stdio server is a command line: `command`, `args`, `cwd` and `env` are
 * handed to StdioClientTransport and executed. The renderer supplies all four,
 * so anything able to call `window.mcpAPI.addServer` — a pasted config, script
 * running in the renderer — otherwise gets silent local execution that also
 * survives restart, because the hub persists it.
 *
 * Only stdio is gated: a url-only server talks over the network and starts no
 * process, and prompting for it would train people to click through.
 *
 * This module is bundled into the preload too, so `dialog` and the window
 * accessor are required lazily — importing them at module scope pulls
 * main-process code into the renderer bundle.
 */
/** What would be executed, so an unchanged command line can skip the prompt. */
function commandLine(config: MCPServerConfig | undefined): string {
  if (!config?.command?.trim()) return "";
  return JSON.stringify([
    config.command.trim(),
    config.args ?? [],
    config.cwd ?? "",
    config.env ?? {},
  ]);
}

export function commandLineChanged(
  previous: MCPServerConfig | undefined,
  next: MCPServerConfig,
): boolean {
  return commandLine(previous) !== commandLine(next);
}

async function confirmsProcessSpawn(
  serverId: string,
  config: MCPServerConfig,
): Promise<boolean> {
  const command = config.command?.trim();
  if (!command) return true;

  const { dialog } = await import("electron");
  const { getMainWindow } = await import(
    "../../electron/windows/main-window.js"
  );
  const argv = [command, ...(config.args ?? [])].join(" ");
  const options: MessageBoxOptions = {
    type: "warning",
    buttons: ["Cancel", "Run this command"],
    defaultId: 0,
    cancelId: 0,
    title: "Add MCP server",
    message: `Let "${serverId}" run a command on this Mac?`,
    detail: `${argv}\n\nMCP servers run with your account's access to files and the network. Only continue if you know where this configuration came from.`,
  };
  const window = getMainWindow();
  const { response } = window
    ? await dialog.showMessageBox(window, options)
    : await dialog.showMessageBox(options);
  return response === 1;
}

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

        // Same gate as addServer, but only when the command line actually
        // changes: toggling `disabled` round-trips the stored config through
        // here, and prompting on every switch flip teaches people to dismiss
        // the dialog without reading it.
        if (
          commandLineChanged(hub.getConfig().mcpServers?.[serverId], config) &&
          !(await confirmsProcessSpawn(serverId, config))
        ) {
          return { success: false, error: "Cancelled." };
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

        if (!(await confirmsProcessSpawn(serverId, config))) {
          return { success: false, error: "Cancelled." };
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
