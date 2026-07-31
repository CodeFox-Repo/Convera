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
      conversationId: "conversation",
      turnId: "turn",
      providerId: "codex-cli",
      modelId: "gpt-test",
      operation: {
        kind: "append",
        message: { role: "user", content: "use a tool" },
      },
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

    await adapter.prepareRun(request, status, {
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

    const mcpServer = providerSettings()?.mcpServers?.convera;
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
      conversationId: "conversation",
      turnId: "turn",
      providerId: "codex-cli",
      modelId: "gpt-test",
      operation: {
        kind: "append",
        message: { role: "user", content: "use a tool" },
      },
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

    await adapter.prepareRun(request, status, {
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

  it("removes native and configured tools for a text-only turn", async () => {
    const listConfiguredMcpServers = vi.fn(async () => [
      "node_repl",
      "openaiDeveloperDocs",
    ]);
    const adapter = new CodexCliAdapter({ listConfiguredMcpServers });
    const request: LocalAIChatRequest = {
      requestId: "restricted",
      conversationId: "memory-curator",
      turnId: "memory-turn",
      providerId: "codex-cli",
      modelId: "gpt-test",
      operation: {
        kind: "append",
        message: { role: "user", content: "return json" },
      },
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
    const interaction = vi.fn(async () => ({ approved: true }));

    await adapter.prepareRun(request, status, {
      tools: [
        {
          name: "builtin__probe",
          qualifiedName: "builtin:probe",
          description: "Must not be exposed",
          inputSchema: { type: "object", properties: {} },
          inputShape: {},
          inputValidator: z.object({}),
          execute: vi.fn(async () => "UNREACHABLE"),
        },
      ],
      executionPolicy: "text-only",
      requestInteraction: interaction,
    });

    expect(listConfiguredMcpServers).toHaveBeenCalledWith("/test/codex");
    const settings = providerSettings() as
      | {
          mcpServers?: unknown;
          approvalPolicy?: unknown;
          sandboxPolicy?: unknown;
          configOverrides?: Record<string, unknown>;
          serverRequests?: Record<
            string,
            (...args: never[]) => Promise<unknown>
          >;
        }
      | undefined;
    expect(settings).toMatchObject({
      approvalPolicy: "never",
      sandboxPolicy: "read-only",
      configOverrides: {
        "features.shell_tool": false,
        "features.unified_exec": false,
        "features.computer_use": false,
        "features.browser_use": false,
        "features.apps": false,
        "features.plugins": false,
        "features.skill_search": false,
        "features.hooks": false,
        "features.multi_agent": false,
        "agents.enabled": false,
        "tools.view_image": false,
        "tools.web_search": false,
        web_search: "disabled",
        mcp_servers: {
          node_repl: { enabled: false },
          openaiDeveloperDocs: { enabled: false },
        },
      },
    });
    expect(settings?.mcpServers).toBeUndefined();
    await expect(
      settings?.serverRequests?.onCommandExecutionApproval?.(),
    ).resolves.toEqual({ decision: "decline" });
    await expect(
      settings?.serverRequests?.onFileChangeApproval?.(),
    ).resolves.toEqual({ decision: "decline" });
    await expect(
      settings?.serverRequests?.onSkillApproval?.(),
    ).resolves.toEqual({ decision: "decline" });
    await expect(
      settings?.serverRequests?.onMcpElicitation?.(),
    ).resolves.toEqual({ action: "decline", content: null });
    expect(interaction).not.toHaveBeenCalled();

    await adapter.dispose();
  });

  it("fails closed when configured MCP servers cannot be enumerated", async () => {
    const adapter = new CodexCliAdapter({
      listConfiguredMcpServers: vi.fn(async () => {
        throw Object.assign(new Error("probe failed"), {
          code: "LOCAL_AI_TEXT_ONLY_POLICY_UNAVAILABLE",
        });
      }),
    });
    const request: LocalAIChatRequest = {
      requestId: "restricted",
      conversationId: "memory-curator",
      turnId: "memory-turn",
      providerId: "codex-cli",
      modelId: "gpt-test",
      operation: {
        kind: "append",
        message: { role: "user", content: "return json" },
      },
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

    await expect(
      adapter.prepareRun(request, status, {
        tools: [],
        executionPolicy: "text-only",
        requestInteraction: vi.fn(async () => ({ approved: false })),
      }),
    ).rejects.toMatchObject({
      code: "LOCAL_AI_TEXT_ONLY_POLICY_UNAVAILABLE",
    });
    await adapter.dispose();
  });
});
