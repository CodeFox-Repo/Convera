/* eslint-disable @typescript-eslint/no-explicit-any */
import { MCPServerConfig, ToolDefinition } from "@/shared/types/mcp";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  CallToolResultSchema,
  ListPromptsResultSchema,
  ListResourcesResultSchema,
  ListResourceTemplatesResultSchema,
  ListToolsResultSchema,
  LoggingMessageNotificationSchema,
  PromptListChangedNotificationSchema,
  ReadResourceResultSchema,
  ResourceListChangedNotificationSchema,
  ToolListChangedNotificationSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { app } from "electron";
import { EventEmitter } from "events";
import * as path from "path";

// Connection status constants
export const ConnectionStatus = {
  CONNECTED: "connected",
  CONNECTING: "connecting",
  DISCONNECTED: "disconnected",
  UNAUTHORIZED: "unauthorized",
  DISABLED: "disabled",
  ERROR: "error",
} as const;

export type ConnectionStatusType =
  (typeof ConnectionStatus)[keyof typeof ConnectionStatus];

// Connection timeout for initial connection (5 minutes for installs)
const CLIENT_CONNECT_TIMEOUT = 5 * 60000;

export interface ResourceDefinition {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

export interface ResourceTemplate {
  uriTemplate: string;
  name?: string;
  description?: string;
}

export interface PromptDefinition {
  name: string;
  description?: string;
  arguments?: Record<string, unknown>[];
}

export interface ServerInfo {
  name: string;
  displayName: string;
  description?: string;
  transportType: string;
  status: ConnectionStatusType;
  error?: string;
  capabilities: {
    tools: ToolDefinition[];
    resources: ResourceDefinition[];
    resourceTemplates: ResourceTemplate[];
    prompts: PromptDefinition[];
  };
  uptime: number;
  lastStarted?: string;
  authorizationUrl?: string;
}

export interface ConnectionError extends Error {
  code?: string;
  data?: Record<string, unknown>;
}

/**
 * MCPConnection manages a single MCP server connection in Electron
 * Handles transport setup, authentication, and capability management
 */
export class MCPConnection extends EventEmitter {
  private name: string;
  private displayName: string;
  private description?: string;
  private config: MCPServerConfig;
  private client: Client | null = null;
  private transport:
    | StdioClientTransport
    | StreamableHTTPClientTransport
    | SSEClientTransport
    | null = null;
  private transportType: string;

  private tools: ToolDefinition[] = [];
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

      // Create transport
      if (this.transportType === "stdio") {
        this.transport = await this.createStdioTransport(resolvedConfig);
      } else {
        // Try HTTP first, fallback to SSE if HTTP fails
        try {
          this.transport =
            await this.createStreamableHTTPTransport(resolvedConfig);
        } catch (httpError) {
          if (this.isAuthError(httpError)) {
            this.handleUnauthorizedConnection();
            return;
          }
          console.warn(
            `HTTP transport failed for ${this.name}, trying SSE:`,
            httpError,
          );
          this.transport = await this.createSSETransport(resolvedConfig);
        }
      }

      // Create and connect client
      this.client = this.createClient();
      await this.client.connect(this.transport, {
        timeout: CLIENT_CONNECT_TIMEOUT,
      });

      // Fetch initial capabilities
      await this.updateCapabilities();

      // Setup notification handlers
      this.setupNotificationHandlers();

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
    this.removeNotificationHandlers();

    if (this.transport) {
      try {
        await this.transport.close();
      } catch (error) {
        console.warn(`Error closing transport for ${this.name}:`, error);
      }
    }

    this.resetState(errorMessage);
  }

