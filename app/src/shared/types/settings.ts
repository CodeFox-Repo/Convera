/**
 * Model configuration for custom API endpoints
 */
export interface ModelConfig {
  id: string; // Unique identifier, e.g., "openrouter-1" or "custom-openai"
  name: string; // Display name, e.g., "OpenRouter" or "My OpenAI"
  endpoint: string; // API endpoint
  apiKey: string; // API key
  models: string[]; // Available models for this config
  isDefault?: boolean; // Whether this is the default config
}

/**
 * Special config ID for Foxychat remote server
 */
export const FOXYCHAT_CONFIG_ID = "foxychat-remote";

export interface OpenAISettings {
  // Legacy fields (kept for backward compatibility)
  endpoint: string;
  apiKey: string;
  modelId: string;
  supportedModels: string[];
  useRemoteStore: boolean;

  // New model config fields
  modelConfigs?: ModelConfig[];
  selectedConfigId?: string; // Current selected config ID
  selectedModelId?: string; // Current selected model ID within the config
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

export interface MCPConfig {
  command?: string;
  args?: string[];
  name?: string;
  url?: string;
  enabled?: boolean;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

/**
 * Installed MCP Server (from /api/mcp/installed-servers endpoint)
 */
export interface InstalledMCPServer {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  running: boolean;
  isPredefined: boolean;
  toolCount: number;
  serverUrl: string | null;
}

/**
 * Unified MCP Server type that includes all server information
 * kind: 'predefined' - Available predefined server
 * kind: 'installed' - Installed server (can be predefined or manual)
 */
export interface MCPServer {
  id: string;
  name: string;
  description: string;
  kind: "predefined" | "installed";
  // Common fields
  enabled?: boolean;
  running?: boolean;
  toolCount?: number;
  serverUrl?: string | null;

  // Predefined specific fields
  repoUrl?: string;
  logoUrl?: string;
  installInstructions?: string;
  isInstalled?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  defaultConfig?: Record<string, any>;

  // Installation specific fields
  isPredefined?: boolean; // If installed, was it from predefined list?
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
