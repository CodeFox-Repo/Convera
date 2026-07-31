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

function request(
  requestId: string,
  content: string,
  options?: LocalAIChatRequest["options"],
): LocalAIChatRequest {
  return {
    requestId,
    conversationId: `conversation-${requestId}`,
    turnId: `turn-${requestId}`,
    providerId: "codex-cli",
    modelId: "gpt-test",
    operation: {
      kind: "append",
      message: { role: "user", content },
    },
    options,
  };
}

function status(): LocalAiProviderStatus {
  return {
    ...LOCAL_AI_PROVIDER_DESCRIPTORS["codex-cli"],
    available: true,
    authenticated: true,
    executablePath: "/test/codex",
    defaultModel: "gpt-test",
    models: ["gpt-test"],
    checkedAt: new Date(0).toISOString(),
  };
}

function providerSettings() {
  const calls = mocks.provider.mock.calls as unknown as Array<
    [
      string,
      {
        mcpServers?: {
          convera?: unknown;
          cua?: {
            transport: "stdio";
            command: string;
            args?: string[];
          };
        };
        approvalPolicy?: unknown;
        sandboxPolicy?: unknown;
        configOverrides?: Record<string, unknown>;
        serverRequests?: {
          onCommandExecutionApproval?: (...args: never[]) => Promise<unknown>;
          onFileChangeApproval?: (...args: never[]) => Promise<unknown>;
          onSkillApproval?: (...args: never[]) => Promise<unknown>;
          onMcpElicitation?: (request?: {
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
    const tool = {
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
    };

    await adapter.prepareRun(
      request("tool", "use a tool", { cwd: "/tmp/convera-test" }),
      status(),
      {
        tools: [tool],
        requestInteraction: vi.fn(async () => ({ approved: false })),
      },
    );

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

    await adapter.prepareRun(request("empty", "use a tool"), status(), {
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

    const handler = providerSettings()?.serverRequests?.onMcpElicitation;
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

  it("passes managed MCP servers natively without converting their tools", async () => {
    const adapter = new CodexCliAdapter();

    await adapter.prepareRun(request("native-mcp", "use cua"), status(), {
      tools: [],
      nativeMcpServers: {
        cua: {
          transport: "stdio",
          command: "cua-driver",
          args: ["mcp"],
          toolNames: ["screenshot"],
        },
      },
      requestInteraction: vi.fn(async () => ({ approved: false })),
    });

    expect(providerSettings()?.mcpServers).toEqual({
      cua: {
        transport: "stdio",
        command: "cua-driver",
        args: ["mcp"],
      },
    });
    expect(mocks.tool).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: "cua__screenshot" }),
    );

    await adapter.dispose();
  });

  it("removes native and configured tools for a text-only turn", async () => {
    const listConfiguredMcpServers = vi.fn(async () => [
      "node_repl",
      "openaiDeveloperDocs",
    ]);
    const adapter = new CodexCliAdapter({ listConfiguredMcpServers });
    const interaction = vi.fn(async () => ({ approved: true }));

    await adapter.prepareRun(
      request("restricted", "return json", { cwd: "/tmp/convera-test" }),
      status(),
      {
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
        nativeMcpServers: {
          cua: {
            transport: "stdio",
            command: "cua-driver",
            args: ["mcp"],
            toolNames: ["screenshot"],
          },
        },
        executionPolicy: "text-only",
        requestInteraction: interaction,
      },
    );

    expect(listConfiguredMcpServers).toHaveBeenCalledWith("/test/codex");
    const settings = providerSettings();
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

    await expect(
      adapter.prepareRun(
        request("failed-restricted", "return json"),
        status(),
        {
          tools: [],
          executionPolicy: "text-only",
          requestInteraction: vi.fn(async () => ({ approved: false })),
        },
      ),
    ).rejects.toMatchObject({
      code: "LOCAL_AI_TEXT_ONLY_POLICY_UNAVAILABLE",
    });
    await adapter.dispose();
  });
});
