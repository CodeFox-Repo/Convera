/**
 * Predefined MCP Servers
 * Contains a list of installable MCP servers
 */
import { MCPServerType, PredefinedMCPServer } from "./types";

/**
 * Predefined MCP Servers List
 * Used to provide installable MCP server options
 */
export const PREDEFINED_SERVERS: PredefinedMCPServer[] = [
  {
    id: "Dev-MCP",
    name: "Development Tools MCP",
    repoUrl: "internal",
    description:
      "A MCP server that provides development tools from FoxyChat's integrated tools",
    logoUrl: "/icons/dev-tools-logo.png",
    builtIn: true,
    defaultConfig: {
      name: "Development Tools MCP",
      enabled: true,
      enabledTools: [
        "writeFile",
        "renameFile",
        "deleteFile",
        "addDependency",
        "webSearch",
        "initProject",
        "listProjectStructure",
      ],
    },
    installInstructions:
      "This MCP server is built-in and provides tools for code generation and project analysis.",
  },
  {
    id: "vscode-mcp-server",
    name: "VSCode MCP Server",
    repoUrl: "github.com/microsoft/vscode-mcp-server",
    description: "A MCP server that integrates with Visual Studio Code",
    logoUrl: "/icons/vscode-logo.png",
    defaultConfig: {
      name: "VSCode MCP Server",
      enabled: true,
      command: "npx",
      args: ["smalboy-vscode-mcp-server"],
      env: {},
      description: "Connect to VSCode via MCP",
    },
    installInstructions:
      "This MCP server provides integration with Visual Studio Code. Make sure you have Node.js installed.",
  },
  {
    id: "Excel-MCP",
    name: "Talk To Excel MCP",
    repoUrl: "https://github.com/negokaz/excel-mcp-server",
    description: "A MCP server that allows agents to use Excel",
    logoUrl: "/icons/Excel-logo.png",
    defaultConfig: {
      name: "Excel MCP",
      enabled: true,
      command: "npx",
      args: ["--yes", "@negokaz/excel-mcp-server"],
      env: {
        EXCEL_MCP_PAGING_CELLS_LIMIT: "4000",
      },
      description: "Connect to Excel via MCP",
    },
  },
  {
    id: "canva-MCP",
    name: "Talk To canva MCP",
    repoUrl: "www.canva.dev/docs/apps/mcp-server/",
    description: "A MCP server that allows agents to use canva",
    logoUrl: "/icons/canva-logo.png",
    defaultConfig: {
      name: "canva MCP",
      enabled: true,
      command: "npx",
      args: ["-y", "@canva/cli@latest", "mcp"],
      description: "Connect to canva via MCP",
    },
  },
];

/**
 * Predefined Remote MCP Servers List
 * Used to provide installable MCP server options
 */
export const PREDEFINED_REMOTE_SERVERS: PredefinedMCPServer[] = [
  {
    id: "Gmail",
    name: "Gmail",
    description: "Gmail Remote MCP Server",
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/commons/7/7e/Gmail_icon_%282020%29.svg",
    defaultConfig: {
      name: "Gmail",
      enabled: true,
      command: "npx",
      args: ["mcp-remote", "http://localhost:8788/sse"],
    },
  },
];

/**
 * Get all predefined servers
 */
export function getAllPredefinedServers(
  type: MCPServerType,
): PredefinedMCPServer[] {
  if (type === MCPServerType.LOCAL) {
    return PREDEFINED_SERVERS;
  } else {
    return PREDEFINED_REMOTE_SERVERS;
  }
}

/**
 * Get predefined server by ID
 * @param id Server ID
 */
export function getPredefinedServerById(
  id: string,
  type: MCPServerType,
): PredefinedMCPServer | undefined {
  if (type === MCPServerType.LOCAL) {
    return PREDEFINED_SERVERS.find((server) => server.id === id);
  } else {
    return PREDEFINED_REMOTE_SERVERS.find((server) => server.id === id);
  }
}
