/**
 * Unified MCP Manager
 * Integrates server management, configuration, and registry functionality
 * into a single, simplified interface
 */
import { ChildProcess } from "child_process";
import { EventEmitter } from "events";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { serverTools } from "./dev-mcp/tools";
import { MCPClient } from "./mcp-client";
import {
  PREDEFINED_SERVERS,
  getPredefinedServerById,
} from "./predefined-servers";
import {
  MCPConfig,
  MCPServerConfig,
  PredefinedMCPServer,
  ServerStatus,
} from "./types";

/**
 * Unified MCP Manager
 * Responsible for all MCP-related operations including:
 * - Server lifecycle management
 * - Configuration management
 * - Server registry
 * - Tool management
 */
export class MCPManager extends EventEmitter {
  private servers: Map<
    string,
    {
      process: ChildProcess | null;
      status: ServerStatus;
      client: MCPClient | null;
      serverUrl: string | null;
      config: MCPServerConfig;
    }
  > = new Map();

  private configPath: string;
  private config: MCPConfig;
  private static instance: MCPManager | null = null;

  /**
   * Get MCPManager singleton
   */
  public static getInstance(configPath?: string): MCPManager {
    if (!MCPManager.instance) {
      MCPManager.instance = new MCPManager(configPath);
    }
    return MCPManager.instance;
  }

