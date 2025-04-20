/**
 * MCP Server Configuration Manager
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { MCPConfig, MCPServerConfig } from "./types";

/**
 * MCP Configuration Manager
 * Responsible for loading and saving MCP server configurations
 */
export class MCPConfigManager {
  private configPath: string;
  private config: MCPConfig;

  /**
   * Create a configuration manager instance
   * @param customPath Custom configuration path
   */
  constructor(customPath?: string) {
    // Default configuration path is ~/.foxychat/mcp.json
    const defaultDir = path.join(os.homedir(), ".foxychat");
    this.configPath = customPath || path.join(defaultDir, "mcp.json");

    // Ensure directory exists
    if (!fs.existsSync(path.dirname(this.configPath))) {
      fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
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
   * Save configuration to file
   */
  public saveConfig(): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error("Error saving MCP config:", error);
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
   * Add server configuration
   * @param id Server ID
   * @param config Server configuration
   */
  public addServerConfig(id: string, config: MCPServerConfig): void {
    this.config.mcpServers[id] = config;
    this.saveConfig();
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

    console.log("mcp config update", config);
    // Update the configuration
    this.config.mcpServers[id] = {
      ...this.config.mcpServers[id],
      ...config,
    };
    this.saveConfig();
  }

  /**
   * Remove server configuration
   * @param id Server ID
   */
  public removeServerConfig(id: string): void {
    if (this.config.mcpServers[id]) {
      delete this.config.mcpServers[id];
      this.saveConfig();
    }
  }

  /**
   * Import configuration from JSON string
   * @param jsonConfig JSON configuration string
   */
  public importFromJson(jsonConfig: string): boolean {
    try {
      const config = JSON.parse(jsonConfig) as MCPConfig;
      if (config && config.mcpServers) {
        this.config = config;
        this.saveConfig();
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
}
