/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * MCP Module Entry Point
 * Provides a unified API interface
 */
import { MCPRegistry } from "./mcp-registry";
import { MCPClient } from "./mcp-client";
import { ServerManager } from "./server-manager";
import { MCPConfigManager } from "./config-manager";
import type {
  ToolDefinition,
  PredefinedMCPServer,
  MCPServerConfig,
} from "./types";
import { tool } from "ai";
import { z } from "zod";

// Initialize MCP registry instance
let registry: MCPRegistry | null = null;

/**
 * Initialize MCP system
 */
export function initializeMCP(configPath?: string): MCPRegistry {
  if (!registry) {
    registry = MCPRegistry.getInstance(configPath);
    console.log("MCP system initialized");
  }
  return registry;
}

/**
 * Get MCP registry instance
 */
export function getMCPRegistry(): MCPRegistry {
  if (!registry) {
    registry = initializeMCP();
  }
  return registry;
}

/**
 * Start all enabled MCP servers
 */
export async function startMCPServers(): Promise<Map<string, boolean>> {
  const reg = getMCPRegistry();
  return reg.startAllEnabled();
}

/**
 * Stop all MCP servers
 */
export async function stopMCPServers(): Promise<Map<string, boolean>> {
  const reg = getMCPRegistry();
  return reg.stopAll();
}

/**
 * Get all available MCP tools
 */
export async function listAllMCPTools(): Promise<
  { serverId: string; tool: ToolDefinition }[]
> {
  const reg = getMCPRegistry();
  return reg.listAllTools();
}

/**
 * Run MCP tool by tool name
 */
export async function runMCPTool<T>(
  toolName: string,
  input: Record<string, unknown>,
): Promise<T> {
  const reg = getMCPRegistry();
  return reg.runToolByName<T>(toolName, input);
}

/**
 * Import MCP configuration
 */
export function importMCPConfig(configJson: string): boolean {
  const reg = getMCPRegistry();
  return reg.importFromJson(configJson);
}

/**
 * Export MCP configuration
 */
export function exportMCPConfig(): string {
  const reg = getMCPRegistry();
  return reg.exportToJson();
}

/**
 * Add MCP tools for chat API
 * Returns tool objects that can be added to the tool list in chatServer.ts
 */
export async function getMCPToolsForChat(): Promise<Record<string, any>> {
  const registry = getMCPRegistry();
  const allTools = await listAllMCPTools();
  const aiTools: Record<string, any> = {};

  // Convert each MCP tool to AI SDK format
  for (const { serverId, tool: mcpTool } of allTools) {
    try {
      const toolName = mcpTool.name;
      // Create a Zod schema from the MCP tool parameters
      const paramSchema = createZodSchemaFromMCPParams(mcpTool.parameters);

      // Create the AI SDK tool
      aiTools[toolName] = tool({
        description: mcpTool.description || `Tool: ${toolName}`,
        parameters: paramSchema,
        execute: async (params: Record<string, unknown>) => {
          try {
            // Call the MCP tool through the registry
            const result = await registry.runTool(serverId, toolName, params);
            // Convert result to string if it's not already
            return typeof result === "string" ? result : JSON.stringify(result);
          } catch (error: unknown) {
            const errorMessage =
              error instanceof Error ? error.message : "Unknown error";
            console.error(`Error executing MCP tool ${toolName}:`, error);
            return `Error executing ${toolName}: ${errorMessage}`;
          }
        },
      });

      console.log(`Successfully converted MCP tool: ${toolName}`);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(
        `Failed to convert MCP tool ${mcpTool.name}:`,
        errorMessage,
      );
    }
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
  const reg = getMCPRegistry();
  return reg.getAvailablePredefinedServers();
}

/**
 * Get specified predefined MCP server
 * @param id Predefined server ID
 */
export function getPredefinedServer(
  id: string,
): PredefinedMCPServer | undefined {
  const reg = getMCPRegistry();
  return reg.getPredefinedServer(id);
}

/**
 * Install predefined MCP server
 * @param id Predefined server ID
 * @param customConfig Custom configuration (optional)
 * @returns Whether installation was successful
 */
export function installPredefinedMCPServer(
  id: string,
  customConfig?: Partial<MCPServerConfig>,
): boolean {
  const reg = getMCPRegistry();
  return reg.installPredefinedServer(id, customConfig);
}

/**
 * Check if predefined server is installed
 * @param id Predefined server ID
 */
export function isPredefinedServerInstalled(id: string): boolean {
  const reg = getMCPRegistry();
  return reg.isPredefinedServerInstalled(id);
}

// Export all classes and types
export { MCPRegistry, MCPClient, ServerManager, MCPConfigManager };

// Re-export types
export type {
  ToolDefinition,
  MCPServerConfig,
  ServerStatus,
  PredefinedMCPServer,
} from "./types";
