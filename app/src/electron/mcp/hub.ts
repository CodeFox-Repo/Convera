import { MCPConfig, MCPServerConfig, ServerInfo } from "@/shared/types/mcp";
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
   * Initialize and start all enabled servers
   */
  async initialize(): Promise<void> {
    const servers = Object.entries(this.config.mcpServers);
    console.log(`Initializing ${servers.length} MCP servers`);

    for (const [name, serverConfig] of servers) {
      if (serverConfig.enabled !== false) {
        try {
          await this.connectServer(name, serverConfig);
          console.log(`✓ Connected MCP server: ${name}`);
        } catch (error) {
          console.error(`✗ Failed to connect MCP server ${name}:`, error);
        }
      } else {
        console.log(`- Skipped disabled MCP server: ${name}`);
      }
    }
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

    return await connection.start();
  }

  /**
   * Stop server
   */
  async stopServer(name: string): Promise<ServerInfo> {
    const connection = this.connections.get(name);
    if (!connection) {
      throw new Error(`Server '${name}' not found`);
    }

    return await connection.stop();
  }

  /**
   * Add new server
   */
  async addServer(name: string, config: MCPServerConfig): Promise<ServerInfo> {
    this.config.mcpServers[name] = config;
    this.saveConfig();

    if (config.enabled !== false) {
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
      if (config.enabled !== false) {
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
    console.log("Cleaning up MCP Hub...");
    await this.disconnectAll();
    console.log("MCP Hub cleanup completed");
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
