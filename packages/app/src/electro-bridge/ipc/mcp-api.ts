import type { IMcpAPI, MCPServerConfig } from "@/shared/types/mcp";

/**
 * Electron-free so both the preload (real `ipcRenderer`) and the browser
 * (HTTP shim) can build the same API from one channel list.
 */
export interface McpRendererIPC {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
}

export function createMcpAPI(rendererIPC: McpRendererIPC): IMcpAPI {
  const invoke = rendererIPC.invoke.bind(rendererIPC) as <T>(
    channel: string,
    ...args: unknown[]
  ) => Promise<T>;

  return {
    getServers: () => invoke("mcp:getServers"),
    getAllTools: () => invoke("mcp:getAllTools"),
    startServer: (serverId: string) => invoke("mcp:startServer", serverId),
    stopServer: (serverId: string) => invoke("mcp:stopServer", serverId),
    getConfigurations: () => invoke("mcp:getConfigurations"),
    addServer: (serverId: string, config: MCPServerConfig) =>
      invoke("mcp:addServer", serverId, config),
    updateServer: (serverId: string, config: MCPServerConfig) =>
      invoke("mcp:updateServer", serverId, config),
    removeServer: (serverId: string) => invoke("mcp:removeServer", serverId),
    callTool: (
      serverId: string,
      toolName: string,
      args: Record<string, unknown>,
    ) => invoke("mcp:callTool", serverId, toolName, args),
    mcpToolCall: (toolName: string, args: Record<string, unknown>) =>
      invoke("mcp:mcpToolCall", toolName, args),
    getAllNonInputParamTool: () => invoke("mcp:getAllNonInputParamTool"),
  };
}