  /**
   * Reset connection state
   */
  private resetState(errorMessage?: string): void {
    this.client = null;
    this.transport = null;
    this.tools = [];
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
   * Create stdio transport for local command-based servers (Electron-optimized)
   */
  private async createStdioTransport(
    config: MCPServerConfig,
  ): Promise<StdioClientTransport> {
    // Get Electron app paths for better environment
    const appPath = app.getAppPath();
    const userDataPath = app.getPath("userData");

    const serverEnv = {
      ...getDefaultEnvironment(),
      // Add Electron-specific environment variables
      ELECTRON_APP_PATH: appPath,
      ELECTRON_USER_DATA: userDataPath,
      FOXYCHAT_APP_PATH: appPath,
      FOXYCHAT_USER_DATA: userDataPath,
      ...(process.env.MCP_ENV_VARS ? JSON.parse(process.env.MCP_ENV_VARS) : {}),
      ...config.env,
    };

    // Resolve working directory - default to user data path
    const cwd = config.cwd ? path.resolve(config.cwd) : userDataPath;

    const transport = new StdioClientTransport({
      command: config.command!,
      args: config.args || [],
      env: serverEnv,
      cwd: cwd,
      stderr: "pipe",
    });

    // Listen to stderr for debugging
    const stderrStream = (
      transport as unknown as { stderr?: NodeJS.ReadableStream }
    ).stderr;
    if (stderrStream) {
      stderrStream.on("data", (data: Buffer) => {
        const errorOutput = data.toString().trim();
        console.warn(`${this.name} stderr: ${errorOutput}`);
      });
    }

    return transport;
  }

  /**
   * Create streamable HTTP transport
   */
  private async createStreamableHTTPTransport(
    config: MCPServerConfig,
  ): Promise<StreamableHTTPClientTransport> {
    if (!config.url) {
      throw new Error("URL required for HTTP transport");
    }

    const options = {
      requestInit: {
        headers: {
          "User-Agent": `FoxyChat/${app.getVersion()} (Electron)`,
          ...(config.apiKey && { Authorization: `Bearer ${config.apiKey}` }),
        },
      },
    };

    return new StreamableHTTPClientTransport(new URL(config.url), options);
  }

  /**
   * Create SSE transport
   */
  private async createSSETransport(
    config: MCPServerConfig,
  ): Promise<SSEClientTransport> {
    if (!config.url) {
      throw new Error("URL required for SSE transport");
    }

    const options = {
      requestInit: {
        headers: {
          "User-Agent": `FoxyChat/${app.getVersion()} (Electron)`,
          ...(config.apiKey && { Authorization: `Bearer ${config.apiKey}` }),
        },
      },
    };

    return new SSEClientTransport(new URL(config.url), options);
  }

  /**
   * Create MCP client instance
   */
  private createClient(): Client {
    const client = new Client(
      {
        name: "foxychat-electron",
        version: app.getVersion(),
      },
      {
        capabilities: {},
      },
    );

    client.onerror = (error) => {
      console.debug(`MCP client error for ${this.name}:`, error.message);
    };

    client.onclose = () => {
      console.debug(`MCP client closed for ${this.name}`);
      this.startTime = null;
      this.emit("connectionClosed", {
        server: this.name,
        type: this.transportType,
      });
    };

    return client;
  }

  /**
   * Setup notification handlers for capability changes
   */
  private setupNotificationHandlers(): void {
    if (!this.client) return;

    // Handle logging messages
    this.client.setNotificationHandler(
      LoggingMessageNotificationSchema,
      (notification) => {
        const params = notification.params || {};
        const data = params.data || {};
        const level = params.level || "debug";
        console.debug(
          `[${this.name} server ${level} log]:`,
          JSON.stringify(data, null, 2),
        );
      },
    );

    // Handle capability changes
    const capabilityMap = {
      tools: ToolListChangedNotificationSchema,
      resources: ResourceListChangedNotificationSchema,
      prompts: PromptListChangedNotificationSchema,
    };

    Object.entries(capabilityMap).forEach(([type, schema]) => {
      this.client!.setNotificationHandler(schema, async () => {
        console.debug(`Received ${type}Changed notification for ${this.name}`);
        const updateTypes =
          type === "resources" ? ["resources", "resourceTemplates"] : [type];
        await this.updateCapabilities(updateTypes);

        const updatedData =
          type === "resources"
            ? {
                resources: this.resources,
                resourceTemplates: this.resourceTemplates,
              }
            : type === "tools"
              ? { tools: this.tools }
              : { prompts: this.prompts };

        this.emit(`${type}Changed`, {
          server: this.name,
          ...updatedData,
        });
      });
    });
  }

  /**
   * Remove notification handlers
   */
  private removeNotificationHandlers(): void {
    if (!this.client) return;

    const nothing = () => {};
    this.client.setNotificationHandler(
      ToolListChangedNotificationSchema,
      nothing,
    );
    this.client.setNotificationHandler(
      ResourceListChangedNotificationSchema,
      nothing,
    );
    this.client.setNotificationHandler(
      PromptListChangedNotificationSchema,
      nothing,
    );
    this.client.setNotificationHandler(
      LoggingMessageNotificationSchema,
      nothing,
    );
  }

  /**
   * Update server capabilities (tools, resources, prompts)
   */
  async updateCapabilities(capabilitiesToUpdate?: string[]): Promise<void> {
    if (!this.client) return;

    const safeRequest = async (method: string, schema: any) => {
      try {
        const response = await this.client!.request({ method }, schema);
        return response;
      } catch {
        console.debug(
          `Server '${this.name}' does not support capability '${method}'`,
        );
        return null;
      }
    };

    const capabilityMap = {
      tools: { method: "tools/list", schema: ListToolsResultSchema },
      resources: {
        method: "resources/list",
        schema: ListResourcesResultSchema,
      },
      resourceTemplates: {
        method: "resources/templates/list",
        schema: ListResourceTemplatesResultSchema,
      },
      prompts: { method: "prompts/list", schema: ListPromptsResultSchema },
    } as const;

    try {
      const typesToFetch = capabilitiesToUpdate || Object.keys(capabilityMap);
      const fetchPromises = typesToFetch.map(async (type) => {
        const capability = capabilityMap[type as keyof typeof capabilityMap];
        if (!capability) return;

        const result = await safeRequest(capability.method, capability.schema);
        if (type === "tools") {
          this.tools = result?.tools || [];
        } else if (type === "resources") {
          this.resources = result?.resources || [];
        } else if (type === "resourceTemplates") {
          this.resourceTemplates = result?.resourceTemplates || [];
        } else if (type === "prompts") {
          this.prompts = result?.prompts || [];
        }
      });

      await Promise.all(fetchPromises);
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
    requestOptions?: Record<string, unknown>,
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

    const tool = this.tools.find((t) => t.name === toolName);
    if (!tool) {
      throw this.createError("TOOL_NOT_FOUND", "Tool not found", {
        tool: toolName,
        availableTools: this.tools.map((t) => t.name),
      });
    }

    try {
      return await this.client.request(
        {
          method: "tools/call",
          params: {
            name: toolName,
            arguments: args,
          },
        },
        CallToolResultSchema,
        requestOptions,
      );
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
  async readResource(
    uri: string,
    requestOptions?: Record<string, unknown>,
  ): Promise<unknown> {
    if (!this.client) {
      throw this.createError(
        "SERVER_NOT_INITIALIZED",
        "Server not initialized",
        { uri },
      );
    }

    if (this.status !== ConnectionStatus.CONNECTED) {
      throw this.createError("SERVER_NOT_CONNECTED", "Server not connected", {
        uri,
        status: this.status,
      });
    }

    try {
      return await this.client.request(
        {
          method: "resources/read",
          params: { uri },
        },
        ReadResourceResultSchema,
        requestOptions,
      );
    } catch (error) {
      throw this.createError(
        "RESOURCE_READ_ERROR",
        `Resource read failed: ${error}`,
        { uri },
      );
    }
  }

  /**
   * Get a prompt from the server
   */
  async getPrompt(
    promptName: string,
    args: Record<string, unknown>,
    requestOptions?: Record<string, unknown>,
  ): Promise<unknown> {
    if (!this.client) {
      throw this.createError(
        "SERVER_NOT_INITIALIZED",
        "Server not initialized",
        { prompt: promptName },
      );
    }

    if (this.status !== ConnectionStatus.CONNECTED) {
      throw this.createError("SERVER_NOT_CONNECTED", "Server not connected", {
        prompt: promptName,
        status: this.status,
      });
    }

    const prompt = this.prompts.find((p) => p.name === promptName);
    if (!prompt) {
      throw this.createError("PROMPT_NOT_FOUND", "Prompt not found", {
        prompt: promptName,
        availablePrompts: this.prompts.map((p) => p.name),
      });
    }

    try {
      return await this.client.getPrompt(
        {
          name: promptName,
          arguments: args as { [x: string]: string },
        },
        requestOptions,
      );
    } catch (error) {
      throw this.createError(
        "PROMPT_EXECUTION_ERROR",
        `Prompt execution failed: ${error}`,
        {
          prompt: promptName,
          args,
        },
      );
    }
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
        tools: this.tools,
        resources: this.resources,
        resourceTemplates: this.resourceTemplates,
        prompts: this.prompts,
      },
      uptime: this.getUptime(),
      lastStarted: this.lastStarted || undefined,
      authorizationUrl: this.authorizationUrl,
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
   * Check if error is authentication related
   */
  private isAuthError(error: unknown): boolean {
    return (
      (error as { code?: number })?.code === 401 ||
      error instanceof UnauthorizedError
    );
  }

  /**
   * Handle unauthorized connection (OAuth flow)
   */
  private handleUnauthorizedConnection(): void {
    console.warn(`Server '${this.name}' requires authorization`);
    this.status = ConnectionStatus.UNAUTHORIZED;
    // TODO: Implement OAuth flow if needed for Electron
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
