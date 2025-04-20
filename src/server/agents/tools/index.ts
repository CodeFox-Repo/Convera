/**
 * Agent tools index file
 */
import { ToolSet } from "ai";
import {
  addDependencyTool,
  deleteFileTool,
  renameFileTool,
  writeFileTool,
} from "./fileTools";
import { webSearch } from "./webSearchTool";
import { initProjectTool } from "./projectTools";
import { listProjectStructureTool } from "./listProjectStructureTool";

// Export all available tools as an object for registration
export const agentTools: ToolSet = {
  writeFile: writeFileTool,
  renameFile: renameFileTool,
  deleteFile: deleteFileTool,
  addDependency: addDependencyTool,
  webSearch: webSearch,
  initProject: initProjectTool,
  listProjectStructure: listProjectStructureTool,
};
export const availableToolNames = Object.keys(agentTools);

export const codefoxTools = {
  initProject: initProjectTool,
  writefileTool: writeFileTool,
  renameFileTool: renameFileTool,
  addDependencyTool: addDependencyTool,
};

// Filter tools by name
export const getToolsByNames = (names: string[]): ToolSet => {
  const subset: ToolSet = {};
  for (const name of names) {
    if (agentTools[name]) {
      subset[name] = agentTools[name];
    }
  }
  return subset;
};

// Export individual tools for modular use
export {
  writeFileTool,
  renameFileTool,
  deleteFileTool,
  addDependencyTool,
  webSearch,
  initProjectTool,
  listProjectStructureTool,
};
