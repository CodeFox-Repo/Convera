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
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { app } from "electron";
import { EventEmitter } from "events";
import { z } from "zod";
import * as path from "path";
import * as os from "os";

import { zodToJsonSchema } from "zod-to-json-schema";
import { getLogger } from "../logger";

const logger = getLogger("MCPConnectionAI");
// Define proper MCP tool types
interface MCPToolProperty {
  type: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  [key: string]: unknown;
}

interface MCPToolSchema {
  type: string;
  properties?: Record<string, MCPToolProperty>;
  required?: string[];
  description?: string;
  additionalProperties?: boolean;
  [key: string]: unknown;
}

interface MCPToolDefinition {
  name: string;
  description?: string;
  inputSchema?: MCPToolSchema;
}

// Define our own tool interface that's compatible with both AI SDK and MCP
interface UnifiedTool {
  description: string;
  parameters: z.ZodTypeAny;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

/**
 * MCP connection backed by the official MCP SDK for stdio, Streamable HTTP,
 * and legacy SSE transports.
 */
export class MCPConnection extends EventEmitter {
  private name: string;
  private displayName: string;
  private description?: string;
  private config: MCPServerConfig;
  private mcpClient: Client | null = null;
  private transportType: string;

  private tools: Record<string, UnifiedTool> = {}; // Store unified tools
  private mcpTools: MCPToolDefinition[] = []; // Store tools from MCP client
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
    this.disabled = config.disabled || false;
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

  private createMcpClient(): Client {
    return new Client(
      {
        name: "convera-electron",
        version: app.getVersion(),
      },
      {
        capabilities: {
          tools: {},
          prompts: {},
          resources: {},
        },
      },
    );
  }

