import type {
  LocalAIChatRequest,
  LocalAIStreamEvent,
} from "@/shared/types/local-ai";
import type { LanguageModel } from "ai";
import { describe, expect, it, vi } from "vitest";
import { createAgentToolCatalog } from "../agent-tools";
import {
  resolveLocalModelId,
  type LocalAiProviderAdapter,
} from "../provider-adapter";
import { LOCAL_AI_PROVIDER_DESCRIPTORS } from "../provider-descriptors";
import { LocalAiRuntime, type RuntimeStreamInvoker } from "../runtime";
import { InMemorySessionStateRepository } from "../session/repository";
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
    prepareRun: vi.fn(async () => ({
      model: {} as LanguageModel,
      getNativeSessionId: () => `${id}-session`,
    })),
    dispose: vi.fn(async () => undefined),
  };
}

function request(
  overrides: Partial<LocalAIChatRequest> = {},
): LocalAIChatRequest {
  return {
    requestId: "request-1",
    conversationId: "conversation-1",
    turnId: "turn-1",
    providerId: "claude-code",
    operation: {
      kind: "append",
      message: { role: "user", content: "hello" },
    },
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
      sessionRepository: new InMemorySessionStateRepository(),
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
      sessionRepository: new InMemorySessionStateRepository(),
    });

    await runtime.startChat(
      request({
        agent: { systemPrompt: "Be concise." },
        options: { cwd: "/renderer/controlled" },
      }),
      (event) => events.push(event),
    );

    expect(adapter.prepareRun).toHaveBeenCalledWith(
      expect.objectContaining({
        options: { cwd: "/trusted/workspace" },
      }),
      expect.any(Object),
      expect.objectContaining({
        tools: [],
        requestInteraction: expect.any(Function),
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
        conversationId: "conversation-1",
        turnId: "turn-1",
        revision: 0,
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
      sessionRepository: new InMemorySessionStateRepository(),
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
      conversationId: "conversation-1",
      turnId: "turn-1",
      revision: 0,
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
      sessionRepository: new InMemorySessionStateRepository(),
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

    expect(adapter.prepareRun).not.toHaveBeenCalled();
    expect(streamInvoker).not.toHaveBeenCalled();
    expect(events.at(-1)).toEqual({
      type: "finish",
      requestId: "request-1",
      finishReason: "aborted",
      conversationId: "conversation-1",
      turnId: "turn-1",
      revision: 0,
    });
  });

  it("rejects a tool interaction that starts after its request was aborted", async () => {
    const events: LocalAIStreamEvent[] = [];
    let toolContext:
      | Parameters<LocalAiProviderAdapter["prepareRun"]>[2]
      | undefined;
    let continueStream: (() => void) | undefined;
    const adapter = fakeAdapter("claude-code");
    vi.mocked(adapter.prepareRun).mockImplementation(
      async (_request, _status, context) => {
        toolContext = context;
        return {
          model: {} as LanguageModel,
          getNativeSessionId: () => "claude-session",
        };
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
      sessionRepository: new InMemorySessionStateRepository(),
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
      conversationId: "conversation-1",
      turnId: "turn-1",
      revision: 0,
    });
  });

  it("pauses an approval-gated tool until the renderer responds", async () => {
    const events: LocalAIStreamEvent[] = [];
    let toolContext:
      | Parameters<LocalAiProviderAdapter["prepareRun"]>[2]
      | undefined;
    const adapter = fakeAdapter("claude-code");
    vi.mocked(adapter.prepareRun).mockImplementation(
      async (_request, _status, context) => {
        toolContext = context;
        return {
          model: {} as LanguageModel,
          getNativeSessionId: () => "claude-session",
        };
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
      sessionRepository: new InMemorySessionStateRepository(),
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
      conversationId: "conversation-1",
      turnId: "turn-1",
      revision: 0,
    });
  });

  it("commits provider metadata and resumes with only the append delta", async () => {
    const repository = new InMemorySessionStateRepository();
    const adapter = fakeAdapter("claude-code");
    vi.mocked(adapter.prepareRun).mockImplementation(
      async (_request, _status, context) => ({
        model: {} as LanguageModel,
        getNativeSessionId: (metadata) => {
          const sessionId = metadata?.test?.sessionId;
          if (typeof sessionId !== "string") throw new Error("missing session");
          return sessionId;
        },
        providerOptions: context.session
          ? { test: { resume: context.session.nativeSessionId } }
          : undefined,
      }),
    );
    let call = 0;
    const streamInvoker = vi.fn<RuntimeStreamInvoker>(() => {
      call += 1;
      return {
        toUIMessageStream: async function* () {
          yield { type: "finish" as const, finishReason: "stop" as const };
        },
        finishReason: Promise.resolve("stop"),
        providerMetadata: Promise.resolve({
          test: { sessionId: `session-${call}` },
        }),
      };
    });
    const runtime = new LocalAiRuntime({
      adapters: [adapter],
      streamInvoker,
      workingDirectory: "/workspace",
      sessionRepository: repository,
    });

    await runtime.startChat(
      request({
        operation: {
          kind: "bootstrap",
          messages: [{ role: "user", content: "first" }],
        },
        agent: { systemPrompt: "system" },
      }),
      () => undefined,
    );
    await runtime.startChat(
      request({
        requestId: "request-2",
        turnId: "turn-2",
        operation: {
          kind: "append",
          message: { role: "user", content: "second" },
        },
        agent: { systemPrompt: "system" },
      }),
      () => undefined,
    );

    expect(streamInvoker.mock.calls[0]?.[0].messages).toEqual([
      { role: "system", content: "system" },
      { role: "user", content: "first" },
    ]);
    expect(streamInvoker.mock.calls[1]?.[0]).toMatchObject({
      messages: [{ role: "user", content: "second" }],
      providerOptions: { test: { resume: "session-1" } },
    });
    expect(
      vi.mocked(adapter.prepareRun).mock.calls[1]?.[2].session,
    ).toMatchObject({ nativeSessionId: "session-1" });
    expect(await repository.getBindings("conversation-1")).toEqual([
      expect.objectContaining({ nativeSessionId: "session-2", revision: 0 }),
    ]);
  });

  it("fails safely when successful output has malformed session metadata", async () => {
    const repository = new InMemorySessionStateRepository();
    const adapter = fakeAdapter("codex-cli");
    vi.mocked(adapter.prepareRun).mockResolvedValue({
      model: {} as LanguageModel,
      getNativeSessionId: () => {
        throw Object.assign(new Error("missing thread id"), {
          code: "LOCAL_AI_SESSION_METADATA_INVALID",
        });
      },
    });
    const events: LocalAIStreamEvent[] = [];
    const runtime = new LocalAiRuntime({
      adapters: [adapter],
      sessionRepository: repository,
      streamInvoker: () => ({
        toUIMessageStream: async function* () {
          yield { type: "text-start" as const, id: "text" };
          yield {
            type: "text-delta" as const,
            id: "text",
            delta: "uncommitted",
          };
          yield { type: "text-end" as const, id: "text" };
          yield { type: "finish" as const, finishReason: "stop" as const };
        },
        finishReason: Promise.resolve("stop"),
        providerMetadata: Promise.resolve(undefined),
      }),
    });

    await runtime.startChat(request({ providerId: "codex-cli" }), (event) =>
      events.push(event),
    );

    expect(events).not.toContainEqual(
      expect.objectContaining({
        type: "ui-message",
        chunk: expect.objectContaining({ type: "finish" }),
      }),
    );
    expect(events.at(-2)).toMatchObject({
      type: "error",
      error: { code: "LOCAL_AI_SESSION_METADATA_INVALID" },
    });
    expect(events.at(-1)).toMatchObject({
      type: "finish",
      finishReason: "error",
      conversationId: "conversation-1",
      turnId: "turn-1",
      revision: 0,
    });
    expect(await repository.getBindings("conversation-1")).toEqual([]);
    expect(await repository.getTurn("turn-1")).toMatchObject({
      status: "uncertain",
      error: "missing thread id",
    });
  });

  it("persists the provider-started boundary before invoking a synchronous stream", async () => {
    const repository = new InMemorySessionStateRepository();
    const events: LocalAIStreamEvent[] = [];
    const runtime = new LocalAiRuntime({
      adapters: [fakeAdapter("codex-cli")],
      sessionRepository: repository,
      streamInvoker: () => {
        throw new Error("provider failed while opening the stream");
      },
    });

    await runtime.startChat(request({ providerId: "codex-cli" }), (event) =>
      events.push(event),
    );

    expect(await repository.getTurn("turn-1")).toMatchObject({
      status: "uncertain",
      error: "provider failed while opening the stream",
    });
    expect(events.at(-1)).toMatchObject({
      type: "finish",
      finishReason: "error",
      revision: 0,
    });
  });

  it("serializes turns for one conversation and resumes the committed session", async () => {
    const repository = new InMemorySessionStateRepository();
    const adapter = fakeAdapter("claude-code");
    let releaseFirst: (() => void) | undefined;
    let streamCall = 0;
    const runtime = new LocalAiRuntime({
      adapters: [adapter],
      sessionRepository: repository,
      streamInvoker: () => {
        streamCall += 1;
        const currentCall = streamCall;
        return {
          toUIMessageStream: async function* () {
            if (currentCall === 1) {
              await new Promise<void>((resolve) => {
                releaseFirst = resolve;
              });
            }
            yield { type: "finish" as const, finishReason: "stop" as const };
          },
          finishReason: Promise.resolve("stop"),
        };
      },
    });

    const first = runtime.startChat(request(), () => undefined);
    await vi.waitFor(() => expect(releaseFirst).toBeTypeOf("function"));
    const second = runtime.startChat(
      request({ requestId: "request-2", turnId: "turn-2" }),
      () => undefined,
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(adapter.prepareRun).toHaveBeenCalledTimes(1);

    releaseFirst?.();
    await Promise.all([first, second]);

    expect(adapter.prepareRun).toHaveBeenCalledTimes(2);
    expect(
      vi.mocked(adapter.prepareRun).mock.calls[1]?.[2].session,
    ).toMatchObject({ nativeSessionId: "claude-code-session" });
  });

  it("invalidates an existing binding when an active provider turn is aborted", async () => {
    const repository = new InMemorySessionStateRepository();
    const adapter = fakeAdapter("codex-cli");
    let streamCall = 0;
    const runtime = new LocalAiRuntime({
      adapters: [adapter],
      sessionRepository: repository,
      streamInvoker: (options) => {
        streamCall += 1;
        const currentCall = streamCall;
        return {
          toUIMessageStream: async function* () {
            if (currentCall === 2) {
              await new Promise<void>((resolve) => {
                options.abortSignal.addEventListener("abort", () => resolve(), {
                  once: true,
                });
              });
              return;
            }
            yield { type: "finish" as const, finishReason: "stop" as const };
          },
          finishReason: currentCall === 2 ? undefined : Promise.resolve("stop"),
        };
      },
    });

    await runtime.startChat(
      request({
        operation: {
          kind: "bootstrap",
          messages: [{ role: "user", content: "seed" }],
        },
        providerId: "codex-cli",
      }),
      () => undefined,
    );

    const secondEvents: LocalAIStreamEvent[] = [];
    const second = runtime.startChat(
      request({
        requestId: "request-2",
        turnId: "turn-2",
        providerId: "codex-cli",
      }),
      (event) => secondEvents.push(event),
    );
    await vi.waitFor(() => expect(streamCall).toBe(2));
    expect(runtime.abort("request-2")).toBe(true);
    await second;

    expect(await repository.getTurn("turn-2")).toMatchObject({
      status: "uncertain",
    });
    expect(await repository.getBindings("conversation-1")).toEqual([
      expect.objectContaining({ stale: true }),
    ]);

    const retryEvents: LocalAIStreamEvent[] = [];
    await runtime.startChat(
      request({
        requestId: "request-3",
        turnId: "turn-3",
        providerId: "codex-cli",
      }),
      (event) => retryEvents.push(event),
    );
    expect(retryEvents.at(-2)).toMatchObject({
      type: "error",
      error: { code: "LOCAL_AI_SESSION_REBASE_REQUIRED" },
    });
    expect(adapter.prepareRun).toHaveBeenCalledTimes(2);
  });

  it("injects ephemeral turn context and tools, commits cursors, and detaches completion work", async () => {
    const repository = new InMemorySessionStateRepository();
    const adapter = fakeAdapter("codex-cli");
    const events: LocalAIStreamEvent[] = [];
    let releaseCompletion: (() => void) | undefined;
    const onTurnCompleted = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseCompletion = resolve;
        }),
    );
    const additionalTools = createAgentToolCatalog({
      groups: [
        {
          serverName: "memory",
          tools: [
            {
              name: "memory_search",
              description: "Search durable memory.",
              inputSchema: {
                type: "object",
                properties: { query: { type: "string" } },
                required: ["query"],
              },
            },
          ],
        },
      ],
      executeTool: async () => [],
      requestInteraction: async () => ({ approved: true }),
    });
    let streamOptions: Parameters<RuntimeStreamInvoker>[0] | undefined;
    const runtime = new LocalAiRuntime({
      adapters: [adapter],
      sessionRepository: repository,
      streamInvoker: (options) => {
        streamOptions = options;
        return {
          toUIMessageStream: async function* () {
            yield { type: "text-start" as const, id: "text" };
            yield {
              type: "text-delta" as const,
              id: "text",
              delta: "remembered",
            };
            yield { type: "text-end" as const, id: "text" };
            yield { type: "finish" as const, finishReason: "stop" as const };
          },
          finishReason: Promise.resolve("stop"),
        };
      },
      turnHooks: {
        prepareTurnContext: () => ({
          systemContext: "<memory>durable context</memory>",
          additionalTools,
          contextToken: { jobId: "job-1" },
          memoryCursors: {
            user: { version: 3, epoch: 1 },
          },
        }),
        onTurnCompleted,
      },
    });

    await runtime.startChat(request({ providerId: "codex-cli" }), (event) =>
      events.push(event),
    );

    expect(events.at(-1)).toMatchObject({
      type: "finish",
      finishReason: "stop",
    });
    await vi.waitFor(() => expect(onTurnCompleted).toHaveBeenCalledOnce());
    expect(releaseCompletion).toBeTypeOf("function");
    expect(streamOptions?.messages).toEqual([
      {
        role: "system",
        content: "<memory>durable context</memory>",
      },
      { role: "user", content: "hello" },
    ]);
    expect(
      vi
        .mocked(adapter.prepareRun)
        .mock.calls[0]?.[2].tools.map((tool) => tool.qualifiedName),
    ).toContain("memory:memory_search");
    expect(onTurnCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        assistantText: "remembered",
        contextToken: { jobId: "job-1" },
        revision: 0,
      }),
    );
    expect(await repository.getBindings("conversation-1")).toEqual([
      expect.objectContaining({
        memoryCursors: {
          user: { version: 3, epoch: 1 },
        },
      }),
    ]);
    releaseCompletion?.();
  });

  it("rotates revision when a turn hook rejects an existing hidden session", async () => {
    const repository = new InMemorySessionStateRepository();
    const adapter = fakeAdapter("codex-cli");
    let prepareCount = 0;
    const streamInvoker = vi.fn<RuntimeStreamInvoker>(() => ({
      toUIMessageStream: async function* () {
        yield { type: "finish" as const, finishReason: "stop" as const };
      },
      finishReason: Promise.resolve("stop"),
    }));
    const runtime = new LocalAiRuntime({
      adapters: [adapter],
      sessionRepository: repository,
      streamInvoker,
      turnHooks: {
        prepareTurnContext: () => {
          prepareCount += 1;
          return prepareCount === 2
            ? {
                forceNewSession: true,
                systemContext: '<memory epoch="2" />',
                memoryCursors: {
                  user: { version: 4, epoch: 2 },
                },
              }
            : undefined;
        },
      },
    });

    await runtime.startChat(
      request({
        providerId: "codex-cli",
        operation: {
          kind: "bootstrap",
          messages: [{ role: "user", content: "seed" }],
        },
      }),
      () => undefined,
    );
    await runtime.startChat(
      request({
        requestId: "request-2",
        turnId: "turn-2",
        providerId: "codex-cli",
        expectedRevision: 0,
        operation: {
          kind: "append",
          message: { role: "user", content: "after correction" },
        },
      }),
      () => undefined,
    );

    expect(
      vi.mocked(adapter.prepareRun).mock.calls[1]?.[2].session,
    ).toBeUndefined();
    expect(streamInvoker.mock.calls[1]?.[0].messages).toEqual([
      { role: "system", content: '<memory epoch="2" />' },
      { role: "user", content: "after correction" },
    ]);
    expect(await runtime.getConversationRuntimeState("conversation-1")).toEqual(
      expect.objectContaining({
        revision: 1,
        providers: [
          expect.objectContaining({
            providerId: "codex-cli",
            revision: 1,
          }),
        ],
      }),
    );
    expect(await repository.getBindings("conversation-1")).toEqual([
      expect.objectContaining({ revision: 0 }),
      expect.objectContaining({
        revision: 1,
        memoryCursors: {
          user: { version: 4, epoch: 2 },
        },
      }),
    ]);
  });

  it("conservatively invalidates a binding when stream creation may have started the provider", async () => {
    const repository = new InMemorySessionStateRepository();
    const adapter = fakeAdapter("claude-code");
    let streamCall = 0;
    const runtime = new LocalAiRuntime({
      adapters: [adapter],
      sessionRepository: repository,
      streamInvoker: () => {
        streamCall += 1;
        if (streamCall === 2) {
          throw new Error("request validation failed");
        }
        return {
          toUIMessageStream: async function* () {
            yield { type: "finish" as const, finishReason: "stop" as const };
          },
          finishReason: Promise.resolve("stop"),
        };
      },
    });

    await runtime.startChat(request(), () => undefined);
    await runtime.startChat(
      request({ requestId: "request-2", turnId: "turn-2" }),
      () => undefined,
    );

    expect(await repository.getTurn("turn-2")).toMatchObject({
      status: "uncertain",
    });
    expect(await repository.getBindings("conversation-1")).toEqual([
      expect.objectContaining({ stale: true }),
    ]);
  });

  it("exposes idempotent branch, reset, and delete lifecycle operations", async () => {
    const repository = new InMemorySessionStateRepository();
    const adapter = fakeAdapter("codex-cli");
    const branchMemory = vi.fn(async () => undefined);
    const deleteMemory = vi.fn(async () => undefined);
    const runtime = new LocalAiRuntime({
      adapters: [adapter],
      sessionRepository: repository,
      memoryService: {
        getMemorySettings: () => ({
          provider: "off",
          baseURL: "",
          apiKeyConfigured: false,
          subconsciousProvider: "off",
          schedule: "every-turn",
          batchSize: 5,
          idleDelayMs: 30_000,
        }),
        updateMemorySettings: () => {
          throw new Error("not used");
        },
        getMemoryStatus: () => ({
          health: "disabled",
          pendingJobs: 0,
          failedJobs: 0,
        }),
        branchConversation: branchMemory,
        deleteConversation: deleteMemory,
      },
      streamInvoker: () => ({
        toUIMessageStream: async function* () {
          yield { type: "finish" as const, finishReason: "stop" as const };
        },
        finishReason: Promise.resolve("stop"),
      }),
    });
    await runtime.startChat(
      request({ providerId: "codex-cli" }),
      () => undefined,
    );

    const branch = await runtime.branchConversation({
      sourceConversationId: "conversation-1",
      targetConversationId: "conversation-branch",
      bootstrapMessages: [{ role: "user", content: "seed" }],
    });
    expect(branch).toMatchObject({
      conversationId: "conversation-branch",
      revision: 0,
      providers: [],
    });
    expect(branchMemory).toHaveBeenCalledOnce();

    const reset = await runtime.resetConversationProviderSession({
      conversationId: "conversation-1",
      providerId: "codex-cli",
    });
    expect(reset.providers).toEqual([]);
    await expect(
      runtime.resetConversationProviderSession({
        conversationId: "conversation-1",
        providerId: "unknown",
      }),
    ).rejects.toMatchObject({ code: "UNKNOWN_PROVIDER" });

    await expect(
      runtime.deleteConversation({
        conversationId: "conversation-branch",
        forgetConversationMemory: true,
      }),
    ).resolves.toBe(true);
    await expect(
      runtime.deleteConversation({
        conversationId: "conversation-branch",
        forgetConversationMemory: true,
      }),
    ).resolves.toBe(true);
    expect(deleteMemory).toHaveBeenCalledTimes(2);
    expect(
      await runtime.getConversationRuntimeState("conversation-branch"),
    ).toBeNull();
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
      sessionRepository: new InMemorySessionStateRepository(),
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
      conversationId: "conversation-1",
      turnId: "turn-1",
      revision: 0,
    });
  });
});