  /**
   * Private constructor, get instance through getInstance
   */
  private constructor(customPath?: string) {
    super();
    // Default configuration path is ~/.foxychat/mcp.json
    const defaultDir = path.join(os.homedir(), ".foxychat");
    this.configPath = customPath || path.join(defaultDir, "mcp.json");

    // Ensure directory exists
    if (!fs.existsSync(path.dirname(this.configPath))) {
      fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
    }

    // Load configuration
    this.config = this.loadConfig();

    // Initialize servers from config
    this.initializeServers();
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
   * Save configuration to file
   */
  private saveConfig(): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error("Error saving MCP config:", error);
    }
  }

  /**
   * Initialize all configured servers
   */
  private initializeServers(): void {
    const serverConfigs = this.config.mcpServers;

    for (const [id, config] of Object.entries(serverConfigs)) {
      this.registerServer(id, config);
    }
  }

  /**
   * Register server
   * @param id Server ID
   * @param config Server configuration
   */
  public registerServer(id: string, config: MCPServerConfig): void {
    if (this.servers.has(id)) {
      throw new Error(`Server with ID ${id} already registered`);
    }

    this.servers.set(id, {
      process: null,
      status: {
        id,
        running: false,
        error: undefined,
      },
      client: null,
      serverUrl: null,
      config,
    });

    // Add new server to configuration
    this.config.mcpServers[id] = config;
    this.saveConfig();

    // Emit server registration event
    this.emit("server:registered", id);
  }

  /**
   * Unregister server
   * @param id Server ID
   */
  public unregisterServer(id: string): boolean {
    const server = this.servers.get(id);
    if (!server) {
      return false;
    }

    // Stop server if running
    if (server.status.running) {
      this.stopServer(id).catch((error) =>
        console.error(`Error stopping server ${id}:`, error),
      );
    }

    // Remove from registry
    this.servers.delete(id);

    // Remove from configuration
    delete this.config.mcpServers[id];
    this.saveConfig();

    // Emit server unregistration event
    this.emit("server:unregistered", id);

    return true;
  }

  /**
   * Start specified server
   * @param id Server ID
   */
  public async startServer(id: string): Promise<boolean> {
    const server = this.servers.get(id);
    if (!server) {
      throw new Error(`Server with id ${id} not found`);
    }

    if (server.status.running) {
      return true;
    }

    try {
      console.log("Ready to start server", id);

      // If remote server
      if (server.config.url) {
        server.serverUrl = server.config.url;
        server.client = new MCPClient(server.config.url, server.config.apiKey);
        server.status.url = server.config.url;

        // Verify connection is valid
        const isConnected = await server.client.connect();
        if (!isConnected) {
          throw new Error(
            `Cannot connect to MCP server at ${server.config.url}`,
          );
        }

        server.status.running = true;
        await this.updateServerTools(id);
        this.emit("server:started", id);
        return true;
      }

      // If local server
      if (server.config.command && server.config.args) {
        const result = await this.startLocalServer(id);
        if (result) {
          await this.updateServerTools(id);
          this.emit("server:started", id);
        }
        return result;
      }

      throw new Error("Invalid server configuration: missing url or command");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      server.status.error = errorMessage;
      server.status.running = false;
      console.error(`Failed to start MCP server ${id}:`, errorMessage);
      this.emit("server:error", { id, error: errorMessage });
      return false;
    }
  }

  /**
   * Start local server process
   * @param id Server ID
   * @returns Whether startup was successful
   */
  private startLocalServer(id: string): Promise<boolean> {
    return new Promise((resolve) => {
      const server = this.servers.get(id);
      if (!server || !server.config.command || !server.config.args) {
        resolve(false);
        return;
      }

      try {
        console.log("start local server", id);
        // Create a new MCP client with stdio transport
        server.client = new MCPClient(
          server.config.command,
          server.config.args,
          true, // Use stdio transport
          server.config.env, // Pass environment variables
        );

        // Connect to the MCP server
        server.client
          .connect()
          .then((connected) => {
            if (!connected) {
              throw new Error(`Failed to connect to MCP server ${id}`);
            }

            server.status.running = true;

            if (server.config.url) {
              server.serverUrl = server.config.url;
              server.status.url = server.config.url;
            }

            resolve(true);
          })
          .catch((error) => {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            server.status.error = errorMessage;
            server.status.running = false;
            console.error(`Failed to start MCP server ${id}:`, errorMessage);
            resolve(false);
          });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        server.status.error = errorMessage;
        server.status.running = false;
        console.error(`Failed to start MCP server ${id}:`, errorMessage);
        resolve(false);
      }
    });
  }

  /**
   * Stop specified server
   * @param id Server ID
   */
  public async stopServer(id: string): Promise<boolean> {
    const server = this.servers.get(id);
    if (!server) {
      throw new Error(`Server with id ${id} not found`);
    }

    if (!server.status.running) {
      return true;
    }

    try {
      // Close the MCP client
      if (server.client) {
        await server.client.close();
      }

      // Remote servers don't need to be stopped, just disconnect
      if (server.config.url) {
        server.status.running = false;
        server.client = null;
        server.serverUrl = null;
        this.emit("server:stopped", id);
        return true;
      }

      // Stop local process
      if (server.process) {
        // First try normal exit
        server.process.kill("SIGTERM");

        // Give the process some time to exit gracefully
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // If process is still running, force terminate
        if (server.process && !server.process.killed) {
          server.process.kill("SIGKILL");
        }

        server.process = null;
      }

      server.status.running = false;
      server.client = null;
      server.serverUrl = null;
      this.emit("server:stopped", id);
      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      server.status.error = errorMessage;
      console.error(`Failed to stop MCP server ${id}:`, errorMessage);
      this.emit("server:error", { id, error: errorMessage });
      return false;
    }
  }

  /**
   * Start all enabled servers
   */
  public async startAllEnabled(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    for (const [id] of this.servers.entries()) {
      results.set(id, await this.startServer(id));
    }

    return results;
  }

  /**
   * Stop all servers
   */
  public async stopAll(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    for (const [id, server] of this.servers.entries()) {
      if (server.status.running) {
        results.set(id, await this.stopServer(id));
      }
    }

    return results;
  }

  /**
   * Get server status
   * @param id Server ID
   */
  public getServerStatus(id: string): ServerStatus | undefined {
    return this.servers.get(id)?.status;
  }

  /**
   * Get all server statuses
   */
  public getAllServerStatus(): ServerStatus[] {
    return Array.from(this.servers.values()).map((server) => server.status);
  }

  /**
   * Get MCP client for a server
   * @param id Server ID
   */
  public getClient(id: string): MCPClient | null {
    return this.servers.get(id)?.client || null;
  }

  /**
   * Check if server is running
   * @param id Server ID
   */
  public isServerRunning(id: string): boolean {
    return this.servers.get(id)?.status.running || false;
  }

  /**
   * Update tools for a specific server
   * @param id Server ID
   */
  public async updateServerTools(id: string): Promise<void> {
    const server = this.servers.get(id);
    if (!server || !server.status.running || !server.client) {
      return;
    }

    try {
      const tools = await server.client.listTools();
      server.status.tools = tools;
    } catch (error) {
      console.error(`Error updating tools for ${id}:`, error);
    }
  }

  /**
   * Get complete configuration
   */
  public getConfig(): MCPConfig {
    return this.config;
  }

  /**
   * Get specific server configuration
   * @param id Server ID
   */
  public getServerConfig(id: string): MCPServerConfig | undefined {
    return this.config.mcpServers[id];
  }

  /**
   * Get all server configurations
   */
  public getAllServerConfigs(): Record<string, MCPServerConfig> {
    return this.config.mcpServers;
  }

  /**
   * Update server configuration
   * @param id Server ID
   * @param config Server configuration (partial)
   */
  public updateServerConfig(
    id: string,
    config: Partial<MCPServerConfig>,
  ): void {
    // Initialize the server config if it doesn't exist
    if (!this.config.mcpServers[id]) {
      this.config.mcpServers[id] = {} as MCPServerConfig;
    }

    // Update the configuration
    this.config.mcpServers[id] = {
      ...this.config.mcpServers[id],
      ...config,
    };

    // Update server instance if it exists
    const server = this.servers.get(id);
    if (server) {
      server.config = this.config.mcpServers[id];
    }

    this.saveConfig();
  }

  /**
   * Import configuration from JSON string
   * @param jsonConfig JSON configuration string
   */
  public importFromJson(jsonConfig: string): boolean {
    try {
      const config = JSON.parse(jsonConfig) as MCPConfig;
      if (config && config.mcpServers) {
        // Stop all running servers before replacing config
        this.stopAll().catch((error) =>
          console.error("Error stopping servers during import:", error),
        );

        this.config = config;
        this.saveConfig();

        // Reinitialize servers with new config
        this.servers.clear();
        this.initializeServers();
        return true;
      }
      return false;
    } catch (error) {
      console.error("Error importing MCP config:", error);
      return false;
    }
  }

  /**
   * Export configuration as JSON string
   */
  public exportToJson(): string {
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * Get all predefined servers
   */
  public getAllPredefinedServers(): PredefinedMCPServer[] {
    return PREDEFINED_SERVERS;
  }

  /**
   * Get predefined server by ID
   * @param id Server ID
   */
  public getPredefinedServerById(id: string): PredefinedMCPServer | undefined {
    return getPredefinedServerById(id);
  }

  /**
   * Install predefined server
   * @param id Predefined server ID
   */
  public installPredefinedServer(id: string): boolean {
    const predefinedServer = this.getPredefinedServerById(id);
    if (!predefinedServer) {
      return false;
    }

    // Register the server with default configuration
    try {
      // Create a copy of the default configuration
      const config = { ...predefinedServer.defaultConfig };

      // Get all available tools for this server but don't enable them by default
      if (predefinedServer.builtIn && id === "Dev-MCP") {
        // For Dev-MCP, we use serverTools from the dev-mcp directory
        const allTools = Object.keys(serverTools);

        // Just list all tools, but don't enable them by default
        config.builtInToolsList = allTools;

        // If no enabledTools was specified in the default config, initialize it as empty
        if (!config.enabledTools) {
          config.enabledTools = [];
        }
      } else if (
        config.builtInToolsList &&
        config.builtInToolsList.length > 0
      ) {
        // For other servers with builtInToolsList, maintain the list but don't automatically enable
        // If no enabledTools was specified in the default config, initialize it as empty
        if (!config.enabledTools) {
          config.enabledTools = [];
        }
      }

      this.registerServer(id, config);
      return true;
    } catch (error) {
      console.error(`Error installing predefined server ${id}:`, error);
      return false;
    }
  }

  /**
   * Uninstall predefined server
   * @param id Server ID
   * @returns Whether uninstallation was successful
   */
  public uninstallPredefinedServer(id: string): boolean {
    // Check if this server is registered
    if (!this.servers.has(id)) {
      console.warn(`Server with ID ${id} not found, cannot uninstall`);
      return false;
    }

    // Stop the server if it's running
    const server = this.servers.get(id);
    if (server && server.status.running) {
      this.stopServer(id).catch((error) =>
        console.error(`Error stopping server ${id} during uninstall:`, error),
      );
    }

    // Unregister the server
    const result = this.unregisterServer(id);
    if (result) {
      console.log(`Successfully uninstalled server ${id}`);
      // Emit server uninstalled event
      this.emit("server:uninstalled", id);
    } else {
      console.error(`Failed to uninstall server ${id}`);
    }

    return result;
  }
}
