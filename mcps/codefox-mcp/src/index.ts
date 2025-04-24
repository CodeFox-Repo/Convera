import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { promises as fsPromises } from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

import { initProjectSchema, initProject } from "./tools/projectTools.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 工具定义接口
interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, unknown>;
    required: string[];
  };
  handler: (args: unknown) => Promise<unknown>;
}

/**
 * Log message to file
 */
async function logToFile(message: string, ...args: unknown[]): Promise<void> {
  const timestamp = new Date().toISOString();
  const formattedArgs = args
    .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
    .join(" ");
  const logMessage = `[${timestamp}] ${message} ${formattedArgs}`.trim() + "\n";
  const logFile = path.join(__dirname, "..", "codefox-mcp-debug.log");

  try {
    await fsPromises.appendFile(logFile, logMessage);
  } catch {
    // If we can't log to file, use console as last resort
    console.error(logMessage);
  }
}

/**
 * CodeFox MCP Server
 */
class CodefoxMCPServer {
  private server: Server;
  private logFile: string;

  constructor() {
    this.logFile = path.join(__dirname, "..", "codefox-mcp-debug.log");

    // Initialize the server
    this.server = new Server(
      {
        name: "codefox-mcp",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.log("CodeFox MCP Server initialized");
    this.initializeHandlers();
  }

  /**
   * Log message to file
   */
  private async log(message: string, ...args: unknown[]): Promise<void> {
    await logToFile(message, ...args);
  }

  /**
   * Initialize handlers for tools
   */
  private async initializeHandlers(): Promise<void> {
    // Log requests before handling
    const logRequest = async (
      method: string,
      params: unknown,
    ): Promise<void> => {
      await this.log("Incoming request:", method, params);
    };

    // Define tools
    const tools: ToolDefinition[] = [
      {
        name: initProjectSchema.name,
        description: initProjectSchema.description,
        inputSchema: {
          type: "object",
          properties: {
            targetDir: {
              type: "string",
              description:
                "The absolute path where the project should be initialized",
            },
          },
          required: ["targetDir"],
        },
        handler: async (args): Promise<unknown> => {
          return await initProject(args as { targetDir: string });
        },
      },
    ];

    // Set up tool list handler
    this.server.setRequestHandler(ListToolsRequestSchema, async (request) => {
      await logRequest("list_tools", request.params);
      return {
        tools: tools.map(({ name, description, inputSchema }) => ({
          name,
          description,
          inputSchema,
        })),
      };
    });

    // Create a map of tool handlers for quick lookup
    const toolHandlers = new Map(
      tools.map((tool) => [tool.name, tool.handler]),
    );

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: rawArgs } = request.params;
      await this.log("Handling tool call:", name, rawArgs);

      try {
        // Get the handler for the requested tool
        const handler = toolHandlers.get(name);

        if (!handler) {
          throw new Error(`Unknown tool: ${name}`);
        }

        // Execute the handler with the provided arguments
        const result = await handler(rawArgs);
        await this.log("Tool call response:", name, result);
        return result;
      } catch (error) {
        await this.log("Tool call error:", name, error);
        throw error;
      }
    });
  }

  /**
   * Start the server
   */
  public async start(): Promise<void> {
    await this.log("Starting CodeFox MCP Server...");
    const transport = new StdioServerTransport();
    await this.log("MCP Server starting with stdio transport");

    await this.server.connect(transport);
    await this.log("CodeFox MCP Server started successfully");
  }
}

/**
 * Start the server
 */
export function startServer(): void {
  const server = new CodefoxMCPServer();
  server.start().catch(async (error) => {
    await logToFile("Failed to start server:", error);
    process.exit(1);
  });
}

// 自动启动服务器
console.log("Starting CodeFox MCP Server...");
startServer();
