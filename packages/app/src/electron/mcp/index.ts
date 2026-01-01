/**
 * Clean MCP connection management system
 */

// Export core classes
export { MCPHub } from "./hub";

// Re-export shared types for convenience
export {
  ConnectionStatus,
  type ConnectionError,
  type ConnectionStatusType,
  type PromptDefinition,
  type ResourceDefinition,
  type ResourceTemplate,
  type ServerInfo,
  type ToolDefinition,
} from "@/shared/types/mcp";

// Import types for internal use
import type { ServerInfo, ToolDefinition } from "@/shared/types/mcp";
import { ConnectionStatus } from "@/shared/types/mcp";
import { MCPHub } from "./hub";

// Global hub instance
let globalHub: MCPHub | null = null;

/**
 * Initialize MCP Hub
 */
export async function initializeMCPHub(configPath?: string): Promise<MCPHub> {
  if (!globalHub) {
    globalHub = new MCPHub(configPath);
  }

  await globalHub.initialize();
  return globalHub;
}

/**
 * Get MCP Hub instance
 */
export function getMCPHub(): MCPHub | null {
  return globalHub;
}

/**
 * Cleanup MCP Hub on app shutdown
 */
export async function cleanupMCPHub(): Promise<void> {
  if (globalHub) {
    await globalHub.cleanup();
    globalHub = null;
  }
}

/**
 * Start all MCP servers
 */
export async function startAllMCPServers(): Promise<void> {
  if (!globalHub) {
    throw new Error("MCP Hub not initialized");
  }
  await globalHub.initialize();
}

/**
 * Stop all MCP servers
 */
export async function stopAllMCPServers(): Promise<void> {
  if (!globalHub) {
    throw new Error("MCP Hub not initialized");
  }
  await globalHub.disconnectAll();
}

/**
 * Simple tool call wrapper
 */
export async function callTool(
  serverName: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (!globalHub) {
    throw new Error("MCP Hub not initialized");
  }
  return globalHub.callTool(serverName, toolName, args);
}

/**
 * Simplified MCP tool call - finds first server with tool name
 */
export async function mcpToolCall(
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (!globalHub) {
    throw new Error("MCP Hub not initialized");
  }
  return globalHub.mcpToolCall(toolName, args);
}

/**
 * Get all available tools from all servers
 */
export function getAllTools(): Array<{
  serverName: string;
  tools: ToolDefinition[];
}> {
  if (!globalHub) {
    return [];
  }

  const builtinTools = {
    serverName: "Builtin",
    tools: globalHub.getBuiltinToolsDefinition(),
  };

  const serverTools = globalHub
    .getAllServerStatuses()
    .filter(
      (server: ServerInfo) => server.status === ConnectionStatus.CONNECTED,
    )
    .map((server: ServerInfo) => ({
      serverName: server.name,
      tools: server.capabilities.tools,
    }));

  return [...serverTools, builtinTools];
}

/**
 * Get all tools that don't require input parameters
 * Uses cached results for better performance
 */
export function getAllNonInputParamTool(): ToolDefinition[] {
  if (!globalHub) {
    return [];
  }
  return globalHub.getAllNonInputParamTool();
}

/**
 * Get builtin tools for direct use with AI SDK
 */
export function getBuiltinTools() {
  if (!globalHub) {
    return [];
  }
  return globalHub.getBuiltinTools();
}

/**
 * Get all server statuses including builtin tools as virtual server
 */
export function getAllServerStatusesWithBuiltin(): Array<ServerInfo> {
  if (!globalHub) {
    return [];
  }
  return globalHub.getAllServerStatusesWithBuiltin();
}

/**
 * Get server status summary
 */
export function getServerStatusSummary(): {
  total: number;
  connected: number;
  disconnected: number;
  error: number;
  disabled: number;
} {
  if (!globalHub) {
    return {
      total: 0,
      connected: 0,
      disconnected: 0,
      error: 0,
      disabled: 0,
    };
  }

  const statuses = globalHub.getAllServerStatuses();
  return {
    total: statuses.length,
    connected: statuses.filter(
      (s: ServerInfo) => s.status === ConnectionStatus.CONNECTED,
    ).length,
    disconnected: statuses.filter(
      (s: ServerInfo) => s.status === ConnectionStatus.DISCONNECTED,
    ).length,
    error: statuses.filter(
      (s: ServerInfo) => s.status === ConnectionStatus.ERROR,
    ).length,
    disabled: statuses.filter(
      (s: ServerInfo) => s.status === ConnectionStatus.DISABLED,
    ).length,
  };
}

// Backward compatibility aliases
export type {
  PromptDefinition as Prompt,
  ResourceDefinition as Resource,
  ServerInfo as Server,
} from "@/shared/types/mcp";
