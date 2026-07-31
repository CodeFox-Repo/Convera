import type { LanguageModel } from "ai";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LocalAiProviderAdapter } from "../ai/provider-adapter";
import { LOCAL_AI_PROVIDER_DESCRIPTORS } from "../ai/provider-descriptors";
import { LocalAiRuntime } from "../ai/runtime";
import { InMemorySessionStateRepository } from "../ai/session/repository";
import { MCPConnection } from "./connection";
import { MCPHub } from "./hub";
import { cleanupMCPHub, getAgentToolGroups, initializeMCPHub } from "./index";

vi.mock("./managed-servers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./managed-servers")>()),
  resolveManagedStdioExecutable: vi.fn(() => "/test/cua-driver"),
}));

function providerAdapter(
  providerId: "codex-cli" | "claude-code",
  prepareRun: LocalAiProviderAdapter["prepareRun"],
): LocalAiProviderAdapter {
  return {
    id: providerId,
    enforcesSandbox: providerId === "codex-cli",
    getStatus: vi.fn(async () => ({
      ...LOCAL_AI_PROVIDER_DESCRIPTORS[providerId],
      available: true,
      authenticated: true,
      checkedAt: new Date(0).toISOString(),
    })),
    prepareRun,
    dispose: vi.fn(async () => undefined),
  };
}

describe("main-process agent tool catalog", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupMCPHub();
  });

  it("does not restart managed MCP connections when the catalog is requested again", async () => {
    const initialize = vi
      .spyOn(MCPHub.prototype, "initialize")
      .mockResolvedValue();
    const configPath = join(
      tmpdir(),
      `convera-mcp-idempotent-${process.pid}.json`,
    );

    const first = await initializeMCPHub(configPath);
    const second = await initializeMCPHub(configPath);

    expect(second).toBe(first);
    expect(initialize).toHaveBeenCalledTimes(1);
  });

  it("provides current builtins to startChat without the removed computer control", async () => {
    const prepareRun = vi.fn<LocalAiProviderAdapter["prepareRun"]>(
      async () => ({
        model: {} as LanguageModel,
        getNativeSessionId: () => "thread-runtime-catalog",
      }),
    );
    const configPath = join(
      tmpdir(),
      `convera-mcp-runtime-catalog-${process.pid}.json`,
    );
    const runtime = new LocalAiRuntime({
      adapters: [providerAdapter("codex-cli", prepareRun)],
      getToolGroups: async () => {
        await initializeMCPHub(configPath);
        return getAgentToolGroups();
      },
      streamInvoker: () => ({
        toUIMessageStream: async function* () {
          yield { type: "finish" as const, finishReason: "stop" as const };
        },
        providerMetadata: Promise.resolve({
          "codex-app-server": { threadId: "thread-runtime-catalog" },
        }),
      }),
      sessionRepository: new InMemorySessionStateRepository(),
    });

    await runtime.startChat(
      {
        requestId: "runtime-catalog",
        conversationId: "conversation-runtime-catalog",
        turnId: "turn-runtime-catalog",
        providerId: "codex-cli",
        operation: {
          kind: "append",
          message: { role: "user", content: "List available tools." },
        },
      },
      vi.fn(),
    );

    const context = prepareRun.mock.calls[0]?.[2];
    expect(context?.tools.map((tool) => tool.qualifiedName)).toEqual([
      "builtin:ask_user_input",
      "builtin:execute_command",
      "builtin:web_fetch",
    ]);
    expect(context?.tools.map((tool) => tool.qualifiedName)).not.toContain(
      "builtin:computer_control",
    );

    await runtime.dispose();
  });

  it.each(["codex-cli", "claude-code"] as const)(
    "provides connected Cua natively and current builtins to %s",
    async (providerId) => {
      vi.spyOn(MCPConnection.prototype, "connect").mockResolvedValue();
      vi.spyOn(MCPConnection.prototype, "disconnect").mockResolvedValue();
      vi.spyOn(MCPConnection.prototype, "getServerInfo").mockReturnValue({
        name: "cua",
        displayName: "Cua",
        description: "Convera-managed Cua Driver computer-use tools",
        transportType: "stdio",
        status: "connected",
        capabilities: {
          tools: [
            {
              name: "screenshot",
              description: "Capture the current desktop",
              inputSchema: { type: "object", properties: {} },
            },
          ],
          resources: [],
          resourceTemplates: [],
          prompts: [],
        },
        uptime: 0,
        managed: true,
      });

      const prepareRun = vi.fn<LocalAiProviderAdapter["prepareRun"]>(
        async () => ({
          model: {} as LanguageModel,
          getNativeSessionId: () => `thread-${providerId}`,
        }),
      );
      const configPath = join(
        tmpdir(),
        `convera-mcp-native-catalog-${providerId}-${process.pid}.json`,
      );
      const runtime = new LocalAiRuntime({
        adapters: [providerAdapter(providerId, prepareRun)],
        getToolGroups: async () => {
          await initializeMCPHub(configPath);
          return getAgentToolGroups();
        },
        streamInvoker: () => ({
          toUIMessageStream: async function* () {
            yield { type: "finish" as const, finishReason: "stop" as const };
          },
          providerMetadata: Promise.resolve({}),
        }),
        sessionRepository: new InMemorySessionStateRepository(),
      });

      await runtime.startChat(
        {
          requestId: `runtime-catalog-${providerId}`,
          conversationId: `conversation-runtime-catalog-${providerId}`,
          turnId: `turn-runtime-catalog-${providerId}`,
          providerId,
          operation: {
            kind: "append",
            message: { role: "user", content: "List available tools." },
          },
        },
        vi.fn(),
      );

      const context = prepareRun.mock.calls[0]?.[2];
      expect(context?.tools.map((tool) => tool.qualifiedName)).toEqual([
        "builtin:ask_user_input",
        "builtin:execute_command",
        "builtin:web_fetch",
      ]);
      expect(context?.nativeMcpServers).toMatchObject({
        cua: {
          transport: "stdio",
          command: "/test/cua-driver",
          args: ["mcp"],
          toolNames: ["screenshot"],
        },
      });
      expect(context?.nativeMcpServers?.cua?.env?.PATH).toContain(
        join(homedir(), ".local", "bin"),
      );
      expect(context?.tools.map((tool) => tool.qualifiedName)).not.toContain(
        "builtin:computer_control",
      );
      expect(context?.tools.map((tool) => tool.qualifiedName)).not.toContain(
        "cua:screenshot",
      );

      await runtime.dispose();
    },
  );
});
