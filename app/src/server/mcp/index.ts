/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * MCP Module Entry Point
 * Provides a unified API interface
 */
import { tool, Tool } from "ai";
import { z } from "zod";
import {
  addDependencyTool,
  deleteFileTool,
  renameFileTool,
  writeFileTool,
} from "./dev-mcp/tools/file-tools";
import { listProjectStructureTool } from "./dev-mcp/tools/list-project-structure-tool";
import { initProjectTool } from "./dev-mcp/tools/project-tools";
import { webSearch } from "./dev-mcp/tools/web-search-tool";
import { MCPClient } from "./mcp-client";
import { MCPManager } from "./mcp-manager";
import type { PredefinedMCPServer, ToolDefinition } from "./types";

// Initialize MCP manager instance
let manager: MCPManager | null = null;

/**
 * Initialize MCP system
 */
export function initializeMCP(configPath?: string): MCPManager {
  if (!manager) {
    manager = MCPManager.getInstance(configPath);
    console.log("MCP system initialized");
  }
  return manager;
}

/**
 * Get MCP manager instance
 */
export function getMCPManager(): MCPManager {
  if (!manager) {
    manager = initializeMCP();
  }
  return manager;
}

/**
 * Start all enabled MCP servers
 */
export async function startMCPServers(): Promise<Map<string, boolean>> {
  const mgr = getMCPManager();
  return mgr.startAllEnabled();
}

/**
 * Stop all MCP servers
 */
export async function stopMCPServers(): Promise<Map<string, boolean>> {
  const mgr = getMCPManager();
  return mgr.stopAll();
}

/**
 * Get all available MCP tools
 */
export async function listAllMCPTools(): Promise<
  { serverId: string; tool: ToolDefinition }[]
> {
  const mgr = getMCPManager();
  const allServers = mgr.getAllServerStatus();
  const result: { serverId: string; tool: ToolDefinition }[] = [];

  for (const server of allServers) {
    if (server.tools && server.running) {
      for (const tool of server.tools) {
        result.push({
          serverId: server.id,
          tool,
        });
      }
    }
  }

  return result;
}

/**
 * Run MCP tool by tool name
 */
export async function runMCPTool<T>(
  toolName: string,
  input: Record<string, unknown>,
): Promise<T> {
  const mgr = getMCPManager();
  // Find which server has this tool
  const allServers = mgr.getAllServerStatus();

  for (const server of allServers) {
    if (server.tools && server.running) {
      const hasTool = server.tools.some((t) => t.name === toolName);
      if (hasTool) {
        const client = mgr.getClient(server.id);
        if (client) {
          return client.runTool<T>(toolName, input);
        }
      }
    }
  }

  throw new Error(`Tool ${toolName} not found in any running server`);
}

/**
 * Import MCP configuration
 */
export function importMCPConfig(configJson: string): boolean {
  const mgr = getMCPManager();
  return mgr.importFromJson(configJson);
}

/**
 * Export MCP configuration
 */
export function exportMCPConfig(): string {
  const mgr = getMCPManager();
  return mgr.exportToJson();
}

/**
 * Add MCP tools for chat API
 * Returns tool objects that can be added to the tool list in chatServer.ts
 */
