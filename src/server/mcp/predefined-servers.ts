/**
 * Predefined MCP Servers
 * Contains a list of installable MCP servers
 */
import { PredefinedMCPServer } from "./types";

/**
 * Predefined MCP Servers List
 * Used to provide installable MCP server options
 */
export const PREDEFINED_SERVERS: PredefinedMCPServer[] = [
  {
    id: "Figma-MCP",
    name: "Talk To Figma MCP",
    repoUrl: "github.com/sonnylazuardi/cursor-talk-to-figma-mcp",
    description: "A MCP server that allows agents to use Figma",
    logoUrl: "/icons/Figma-logo.png",
    defaultConfig: {
      name: "Figma MCP",
      enabled: false,
      command: "bunx",
      args: ["cursor-talk-to-figma-mcp@latest"],
      description: "Connect to Figma via MCP",
    },
    installInstructions:
      "Ensure Figma is installed and bunx is set up with the MCP package.",
  },
  {
    id: "Notion-MCP",
    name: "Talk To Notion MCP",
    repoUrl: "github.com/makenotion/notion-mcp-server",
    description: "A MCP server that allows agents to use Notion",
    logoUrl: "/icons/Notion-logo.png",
    defaultConfig: {
      name: "Notion MCP",
      enabled: false,
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
      enabled: false,
      command: "npx",
      args: ["-y", "@canva/cli@latest", "mcp"],
      description: "Connect to canva via MCP",
    },
    installInstructions: "Ensure use canva token and set it in mcp setting tab",
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
