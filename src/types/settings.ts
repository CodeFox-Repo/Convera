export interface OpenAISettings {
  endpoint: string;
  apiKey: string;
  modelId: string;
  supportedModels: string[];
}

export interface ShortcutSettings {
  id: string;
  name: string;
  shortcut: string;
  enabled: boolean;
}

export interface McpMarketplaceItem {
  mcpId: string;
  githubUrl: string;
  name: string;
  author: string;
  description: string;
  codiconIcon: string;
  logoUrl: string;
  category: string;
  tags: string[];
  requiresApiKey: boolean;
  isRecommended: boolean;
  githubStars: number;
  downloadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface McpMarketplaceCatalog {
  items: McpMarketplaceItem[];
}

/**
 * Predefined MCP Server from our backend
 */
export interface PredefinedMCPServer {
  id: string;
  name: string;
  repoUrl: string;
  description: string;
  defaultConfig: any; // Matches MCPServerConfig from the backend
  logoUrl?: string;
  installInstructions?: string;
  isInstalled?: boolean; // Added by the API response
}

export interface McpToolSettings {
  [toolId: string]: {
    [settingKey: string]: string | number | boolean | string[] | null;
  };
}

export interface McpServerSettings {
  serverUrl: string;
  requestTimeout: number;
}

export interface McpSettings {
  tools: McpToolSettings;
  server: McpServerSettings;
}

export interface AppSettings {
  openai: OpenAISettings;
  shortcuts: ShortcutSettings[];
  mcp?: McpSettings;
}
