// MCP Types

// Connection status constants (from connection.ts)
export const ConnectionStatus = {
  CONNECTED: "connected",
  CONNECTING: "connecting",
  DISCONNECTED: "disconnected",
  UNAUTHORIZED: "unauthorized",
  DISABLED: "disabled",
  ERROR: "error",
} as const;

export type ConnectionStatusType =
  (typeof ConnectionStatus)[keyof typeof ConnectionStatus];

// Connection timeout for initial connection (5 minutes for installs)
export const CLIENT_CONNECT_TIMEOUT = 5 * 60000;

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
  isApp?: boolean;
}

export interface MCPConfig {
  mcpServers: Record<string, MCPServerConfig>;
}

export interface ToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
  annotations?: {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    openWorldHint?: boolean;
  };
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
  status: ConnectionStatusType;
  error?: string;
  capabilities: ServerCapabilities;
  uptime: number;
  lastStarted?: string;
  authorizationUrl?: string;
  isApp?: boolean;
}

export interface ConnectionError extends Error {
  code?: string;
  data?: Record<string, unknown>;
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

  // Simplified tool call - finds first server with the tool
  mcpToolCall(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<MCPIPCResponse<unknown>>;
}
