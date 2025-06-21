// MCP Types

export interface MCPServerConfig {
  name?: string;
  enabled?: boolean;
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  url?: string;
  apiKey?: string;
  description?: string;
}

export interface MCPConfig {
  mcpServers: Record<string, MCPServerConfig>;
}

export interface ToolDefinition {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

export interface ResourceDefinition {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

export interface ResourceTemplate {
  uriTemplate: string;
  name?: string;
  description?: string;
}

export interface PromptDefinition {
  name: string;
  description?: string;
  arguments?: Record<string, unknown>[];
}

export interface ServerCapabilities {
  tools: ToolDefinition[];
  resources: ResourceDefinition[];
  resourceTemplates: ResourceTemplate[];
  prompts: PromptDefinition[];
}

export interface ServerInfo {
  name: string;
  displayName: string;
  description?: string;
  transportType: string;
  status: string;
  error?: string;
  capabilities: ServerCapabilities;
  uptime: number;
  lastStarted?: string;
  authorizationUrl?: string;
}

export interface MCPIPCResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// MCP API interface
export interface IMcpAPI {
  // Server management
  getServers(): Promise<MCPIPCResponse<ServerInfo[]>>;
  startServer(serverId: string): Promise<MCPIPCResponse<ServerInfo>>;
  stopServer(serverId: string): Promise<MCPIPCResponse<ServerInfo>>;

  // Configuration management
  getConfigurations(): Promise<MCPIPCResponse<MCPConfig>>;
  addServer(
    serverId: string,
    config: MCPServerConfig,
  ): Promise<MCPIPCResponse<ServerInfo>>;
  updateServer(
    serverId: string,
    config: MCPServerConfig,
  ): Promise<MCPIPCResponse<ServerInfo>>;
  removeServer(serverId: string): Promise<MCPIPCResponse<null>>;

  // Tool operations
  callTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<MCPIPCResponse<unknown>>;
}
