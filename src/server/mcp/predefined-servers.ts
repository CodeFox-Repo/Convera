/**
 * Predefined MCP Servers
 * Contains a list of installable MCP servers
 */
import path from "path";
import * as os from "os";
import { PredefinedMCPServer } from "./types";

/**
 * Predefined MCP Servers List
 * Used to provide installable MCP server options
 */
export const PREDEFINED_SERVERS: PredefinedMCPServer[] = [
  {
    id: "Memory-MCP",
    name: "Talk To Memory MCP",
    repoUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/memory",
    description: "A MCP server that allows agents to use Memory",
    logoUrl: "/icons/Memory-logo.png",
    defaultConfig: {
      name: "Memory MCP",
      enabled: true,
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-memory"],
      env: {
        MEMORY_FILE_PATH: "/Users/allenz/.foxychat/memory.json",
      },
      description: "Connect to Memory via MCP",
    },
    installInstructions:
      "Ensure Memory is installed and bunx is set up with the MCP package.",
  },
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
    id: "Figma-MCP",
    name: "Talk To Figma MCP",
    repoUrl: "github.com/sonnylazuardi/cursor-talk-to-figma-mcp",
    description: "A MCP server that allows agents to use Figma",
    logoUrl: "/icons/Figma-logo.png",
    defaultConfig: {
      name: "Figma MCP",
      enabled: true,
      command: "bunx",
      args: ["cursor-talk-to-figma-mcp@latest"],
      description: "Connect to Figma via MCP",
    },
    installInstructions:
      "Ensure Figma is installed and bunx is set up with the MCP package.",
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
    installInstructions:
      "Ensure Excel is installed and bunx is set up with the MCP package.",
  },
  {
    id: "Notion-MCP",
    name: "Talk To Notion MCP",
    repoUrl: "github.com/makenotion/notion-mcp-server",
    description: "A MCP server that allows agents to use Notion",
    logoUrl: "/icons/Notion-logo.png",
    defaultConfig: {
      name: "Notion MCP",
      enabled: true,
      command: "npx",
      args: ["-y", "@notionhq/notion-mcp-server"],
      description: "Connect to Notion via MCP",
      env: {
        OPENAPI_MCP_HEADERS:
          '{"Authorization": "Bearer ntn_ChangeThisToYourNotionToken", "Notion-Version": "2022-06-28" }',
      },
    },
    installInstructions:
      "Ensure use Notion token and set it in mcp setting tab in section envirenment variables",
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
    installInstructions: "Ensure use canva token and set it in mcp setting tab",
  },
  {
    id: "browser-use-MCP",
    name: "Talk To browser MCP",
    repoUrl: "github.com/Saik0s/mcp-browser-use",
    description: "A MCP server that allows agents to use browser",
    logoUrl: "/icons/browser-logo.png",
    defaultConfig: {
      name: "browser MCP",
      enabled: false,
      command: "uv",
      args: [
        "--directory",
        "Your-Path/mcp-browser-use/src/mcp_server_browser_use",
        "run",
        "mcp-server-browser-use",
      ],
      description: "Connect to browser via MCP",
      env: {
        OPENROUTER_API_KEY: "api_key",
        MCP_MODEL_PROVIDER: "openrouter",
        MCP_MODEL_NAME: "openai/gpt-4.1",
        BROWSER_USE_LOGGING_LEVEL: "INFO",
        PYTHONIOENCODING: "utf-8",
        PYTHONUNBUFFERED: "1",
        PYTHONUTF8: "1",
        MCP_HEADLESS: "false",
        BROWSER_HEADLESS: "false",
        MCP_KEEP_BROWSER_OPEN: "true",
      },
    },
    installInstructions:
      "Clone the repo. Ensure OPENROUTER_API_KEY and directory of the projectset it in mcp setting tab",
  },
  {
    id: "Adobe-Photoshop-MCP",
    name: "Talk To Photoshop MCP",
    repoUrl: "github.com/mikechambers/adb-mcp",
    description: "A MCP server that allows agents to use Photoshop",
    logoUrl: "/icons/Photoshop-logo.png",
    defaultConfig: {
      name: "Photoshop MCP",
      enabled: true,
      command: "uv",
      args: [
        "run",
        "--with",
        "fonttools",
        "--with",
        "mcp",
        "--with",
        "mcp[cli]",
        "--with",
        "python-socketio",
        "--with",
        "requests",
        "--with",
        "websocket-client",
        "mcp",
        "run",
        "Your-Path/adb-mcp/mcp/ps-mcp.py",
      ],
      description: "Connect to Photoshop via MCP",
    },
    installInstructions:
      "Ensure Photoshop is installed and uv is set up with the MCP package. Clone the adb-mcp repository and run the ps-mcp.py file. Also run node adb-mcp/mcp/proxy.js",
  },
];

/**
 * Get all predefined servers
 */
export function getAllPredefinedServers(): PredefinedMCPServer[] {
  return PREDEFINED_SERVERS;
}

/**
 * Get predefined server by ID
 * @param id Server ID
 */
export function getPredefinedServerById(
  id: string,
): PredefinedMCPServer | undefined {
  return PREDEFINED_SERVERS.find((server) => server.id === id);
}
