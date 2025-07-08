// Market Agent interface
export interface MarketAgent {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  selectedMCPs?: string[];
  disableToolReferences?: string[];
  version?: string;
  keywords?: string[];
  author?: {
    name: string;
    url?: string;
  };
  iconUrl?: string;
  createdAt: string;
  updatedAt: string;
}

// Raw agent API response interface
export interface MarketAgentApiResponse {
  agentId: string | number;
  agentJson: {
    name: string;
    description: string;
    systemPrompt: string;
    predefined: boolean;
    selectedMCPs: string[];
    disableToolReferences: string[];
    createdAt?: string;
    updatedAt?: string;
  };
  createdAt: string;
  updatedAt: string;
  mcpInstallations: Record<string, unknown>;
}

// MCP Server configuration interface
export interface MCPServerConfig {
  command: string;
  args: string[];
  env: Record<string, string>;
}

// Agent form data interface
export interface AgentFormData {
  name: string;
  description: string;
  systemPrompt: string;
  keywords: string;
  version: string;
  authorName: string;
  authorUrl: string;
}

// Create mode type
export type CreateMode = "create" | "existing" | null;
