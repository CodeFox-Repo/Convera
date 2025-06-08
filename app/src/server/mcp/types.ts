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

  // Tools configuration
  enabledTools?: string[];
  disabledTools?: string[];
  builtInToolsList?: string[]; // List of all available built-in tools
  autoEnableAllTools?: boolean; // Flag to automatically enable all discovered tools

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
  repoUrl?: string;
  description: string;
  defaultConfig: MCPServerConfig;
  logoUrl?: string;
  installInstructions?: string;
  builtIn?: boolean;
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

import { z } from "zod";

export const McpServerConfigSchema = z.object({
  url: z.string().optional(),
  apiKey: z.string().optional(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  env: z.record(z.string()).optional(),
  enabledTools: z.array(z.string()).optional(),
  disabledTools: z.array(z.string()).optional(),
  builtInToolsList: z.array(z.string()).optional(),
  autoEnableAllTools: z.boolean().optional(),
  name: z.string(),
  description: z.string().optional(),
  enabled: z.boolean(),
});

export const UpdateMcpConfigSchema = McpServerConfigSchema.partial();

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
