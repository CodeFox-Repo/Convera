import type {
  LocalAIChatRequest,
  LocalAIStreamEvent,
} from "@/shared/types/local-ai";
import type { LanguageModel } from "ai";
import { describe, expect, it, vi } from "vitest";
import {
  resolveLocalModelId,
  type LocalAiProviderAdapter,
} from "../provider-adapter";
import { LOCAL_AI_PROVIDER_DESCRIPTORS } from "../provider-descriptors";
import { LocalAiRuntime, type RuntimeStreamInvoker } from "../runtime";
import type { LocalAiProviderId, LocalAiProviderStatus } from "../types";

function fakeAdapter(
  id: LocalAiProviderId,
  overrides: Partial<LocalAiProviderStatus> = {},
): LocalAiProviderAdapter {
  const status: LocalAiProviderStatus = {
    ...LOCAL_AI_PROVIDER_DESCRIPTORS[id],
    available: true,
    authenticated: true,
    version: "test-version",
    executablePath: `/test/${id}`,
    checkedAt: new Date(0).toISOString(),
    ...overrides,
  };

  return {
    id,
    getStatus: vi.fn(async () => status),
    createModel: vi.fn(async () => ({}) as LanguageModel),
    dispose: vi.fn(async () => undefined),
  };
}

function request(
  overrides: Partial<LocalAIChatRequest> = {},
): LocalAIChatRequest {
  return {
    requestId: "request-1",
    providerId: "claude-code",
    messages: [{ role: "user", content: "hello" }],
    ...overrides,
  };
}

describe("LocalAiRuntime", () => {
  it("maps the renderer default sentinel to the provider default model", () => {
    expect(resolveLocalModelId(undefined, "provider-default")).toBe(
      "provider-default",
    );
    expect(resolveLocalModelId("default", "provider-default")).toBe(
      "provider-default",
    );
    expect(resolveLocalModelId(" explicit-model ", "provider-default")).toBe(
      "explicit-model",
    );
  });

  it("maps internal CLI probes to the shared provider status contract", async () => {
    const runtime = new LocalAiRuntime({
      adapters: [
        fakeAdapter("claude-code", {
          authenticated: false,
          detail: "Run claude login",
        }),
      ],
    });

    const providers = await runtime.listProviders();

    expect(providers).toEqual([
      expect.objectContaining({
        id: "claude-code",
        kind: "claude-code",
        availability: "unauthenticated",
        detail: "Run claude login · test-version",
      }),
      expect.objectContaining({
        id: "codex-cli",
        availability: "unavailable",
      }),
    ]);
  });

  it("forwards text, tool, finish, usage, and explicit agent context", async () => {
    const events: LocalAIStreamEvent[] = [];
    let streamOptions: Parameters<RuntimeStreamInvoker>[0] | undefined;
    const streamInvoker: RuntimeStreamInvoker = (options) => {
      streamOptions = options;
      return {
        fullStream: (async function* () {
          yield { type: "text-delta", text: "Hi" };
          yield {
            type: "tool-call",
            toolCallId: "tool-1",
            toolName: "read_file",
            input: { path: "README.md" },
          };
          yield {
            type: "tool-result",
            toolCallId: "tool-1",
            toolName: "read_file",
            output: "contents",
          };
          yield {
            type: "finish",
            finishReason: "stop",
            totalUsage: {
              inputTokens: 3,
              outputTokens: 2,
              totalTokens: 5,
            },
          };
        })(),
      };
    };
    const adapter = fakeAdapter("claude-code");
    const runtime = new LocalAiRuntime({
      adapters: [adapter],
      streamInvoker,
      workingDirectory: "/trusted/workspace",
    });

    await runtime.startChat(
      request({
        agent: { systemPrompt: "Be concise." },
        options: { cwd: "/renderer/controlled" },
      }),
      (event) => events.push(event),
    );

    expect(adapter.createModel).toHaveBeenCalledWith(
      expect.objectContaining({
        options: { cwd: "/trusted/workspace" },
      }),
      expect.any(Object),
    );
    expect(streamOptions?.messages).toEqual([
      { role: "system", content: "Be concise." },
      { role: "user", content: "hello" },
    ]);
    expect(events).toEqual([
      { type: "delta", requestId: "request-1", text: "Hi" },
      {
        type: "tool",
        requestId: "request-1",
        toolCallId: "tool-1",
        name: "read_file",
        state: "input-available",
        input: { path: "README.md" },
      },
      {
        type: "tool",
        requestId: "request-1",
        toolCallId: "tool-1",
        name: "read_file",
        state: "output-available",
        output: "contents",
      },
      {
        type: "finish",
        requestId: "request-1",
        finishReason: "stop",
        usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
      },
    ]);
  });

  it("aborts an active stream and reports an aborted terminal event", async () => {
    const events: LocalAIStreamEvent[] = [];
    const streamInvoker: RuntimeStreamInvoker = (options) => ({
      fullStream: (async function* () {
        yield { type: "text-delta", text: "partial" };
        await new Promise<void>((resolve) => {
          options.abortSignal.addEventListener("abort", () => resolve(), {
            once: true,
          });
        });
        yield { type: "abort" };
      })(),
    });
    const adapter = fakeAdapter("claude-code");
    const runtime = new LocalAiRuntime({
      adapters: [adapter],
      streamInvoker,
    });

    const chat = runtime.startChat(request(), (event) => events.push(event));
    await vi.waitFor(() => {
      expect(events).toContainEqual({
        type: "delta",
        requestId: "request-1",
        text: "partial",
      });
    });

    expect(runtime.abort("request-1")).toBe(true);
    await chat;
    expect(runtime.abort("request-1")).toBe(false);
    expect(events.at(-1)).toEqual({
      type: "finish",
      requestId: "request-1",
      finishReason: "aborted",
    });

    await runtime.dispose();
    expect(adapter.dispose).toHaveBeenCalledOnce();
  });

  it("emits a structured error and terminal event for unavailable auth", async () => {
    const events: LocalAIStreamEvent[] = [];
    const runtime = new LocalAiRuntime({
      adapters: [
        fakeAdapter("codex-cli", {
          authenticated: false,
          detail: "Not logged in",
        }),
      ],
    });

    await runtime.startChat(request({ providerId: "codex-cli" }), (event) =>
      events.push(event),
    );

    expect(events[0]).toMatchObject({
      type: "error",
      requestId: "request-1",
      error: {
        name: "Error",
        message: "Not logged in",
        code: "PROVIDER_UNAUTHENTICATED",
      },
    });
    expect(events[1]).toEqual({
      type: "finish",
      requestId: "request-1",
      finishReason: "error",
    });
  });
});
