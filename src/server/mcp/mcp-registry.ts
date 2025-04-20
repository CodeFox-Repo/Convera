/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * MCP Tool Registry
 * Unified management of MCP servers and tools
 */
import { ServerManager } from "./server-manager";
import { MCPConfigManager } from "./config-manager";
import {
  MCPServerConfig,
  ServerStatus,
  ToolDefinition,
  PredefinedMCPServer,
} from "./types";
import { EventEmitter } from "events";
import {
  PREDEFINED_SERVERS,
  getPredefinedServerById,
} from "./predefined-servers";

/**
 * MCP Tool Registry
 * Responsible for managing all MCP servers and tools
 */
export class MCPRegistry extends EventEmitter {
  private servers: Map<string, ServerManager> = new Map();
  private configManager: MCPConfigManager;
  private static instance: MCPRegistry | null = null;

  /**
   * Get MCPRegistry singleton
   */
  public static getInstance(configPath?: string): MCPRegistry {
    if (!MCPRegistry.instance) {
      MCPRegistry.instance = new MCPRegistry(configPath);
    }
    return MCPRegistry.instance;
  }

  /**
   * Private constructor, get instance through getInstance
   */
  private constructor(configPath?: string) {
    super();
    this.configManager = new MCPConfigManager(configPath);
    this.initializeServers();
  }

  /**
   * Initialize all configured servers
   */
  private initializeServers(): void {
    const serverConfigs = this.configManager.getAllServerConfigs();

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

    const serverProcess = new ServerManager(id, config);
    this.servers.set(id, serverProcess);

    // Add new server to configuration
    this.configManager.addServerConfig(id, config);

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

    // Stop server
    if (server.isRunning()) {
      server
        .stop()
        .catch((error) => console.error(`Error stopping server ${id}:`, error));
    }

    // Remove from registry
    this.servers.delete(id);

    // Remove from configuration
    this.configManager.removeServerConfig(id);

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

    try {
      console.log("Ready to start server", id);
      const result = await server.start();
      console.log("start server", id, result);
      if (result) {
        await server.updateTools();
        this.emit("server:started", id);
      }
      console.log("finish start server", id);
      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error starting server ${id}:`, errorMessage);
      this.emit("server:error", { id, error: errorMessage });
      return false;
    }
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

    try {
      const result = await server.stop();
      if (result) {
        this.emit("server:stopped", id);
      }
      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error stopping server ${id}:`, errorMessage);
      this.emit("server:error", { id, error: errorMessage });
      return false;
    }
  }

  /**
   * Start all enabled servers
   */
  public async startAllEnabled(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    for (const [id, _server] of this.servers.entries()) {
      const config = this.configManager.getServerConfig(id);
      if (config && config.enabled) {
        results.set(id, await this.startServer(id));
      }
    }

    return results;
  }

  /**
   * Stop all servers
   */
  public async stopAll(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    for (const [id, server] of this.servers.entries()) {
      if (server.isRunning()) {
        results.set(id, await this.stopServer(id));
      }
    }

    return results;
  }

  /**
   * Get all server statuses
   */
  public getAllServerStatus(): ServerStatus[] {
    return Array.from(this.servers.values()).map((server) =>
      server.getStatus(),
    );
  }

  /**
   * Get specified server status
   * @param id Server ID
   */
  public getServerStatus(id: string): ServerStatus | null {
    const server = this.servers.get(id);
    return server ? server.getStatus() : null;
  }

  /**
   * Get available tool list
   */
  public async listAllTools(): Promise<
    { serverId: string; tool: ToolDefinition }[]
  > {
    const allTools: { serverId: string; tool: ToolDefinition }[] = [];

    for (const [id, server] of this.servers.entries()) {
      if (server.isRunning()) {
        await server.updateTools();
        const status = server.getStatus();

        if (status.tools && status.tools.length > 0) {
          status.tools.forEach((tool) => {
            allTools.push({ serverId: id, tool });
          });
        }
      }
    }

    return allTools;
  }

  /**
   * Find tool by tool name
   * @param toolName Tool name
   */
  public async findToolByName(
    toolName: string,
  ): Promise<{ serverId: string; tool: ToolDefinition } | null> {
    const allTools = await this.listAllTools();
    return allTools.find((item) => item.tool.name === toolName) || null;
  }

  /**
   * Run specified tool
   * @param serverId Server ID
   * @param toolName Tool name
   * @param input Input parameters
   */
  public async runTool<T>(
    serverId: string,
    toolName: string,
    input: any,
  ): Promise<T> {
    const server = this.servers.get(serverId);
    if (!server) {
      throw new Error(`Server with id ${serverId} not found`);
    }

    if (!server.isRunning()) {
      throw new Error(`Server ${serverId} is not running`);
    }

    const client = server.getClient();
    if (!client) {
      throw new Error(`Client for server ${serverId} is not available`);
    }

    return client.runTool<T>(toolName, input);
  }

  /**
   * Run tool by tool name
   * Automatically find the server where the tool is located
   * @param toolName Tool name
   * @param input Input parameters
   */
  public async runToolByName<T>(toolName: string, input: any): Promise<T> {
    const toolInfo = await this.findToolByName(toolName);
    if (!toolInfo) {
      throw new Error(`Tool ${toolName} not found in any running server`);
    }

    return this.runTool<T>(toolInfo.serverId, toolName, input);
  }

  /**
   * Import configuration from JSON
   * @param jsonConfig JSON configuration string
   */
  public importFromJson(jsonConfig: string): boolean {
    const result = this.configManager.importFromJson(jsonConfig);
    if (result) {
      // Reinitialize servers
      this.servers.clear();
      this.initializeServers();
    }
    return result;
  }

  /**
   * Export configuration to JSON
   */
  public exportToJson(): string {
    return this.configManager.exportToJson();
  }

  /**
   * Get available predefined server list
   */
  public getAvailablePredefinedServers(): PredefinedMCPServer[] {
    return PREDEFINED_SERVERS;
  }

  /**
   * Get specified predefined server
   * @param id Predefined server ID
   */
  public getPredefinedServer(id: string): PredefinedMCPServer | undefined {
    return getPredefinedServerById(id);
  }

  /**
   * Install predefined server
   * @param id Predefined server ID
   * @param customConfig Custom configuration (optional)
   * @returns Installation success or failure
   */
  public installPredefinedServer(
    id: string,
    customConfig?: Partial<MCPServerConfig>,
  ): boolean {
    const predefined = this.getPredefinedServer(id);

    if (!predefined) {
      console.error(`Predefined server ${id} not found`);
      return false;
    }

    try {
      // Merge default configuration and custom configuration
      const config = {
        ...predefined.defaultConfig,
        ...customConfig,
      };

      // If server already exists, unregister first
      if (this.servers.has(id)) {
        this.unregisterServer(id);
      }

      // Register server
      this.registerServer(id, config);

      // Emit server installation event
      this.emit("server:installed", id);

      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Failed to install predefined server ${id}:`, errorMessage);
      return false;
    }
  }

  /**
   * Check if predefined server is installed
   * @param id Predefined server ID
   */
  public isPredefinedServerInstalled(id: string): boolean {
    return this.servers.has(id);
  }
}
