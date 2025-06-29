/**
 * Using proper types from the ai SDK package instead of creating custom types
 * This ensures compatibility with rapid updates to the ai SDK
 *
 * Key types used:
 * - Tool: The main tool interface with Zod schema support
 * - ToolSet: Record of tool names to Tool instances
 * - MCPTransport: Transport interface for MCP communication
 * - MCPClientError: Error type for MCP client operations
 */

import {
  ConnectionError,
  ConnectionStatus,
  ConnectionStatusType,
  MCPServerConfig,
  PromptDefinition,
  ResourceDefinition,
  ResourceTemplate,
  ServerInfo,
  ToolDefinition,
} from "@/shared/types/mcp";
import { experimental_createMCPClient, type Tool } from "ai";
import { Experimental_StdioMCPTransport } from "ai/mcp-stdio";
import { app } from "electron";
import { EventEmitter } from "events";

// Type for the MCP client instance
type MCPClientInstance = Awaited<
  ReturnType<typeof experimental_createMCPClient>
>;

// Use the actual ai SDK tool types directly
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MCPTool = Tool<any, any>; // Individual tool type from ai SDK

/**
 * MCPConnection using the ai package's experimental MCP client
 * This implementation leverages the built-in MCP client from the ai package
 * for better integration and maintenance
 *
 * Key differences from the original MCPConnection:
 * 1. Uses experimental_createMCPClient from 'ai' package
 * 2. Supports both stdio (via Experimental_StdioMCPTransport) and SSE transports
 * 3. Currently focused on tool functionality (resources and prompts not yet supported by ai package)
 * 4. Simpler connection management with built-in error handling
 *
 * Note: This is experimental and may change as the ai package's MCP support evolves
 */
export class MCPConnectionAI extends EventEmitter {
  private name: string;
  private displayName: string;
  private description?: string;
  private config: MCPServerConfig;
  private client: MCPClientInstance | null = null;
  private transportType: string;

  private tools: Record<string, MCPTool> = {}; // Store tools as name->tool mapping
  private toolNames: Set<string> = new Set(); // Cache tool names for quick lookup
  private resources: ResourceDefinition[] = [];
  private prompts: PromptDefinition[] = [];
  private resourceTemplates: ResourceTemplate[] = [];

  private status: ConnectionStatusType;
  private error: string | null = null;
  private startTime: number | null = null;
  private lastStarted: string | null = null;
  private disabled: boolean;
  private authorizationUrl?: string;

  constructor(name: string, config: MCPServerConfig) {
    super();

    this.name = name;
    this.displayName = config.name || name;
    this.description = config.description;
    this.config = config;
    this.transportType = this.determineTransportType(config);
    this.disabled = config.enabled === false;
    this.status = this.disabled
      ? ConnectionStatus.DISABLED
      : ConnectionStatus.DISCONNECTED;
  }

  /**
   * Determine transport type from configuration
   */
  private determineTransportType(config: MCPServerConfig): string {
    if (config.command) return "stdio";
    if (config.url) return "http";
    throw new Error(
      `Invalid server configuration for ${this.name}: missing command or url`,
    );
  }

  /**
   * Start the connection (enable if disabled)
   */
  async start(): Promise<ServerInfo> {
    if (this.disabled) {
      this.disabled = false;
      this.config.enabled = true;
      this.status = ConnectionStatus.DISCONNECTED;
    }

    if (this.status === ConnectionStatus.CONNECTED) {
      return this.getServerInfo();
    }

    await this.connect();
    return this.getServerInfo();
  }

  /**
   * Stop the connection (optionally disable)
   */
  async stop(disable = false): Promise<ServerInfo> {
    if (disable) {
      this.disabled = true;
      this.config.enabled = false;
      this.status = ConnectionStatus.DISABLED;
    }

    await this.disconnect();
    return this.getServerInfo();
  }

