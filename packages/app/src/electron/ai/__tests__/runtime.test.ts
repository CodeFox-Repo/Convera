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
    enforcesSandbox: false,
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

  it("forwards the AI SDK UI stream, usage, and explicit agent context", async () => {
    const events: LocalAIStreamEvent[] = [];
    let streamOptions: Parameters<RuntimeStreamInvoker>[0] | undefined;
    const streamInvoker: RuntimeStreamInvoker = (options) => {
      streamOptions = options;
      return {
        toUIMessageStream: async function* () {
          yield { type: "start" as const, messageId: "assistant-1" };
          yield { type: "text-start" as const, id: "text-1" };
          yield { type: "text-delta" as const, id: "text-1", delta: "Hi" };
          yield { type: "text-end" as const, id: "text-1" };
          yield {
            type: "tool-input-available" as const,
            toolCallId: "tool-1",
            toolName: "read_file",
            input: { path: "README.md" },
            dynamic: true,
          };
          yield {
            type: "tool-output-available" as const,
            toolCallId: "tool-1",
            output: "contents",
            dynamic: true,
          };
          yield { type: "finish" as const, finishReason: "stop" as const };
        },
        finishReason: Promise.resolve("stop"),
        usage: Promise.resolve({
          inputTokens: 3,
          outputTokens: 2,
          totalTokens: 5,
        }),
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
      expect.objectContaining({
        tools: [],
        requestInteraction: expect.any(Function),
        sandbox: {
          root: "/trusted/workspace",
          writableRoots: ["/trusted/workspace/workspace"],
          networkAccess: false,
        },
      }),
    );
    expect(streamOptions?.messages).toEqual([
      { role: "system", content: "Be concise." },
      { role: "user", content: "hello" },
    ]);
    expect(events).toEqual([
      {
        type: "ui-message",
        requestId: "request-1",
        chunk: { type: "start", messageId: "assistant-1" },
      },
      {
        type: "ui-message",
        requestId: "request-1",
        chunk: { type: "text-start", id: "text-1" },
      },
      {
        type: "ui-message",
        requestId: "request-1",
        chunk: { type: "text-delta", id: "text-1", delta: "Hi" },
      },
      {
        type: "ui-message",
        requestId: "request-1",
        chunk: { type: "text-end", id: "text-1" },
      },
      {
        type: "ui-message",
        requestId: "request-1",
        chunk: {
          type: "tool-input-available",
          toolCallId: "tool-1",
          toolName: "read_file",
          input: { path: "README.md" },
          dynamic: true,
        },
      },
      {
        type: "ui-message",
        requestId: "request-1",
        chunk: {
          type: "tool-output-available",
          toolCallId: "tool-1",
          output: "contents",
          dynamic: true,
        },
      },
      {
        type: "ui-message",
        requestId: "request-1",
        chunk: { type: "finish", finishReason: "stop" },
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
      toUIMessageStream: async function* () {
        yield { type: "start" as const, messageId: "assistant-1" };
        yield { type: "text-start" as const, id: "text-1" };
        yield {
          type: "text-delta" as const,
          id: "text-1",
          delta: "partial",
        };
        await new Promise<void>((resolve) => {
          options.abortSignal.addEventListener("abort", () => resolve(), {
            once: true,
          });
        });
      },
    });
    const adapter = fakeAdapter("claude-code");
    const runtime = new LocalAiRuntime({
      adapters: [adapter],
      streamInvoker,
    });

    const chat = runtime.startChat(request(), (event) => events.push(event));
    await vi.waitFor(() => {
      expect(events).toContainEqual({
        type: "ui-message",
        requestId: "request-1",
        chunk: { type: "text-delta", id: "text-1", delta: "partial" },
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

  it("does not create a provider model after aborting during status discovery", async () => {
    const events: LocalAIStreamEvent[] = [];
    const adapter = fakeAdapter("codex-cli");
    let finishStatusDiscovery: (() => void) | undefined;
    vi.mocked(adapter.getStatus).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishStatusDiscovery = () =>
            resolve({
              ...LOCAL_AI_PROVIDER_DESCRIPTORS["codex-cli"],
              available: true,
              authenticated: true,
              executablePath: "/test/codex",
              checkedAt: new Date(0).toISOString(),
            });
        }),
    );
    const streamInvoker = vi.fn<RuntimeStreamInvoker>();
    const runtime = new LocalAiRuntime({
      adapters: [adapter],
      streamInvoker,
    });

    const chat = runtime.startChat(
      request({ providerId: "codex-cli" }),
      (event) => events.push(event),
    );
    await vi.waitFor(() => {
      expect(adapter.getStatus).toHaveBeenCalledOnce();
    });
    expect(runtime.abort("request-1")).toBe(true);
    finishStatusDiscovery?.();
    await chat;

    expect(adapter.createModel).not.toHaveBeenCalled();
    expect(streamInvoker).not.toHaveBeenCalled();
    expect(events.at(-1)).toEqual({
      type: "finish",
      requestId: "request-1",
      finishReason: "aborted",
    });
  });

  it("rejects a tool interaction that starts after its request was aborted", async () => {
    const events: LocalAIStreamEvent[] = [];
    let toolContext:
      | Parameters<LocalAiProviderAdapter["createModel"]>[2]
      | undefined;
    let continueStream: (() => void) | undefined;
    const adapter = fakeAdapter("claude-code");
    vi.mocked(adapter.createModel).mockImplementation(
      async (_request, _status, context) => {
        toolContext = context;
        return {} as LanguageModel;
      },
    );
    const executeTool = vi.fn(async () => ({ written: true }));
    const runtime = new LocalAiRuntime({
      adapters: [adapter],
      getToolGroups: () => [
        {
          serverName: "external",
          tools: [
            {
              name: "write_value",
              inputSchema: { type: "object", properties: {} },
            },
          ],
        },
      ],
      executeTool,
      streamInvoker: () => ({
        toUIMessageStream: async function* () {
          yield { type: "start" as const, messageId: "assistant-1" };
          await new Promise<void>((resolve) => {
            continueStream = resolve;
          });
          await toolContext?.tools[0]?.execute({});
        },
      }),
    });

    const chat = runtime.startChat(request(), (event) => events.push(event));
    await vi.waitFor(() => {
      expect(continueStream).toBeTypeOf("function");
    });
    expect(runtime.abort("request-1")).toBe(true);
    continueStream?.();
    await chat;

    expect(executeTool).not.toHaveBeenCalled();
    expect(events).not.toContainEqual(
      expect.objectContaining({ type: "interaction" }),
    );
    expect(events.at(-1)).toEqual({
      type: "finish",
      requestId: "request-1",
      finishReason: "aborted",
    });
  });

  it("pauses an approval-gated tool until the renderer responds", async () => {
    const events: LocalAIStreamEvent[] = [];
    let toolContext:
      | Parameters<LocalAiProviderAdapter["createModel"]>[2]
      | undefined;
    const adapter = fakeAdapter("claude-code");
    vi.mocked(adapter.createModel).mockImplementation(
      async (_request, _status, context) => {
        toolContext = context;
        return {} as LanguageModel;
      },
    );
    const runtime = new LocalAiRuntime({
      adapters: [adapter],
      getToolGroups: () => [
        {
          serverName: "external",
          tools: [
            {
              name: "write_value",
              description: "Writes a value",
              inputSchema: {
                type: "object",
                properties: { value: { type: "string" } },
                required: ["value"],
              },
            },
          ],
        },
      ],
      executeTool: vi.fn(async () => ({ written: true })),
      streamInvoker: () => ({
        toUIMessageStream: async function* () {
          const tool = toolContext?.tools[0];
          if (!tool) throw new Error("Expected tool context");
          const output = await tool.execute({ value: "ready" });
          yield {
            type: "tool-input-available" as const,
            toolCallId: "tool-1",
            toolName: tool.name,
            input: { value: "ready" },
            dynamic: true,
          };
          yield {
            type: "tool-output-available" as const,
            toolCallId: "tool-1",
            output,
            dynamic: true,
          };
          yield { type: "finish" as const, finishReason: "stop" as const };
        },
      }),
    });

    const chat = runtime.startChat(request(), (event) => events.push(event));
    await vi.waitFor(() => {
      expect(events[0]).toMatchObject({
        type: "interaction",
        requestId: "request-1",
        kind: "approval",
        name: "external:write_value",
      });
    });
    const interaction = events[0];
    if (interaction.type !== "interaction") {
      throw new Error("Expected interaction event");
    }

    expect(
      runtime.respondToInteraction(
        interaction.requestId,
        interaction.interactionId,
        { approved: true },
      ),
    ).toBe(true);
    await chat;

    expect(events).toContainEqual({
      type: "ui-message",
      requestId: "request-1",
      chunk: {
        type: "tool-input-available",
        toolCallId: "tool-1",
        toolName: "external:write_value",
        input: { value: "ready" },
        dynamic: true,
      },
    });
    expect(events.at(-1)).toEqual({
      type: "finish",
      requestId: "request-1",
      finishReason: "stop",
      usage: undefined,
    });
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
