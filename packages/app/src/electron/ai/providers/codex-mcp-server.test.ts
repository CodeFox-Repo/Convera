import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { LocalTool } from "ai-sdk-provider-codex-cli";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { AgentTool } from "../agent-tools";
import { createCodexMcpServer } from "./codex-mcp-server";

describe("Codex image-capable MCP server", () => {
  it("preserves image content and rejects unauthenticated callers", async () => {
    const execute = vi.fn(async () => ({
      content: [
        { type: "text" as const, text: "screen" },
        { type: "image" as const, data: "cG5n", mimeType: "image/png" },
      ],
    }));
    const definition: AgentTool = {
      name: "builtin__computer_control",
      qualifiedName: "builtin:computer_control",
      description: "Capture the screen",
      inputSchema: {
        type: "object",
        properties: { action: { type: "string" } },
      },
      inputShape: { action: z.string() },
      inputValidator: z.object({ action: z.string() }),
      execute,
    };
    const localTool: LocalTool = {
      name: definition.name,
      description: definition.description,
      inputSchema: definition.inputSchema,
      execute,
    };
    const server = createCodexMcpServer({
      name: "convera",
      tools: [localTool],
      definitions: [definition],
    });

    const config = await server._start();
    expect(config.transport).toBe("http");
    if (config.transport !== "http") {
      throw new Error("Expected HTTP MCP transport.");
    }

    const unauthorized = await fetch(config.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0.0" },
        },
      }),
    });
    expect(unauthorized.status).toBe(401);

    const client = new Client({ name: "test", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(config.url), {
      requestInit: {
        headers: { Authorization: `Bearer ${config.bearerToken}` },
      },
    });

    try {
      await client.connect(transport);
      await expect(
        client.callTool({
          name: definition.name,
          arguments: { action: "screenshot" },
        }),
      ).resolves.toEqual({
        content: [
          { type: "text", text: "screen" },
          { type: "image", data: "cG5n", mimeType: "image/png" },
        ],
      });
      expect(execute).toHaveBeenCalledWith({ action: "screenshot" });
    } finally {
      await client.close();
      await server._stop();
    }
  });
});
