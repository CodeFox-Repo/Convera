/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * MCP Client using the Model Context Protocol SDK
 * Handles communication with MCP servers
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import packageJson from "../../../package.json";
import { ToolDefinition } from "./types";

/**
 * MCP client implementation
 */
export class MCPClient {
  private client: Client | null = null;
  private transport:
    | StdioClientTransport
    | StreamableHTTPClientTransport
    | SSEClientTransport
    | null = null;

  private tools: ToolDefinition[] = [];
  private url?: string;
  private apiKey?: string;
  private command?: string;
  private args?: string[];
  private serverEnv?: Record<string, string>;
  private isStdioTransport = false;

  /**
   * Create an MCP client instance
   * @param baseUrlOrCommand URL for remote servers or command for local servers
   * @param apiKeyOrArgs API key for remote servers or args for local servers
   * @param isStdio Whether to use stdio transport (for local command-based servers)
   * @param env Environment variables for local servers
   */
  constructor(
    baseUrlOrCommand: string,
    apiKeyOrArgs?: string | string[],
    isStdio = false,
    env?: Record<string, string>,
  ) {
    this.isStdioTransport = isStdio;
    this.serverEnv = env;

    if (isStdio) {
      // Setup for local command-based server
      this.command = baseUrlOrCommand;
      this.args = Array.isArray(apiKeyOrArgs) ? apiKeyOrArgs : [];
    } else {
      // Setup for remote HTTP server
      this.url = baseUrlOrCommand.endsWith("/")
        ? baseUrlOrCommand.slice(0, -1)
        : baseUrlOrCommand;
      this.apiKey = typeof apiKeyOrArgs === "string" ? apiKeyOrArgs : undefined;
    }
  }

  /**
   * Connect to the MCP server
   */
  public async connect(): Promise<boolean> {
    try {
      // Initialize the MCP client
      this.client = new Client({
        name: "foxychat-mcp-client",
        version: packageJson.version,
      });

      if (this.isStdioTransport && this.command) {
        // Connect using stdio transport for local servers
        const options: any = {
          command: this.command,
          args: this.args || [],
          env: { ...process.env }, // Always include system environment variables,
        };

        // Create a merged environment that includes system environment variables
        // This ensures PATH and other critical variables are available
        if (this.serverEnv && Object.keys(this.serverEnv).length > 0) {
          options.env = {
            ...process.env, // Inherit system environment variables (if remove this then we get error, need to check if it is nessysary)
            ...this.serverEnv, // Override with custom environment variables
          };
          console.log(
            `Using environment variables for MCP server: ${Object.keys(this.serverEnv).join(", ")}`,
          );
        }

        console.log(
          `Spawning process with command: ${this.command} ${this.args?.join(" ") || ""}`,
        );

        try {
          this.transport = new StdioClientTransport(options);
          await this.client.connect(this.transport);
        } catch (error: any) {
          console.error("Error spawning MCP server process:", error);
          // If it's an ENOENT error, provide a helpful message about PATH
          if (
            error.message &&
            typeof error.message === "string" &&
            error.message.includes("ENOENT")
          ) {
            console.error(
              `Could not find the command '${this.command}'. Make sure it's installed and in your PATH.`,
            );
          }
          throw error;
        }
      } else if (this.url) {
        // Try connecting using Streamable HTTP transport first
        try {
          const url = new URL(this.url);
          console.log(`Connecting to MCP server at ${url.href}`);

          this.transport = new StreamableHTTPClientTransport(url);

          // Add API key as bearer token if available
          if (this.apiKey) {
            (this.transport as any).headers = {
              ...(this.transport as any).headers,
              Authorization: `Bearer ${this.apiKey}`,
            };
          }

          await this.client.connect(this.transport);
          console.log(
            `Connected to MCP server at ${url.href} using Streamable HTTP transport`,
          );
        } catch (error) {
          // If Streamable HTTP fails, try falling back to SSE transport
          console.warn(
            "Streamable HTTP connection failed, falling back to SSE transport",
          );
          try {
            const url = new URL(this.url);
            this.transport = new SSEClientTransport(url);

            // Add API key as bearer token if available
            if (this.apiKey) {
              (this.transport as any).headers = {
                ...(this.transport as any).headers,
                Authorization: `Bearer ${this.apiKey}`,
              };
            }

            await this.client.connect(this.transport);
            console.log(
              `Connected to MCP server at ${url.href} using SSE transport`,
            );
          } catch (sseError) {
            console.error("Failed to connect using SSE transport:", sseError);
            throw sseError;
          }
        }
      } else {
        throw new Error("Invalid server configuration");
      }

      // Fetch and cache available tools
      await this.updateToolsList();
      return true;
    } catch (error) {
      console.error("Failed to connect to MCP server:", error);
      return false;
    }
  }

  /**
   * Get the list of available tools from the server
   */
  public async listTools(): Promise<ToolDefinition[]> {
    if (!this.client) {
      console.error("MCP client not connected");
      return [];
    }

    try {
      if (this.tools.length === 0) {
        await this.updateToolsList();
      }
      return this.tools;
    } catch (error) {
      console.error("Failed to list MCP tools:", error);
      return [];
    }
  }

  /**
   * Update the cached tools list
   */
  private async updateToolsList(): Promise<void> {
    if (!this.client) {
      console.error("MCP client not connected");
      return;
    }

    try {
      const result = await this.client.listTools();
      this.tools = result.tools.map((tool) => ({
        name: tool.name,
        description: tool.description || `Tool: ${tool.name}`,
        parameters: tool.inputSchema,
        returns: tool.outputSchema,
      }));

      console.log(
        "Available MCP tools:",
        this.tools.map(({ name }) => name),
      );
    } catch (error) {
      console.error("Failed to update tools list:", error);
      this.tools = [];
    }
  }

  /**
   * Run an MCP tool
   * @param toolName Tool name
   * @param input Tool input arguments
   * @returns Tool execution result
   */
  public async runTool<T>(toolName: string, input: any): Promise<T> {
    if (!this.client) {
      throw new Error("MCP client not connected");
    }

    try {
      const result = await this.client.callTool({
        name: toolName,
        arguments: input,
      });

      return result as unknown as T;
    } catch (error) {
      console.error(`Error executing tool ${toolName}:`, error);
      throw error;
    }
  }

  /**
   * Close the connection to the server
   */
  public async close(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
        this.client = null;
        this.transport = null;
      } catch (error) {
        console.error("Error closing MCP client:", error);
      }
    }
  }
}
