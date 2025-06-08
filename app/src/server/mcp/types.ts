/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * MCP Server Configuration and Type Definitions
 */
import { Server } from "http";

/**
 * General MCP Server Configuration (external format)
 * This is the standard format used in MCP documentation and third-party configs
 */
export interface GeneralMCPServerConfig {
  // Remote server configuration
  url?: string;
  apiKey?: string;

  // Local server configuration
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;

  // Tools configuration
  enabledTools?: string[];
  disabledTools?: string[];
  autoEnableAllTools?: boolean;

  // Optional metadata
  description?: string;
}

/**
 * Database MCP Server Configuration (internal format)
 * This includes our internal fields for managing servers
 */
export interface MCPServerConfig extends GeneralMCPServerConfig {
  name: string;
  enabled: boolean;
  builtInToolsList?: string[];
}

/**
 * Predefined MCP Server
 */
export interface PredefinedMCPServer {
  id: string;
  name: string;
  repoUrl?: string;
  description: string;
  defaultConfig: MCPServerConfig;
  logoUrl?: string;
  installInstructions?: string;
  builtIn?: boolean;
}

/**
 * General MCP Configuration (external format)
 */
export interface GeneralMCPConfig {
  mcpServers: Record<string, GeneralMCPServerConfig>;
}

/**
 * Database MCP Configuration (internal format)
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

import { z } from "zod";

// General MCP Server Config Schema (external format)
export const GeneralMcpServerConfigSchema = z.object({
  url: z.string().optional(),
  apiKey: z.string().optional(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  env: z.record(z.string()).optional(),
  enabledTools: z.array(z.string()).optional(),
  disabledTools: z.array(z.string()).optional(),
  autoEnableAllTools: z.boolean().optional(),
  description: z.string().optional(),
});

// Database MCP Server Config Schema (internal format)
export const McpServerConfigSchema = GeneralMcpServerConfigSchema.extend({
  name: z.string(),
  enabled: z.boolean(),
  builtInToolsList: z.array(z.string()).optional(),
});

export const UpdateMcpConfigSchema = McpServerConfigSchema.partial();

// General MCP Config Schema (for manual installation)
export const GeneralMCPConfigSchema = z.object({
  mcpServers: z.record(GeneralMcpServerConfigSchema),
});

// Internal MCP Config Schema (for database storage)
export const ManualMCPConfigSchema = z.object({
  mcpServers: z.record(McpServerConfigSchema),
});

export const McpSettingsSchema = z.object({
  toolId: z.string(),
  settings: z.record(z.any()),
});

export const DisabledToolsSchema = z.object({
  disabledTools: z.array(z.string()),
});

export const IdSchema = z.object({
  id: z.string(),
});

export type McpServerConfigPayload = z.infer<typeof McpServerConfigSchema>;
