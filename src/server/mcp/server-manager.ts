/**
 * MCP Server Process Management
 * Manages local and remote MCP servers
 */
import { ChildProcess } from "child_process";
import { MCPServerConfig, ServerStatus } from "./types";
import { MCPClient } from "./mcp-client";

/**
 * MCP Server Process Class
 * Responsible for managing the lifecycle of a single server
 */
export class ServerManager {
  private process: ChildProcess | null = null;
  private status: ServerStatus;
  private client: MCPClient | null = null;
  private serverUrl: string | null = null;

  /**
   * Create server manager instance
   * @param id Server ID
   * @param config Server configuration
   */
  constructor(
    private id: string,
    private config: MCPServerConfig,
  ) {
    this.status = {
      id,
      running: false,
      error: undefined,
    };
  }

  /**
   * Start server
   * @returns Whether startup was successful
   */
  public async start(): Promise<boolean> {
    if (this.status.running) {
      return true;
    }

    try {
      // If remote server
      if (this.config.url) {
        this.serverUrl = this.config.url;
        this.client = new MCPClient(this.config.url, this.config.apiKey);
        this.status.url = this.config.url;

        // Verify connection is valid
        const isConnected = await this.client.connect();
        if (!isConnected) {
          throw new Error(`Cannot connect to MCP server at ${this.config.url}`);
        }

        this.status.running = true;
        return true;
      }

      // If local server
      if (this.config.command && this.config.args) {
        return this.startLocalServer();
      }

      throw new Error("Invalid server configuration: missing url or command");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.status.error = errorMessage;
      this.status.running = false;
      console.error(`Failed to start MCP server ${this.id}:`, errorMessage);
      return false;
    }
  }

  /**
   * Start local server process
   * @returns Whether startup was successful
   */
  private startLocalServer(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.config.command || !this.config.args) {
        resolve(false);
        return;
      }

      try {
        console.log("start local server", this.id);
        // Create a new MCP client with stdio transport
        this.client = new MCPClient(
          this.config.command,
          this.config.args,
          true, // Use stdio transport
          this.config.env, // Pass environment variables
        );

        // Connect to the MCP server
        this.client
          .connect()
          .then((connected) => {
            if (!connected) {
              throw new Error(`Failed to connect to MCP server ${this.id}`);
            }

            this.status.running = true;

            if (this.config.url) {
              this.serverUrl = this.config.url;
              this.status.url = this.config.url;
            }

            resolve(true);
          })
          .catch((error) => {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            this.status.error = errorMessage;
            this.status.running = false;
            console.error(
              `Failed to start MCP server ${this.id}:`,
              errorMessage,
            );
            resolve(false);
          });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.status.error = errorMessage;
        this.status.running = false;
        console.error(`Failed to start MCP server ${this.id}:`, errorMessage);
        resolve(false);
      }
    });
  }

  /**
   * Stop server
   * @returns Whether stopped successfully
   */
  public async stop(): Promise<boolean> {
    if (!this.status.running) {
      return true;
    }

    try {
      // Close the MCP client
      if (this.client) {
        await this.client.close();
      }

      // Remote servers don't need to be stopped, just disconnect
      if (this.config.url) {
        this.status.running = false;
        this.client = null;
        this.serverUrl = null;
        return true;
      }

      // Stop local process
      if (this.process) {
        // First try normal exit
        this.process.kill("SIGTERM");

        // Give the process some time to exit gracefully
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // If process is still running, force terminate
        if (this.process && !this.process.killed) {
          this.process.kill("SIGKILL");
        }

        this.process = null;
      }

      this.status.running = false;
      this.client = null;
      this.serverUrl = null;
      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.status.error = errorMessage;
      console.error(`Failed to stop MCP server ${this.id}:`, errorMessage);
      return false;
    }
  }

  /**
   * Get server status
   */
  public getStatus(): ServerStatus {
    return this.status;
  }

  /**
   * Get MCP client
   */
  public getClient(): MCPClient | null {
    return this.client;
  }

  /**
   * Check if server is running
   */
  public isRunning(): boolean {
    return this.status.running;
  }

  /**
   * Update tool list
   */
  public async updateTools(): Promise<void> {
    console.log("start update tools");
    if (!this.status.running || !this.client) {
      return;
    }

    try {
      const tools = await this.client.listTools();
      this.status.tools = tools;
    } catch (error) {
      console.error(`Error updating tools for ${this.id}:`, error);
    }
  }
}
