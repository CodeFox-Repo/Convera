/**
 * Clean MCP connection management system
 */

// Export core classes
export { ConnectionStatus, MCPConnection } from "./connection";
export { MCPHub } from "./hub";

// Export types
export type {
  ConnectionError,
  ConnectionStatusType,
  PromptDefinition,
  ResourceDefinition,
  ResourceTemplate,
  ServerInfo,
  ToolDefinition,
} from "./connection";
export type { MCPConfig, MCPServerConfig } from "./hub";

// Import for local use
import type { ServerInfo, ToolDefinition } from "./connection";
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
 * Get all available tools from all servers
 */
export function getAllTools(): Array<{
  serverName: string;
  tools: ToolDefinition[];
}> {
  if (!globalHub) {
    return [];
  }

  return globalHub
    .getAllServerStatuses()
    .filter((server: ServerInfo) => server.status === "connected")
    .map((server: ServerInfo) => ({
      serverName: server.name,
      tools: server.capabilities.tools,
    }));
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
    connected: statuses.filter((s: ServerInfo) => s.status === "connected")
      .length,
    disconnected: statuses.filter(
      (s: ServerInfo) => s.status === "disconnected",
    ).length,
    error: statuses.filter((s: ServerInfo) => s.status === "error").length,
    disabled: statuses.filter((s: ServerInfo) => s.status === "disabled")
      .length,
  };
}

// Import types to avoid redefinition
export type {
  PromptDefinition as Prompt,
  ResourceDefinition as Resource,
  ServerInfo as Server,
  ToolDefinition as Tool,
} from "./connection";
