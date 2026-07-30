import type { LocalAIChatRequest } from "@/shared/types/local-ai";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { LOCAL_AI_PROVIDER_DESCRIPTORS } from "../provider-descriptors";
import { CodexCliAdapter } from "../providers/codex-cli";
import type { LocalAiProviderStatus } from "../types";

const mocks = vi.hoisted(() => {
  const model = {};
  const provider = Object.assign(
    vi.fn(() => model),
    {
      close: vi.fn(async () => undefined),
      listModels: vi.fn(async () => ({
        models: [{ id: "gpt-test" }],
        defaultModel: { id: "gpt-test" },
      })),
    },
  );

  return {
    model,
    provider,
    createCodexAppServer: vi.fn(() => provider),
    tool: vi.fn((definition) => definition),
  };
});

vi.mock("ai-sdk-provider-codex-cli", () => ({
  createCodexAppServer: mocks.createCodexAppServer,
  tool: mocks.tool,
}));

function providerSettings() {
  const calls = mocks.provider.mock.calls as unknown as Array<
    [
      string,
      {
        mcpServers?: { convera?: unknown };
        serverRequests?: {
          onMcpElicitation?: (request: {
            id: number;
            method: string;
            params: Record<string, unknown>;
          }) => Promise<unknown>;
        };
      },
    ]
  >;
  return calls.at(-1)?.[1];
}

describe("CodexCliAdapter MCP transport", () => {
  it("attaches Convera tools without the obsolete RMCP feature flag", async () => {
    const adapter = new CodexCliAdapter();
    const request: LocalAIChatRequest = {
      requestId: "test",
      providerId: "codex-cli",
      modelId: "gpt-test",
      messages: [{ role: "user", content: "use a tool" }],
      options: { cwd: "/tmp/convera-test" },
    };
    const status: LocalAiProviderStatus = {
      ...LOCAL_AI_PROVIDER_DESCRIPTORS["codex-cli"],
      available: true,
      authenticated: true,
      executablePath: "/test/codex",
      defaultModel: "gpt-test",
      models: ["gpt-test"],
      checkedAt: new Date(0).toISOString(),
    };

    await adapter.createModel(request, status, {
      tools: [
        {
          name: "builtin__probe",
          qualifiedName: "builtin:probe",
          description: "Probe the local MCP bridge",
          inputSchema: {
            type: "object",
            properties: { value: { type: "string" } },
          },
          inputShape: { value: z.string() },
          inputValidator: z.object({ value: z.string() }),
          execute: vi.fn(async () => "PROBE_OK"),
        },
      ],
      requestInteraction: vi.fn(async () => ({ approved: false })),
    });

    const mcpServer = mocks.provider.mock.calls[0]?.[1]?.mcpServers?.convera;
    expect(mcpServer).toEqual(
      expect.objectContaining({
        name: "convera",
        _start: expect.any(Function),
        _stop: expect.any(Function),
      }),
    );
    expect(mocks.provider).toHaveBeenCalledWith(
      "gpt-test",
      expect.objectContaining({
        cwd: "/tmp/convera-test",
        mcpServers: { convera: mcpServer },
      }),
    );
    expect(providerSettings()).not.toHaveProperty("rmcpClient");

    await adapter.dispose();
  });

  it("accepts MCP tool calls with structured empty content", async () => {
    const adapter = new CodexCliAdapter();
    const request: LocalAIChatRequest = {
      requestId: "test",
      providerId: "codex-cli",
      modelId: "gpt-test",
      messages: [{ role: "user", content: "use a tool" }],
    };
    const status: LocalAiProviderStatus = {
      ...LOCAL_AI_PROVIDER_DESCRIPTORS["codex-cli"],
      available: true,
      authenticated: true,
      executablePath: "/test/codex",
      defaultModel: "gpt-test",
      models: ["gpt-test"],
      checkedAt: new Date(0).toISOString(),
    };

    await adapter.createModel(request, status, {
      tools: [
        {
          name: "builtin__probe",
          qualifiedName: "builtin:probe",
          description: "Probe the local MCP bridge",
          inputSchema: { type: "object", properties: {} },
          inputShape: {},
          inputValidator: z.object({}),
          execute: vi.fn(async () => "PROBE_OK"),
        },
      ],
      requestInteraction: vi.fn(async () => ({ approved: false })),
    });

    const settings = providerSettings();
    const handler = settings?.serverRequests?.onMcpElicitation;
    expect(handler).toBeTypeOf("function");
    await expect(
      handler?.({
        id: 1,
        method: "mcpServer/elicitation/request",
        params: {
          threadId: "thread",
          serverName: "convera",
          _meta: { codex_approval_kind: "mcp_tool_call" },
        },
      }),
    ).resolves.toEqual({ action: "accept", content: {} });

    await adapter.dispose();
  });
});
