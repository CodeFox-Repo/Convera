import type { LanguageModel } from "ai";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LocalAiProviderAdapter } from "../ai/provider-adapter";
import { LOCAL_AI_PROVIDER_DESCRIPTORS } from "../ai/provider-descriptors";
import { LocalAiRuntime } from "../ai/runtime";
import { InMemorySessionStateRepository } from "../ai/session/repository";
import { cleanupMCPHub, getAllTools, initializeMCPHub } from "./index";

describe("main-process agent tool catalog", () => {
  afterEach(async () => {
    await cleanupMCPHub();
  });

  it("provides every builtin tool to startChat after MCP initialization", async () => {
    const prepareRun = vi.fn<LocalAiProviderAdapter["prepareRun"]>(
      async () => ({
        model: {} as LanguageModel,
        getNativeSessionId: () => "thread-runtime-catalog",
      }),
    );
    const adapter: LocalAiProviderAdapter = {
      id: "codex-cli",
      getStatus: vi.fn(async () => ({
        ...LOCAL_AI_PROVIDER_DESCRIPTORS["codex-cli"],
        available: true,
        authenticated: true,
        checkedAt: new Date(0).toISOString(),
      })),
      prepareRun,
      dispose: vi.fn(async () => undefined),
    };
    const configPath = join(
      tmpdir(),
      `convera-mcp-runtime-catalog-${process.pid}.json`,
    );
    const runtime = new LocalAiRuntime({
      adapters: [adapter],
      getToolGroups: async () => {
        await initializeMCPHub(configPath);
        return getAllTools();
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
      "builtin:computer_control",
      "builtin:execute_command",
      "builtin:web_fetch",
    ]);

    await runtime.dispose();
  });
});