export async function getMCPToolsForChat(): Promise<Record<string, any>> {
  const manager = getMCPManager();
  const aiTools: Record<string, any> = {};

  // Get all server configurations and statuses
  const serverConfigs = manager.getAllServerConfigs();
  const serverStatuses = manager.getAllServerStatus();

  // Log the total number of servers and their status
  console.log(
    `Found ${serverStatuses.length} MCP servers, checking for available tools...`,
  );

  // Map of built-in tools to their direct imports
  const builtInTools: Record<string, Tool<any, any>> = {
    initProject: initProjectTool,
    listProjectStructure: listProjectStructureTool,
    writeFile: writeFileTool,
    renameFile: renameFileTool,
    deleteFile: deleteFileTool,
    addDependency: addDependencyTool,
    webSearch: webSearch,
  };

  // Special handling for built-in tools that need direct access
  // We add these first so they can be overridden by MCP servers if needed
  if (serverConfigs["Dev-MCP"] && serverConfigs["Dev-MCP"].enabled) {
    const devMcpConfig = serverConfigs["Dev-MCP"];
    console.log(
      `Dev-MCP is enabled with ${Object.keys(builtInTools).length} available tools`,
    );

    const disabledTools = devMcpConfig.disabledTools || [];
    console.log(
      `${disabledTools.length} tools are explicitly disabled in Dev-MCP`,
    );

    for (const [toolName, toolObj] of Object.entries(builtInTools)) {
      if (!disabledTools.includes(toolName)) {
        aiTools[toolName] = toolObj;
        console.log(`+ Added built-in ${toolName} tool from Dev-MCP`);
      } else {
        console.log(`- Skipping disabled built-in tool: ${toolName}`);
      }
    }
  }

  // Process each running server
  for (const serverStatus of serverStatuses) {
    // Skip servers that aren't running
    if (!serverStatus.running) {
      console.log(
        `- Skipping MCP server that's not running: ${serverStatus.id}`,
      );
      continue;
    }

    const serverId = serverStatus.id;
    const serverConfig = serverConfigs[serverId];

    // Skip if no configuration exists
    if (!serverConfig) {
      console.log(`- No configuration found for MCP server: ${serverId}`);
      continue;
    }

    // Get the tools for this server
    const tools = serverStatus.tools || [];
    console.log(`Server ${serverId} has ${tools.length} available tools`);

    const disabledTools = serverConfig.disabledTools || [];
    console.log(
      `${disabledTools.length} tools are explicitly disabled in server ${serverId}`,
    );

    // Process each tool from this server
    for (const mcpTool of tools) {
      try {
        const toolName = mcpTool.name;

        // Skip built-in tools that were already added directly from source
        if (serverId === "Dev-MCP" && toolName in builtInTools) {
          console.log(
            `- Skipping ${toolName} from Dev-MCP as it was already added directly`,
          );
          continue;
        }

        if (disabledTools.includes(toolName)) {
          console.log(
            `- Skipping disabled MCP tool: ${toolName} from server ${serverId}`,
          );
          continue;
        }

        // Create a Zod schema from the MCP tool parameters
        const paramSchema = createZodSchemaFromMCPParams(mcpTool.parameters);

        // Log the addition of the tool
        console.log(`+ Adding MCP tool: ${toolName} from server ${serverId}`);

        // Create the AI SDK tool for all other tools
        try {
          aiTools[toolName] = tool({
            description: mcpTool.description || `Tool: ${toolName}`,
            parameters: paramSchema,
            execute: async (params: Record<string, unknown>) => {
              try {
                // Call the MCP tool through the manager
                const client = manager.getClient(serverId);
                if (!client) {
                  throw new Error(`Server ${serverId} not available`);
                }
                const result = await client.runTool(toolName, params);
                // Convert result to string if it's not already
                return typeof result === "string"
                  ? result
                  : JSON.stringify(result);
              } catch (error: unknown) {
                const errorMessage =
                  error instanceof Error ? error.message : "Unknown error";
                console.error(`Error executing MCP tool ${toolName}:`, error);
                return `Error executing ${toolName}: ${errorMessage}`;
              }
            },
          });
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error(
            `Error creating AI SDK tool for ${toolName}:`,
            errorMessage,
          );
        }
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          `Error processing MCP tool from server ${serverId}:`,
          errorMessage,
        );
      }
    }
  }

  // Log summary of available tools
  const toolNames = Object.keys(aiTools);
  console.log(
    `===== Total MCP tools available for chat: ${toolNames.length} =====`,
  );
  if (toolNames.length > 0) {
    console.log(`Available tools: ${toolNames.join(", ")}`);
  } else {
    console.log("No MCP tools available for chat");
  }

  return aiTools;
}

/**
 * Helper to convert MCP parameter schema to Zod schema
 */
function createZodSchemaFromMCPParams(mcpParams: any): z.ZodObject<any> {
  // If no parameters or invalid format, return empty object schema
  if (!mcpParams || typeof mcpParams !== "object") {
    return z.object({}).describe("No parameters needed");
  }

  // For JSON Schema format (most common in MCP)
  if (mcpParams.properties) {
    const zodObj: Record<string, z.ZodTypeAny> = {};
    const required = mcpParams.required || [];

    Object.entries(mcpParams.properties).forEach(([name, propValue]) => {
      const prop = propValue as any;
      let zodType: z.ZodTypeAny;

      // Convert JSON Schema types to Zod types
      switch (prop.type) {
        case "string":
          zodType = z.string();
          break;
        case "number":
        case "integer":
          zodType = z.number();
          break;
        case "boolean":
          zodType = z.boolean();
          break;
        case "array":
          // For arrays, create a simple array of any type if item type is not specified
          zodType = z.array(z.any());
          // TODO: Handle array item types if needed
          break;
        case "object":
          // For objects, create a simple record if properties are not specified
          zodType = z.record(z.any());
          // TODO: Handle nested object schemas if needed
          break;
        default:
          zodType = z.any();
      }

      // Add description if available
      if (prop.description) {
        zodType = zodType.describe(prop.description);
      }

      // Make optional if not required
      if (!required.includes(name)) {
        zodType = zodType.optional();
      }

      zodObj[name] = zodType;
    });

    return z.object(zodObj);
  }

  // Fallback for unknown schema format
  return z.object({}).describe("Parameters in unknown format");
}