  /**
   * Calculate uptime in seconds
   */
  getUptime(): number {
    if (
      !this.startTime ||
      (this.status !== ConnectionStatus.CONNECTED &&
        this.status !== ConnectionStatus.DISABLED)
    ) {
      return 0;
    }
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  /**
   * Connect to the MCP server
   */
  async connect(newConfig?: MCPServerConfig): Promise<void> {
    // Update configuration if provided
    if (newConfig) {
      this.config = newConfig;
      this.transportType = this.determineTransportType(newConfig);
    }

    // Handle disabled state
    if (this.disabled) {
      this.status = ConnectionStatus.DISABLED;
      this.startTime = Date.now();
      this.lastStarted = new Date().toISOString();
      return;
    }

    // Initialize connection attempt
    this.error = null;
    this.status = ConnectionStatus.CONNECTING;
    this.lastStarted = new Date().toISOString();

    try {
      // Resolve environment variables
      const resolvedConfig = await this.resolveConfigEnvironment(this.config);

      // Create transport and client
      if (this.transportType === "stdio") {
        const transport = new Experimental_StdioMCPTransport({
          command: resolvedConfig.command!,
          args: resolvedConfig.args || [],
          env: {
            ...process.env,
            ELECTRON_APP_PATH: app.getAppPath(),
            ELECTRON_USER_DATA: app.getPath("userData"),
            FOXYCHAT_APP_PATH: app.getAppPath(),
            FOXYCHAT_USER_DATA: app.getPath("userData"),
            ...resolvedConfig.env,
          },
          cwd: resolvedConfig.cwd || app.getPath("userData"),
        });

        // Set up transport event handlers
        transport.onclose = () => this.handleTransportClose();
        transport.onerror = (error) =>
          this.handleTransportError(error as Error);

        this.client = await experimental_createMCPClient({
          transport,
          name: `foxychat-electron`,
          onUncaughtError: (error) => {
            console.error(
              `Uncaught error in MCP client '${this.name}':`,
              error,
            );
            this.emit("error", { server: this.name, error });
          },
        });
      } else {
        // For HTTP/SSE transport
        this.client = await experimental_createMCPClient({
          transport: {
            type: "sse",
            url: resolvedConfig.url!,
            headers: {
              "User-Agent": `FoxyChat/${app.getVersion()} (Electron)`,
              ...(resolvedConfig.apiKey && {
                Authorization: `Bearer ${resolvedConfig.apiKey}`,
              }),
            },
          },
          name: `foxychat-electron`,
          onUncaughtError: (error) => {
            console.error(
              `Uncaught error in MCP client '${this.name}':`,
              error,
            );
            this.emit("error", { server: this.name, error });
          },
        });
      }

      // Fetch initial capabilities
      await this.updateCapabilities();

      // Mark as connected
      this.status = ConnectionStatus.CONNECTED;
      this.startTime = Date.now();
      this.error = null;

      console.log(`MCP server '${this.name}' connected successfully`);
    } catch (error) {
      console.error(`Failed to connect MCP server '${this.name}':`, error);
      await this.disconnect(
        error instanceof Error ? error.message : String(error),
      );

      const err = new Error(
        `Failed to connect to "${this.name}" MCP server: ${error}`,
      ) as ConnectionError;
      err.code = "CONNECTION_ERROR";
      err.data = { server: this.name, error: String(error) };
      throw err;
    }
  }

  /**
   * Disconnect from the MCP server
   */
  async disconnect(errorMessage?: string): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
      } catch (error) {
        console.warn(`Error closing client for ${this.name}:`, error);
      }
    }

    this.resetState(errorMessage);
  }

  /**
   * Reset connection state
   */
  private resetState(errorMessage?: string): void {
    this.client = null;
    this.tools = {};
    this.toolNames.clear();
    this.resources = [];
    this.prompts = [];
    this.resourceTemplates = [];
    this.status = this.disabled
      ? ConnectionStatus.DISABLED
      : ConnectionStatus.DISCONNECTED;
    this.error = errorMessage || null;
    this.startTime = null;
    this.authorizationUrl = undefined;
  }

  /**
   * Handle transport close event
   */
  private handleTransportClose(): void {
    console.debug(`MCP transport closed for ${this.name}`);
    this.startTime = null;
    this.emit("connectionClosed", {
      server: this.name,
      type: this.transportType,
    });
  }

  /**
   * Handle transport error event
   */
  private handleTransportError(error: Error): void {
    console.debug(`MCP transport error for ${this.name}:`, error.message);
    this.emit("error", { server: this.name, error });
  }

  /**
   * Update server capabilities (tools, resources, prompts)
   */
  async updateCapabilities(capabilitiesToUpdate?: string[]): Promise<void> {
    if (!this.client) return;

    try {
      // For now, we'll focus on tools as the ai package primarily supports tool conversion
      // The ai package's MCP client is designed mainly for tool integration
      const tools = await this.client.tools();

      // Store ai SDK tools directly with their names
      // This keeps us in sync with the ai package types
      this.tools = tools;
      this.toolNames = new Set(Object.keys(tools));

      // Emit tools changed event with legacy format
      this.emit("toolsChanged", {
        server: this.name,
        tools: this.convertToolsToLegacyFormat(),
      });

      // Note: The ai package's MCP client doesn't fully support resources and prompts yet
      // These features may be added in future versions
      if (capabilitiesToUpdate?.includes("resources")) {
        console.debug(
          `Resources not yet supported by ai package MCP client for '${this.name}'`,
        );
      }
      if (capabilitiesToUpdate?.includes("prompts")) {
        console.debug(
          `Prompts not yet supported by ai package MCP client for '${this.name}'`,
        );
      }
    } catch (error) {
      console.warn(
        `Error updating capabilities for server '${this.name}':`,
        error,
      );
    }
  }

  /**
   * Call a tool on the server
   */
  async callTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    if (!this.client) {
      throw this.createError(
        "SERVER_NOT_INITIALIZED",
        "Server not initialized",
        { tool: toolName },
      );
    }

    if (this.status !== ConnectionStatus.CONNECTED) {
      throw this.createError("SERVER_NOT_CONNECTED", "Server not connected", {
        tool: toolName,
        status: this.status,
      });
    }

    // Check if tool exists in our cached tools
    if (!this.toolNames.has(toolName)) {
      throw this.createError("TOOL_NOT_FOUND", "Tool not found", {
        tool: toolName,
        availableTools: Array.from(this.toolNames),
      });
    }

    try {
      // Get the tools and call the specific tool
      const tools = await this.client.tools();
      const mcpTool = tools[toolName];

      if (!mcpTool) {
        throw this.createError(
          "TOOL_NOT_FOUND",
          "Tool not found in MCP client",
          {
            tool: toolName,
            availableTools: Object.keys(tools),
          },
        );
      }

      // Execute the tool using the ai SDK's Tool interface
      // The execute function returns the result based on the tool's implementation
      const result = await mcpTool.execute(args, {
        toolCallId: `${this.name}-${toolName}-${Date.now()}`,
        messages: [], // MCP tools don't require message context
      });

      return result;
    } catch (error) {
      throw this.createError(
        "TOOL_EXECUTION_ERROR",
        `Tool execution failed: ${error}`,
        {
          tool: toolName,
          args,
        },
      );
    }
  }

  /**
   * Read a resource from the server
   */
  async readResource(uri: string): Promise<unknown> {
    // Note: The ai package's MCP client doesn't support resources yet
    throw this.createError(
      "UNSUPPORTED_FEATURE",
      "Resource reading is not yet supported by the ai package MCP client",
      { uri },
    );
  }

  /**
   * Get a prompt from the server
   */
  async getPrompt(
    promptName: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _args: Record<string, unknown>,
  ): Promise<unknown> {
    // Note: The ai package's MCP client doesn't support prompts yet
    throw this.createError(
      "UNSUPPORTED_FEATURE",
      "Prompts are not yet supported by the ai package MCP client",
      { prompt: promptName },
    );
  }

  /**
   * Convert ai SDK tools to legacy ToolDefinition format for backward compatibility
   */
  private convertToolsToLegacyFormat(): ToolDefinition[] {
    return Object.entries(this.tools).map(([name, tool]) => ({
      name,
      description: tool.description,
      inputSchema: tool.parameters,
      parameters: tool.parameters,
    }));
  }

  /**
   * Get server information
   */
  getServerInfo(): ServerInfo {
    return {
      name: this.name,
      displayName: this.displayName,
      description: this.description,
      transportType: this.transportType,
      status: this.status,
      error: this.error || undefined,
      capabilities: {
        // Convert ai SDK tools to legacy format for backward compatibility
        tools: this.convertToolsToLegacyFormat(),
        resources: this.resources,
        resourceTemplates: this.resourceTemplates,
        prompts: this.prompts,
      },
      uptime: this.getUptime(),
      lastStarted: this.lastStarted || undefined,
      authorizationUrl: this.authorizationUrl,
      isApp: this.config.isApp,
    };
  }

  /**
   * Resolve environment variables in configuration (Electron-optimized)
   */
  private async resolveConfigEnvironment(
    config: MCPServerConfig,
  ): Promise<MCPServerConfig> {
    const resolveEnvVars = (str: string): string => {
      return str.replace(/\$\{([^}]+)\}/g, (match, varName) => {
        // Try process.env first, then Electron app paths
        if (process.env[varName]) {
          return process.env[varName];
        }

        // Electron-specific path variables
        switch (varName) {
          case "ELECTRON_APP_PATH":
          case "APP_PATH":
            return app.getAppPath();
          case "ELECTRON_USER_DATA":
          case "USER_DATA":
            return app.getPath("userData");
          case "ELECTRON_TEMP":
          case "TEMP":
            return app.getPath("temp");
          case "ELECTRON_HOME":
          case "HOME":
            return app.getPath("home");
          case "ELECTRON_DESKTOP":
          case "DESKTOP":
            return app.getPath("desktop");
          case "ELECTRON_DOCUMENTS":
          case "DOCUMENTS":
            return app.getPath("documents");
          case "ELECTRON_DOWNLOADS":
          case "DOWNLOADS":
            return app.getPath("downloads");
          default:
            return match;
        }
      });
    };

    const resolved = { ...config };
    if (resolved.command) {
      resolved.command = resolveEnvVars(resolved.command);
    }
    if (resolved.url) {
      resolved.url = resolveEnvVars(resolved.url);
    }
    if (resolved.args) {
      resolved.args = resolved.args.map(resolveEnvVars);
    }
    if (resolved.cwd) {
      resolved.cwd = resolveEnvVars(resolved.cwd);
    }

    return resolved;
  }

  /**
   * Create standardized error
   */
  private createError(
    code: string,
    message: string,
    data?: Record<string, unknown>,
  ): ConnectionError {
    const error = new Error(message) as ConnectionError;
    error.code = code;
    error.data = { server: this.name, ...data };
    return error;
  }
}