/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * MCP Module Entry Point
 * Provides a unified API interface
 */
import { tool, Tool } from "ai";
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
import { createZodSchemaFromMCPParams } from "./schema";
import { MCPServerType, type PredefinedMCPServer } from "./types";

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
 * Get available predefined MCP servers list
 */
export function getAvailablePredefinedServers(): PredefinedMCPServer[] {
  const mgr = getMCPManager();
  return mgr.getAllPredefinedServers(MCPServerType.LOCAL);
}

/**
 * Get specified predefined MCP server
 * @param id Predefined server ID
 */
export function getPredefinedServer(
  id: string,
): PredefinedMCPServer | undefined {
  const mgr = getMCPManager();
  return mgr.getPredefinedServerById(id, MCPServerType.LOCAL);
}

/**
 * Check if predefined server is installed
 * @param id Predefined server ID
 */
export function isPredefinedServerInstalled(id: string): boolean {
  const mgr = getMCPManager();
  return mgr.getServerConfig(id) !== undefined;
}

// Export MCPManager and MCPClient classes
export { MCPClient, MCPManager };

// Re-export types
export type {
  MCPServerConfig,
  PredefinedMCPServer,
  ServerStatus,
  ToolDefinition,
} from "./types";