/**
 * Get available predefined MCP servers list
 */
export function getAvailablePredefinedServers(): PredefinedMCPServer[] {
  const mgr = getMCPManager();
  return mgr.getAllPredefinedServers();
}

/**
 * Get specified predefined MCP server
 * @param id Predefined server ID
 */
export function getPredefinedServer(
  id: string,
): PredefinedMCPServer | undefined {
  const mgr = getMCPManager();
  return mgr.getPredefinedServerById(id);
}

/**
 * Install a predefined MCP server
 * @param id Server ID
 * @param autoEnableAllTools 如果为true，不再设置enabledTools（默认全部启用），而是设置disabledTools为空数组
 * @returns Whether installation was successful
 */
export function installPredefinedMCPServer(
  id: string,
  autoEnableAllTools = true,
): boolean {
  const predefinedServer = getPredefinedServer(id);
  if (!predefinedServer) {
    return false;
  }

  const manager = getMCPManager();
  const { defaultConfig } = predefinedServer;

  // Create a copy of the config
  const config = { ...defaultConfig };

  // 如果autoEnableAllTools为true，使用黑名单方式
  if (autoEnableAllTools) {
    // 使用黑名单方式，默认所有工具都启用
    config.disabledTools = []; // 设置空的禁用列表，表示没有工具被禁用
    console.log(
      `Installing server ${id} with all tools enabled by default (using disabledTools=[])`,
    );

    // 清除可能存在的旧配置
    config.enabledTools = undefined;
    config.autoEnableAllTools = undefined;
  }

  try {
    manager.registerServer(id, config);

    // 启动服务器以便发现工具
    const startServerAsync = async () => {
      try {
        const success = await manager.startServer(id);
        if (success) {
          console.log(`Server ${id} started successfully`);

          // 获取所有可用工具，仅用于记录
          const serverStatus = manager.getServerStatus(id);
          if (
            serverStatus &&
            serverStatus.tools &&
            serverStatus.tools.length > 0
          ) {
            const toolNames = serverStatus.tools.map((tool) => tool.name);
            console.log(
              `Server ${id} has ${toolNames.length} available tools: ${toolNames.join(", ")}`,
            );
          }
        }
      } catch (error) {
        console.error(`Error starting server ${id}:`, error);
      }
    };
    startServerAsync();

    return true;
  } catch (error) {
    console.error(`Error installing MCP server ${id}:`, error);
    return false;
  }
}

/**
 * Check if predefined server is installed
 * @param id Predefined server ID
 */
export function isPredefinedServerInstalled(id: string): boolean {
  const mgr = getMCPManager();
  return mgr.getServerConfig(id) !== undefined;
}

/**
 * Uninstall a predefined MCP server
 * @param id Server ID
 * @returns Whether uninstallation was successful
 */
export function uninstallPredefinedMCPServer(id: string): boolean {
  const manager = getMCPManager();

  try {
    // Check if the server is installed first
    if (!isPredefinedServerInstalled(id)) {
      console.warn(`Server ${id} is not installed, cannot uninstall`);
      return false;
    }

    // Attempt to uninstall the server
    const result = manager.uninstallPredefinedServer(id);

    if (result) {
      console.log(`Successfully uninstalled MCP server ${id}`);
    } else {
      console.error(`Failed to uninstall MCP server ${id}`);
    }

    return result;
  } catch (error) {
    console.error(`Error uninstalling MCP server ${id}:`, error);
    return false;
  }
}

// Export MCPManager and MCPClient classes
export { MCPClient, MCPManager };

// Re-export types
  export type {
    MCPServerConfig,
    PredefinedMCPServer,
    ServerStatus,
    ToolDefinition
  } from "./types";

