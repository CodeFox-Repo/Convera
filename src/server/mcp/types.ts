/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * MCP Server Configuration and Type Definitions
 */
import { Server } from "http";

/**
 * MCP Server Configuration
 */
export interface MCPServerConfig {
  // Remote server configuration
  url?: string;
  apiKey?: string;

  // Local server configuration
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;

  // Metadata
  name: string;
  description?: string;
  enabled: boolean;
}

/**
 * Predefined MCP Server
 */
export interface PredefinedMCPServer {
  id: string;
  name: string;
  repoUrl: string;
  description: string;
  defaultConfig: MCPServerConfig;
  logoUrl?: string;
  installInstructions?: string;
}

/**
 * MCP Configuration
 */
export interface MCPConfig {
  mcpServers: Record<string, MCPServerConfig>;
}

/**
 * Tool Definition
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: any;
  returns?: any;
}

/**
 * Server Status
 */
export interface ServerStatus {
  id: string;
  running: boolean;
  url?: string;
  pid?: number;
  tools?: ToolDefinition[];
  error?: string;
}

/**
 * Server Instance Interface
 */
export interface ServerInstance {
  id: string;
  config: MCPServerConfig;
  server: Server | null;
  status: ServerStatus;
  client: any;
  start(): Promise<boolean>;
  stop(): Promise<boolean>;
  getStatus(): ServerStatus;
  isRunning(): boolean;
  updateTools(): Promise<void>;
}
