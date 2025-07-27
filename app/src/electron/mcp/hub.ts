import {
  MCPConfig,
  MCPServerConfig,
  ServerInfo,
  ToolDefinition,
} from "@/shared/types/mcp";
import { EventEmitter } from "events";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { MCPConnection } from "./connection";

/**
 * MCPHub - Clean MCP connection manager
 * Focus on core functionality: connection management, configuration storage, tool calling
 */
export class MCPHub extends EventEmitter {
  private connections: Map<string, MCPConnection> = new Map();
  private config: MCPConfig;
  private configPath: string;
  private allToolNames: Set<string> = new Set();
  private toolsCache: ToolDefinition[] = [];
  private toolsCacheLastUpdate: number = 0;

  constructor(configPath?: string) {
    super();

    // Default configuration path is ~/.foxychat/mcp.json
    const defaultDir = path.join(os.homedir(), ".foxychat");
    this.configPath = configPath || path.join(defaultDir, "mcp.json");

    // Ensure directory exists
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Load configuration
    this.config = this.loadConfig();
  }

  /**
   * Load configuration file
   */
  private loadConfig(): MCPConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, "utf8");
        return JSON.parse(data);
      }
    } catch (error) {
      console.error("Error loading MCP config:", error);
    }

    // Default configuration
    return { mcpServers: {} };
  }

  /**
   * Save configuration file
   */
  private saveConfig(): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error("Error saving MCP config:", error);
    }
  }

  /**
   * Update tool names cache from all connected servers
   */
  private updateToolCache(): void {
    this.allToolNames.clear();
    this.toolsCache = [];

    for (const connection of this.connections.values()) {
      const serverInfo = connection.getServerInfo();
      if (serverInfo.status === "connected" && serverInfo.capabilities.tools) {
        serverInfo.capabilities.tools.forEach((tool) => {
          this.allToolNames.add(tool.name);
          this.toolsCache.push(tool);
        });
      }
    }

    this.toolsCacheLastUpdate = Date.now();
  }

  /**
   * Check if a tool exists in any connected server
   */
  public hasToolAvailable(toolName: string): boolean {
    return this.allToolNames.has(toolName);
  }

  /**
   * Get all tools that don't require input parameters
   * Returns cached result if cache is fresh (within 5 minutes)
   */
  public getAllNonInputParamTool(): ToolDefinition[] {
    const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
    const now = Date.now();

    // Check if cache is fresh
    if (
      this.toolsCacheLastUpdate &&
      now - this.toolsCacheLastUpdate < CACHE_DURATION
    ) {
      return this.filterNonInputParamTools(this.toolsCache);
    }

    // Update cache if it's stale
    this.updateToolCache();

    return this.filterNonInputParamTools(this.toolsCache);
  }

  /**
   * Filter tools that don't require input parameters
   */
  private filterNonInputParamTools(tools: ToolDefinition[]): ToolDefinition[] {
    return tools.filter((tool) => {
      // Check inputSchema first, then fallback to parameters
      const schema = tool.inputSchema || tool.parameters;

      if (!schema || typeof schema !== "object") {
        return true; // No schema means no parameters required
      }

      // Handle different schema formats
      if ("properties" in schema && "required" in schema) {
        // JSON Schema format
        const required = Array.isArray(schema.required) ? schema.required : [];
        return required.length === 0;
      }

      if ("type" in schema && schema.type === "object") {
        // JSON Schema object without required field
        const schemaWithRequired = schema as Record<string, unknown> & {
          required?: unknown;
        };
        const required = Array.isArray(schemaWithRequired.required)
          ? schemaWithRequired.required
          : [];
        return required.length === 0;
      }

      // If we can't determine the structure, assume it has no required params
      return true;
    });
  }

  /**
   * Initialize and start all enabled servers
   */
  async initialize(): Promise<void> {
    const servers = Object.entries(this.config.mcpServers);

    // Start all connections concurrently without waiting for completion
    // This avoids blocking initialization on slow/failing connections
    servers
      .filter(([, serverConfig]) => serverConfig.disabled !== true)
      .forEach(([name, serverConfig]) => {
        this.connectServer(name, serverConfig).catch((error) => {
          console.error(`✗ Failed to connect MCP server ${name}:`, error);
        });
      });

    console.log(`MCP initialization started for ${servers.length} servers`);
  }

  /**
   * Connect to a single server
   */
  async connectServer(
    name: string,
    config: MCPServerConfig,
  ): Promise<ServerInfo> {
    // If connection already exists, disconnect first
    if (this.connections.has(name)) {
      await this.disconnectServer(name);
    }

    const connection = new MCPConnection(name, config);

    // Forward events
    connection.on("toolsChanged", (data) => this.emit("toolsChanged", data));
    connection.on("resourcesChanged", (data) =>
      this.emit("resourcesChanged", data),
    );
    connection.on("promptsChanged", (data) =>
      this.emit("promptsChanged", data),
    );

    this.connections.set(name, connection);
    await connection.connect();

    // Update tool cache when a server connects
    this.updateToolCache();

    return connection.getServerInfo();
  }

  /**
   * Disconnect from a single server
   */
  async disconnectServer(name: string): Promise<void> {
    const connection = this.connections.get(name);
    if (connection) {
      try {
        await connection.disconnect();
      } catch (error) {
        console.error(`Error disconnecting server ${name}:`, error);
      }
      this.connections.delete(name);

      // Update tool cache when a server disconnects
      this.updateToolCache();
    }
  }

  /**
   * Start server
   */
  async startServer(name: string): Promise<ServerInfo> {
    const config = this.config.mcpServers[name];
    if (!config) {
      throw new Error(`Server '${name}' not found in configuration`);
    }

    const connection = this.connections.get(name);
    if (!connection) {
      // If connection doesn't exist, create new connection
      return await this.connectServer(name, config);
    }

    const result = await connection.start();

    // Update tool cache when server starts
    this.updateToolCache();

    return result;
  }

  /**
   * Stop server
   */
  async stopServer(name: string): Promise<ServerInfo> {
    const connection = this.connections.get(name);
    if (!connection) {
      throw new Error(`Server '${name}' not found`);
    }

    const result = await connection.stop();

    // Update tool cache when server stops
    this.updateToolCache();

    return result;
  }

  /**
   * Add new server
   */
  async addServer(name: string, config: MCPServerConfig): Promise<ServerInfo> {
    this.config.mcpServers[name] = config;
    this.saveConfig();

    if (config.disabled !== true) {
      return await this.connectServer(name, config);
    } else {
      // Create connection but don't start
      const connection = new MCPConnection(name, config);
      this.connections.set(name, connection);
      return connection.getServerInfo();
    }
  }

  /**
   * Remove server
   */
  async removeServer(name: string): Promise<void> {
    await this.disconnectServer(name);
    delete this.config.mcpServers[name];
    this.saveConfig();
  }

  /**
   * Update server configuration
   */
  async updateServer(
    name: string,
    config: MCPServerConfig,
  ): Promise<ServerInfo> {
    this.config.mcpServers[name] = config;
    this.saveConfig();

    const connection = this.connections.get(name);
    if (connection) {
      return connection.getServerInfo();
    } else {
      // If no connection exists, create one if enabled
      if (config.disabled !== true) {
        return await this.connectServer(name, config);
      } else {
        // Create connection but don't start
        const connection = new MCPConnection(name, config);
        this.connections.set(name, connection);
        return connection.getServerInfo();
      }
    }
  }

  /**
   * Get server status
   */
  getServerStatus(name: string): ServerInfo {
    const connection = this.connections.get(name);
    if (!connection) {
      throw new Error(`Server '${name}' not found`);
    }
    return connection.getServerInfo();
  }

  /**
   * Get all server statuses
   */
  getAllServerStatuses(): ServerInfo[] {
    return Array.from(this.connections.values()).map((conn) =>
      conn.getServerInfo(),
    );
  }

  /**
   * Call tool
   */
  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const connection = this.connections.get(serverName);
    if (!connection) {
      throw new Error(`Server '${serverName}' not found`);
    }
    return await connection.callTool(toolName, args);
  }

  /**
   * Simplified tool call method - finds first server with the tool name
   * Returns null if tool is not found, so caller can decide what to do
   */
  async mcpToolCall(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    // Quick check: if tool doesn't exist in cache, return null (not an MCP tool)
    if (!this.hasToolAvailable(toolName)) {
      return null;
    }

    // Find the first connected server that has this tool
    for (const connection of this.connections.values()) {
      const serverInfo = connection.getServerInfo();
      if (serverInfo.status === "connected" && serverInfo.capabilities.tools) {
        const hasTool = serverInfo.capabilities.tools.some(
          (tool) => tool.name === toolName,
        );
        if (hasTool) {
          try {
            return await connection.callTool(toolName, args);
          } catch (error) {
            return `Tool execution failed: ${error instanceof Error ? error.message : "Unknown error"}`;
          }
        }
      }
    }

    return null; // Tool not found, let caller handle it
  }

  /**
   * Read resource
   */
  async readResource(serverName: string, uri: string): Promise<unknown> {
    const connection = this.connections.get(serverName);
    if (!connection) {
      throw new Error(`Server '${serverName}' not found`);
    }
    return await connection.readResource(uri);
  }

  /**
   * Get prompt
   */
  async getPrompt(
    serverName: string,
    promptName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const connection = this.connections.get(serverName);
    if (!connection) {
      throw new Error(`Server '${serverName}' not found`);
    }
    return await connection.getPrompt(promptName, args);
  }

  /**
   * Get configuration
   */
  getConfig(): MCPConfig {
    return this.config;
  }

  /**
   * Update configuration
   */
  async updateConfig(newConfig: MCPConfig): Promise<void> {
    this.config = newConfig;
    this.saveConfig();
  }

  /**
   * Disconnect all connections
   */
  async disconnectAll(): Promise<void> {
    const disconnectPromises = Array.from(this.connections.keys()).map((name) =>
      this.disconnectServer(name),
    );

    await Promise.allSettled(disconnectPromises);
    this.connections.clear();
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    await this.disconnectAll();
  }

  /**
   * Get connection instance
   */
  getConnection(name: string): MCPConnection | undefined {
    return this.connections.get(name);
  }

  /**
   * List all server names
   */
  listServers(): string[] {
    return Object.keys(this.config.mcpServers);
  }

  /**
   * Check if server exists
   */
  hasServer(name: string): boolean {
    return this.connections.has(name);
  }

  /**
   * Get the number of connected servers
   */
  getConnectedCount(): number {
    return Array.from(this.connections.values()).filter(
      (conn) => conn.getServerInfo().status === "connected",
    ).length;
  }
}
