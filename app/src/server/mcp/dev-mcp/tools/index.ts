/**
 * Dev MCP Server tools index file
 */
import { ToolReference } from "@/server/agents/types";
import { ToolSet, tool } from "ai";
import { z } from "zod";
import {
  addDependencyTool,
  deleteFileTool,
  renameFileTool,
  writeFileTool,
} from "./fileTools";
import { listProjectStructureTool } from "./listProjectStructureTool";
import { initProjectTool } from "./projectTools";
import { webSearch } from "./webSearchTool";

// Export all available tools as an object for registration
export const serverTools: ToolSet = {
  writeFile: writeFileTool,
  renameFile: renameFileTool,
  deleteFile: deleteFileTool,
  addDependency: addDependencyTool,
  webSearch: webSearch,
  initProject: initProjectTool,
  listProjectStructure: listProjectStructureTool,
};

// Export all available tool names
export const availableToolNames = Object.keys(serverTools);

/**
 * Get information about all available tools
 * @returns Array of tool information objects
 */
export function getAvailableTools() {
  return Object.entries(serverTools).map(([name, tool]) => ({
    name,
    description: tool.description,
  }));
}

export const codefoxTools = {
  initProject: initProjectTool,
  writefileTool: writeFileTool,
  renameFileTool: renameFileTool,
  addDependencyTool: addDependencyTool,
};

// Function to create a placeholder tool for MCP tools that aren't available locally
const createPlaceholderTool = (toolName: string, mcpName: string) => {
  return tool({
    description: `Tool '${toolName}' from MCP server '${mcpName}'`,
    parameters: z.object({
      unused: z
        .string()
        .optional()
        .describe("Any parameters passed to the tool"),
    }),
    execute: async ({ unused }) => {
      console.log(
        `Tool ${toolName} from ${mcpName} was called but has no implementation`,
        unused,
      );
      return {
        result: `Tool ${toolName} from ${mcpName} is not currently available`,
      };
    },
  });
};

// Filter tools by name - supports both string format and ToolReference format
export const getToolsByNames = (
  names: Array<string | ToolReference>,
): ToolSet => {
  const subset: ToolSet = {};
  const notFound: string[] = [];

  console.log(`getToolsByNames: Trying to find ${names.length} tools`, names);

  names.forEach((nameOrRef) => {
    // Handle both string format and ToolReference format
    if (typeof nameOrRef === "object" && nameOrRef !== null) {
      // This is a ToolReference object
      const toolRef = nameOrRef as ToolReference;
      const toolId = `${toolRef.mcpName}:${toolRef.toolName}`;
      console.log(
        `Looking for tool ${toolRef.toolName} from MCP ${toolRef.mcpName}`,
      );

      // Special handling for different MCP types
      if (toolRef.mcpName === "Dev-MCP" || toolRef.mcpName === "codefox-mcp") {
        if (serverTools[toolRef.toolName]) {
          subset[toolRef.toolName] = serverTools[toolRef.toolName];
          console.log(`✅ Tool found in serverTools: ${toolRef.toolName}`);
        } else {
          console.log(`⚠️ Tool not found in serverTools: ${toolRef.toolName}`);
          notFound.push(toolId);
        }
      } else {
        // For other MCP servers, we still want to register the tool name
        // even if we don't have the implementation right now
        // This preserves the tool reference for the agent
        console.log(`Adding placeholder for non-Dev-MCP tool: ${toolId}`);

        // Add a placeholder tool for non-standard MCP tools
        subset[toolRef.toolName] = createPlaceholderTool(
          toolRef.toolName,
          toolRef.mcpName,
        );
      }
    } else if (typeof nameOrRef === "string") {
      // This is a string, could be either "mcpId:toolName" or just "toolName"
      const fullName = nameOrRef;
      const parts = fullName.split(":");

      if (parts.length > 1) {
        // Format is "mcpId:toolName"
        const mcpId = parts[0];
        const toolName = parts[1];

        console.log(`Looking for tool ${toolName} from MCP ${mcpId}`);

        // Handle various MCP IDs that might be used
        if (
          (mcpId === "Dev-MCP" || mcpId === "codefox-mcp") &&
          serverTools[toolName]
        ) {
          subset[toolName] = serverTools[toolName];
        } else {
          console.log(`⚠️ Tool not found for ${mcpId}:${toolName}`);
          notFound.push(fullName);

          // Add placeholder for non-standard MCP tools
          subset[toolName] = createPlaceholderTool(toolName, mcpId);
        }
      } else {
        // Just a tool name without MCP prefix
        const toolName = fullName;
        if (serverTools[toolName]) {
          subset[toolName] = serverTools[toolName];
          console.log(`✅ Tool found in serverTools: ${toolName}`);
        } else {
          console.log(`⚠️ Tool not found for ${toolName} (no MCP prefix)`);
          notFound.push(toolName);
        }
      }
    }
  });

  console.log(
    `getToolsByNames: Found ${Object.keys(subset).length} tools, missing ${notFound.length} tools`,
    { found: Object.keys(subset), notFound },
  );

  return subset;
};

// Export individual tools for modular use
export {
  addDependencyTool,
  deleteFileTool,
  initProjectTool,
  listProjectStructureTool,
  renameFileTool,
  webSearch,
  writeFileTool,
};
