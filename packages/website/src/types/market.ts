// Shared types for Agent Market and MCP functionality

export interface MCPInstallation {
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  url?: string;
  apiKey?: string;
  description?: string;
  isSSE?: boolean;
  name?: string;
  version?: string;
  keywords?: string[];
  author?: MCPAuthor;
}

// Simplified MCP Installation for the new structure
export interface MCPInstallationSimple {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}

export interface MCPServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}

// Legacy interface for backwards compatibility
export interface MCPServerConfigLegacy {
  name?: string;
  disabled?: boolean;
  enabled?: boolean;
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  url?: string;
  apiKey?: string;
  description?: string;
  isSSE?: boolean;
  isApp?: boolean;
}

// MCP Installation configuration structure
export interface MCPInstallationConfig {
  mcpServers: Record<string, MCPServerConfig>;
}

export interface MCPAuthor {
  name: string;
  url?: string;
}

export interface MCPDetailedConfig {
  id: string;
  name: string;
  description: string;
  config: MCPServerConfig;
  version?: string;
  keywords?: string[];
  author?: MCPAuthor;
}

export interface MCPServerOption {
  serverId: string;
  name?: string;
  description?: string;
}

export interface MCPServer {
  id: string;
  name: string;
  description: string;
  iconUrl: string;
  config: MCPServerConfig;
  version: string;
  keywords: string[];
  author: MCPAuthor;
  fileType: string | null;
  fileContent: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MCPFile {
  type: "dataUrl" | "url" | "path";
  content: string;
}

// Agent Market Types
export interface MarketAgentApi {
  agentId: number;
  publisherId: string;
  agentJson: {
    id: string;
    name: string;
    description: string;
    systemPrompt: string;
    predefined: boolean;
    selectedMCPs?: string[];
    disableToolReferences?: string[];
    createdAt: string;
    updatedAt: string;
  };
  createdAt: string;
  updatedAt: string;
  mcpInstallations?: Record<string, MCPInstallation>;
}

export interface MarketAgent {
  id: number | string;
  name: string;
  description: string;
  systemPrompt: string;
  predefined: boolean;
  selectedMCPs?: string[];
  disableToolReferences?: string[];
  createdAt: string;
  updatedAt: string;
  mcpInstallations?: Record<string, unknown>;
}

// Form Data Types
export interface AgentFormData {
  name: string;
  description: string;
  systemPrompt: string;
  predefined: boolean;
  selectedMCPs: string[];
  disableToolsStr: string;
}

export interface MCPFormData {
  name: string;
  command: string;
  args: string;
  url: string;
  apiKey: string;
  description: string;
  cwd: string;
  env: string;
  isSSE: boolean;
}

export interface MCPManagementFormData {
  serverId: string;
  name: string;
  description: string;
  iconUrl: string;
  command: string;
  args: string;
  url: string;
  apiKey: string;
  version: string;
  keywords: string;
  authorName: string;
  authorUrl: string;
}