  /**
   * Start the connection (enable if disabled)
   */
  async start(): Promise<ServerInfo> {
    if (this.disabled) {
      this.disabled = false;
      this.config.disabled = false;
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
      this.config.disabled = false;
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

    logger.info("Connecting to MCP server", this.config);
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

      logger.info("Resolved config", resolvedConfig);
      // Create transport and client
      if (this.transportType === "stdio") {
        // If command is npx, try to use full path
        let actualCommand = resolvedConfig.command!;
        if (actualCommand === "npx" && process.platform === "darwin") {
          const fs = await import("fs");
          const npxPaths = ["/usr/local/bin/npx", "/opt/homebrew/bin/npx"];

          // Check NVM directory for any installed versions
          const nvmDir = path.join(os.homedir(), ".nvm/versions/node");
          if (fs.existsSync(nvmDir)) {
            const versions = fs.readdirSync(nvmDir);
            for (const version of versions) {
              npxPaths.push(path.join(nvmDir, version, "bin/npx"));
            }
          }

          for (const npxPath of npxPaths) {
            if (fs.existsSync(npxPath)) {
              actualCommand = npxPath;
              break;
            }
          }
        }

        const environment = Object.fromEntries(
          Object.entries({
            ...process.env,
            ELECTRON_APP_PATH: app.getAppPath(),
            ELECTRON_USER_DATA: app.getPath("userData"),
            CONVERA_APP_PATH: app.getAppPath(),
            CONVERA_USER_DATA: app.getPath("userData"),
            ...resolvedConfig.env,
          }).filter((entry): entry is [string, string] => {
            return typeof entry[1] === "string";
          }),
        );
        const transport = new StdioClientTransport({
          command: actualCommand,
          args: resolvedConfig.args || [],
          env: environment,
          cwd: resolvedConfig.cwd || app.getPath("userData"),
        });

        // Set up transport event handlers
        transport.onclose = () => this.handleTransportClose();
        transport.onerror = (error) =>
          this.handleTransportError(error as Error);

        this.mcpClient = this.createMcpClient();
        await this.mcpClient.connect(transport);
      } else {
        // For HTTP/SSE - try Streamable HTTP first, fallback to SSE
        await this.connectWithHttpFallback(resolvedConfig);
      }

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
    if (this.mcpClient) {
      try {
        await this.mcpClient.close();
      } catch (error) {
        console.warn(`Error closing MCP client for ${this.name}:`, error);
      }
    }

    this.resetState(errorMessage);
  }

  /**
   * Reset connection state
   */
  private resetState(errorMessage?: string): void {
    this.mcpClient = null;
    this.tools = {};
    this.mcpTools = [];
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
  async updateCapabilities(): Promise<void> {
    try {
      if (this.mcpClient) {
        const result = await this.mcpClient.listTools();
        this.mcpTools = (result.tools || []) as MCPToolDefinition[];

        // Convert MCP tools to unified format
        this.tools = this.convertMcpToolsToUnified(this.mcpTools);
        this.toolNames = new Set(this.mcpTools.map((tool) => tool.name));
      }

      // Emit tools changed event with legacy format
      this.emit("toolsChanged", {
        server: this.name,
        tools: this.convertToolsToLegacyFormat(),
      });

      logger.info(`Updated capabilities for ${this.name}`, {
        toolCount: this.toolNames.size,
      });
    } catch (error) {
      logger.warn(
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
    if (!this.mcpClient) {
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
      // Use the unified tool interface
      const tool = this.tools[toolName];
      if (!tool) {
        throw this.createError("TOOL_NOT_FOUND", "Tool not found", {
          tool: toolName,
          availableTools: Object.keys(this.tools),
        });
      }

      return await tool.execute(args);
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
   * Connect with HTTP fallback strategy
   */
  private async connectWithHttpFallback(
    resolvedConfig: MCPServerConfig,
  ): Promise<void> {
    logger.info("Attempting HTTP/SSE connection for", resolvedConfig.url);

    try {
      // First try: Streamable HTTP with MCP client
      await this.connectWithStreamableHttp(resolvedConfig);
      logger.info("Connected successfully with Streamable HTTP");
    } catch (httpError) {
      logger.warn("Streamable HTTP failed, trying legacy SSE:", httpError);
      await this.mcpClient?.close().catch(() => undefined);
      this.mcpClient = null;

      try {
        await this.connectWithSse(resolvedConfig);
        logger.info("Connected successfully with legacy SSE");
      } catch (sseError) {
        logger.error("Both HTTP and SSE failed:", { httpError, sseError });
        throw new Error(
          `Failed to connect with both transports. HTTP: ${httpError}. SSE: ${sseError}`,
        );
      }
    }
  }

  /**
   * Connect using MCP SDK Streamable HTTP
   */
  private async connectWithStreamableHttp(
    resolvedConfig: MCPServerConfig,
  ): Promise<void> {
    const httpTransport = new StreamableHTTPClientTransport(
      new URL(resolvedConfig.url!),
      {
        requestInit: {
          headers: {
            "User-Agent": `Convera/${app.getVersion()} (Electron)`,
            ...(resolvedConfig.apiKey && {
              Authorization: `Bearer ${resolvedConfig.apiKey}`,
            }),
          },
        },
      },
    );

    this.mcpClient = this.createMcpClient();

    await this.mcpClient.connect(httpTransport);
  }

  /**
   * Connect using the MCP SDK legacy SSE transport.
   */
  private async connectWithSse(resolvedConfig: MCPServerConfig): Promise<void> {
    const headers = {
      "User-Agent": `Convera/${app.getVersion()} (Electron)`,
      ...(resolvedConfig.apiKey && {
        Authorization: `Bearer ${resolvedConfig.apiKey}`,
      }),
    };
    const transport = new SSEClientTransport(new URL(resolvedConfig.url!), {
      eventSourceInit: {
        fetch: (url, init) =>
          fetch(url, {
            ...init,
            headers: { ...headers, ...init?.headers },
          }),
      },
      requestInit: { headers },
    });
    this.mcpClient = this.createMcpClient();
    await this.mcpClient.connect(transport);
  }

  /**
   * Convert MCP tools to unified format
   */
  private convertMcpToolsToUnified(
    mcpTools: MCPToolDefinition[],
  ): Record<string, UnifiedTool> {
    const unifiedTools: Record<string, UnifiedTool> = {};

    for (const mcpTool of mcpTools) {
      // Convert MCP tool parameters (JSON Schema) to Zod format
      const parameters = this.convertJsonSchemaToZod(mcpTool.inputSchema);

      unifiedTools[mcpTool.name] = {
        description: mcpTool.description || "",
        parameters,
        execute: async (args: Record<string, unknown>) => {
          if (!this.mcpClient) {
            throw new Error("MCP client not initialized");
          }
          return await this.mcpClient.callTool({
            name: mcpTool.name,
            arguments: args,
          });
        },
      };
    }

    return unifiedTools;
  }

  /**
   * Convert JSON Schema to Zod schema object
   */
  private convertJsonSchemaToZod(schema?: MCPToolSchema): z.ZodTypeAny {
    if (!schema || !schema.type) {
      return z.object({});
    }

    if (schema.type === "object") {
      const shape: Record<string, z.ZodTypeAny> = {};
      const properties = schema.properties || {};

      for (const [key, prop] of Object.entries(properties)) {
        let zodType: z.ZodTypeAny;

        if (prop.type === "string") {
          zodType = z.string();
        } else if (prop.type === "number" || prop.type === "integer") {
          zodType = z.number();
        } else if (prop.type === "boolean") {
          zodType = z.boolean();
        } else if (prop.type === "array") {
          zodType = z.array(z.any());
        } else {
          zodType = z.any();
        }

        // Handle optional vs required
        if (!schema.required?.includes(key)) {
          zodType = zodType.optional();
        }

        shape[key] = zodType;
      }

      return z.object(shape);
    }

    return z.any();
  }

  /**
   * Convert Zod schema back to JSON Schema (simplified)
   */
  private zodSchemaToJsonSchema(
    zodSchema: z.ZodTypeAny,
  ): Record<string, unknown> {
    try {
      // Handle cases where the tool definition provides a JSON schema directly
      const potentialSchema = zodSchema as {
        jsonSchema?: Record<string, unknown>;
      };
      if (potentialSchema?.jsonSchema) {
        return potentialSchema.jsonSchema;
      }

      return zodToJsonSchema(zodSchema);
    } catch (e) {
      logger.error(
        "[MCPConnectionAI] Error converting zod schema to json schema",
        e,
      );
      // Fallback to empty object schema
      return { type: "object", properties: {} };
    }
  }

  /**
   * Convert tools to legacy ToolDefinition format for backward compatibility
   */
  private convertToolsToLegacyFormat(): ToolDefinition[] {
    if (this.mcpClient && this.mcpTools.length > 0) {
      return this.mcpTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema || {},
        parameters: tool.inputSchema || {},
      }));
    }

    return [];
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
