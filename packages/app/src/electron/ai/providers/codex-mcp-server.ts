import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { ServerResponse } from "node:http";
import { createServer, type Server } from "node:http";
import { randomBytes } from "node:crypto";
import type { LocalTool, SdkMcpServer } from "ai-sdk-provider-codex-cli";
import type { AgentTool } from "../agent-tools";
import { toMcpToolResult } from "../tool-result";

const SDK_MCP_SERVER_MARKER = Symbol.for(
  "ai-sdk-provider-codex-cli.sdkMcpServer",
);

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  response.writeHead(statusCode, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function closeHttpServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function waitForResponse(response: ServerResponse): Promise<void> {
  if (response.writableFinished || response.destroyed) return;
  await new Promise<void>((resolve) => {
    response.once("finish", resolve);
    response.once("close", resolve);
  });
}

function createRequestServer(
  name: string,
  definitions: AgentTool[],
): McpServer {
  const server = new McpServer({ name, version: "1.0.0" });
  for (const definition of definitions) {
    server.registerTool(
      definition.name,
      {
        description: definition.description,
        inputSchema: definition.inputShape,
      },
      async (input) =>
        toMcpToolResult(
          await definition.execute(input as Record<string, unknown>),
        ),
    );
  }
  return server;
}

export function createCodexMcpServer(options: {
  name: string;
  tools: LocalTool[];
  definitions: AgentTool[];
}): SdkMcpServer {
  const bearerToken = randomBytes(32).toString("hex");
  const expectedAuthorization = `Bearer ${bearerToken}`;
  let httpServer: Server | undefined;
  let startPromise: Promise<{
    transport: "http";
    url: string;
    bearerToken: string;
  }> | null = null;
  let stopPromise: Promise<void> | null = null;

  const sdkServer = {
    [SDK_MCP_SERVER_MARKER]: true,
    name: options.name,
    tools: options.tools,
    async _start() {
      while (stopPromise) await stopPromise;
      if (httpServer?.listening) {
        const address = httpServer.address();
        if (address && typeof address !== "string") {
          return {
            transport: "http" as const,
            url: `http://127.0.0.1:${address.port}/mcp`,
            bearerToken,
          };
        }
      }
      if (startPromise) return startPromise;

      startPromise = new Promise((resolve, reject) => {
        const server = createServer(async (request, response) => {
          if (request.url !== "/mcp") {
            sendJson(response, 404, { error: "Not found" });
            return;
          }
          if (request.method !== "POST") {
            sendJson(response, 405, { error: "Method not allowed" });
            return;
          }
          if (request.headers.authorization !== expectedAuthorization) {
            response.setHeader("WWW-Authenticate", "Bearer");
            sendJson(response, 401, { error: "Unauthorized" });
            return;
          }

          const mcpServer = createRequestServer(
            options.name,
            options.definitions,
          );
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableJsonResponse: true,
          });
          try {
            await mcpServer.connect(transport);
            await transport.handleRequest(request, response);
            await waitForResponse(response);
          } catch (error) {
            if (!response.headersSent) {
              sendJson(response, 500, {
                jsonrpc: "2.0",
                id: null,
                error: {
                  code: -32603,
                  message:
                    error instanceof Error ? error.message : String(error),
                },
              });
            }
          } finally {
            await mcpServer.close();
          }
        });
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
          server.off("error", reject);
          const address = server.address();
          if (!address || typeof address === "string") {
            reject(new Error("Failed to resolve local MCP server address."));
            return;
          }
          httpServer = server;
          resolve({
            transport: "http",
            url: `http://127.0.0.1:${address.port}/mcp`,
            bearerToken,
          });
        });
      });

      try {
        return await startPromise;
      } finally {
        startPromise = null;
      }
    },
    async _stop() {
      if (stopPromise) return stopPromise;
      stopPromise = (async () => {
        await startPromise?.catch(() => undefined);
        const server = httpServer;
        httpServer = undefined;
        if (server) await closeHttpServer(server);
      })();
      try {
        await stopPromise;
      } finally {
        stopPromise = null;
      }
    },
  };

  return sdkServer as unknown as SdkMcpServer;
}
