import type {
  LocalAIChatRequest,
  LocalAIMemorySettings,
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
import {
  describeSandboxMemory,
  fingerprintAgentContext,
  LocalAiRuntime,
  resolveLocalAiActorId,
  type RuntimeStreamInvoker,
} from "../runtime";
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
    enforcesSandbox: false,
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

async function flushMicrotasks(iterations = 20): Promise<void> {
  for (let index = 0; index < iterations; index += 1) {
    await Promise.resolve();
  }
}

const enabledMemorySettings: LocalAIMemorySettings = {
  provider: "local",
  subconsciousProvider: "codex-cli",
  schedule: "every-turn",
  batchSize: 5,
  idleDelayMs: 30_000,
};

describe("LocalAiRuntime", () => {
  it("tells an agent about memory/ only when memory/ is writable", async () => {
    let streamOptions: Parameters<RuntimeStreamInvoker>[0] | undefined;
    const runtime = new LocalAiRuntime({
      adapters: [fakeAdapter("claude-code")],
      sessionRepository: new InMemorySessionStateRepository(),
      streamInvoker: (options) => {
        streamOptions = options;
        return {
          toUIMessageStream: async function* () {
            yield { type: "finish" as const, finishReason: "stop" as const };
          },
          finishReason: Promise.resolve("stop"),
        };
      },
      resolveSandbox: () => ({
        root: "/agents/fizz",
        writableRoots: ["/agents/fizz/workspace", "/agents/fizz/memory"],
        networkAccess: true,
      }),
    });

    await runtime.startChat(
      request({ agent: { id: "fizz", systemPrompt: "Be concise." } }),
      () => undefined,
    );

    const system = streamOptions?.messages.find(
      (message) => message.role === "system",
    );
    expect(system?.content).toContain("Be concise.");
    expect(system?.content).toContain("/agents/fizz/memory/MEMORY.md");

    // A sandbox without a writable memory/ must not promise one: the standalone
    // runtime's cwd sandbox would have write_file refuse the path.
    expect(
      describeSandboxMemory({
        root: "/trusted/workspace",
        writableRoots: ["/trusted/workspace"],
        networkAccess: false,
      }),
    ).toBeUndefined();
  });

  it("derives stable actor identity from the responder member", () => {
    expect(
      resolveLocalAiActorId({
        agent: { id: "fizz", memberId: "agent:fizz" },
      }),
    ).toBe("agent:fizz");
    expect(resolveLocalAiActorId({ agent: { id: "fizz" } })).toBe("agent:fizz");
  });

  it("fingerprints prompt and the main-owned sandbox policy", () => {
    const request = {
      agent: {
        id: "fizz",
        memberId: "agent:fizz",
        systemPrompt: "Be concise.",
      },
    };
    const sandbox = {
      root: "/agents/fizz",
      writableRoots: ["/agents/fizz/workspace"],
      networkAccess: false,
    };
    const fingerprint = fingerprintAgentContext(request, sandbox);

    expect(fingerprintAgentContext(request, sandbox)).toBe(fingerprint);
    expect(
      fingerprintAgentContext(
        {
          agent: {
            ...request.agent,
            systemPrompt: "Be expansive.",
          },
        },
        sandbox,
      ),
    ).not.toBe(fingerprint);
    expect(
      fingerprintAgentContext(request, {
        ...sandbox,
        networkAccess: true,
      }),
    ).not.toBe(fingerprint);
  });

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
      expect.objectContaining({
        id: "openai-api",
        availability: "unavailable",
      }),
      expect.objectContaining({
        id: "fireworks-api",
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
        sandbox: {
          root: "/trusted/workspace",
          writableRoots: ["/trusted/workspace"],
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
        conversationId: "conversation-1",
        turnId: "turn-1",
        revision: 0,
      },
    ]);
    await expect(
      runtime.getTurnRuntimeState({
        conversationId: "conversation-1",
        turnId: "turn-1",
      }),
    ).resolves.toMatchObject({
      status: "completed",
      assistantText: "Hi",
      finishReason: "stop",
      revision: 0,
    });
    await expect(
      runtime.acknowledgeTurnPersistence({
        conversationId: "conversation-1",
        turnId: "turn-1",
      }),
    ).resolves.toBe(true);
    expect(
      (
        await runtime.getTurnRuntimeState({
          conversationId: "conversation-1",
          turnId: "turn-1",
        })
      )?.assistantText,
    ).toBeUndefined();
  });

  it("enforces text-only policy before provider tool preparation", async () => {
    const adapter = fakeAdapter("codex-cli");
    const getToolGroups = vi.fn(async () => {
      throw new Error("Text-only runtime must not enumerate tools.");
    });
    const runtime = new LocalAiRuntime({
      adapters: [adapter],
      executionPolicy: "text-only",
      getToolGroups,
      sessionRepository: new InMemorySessionStateRepository(),
      streamInvoker: () => ({
        toUIMessageStream: async function* () {
          yield { type: "finish" as const, finishReason: "stop" as const };
        },
        finishReason: Promise.resolve("stop"),
      }),
    });

    await runtime.startChat(
      request({
        providerId: "codex-cli",
        conversationId: "memory-curator",
        turnId: "memory-turn",
      }),
      vi.fn(),
    );

    expect(runtime.executionPolicy).toBe("text-only");
    expect(getToolGroups).not.toHaveBeenCalled();
    expect(adapter.prepareRun).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({
        executionPolicy: "text-only",
        tools: [],
      }),
    );
    await runtime.dispose();
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
              name: "write_file",
              description: "Writes a file",
              inputSchema: {
                type: "object",
                properties: { path: { type: "string" } },
                required: ["path"],
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
          const output = await tool.execute({ path: "workspace/ready.txt" });
          yield {
            type: "tool-input-available" as const,
            toolCallId: "tool-1",
            toolName: tool.name,
            input: { path: "workspace/ready.txt" },
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
        name: "external:write_file",
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
        toolName: "external:write_file",
        input: { path: "workspace/ready.txt" },
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

  it.each(["claude-code", "codex-cli"] as const)(
    "fails closed before executing an opaque MCP tool for %s",
    async (providerId) => {
      const events: LocalAIStreamEvent[] = [];
      let toolContext:
        | Parameters<LocalAiProviderAdapter["prepareRun"]>[2]
        | undefined;
      const adapter = fakeAdapter(providerId);
      vi.mocked(adapter.prepareRun).mockImplementation(
        async (_request, _status, context) => {
          toolContext = context;
          return {
            model: {} as LanguageModel,
            getNativeSessionId: () => "claude-session",
          };
        },
      );
      const executeTool = vi.fn(async () => ({ ok: true }));
      const runtime = new LocalAiRuntime({
        adapters: [adapter],
        getToolGroups: () => [
          {
            serverName: "external",
            tools: [
              {
                name: "execute",
                inputSchema: {
                  type: "object",
                  properties: { command: { type: "string" } },
                  required: ["command"],
                },
              },
            ],
          },
        ],
        executeTool,
        streamInvoker: () => ({
          toUIMessageStream: async function* () {
            await toolContext?.tools[0]?.execute({
              command: "cat /etc/passwd",
            });
            yield { type: "finish" as const, finishReason: "stop" as const };
          },
        }),
        sessionRepository: new InMemorySessionStateRepository(),
      });

      await runtime.startChat(request({ providerId }), (event) =>
        events.push(event),
      );

      expect(executeTool).not.toHaveBeenCalled();
      expect(events).toContainEqual(
        expect.objectContaining({
          type: "error",
          error: expect.objectContaining({
            message: expect.stringContaining(
              "exposes no canonicalizable filesystem boundary",
            ),
          }),
        }),
      );
    },
  );

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
          recoveryMessages: [
            { role: "user", content: "first" },
            { role: "assistant", content: "first response" },
            { role: "user", content: "second" },
          ],
        },
        agent: { systemPrompt: "system" },
      }),
      () => undefined,
    );
    await runtime.startChat(
      request({
        requestId: "request-3",
        turnId: "turn-3",
        expectedRevision: 0,
        operation: {
          kind: "append",
          message: { role: "user", content: "third" },
          recoveryMessages: [
            { role: "user", content: "first" },
            { role: "assistant", content: "first response" },
            { role: "user", content: "second" },
            { role: "assistant", content: "second response" },
            { role: "user", content: "third" },
          ],
        },
        agent: { systemPrompt: "changed system" },
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
    expect(streamInvoker.mock.calls[2]?.[0].messages).toEqual([
      { role: "system", content: "changed system" },
      { role: "user", content: "first" },
      { role: "assistant", content: "first response" },
      { role: "user", content: "second" },
      { role: "assistant", content: "second response" },
      { role: "user", content: "third" },
    ]);
    expect(
      vi.mocked(adapter.prepareRun).mock.calls[2]?.[2].session,
    ).toBeUndefined();
    expect(await repository.getBindings("conversation-1")).toEqual([
      expect.objectContaining({ nativeSessionId: "session-2", revision: 0 }),
      expect.objectContaining({ nativeSessionId: "session-3", revision: 1 }),
    ]);
  });

  it("rebases A to B to A with the complete shared transcript", async () => {
    const repository = new InMemorySessionStateRepository();
    const codex = fakeAdapter("codex-cli");
    const claude = fakeAdapter("claude-code");
    const streamInvoker = vi.fn<RuntimeStreamInvoker>(() => ({
      toUIMessageStream: async function* () {
        yield { type: "finish" as const, finishReason: "stop" as const };
      },
      finishReason: Promise.resolve("stop"),
    }));
    const runtime = new LocalAiRuntime({
      adapters: [codex, claude],
      streamInvoker,
      workingDirectory: "/workspace",
      sessionRepository: repository,
    });
    const revisions: number[] = [];
    const emit = (event: LocalAIStreamEvent) => {
      if (event.type === "finish" && event.revision !== undefined) {
        revisions.push(event.revision);
      }
    };

    await runtime.startChat(
      request({
        providerId: "codex-cli",
        operation: {
          kind: "append",
          message: { role: "user", content: "A first" },
        },
      }),
      emit,
    );
    await runtime.startChat(
      request({
        requestId: "request-2",
        turnId: "turn-2",
        providerId: "claude-code",
        expectedRevision: 0,
        operation: {
          kind: "rebase",
          reason: "provider-switch",
          messages: [
            { role: "user", content: "A first" },
            { role: "assistant", content: "A answer" },
            { role: "user", content: "B follows" },
          ],
        },
      }),
      emit,
    );
    await runtime.startChat(
      request({
        requestId: "request-3",
        turnId: "turn-3",
        providerId: "codex-cli",
        expectedRevision: 1,
        operation: {
          kind: "rebase",
          reason: "provider-switch",
          messages: [
            { role: "user", content: "A first" },
            { role: "assistant", content: "A answer" },
            { role: "user", content: "B follows" },
            { role: "assistant", content: "B answer" },
            { role: "user", content: "A returns" },
          ],
        },
      }),
      emit,
    );

    expect(revisions).toEqual([0, 1, 2]);
    expect(
      streamInvoker.mock.calls.map(([options]) => options.messages),
    ).toEqual([
      [{ role: "user", content: "A first" }],
      [
        { role: "user", content: "A first" },
        { role: "assistant", content: "A answer" },
        { role: "user", content: "B follows" },
      ],
      [
        { role: "user", content: "A first" },
        { role: "assistant", content: "A answer" },
        { role: "user", content: "B follows" },
        { role: "assistant", content: "B answer" },
        { role: "user", content: "A returns" },
      ],
    ]);
    expect(
      vi.mocked(codex.prepareRun).mock.calls.map((call) => call[2].session),
    ).toEqual([undefined, undefined]);
    expect(
      vi.mocked(claude.prepareRun).mock.calls[0]?.[2].session,
    ).toBeUndefined();
    await expect(
      runtime.getConversationRuntimeState("conversation-1"),
    ).resolves.toMatchObject({
      revision: 2,
      transcriptVersion: 3,
      lastCompletedProviderId: "codex-cli",
      providers: [
        {
          providerId: "codex-cli",
          revision: 2,
          transcriptVersion: 3,
          stale: false,
        },
      ],
    });
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

  it("linearizes turn-state queries behind accepted work instead of returning not-found", async () => {
    let streamStarted = false;
    let releaseStream: (() => void) | undefined;
    const runtime = new LocalAiRuntime({
      adapters: [fakeAdapter("claude-code")],
      sessionRepository: new InMemorySessionStateRepository(),
      streamInvoker: () => ({
        toUIMessageStream: async function* () {
          streamStarted = true;
          await new Promise<void>((resolve) => {
            releaseStream = resolve;
          });
          yield { type: "text-start" as const, id: "text" };
          yield {
            type: "text-delta" as const,
            id: "text",
            delta: "durable",
          };
          yield { type: "text-end" as const, id: "text" };
          yield { type: "finish" as const, finishReason: "stop" as const };
        },
        finishReason: Promise.resolve("stop"),
      }),
    });
    const chat = runtime.startChat(request(), () => undefined);
    await vi.waitFor(() => expect(streamStarted).toBe(true));

    let querySettled = false;
    const query = runtime
      .getTurnRuntimeState({
        conversationId: "conversation-1",
        turnId: "turn-1",
      })
      .then((state) => {
        querySettled = true;
        return state;
      });
    vi.useFakeTimers();
    try {
      await vi.advanceTimersByTimeAsync(6_000);
      expect(querySettled).toBe(false);
    } finally {
      vi.useRealTimers();
    }

    releaseStream?.();
    await chat;
    await expect(query).resolves.toMatchObject({
      status: "completed",
      assistantText: "durable",
    });
  });

  it("aborts active work before granting an exclusive conversation lease", async () => {
    let streamStarted: (() => void) | undefined;
    let streamCalls = 0;
    const runtime = new LocalAiRuntime({
      adapters: [fakeAdapter("claude-code")],
      sessionRepository: new InMemorySessionStateRepository(),
      streamInvoker: (options) => ({
        toUIMessageStream: async function* () {
          streamCalls += 1;
          if (streamCalls === 1) {
            await new Promise<void>((resolve) => {
              streamStarted = () => undefined;
              const release = () => {
                resolve();
              };
              if (options.abortSignal.aborted) {
                release();
              } else {
                options.abortSignal.addEventListener("abort", release, {
                  once: true,
                });
              }
            });
          }
          yield { type: "finish" as const, finishReason: "stop" as const };
        },
        finishReason: Promise.resolve("stop"),
      }),
    });
    const chat = runtime.startChat(request(), () => undefined);
    await vi.waitFor(() => expect(streamStarted).toBeTypeOf("function"));
    const leaseToken = await runtime.quiesceConversation("conversation-1");
    await chat;
    expect(leaseToken).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );

    const rejected: LocalAIStreamEvent[] = [];
    await runtime.startChat(
      request({ requestId: "request-2", turnId: "turn-2" }),
      (event) => rejected.push(event),
    );
    expect(rejected).toContainEqual(
      expect.objectContaining({
        type: "error",
        error: expect.objectContaining({
          code: "LOCAL_AI_CONVERSATION_QUIESCED",
        }),
      }),
    );
    expect(() =>
      runtime.resumeConversation("conversation-1", "wrong-token"),
    ).toThrowError(
      expect.objectContaining({
        code: "LOCAL_AI_CONVERSATION_LEASE_INVALID",
      }),
    );
    expect(runtime.resumeConversation("conversation-1", leaseToken)).toBe(true);
    await runtime.startChat(
      request({
        requestId: "request-3",
        turnId: "turn-3",
        operation: {
          kind: "rebase",
          reason: "edit",
          messages: [{ role: "user", content: "try again" }],
        },
      }),
      () => undefined,
    );
    expect(streamCalls).toBe(2);
  });

  it("enforces one lease owner and consumes that lease on delete failure", async () => {
    const runtime = new LocalAiRuntime({
      adapters: [fakeAdapter("claude-code")],
      sessionRepository: new InMemorySessionStateRepository(),
      memoryService: {
        getMemorySettings: vi.fn(),
        updateMemorySettings: vi.fn(),
        getMemoryStatus: vi.fn(),
        deleteConversation: vi.fn(async () => {
          throw new Error("memory delete failed");
        }),
      },
    });
    const leaseToken = await runtime.quiesceConversation("conversation-1");

    await expect(
      runtime.quiesceConversation("conversation-1"),
    ).rejects.toMatchObject({
      code: "LOCAL_AI_CONVERSATION_LEASE_CONFLICT",
    });
    await expect(
      runtime.deleteConversation({
        conversationId: "conversation-1",
        forgetConversationMemory: true,
        leaseToken: "wrong-token",
      }),
    ).rejects.toMatchObject({
      code: "LOCAL_AI_CONVERSATION_LEASE_INVALID",
    });
    await expect(
      runtime.deleteConversation({
        conversationId: "conversation-1",
        forgetConversationMemory: true,
        leaseToken,
      }),
    ).rejects.toThrow("memory delete failed");

    const replacementLease =
      await runtime.quiesceConversation("conversation-1");
    expect(replacementLease).not.toBe(leaseToken);
    expect(runtime.resumeConversation("conversation-1", replacementLease)).toBe(
      true,
    );
  });

  it("bounds quiesce when a provider ignores abort", async () => {
    let streamStarted = false;
    const runtime = new LocalAiRuntime({
      adapters: [fakeAdapter("claude-code")],
      sessionRepository: new InMemorySessionStateRepository(),
      quiesceTimeoutMs: 5,
      streamInvoker: () => ({
        toUIMessageStream: async function* () {
          streamStarted = true;
          await new Promise<void>(() => undefined);
          yield { type: "finish" as const, finishReason: "stop" as const };
        },
        finishReason: Promise.resolve("stop"),
      }),
    });
    void runtime.startChat(request(), () => undefined);
    await vi.waitFor(() => expect(streamStarted).toBe(true));

    await expect(
      runtime.quiesceConversation("conversation-1"),
    ).rejects.toMatchObject({
      code: "LOCAL_AI_CONVERSATION_QUIESCE_TIMEOUT",
    });
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
    let disposed = false;
    const disposePromise = runtime.dispose().then(() => {
      disposed = true;
    });
    await Promise.resolve();
    expect(disposed).toBe(false);
    releaseCompletion?.();
    await disposePromise;
    expect(disposed).toBe(true);
  });

  it("waits for active turns and their failure hooks before disposing providers", async () => {
    const adapter = fakeAdapter("codex-cli");
    const originalGetStatus = adapter.getStatus.bind(adapter);
    let markStatusStarted: (() => void) | undefined;
    let releaseStatus: (() => void) | undefined;
    const statusStarted = new Promise<void>((resolve) => {
      markStatusStarted = resolve;
    });
    const statusGate = new Promise<void>((resolve) => {
      releaseStatus = resolve;
    });
    adapter.getStatus = vi.fn(async () => {
      markStatusStarted?.();
      await statusGate;
      return originalGetStatus();
    });

    let markFailureHookStarted: (() => void) | undefined;
    let releaseFailureHook: (() => void) | undefined;
    const failureHookStarted = new Promise<void>((resolve) => {
      markFailureHookStarted = resolve;
    });
    const failureHookGate = new Promise<void>((resolve) => {
      releaseFailureHook = resolve;
    });
    const runtime = new LocalAiRuntime({
      adapters: [adapter],
      sessionRepository: new InMemorySessionStateRepository(),
      turnHooks: {
        onTurnFailed: async () => {
          markFailureHookStarted?.();
          await failureHookGate;
        },
      },
    });

    const chat = runtime.startChat(
      request({ providerId: "codex-cli" }),
      () => undefined,
    );
    await statusStarted;
    let disposed = false;
    const disposal = runtime.dispose().then(() => {
      disposed = true;
    });
    releaseStatus?.();
    await failureHookStarted;

    expect(disposed).toBe(false);
    expect(adapter.dispose).not.toHaveBeenCalled();
    releaseFailureHook?.();
    await Promise.all([chat, disposal]);
    expect(disposed).toBe(true);
    expect(adapter.dispose).toHaveBeenCalledOnce();
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
          recoveryMessages: [
            { role: "user", content: "seed" },
            { role: "assistant", content: "seed response" },
            { role: "user", content: "after correction" },
          ],
        },
      }),
      () => undefined,
    );

    expect(
      vi.mocked(adapter.prepareRun).mock.calls[1]?.[2].session,
    ).toBeUndefined();
    expect(streamInvoker.mock.calls[1]?.[0].messages).toEqual([
      { role: "system", content: '<memory epoch="2" />' },
      { role: "user", content: "seed" },
      { role: "assistant", content: "seed response" },
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

    const firstDeleteLease = await runtime.quiesceConversation(
      "conversation-branch",
    );
    await expect(
      runtime.deleteConversation({
        conversationId: "conversation-branch",
        forgetConversationMemory: true,
        leaseToken: firstDeleteLease,
      }),
    ).resolves.toBe(true);
    const secondDeleteLease = await runtime.quiesceConversation(
      "conversation-branch",
    );
    await expect(
      runtime.deleteConversation({
        conversationId: "conversation-branch",
        forgetConversationMemory: true,
        leaseToken: secondDeleteLease,
      }),
    ).resolves.toBe(true);
    expect(deleteMemory).toHaveBeenCalledOnce();
    expect(
      await runtime.getConversationRuntimeState("conversation-branch"),
    ).toBeNull();
  });

  it("replays a durable deletion with one stable memory operation id", async () => {
    const repository = new InMemorySessionStateRepository();
    await repository.branchConversation("missing-source", "deletion-source");
    const operationIds: string[] = [];
    let attempts = 0;
    const deleteMemory = vi.fn(async (input) => {
      operationIds.push(input.operationId ?? "");
      attempts += 1;
      if (attempts === 1) {
        throw new Error("memory temporarily unavailable");
      }
    });
    const memoryService = {
      getMemorySettings: vi.fn(),
      updateMemorySettings: vi.fn(),
      getMemoryStatus: vi.fn(),
      deleteConversation: deleteMemory,
    };
    const firstRuntime = new LocalAiRuntime({
      adapters: [fakeAdapter("codex-cli")],
      sessionRepository: repository,
      memoryService,
    });
    const firstLease =
      await firstRuntime.quiesceConversation("deletion-source");
    await expect(
      firstRuntime.deleteConversation({
        conversationId: "deletion-source",
        forgetConversationMemory: true,
        leaseToken: firstLease,
      }),
    ).rejects.toThrow("memory temporarily unavailable");

    const rejected: LocalAIStreamEvent[] = [];
    await firstRuntime.startChat(
      request({
        conversationId: "deletion-source",
        requestId: "late-request",
        turnId: "late-turn",
        providerId: "codex-cli",
      }),
      (event) => rejected.push(event),
    );
    expect(rejected).toContainEqual(
      expect.objectContaining({
        type: "error",
        error: expect.objectContaining({
          code: "LOCAL_AI_CONVERSATION_DELETING",
        }),
      }),
    );

    const recoveredRuntime = new LocalAiRuntime({
      adapters: [],
      sessionRepository: repository,
      memoryService,
    });
    const retryLease =
      await recoveredRuntime.quiesceConversation("deletion-source");
    await expect(
      recoveredRuntime.deleteConversation({
        conversationId: "deletion-source",
        forgetConversationMemory: true,
        leaseToken: retryLease,
      }),
    ).resolves.toBe(true);
    expect(operationIds).toHaveLength(2);
    expect(operationIds[0]).toBeTruthy();
    expect(operationIds[1]).toBe(operationIds[0]);

    const responseLostLease =
      await recoveredRuntime.quiesceConversation("deletion-source");
    await expect(
      recoveredRuntime.deleteConversation({
        conversationId: "deletion-source",
        forgetConversationMemory: true,
        leaseToken: responseLostLease,
      }),
    ).resolves.toBe(true);
    expect(deleteMemory).toHaveBeenCalledTimes(2);
    await expect(
      repository.getConversationDeletion("deletion-source"),
    ).resolves.toMatchObject({
      operationId: operationIds[0],
      status: "completed",
    });
  });

  it("serializes branch publication with target deletion and fences a leased source", async () => {
    const repository = new InMemorySessionStateRepository();
    await repository.branchConversation("missing-source", "branch-source");
    let enterBranch: () => void = () => undefined;
    const branchEntered = new Promise<void>((resolve) => {
      enterBranch = resolve;
    });
    let releaseBranch: () => void = () => undefined;
    const branchRelease = new Promise<void>((resolve) => {
      releaseBranch = resolve;
    });
    const runtime = new LocalAiRuntime({
      adapters: [],
      sessionRepository: repository,
      memoryService: {
        getMemorySettings: vi.fn(),
        updateMemorySettings: vi.fn(),
        getMemoryStatus: vi.fn(),
        branchConversation: vi.fn(async () => {
          enterBranch();
          await branchRelease;
        }),
      },
    });

    const branch = runtime.branchConversation({
      sourceConversationId: "branch-source",
      targetConversationId: "branch-target",
      bootstrapMessages: [{ role: "user", content: "seed" }],
    });
    await branchEntered;
    let targetQuiesced = false;
    const targetLeasePromise = runtime
      .quiesceConversation("branch-target")
      .then((leaseToken) => {
        targetQuiesced = true;
        return leaseToken;
      });
    await Promise.resolve();
    expect(targetQuiesced).toBe(false);

    releaseBranch();
    await branch;
    const targetLease = await targetLeasePromise;
    expect(targetQuiesced).toBe(true);
    expect(runtime.resumeConversation("branch-target", targetLease)).toBe(true);

    const sourceLease = await runtime.quiesceConversation("branch-source");
    await expect(
      runtime.branchConversation({
        sourceConversationId: "branch-source",
        targetConversationId: "blocked-target",
        bootstrapMessages: [{ role: "user", content: "blocked" }],
      }),
    ).rejects.toMatchObject({
      code: "LOCAL_AI_CONVERSATION_QUIESCED",
    });
    expect(runtime.resumeConversation("branch-source", sourceLease)).toBe(true);
    expect(await repository.getConversation("blocked-target")).toBeUndefined();
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

  it("replays a durable completion hook after renderer acknowledgement", async () => {
    const repository = new InMemorySessionStateRepository();
    await repository.beginTurn({
      turnId: "durable-turn",
      requestId: "durable-request",
      conversationId: "durable-conversation",
      providerId: "codex-cli",
      operation: "bootstrap",
    });
    await repository.armTurnHook("durable-turn", {
      kind: "memory-turn",
      turnId: "durable-turn",
      conversationId: "durable-conversation",
      revision: 0,
      providerId: "codex-cli",
      scopes: [{ kind: "conversation", id: "durable-conversation" }],
      userContent: "durable user",
    });
    await repository.completeTurn({
      turnId: "durable-turn",
      nativeSessionId: "thread",
      cwd: "/workspace",
      assistantText: "renderer assistant",
      assistantHookContent: "memory assistant",
    });
    await repository.acknowledgeTurnPersistence(
      "durable-conversation",
      "durable-turn",
    );
    const replay = vi.fn(async () => undefined);
    const runtime = new LocalAiRuntime({
      adapters: [],
      sessionRepository: repository,
      turnHooks: {
        prepareDurableTurnHook: () => undefined,
        replayDurableTurnHook: replay,
      },
    });

    await Promise.resolve();
    await runtime.dispose();

    expect(replay).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "completed",
        payload: expect.objectContaining({
          userContent: "durable user",
          assistantContent: "memory assistant",
        }),
      }),
    );
    expect((await repository.snapshot()).turnHooks).toEqual([]);
  });

  it("does not let a curator runtime without a replay handler consume main hooks", async () => {
    const repository = new InMemorySessionStateRepository();
    await repository.beginTurn({
      turnId: "main-turn",
      requestId: "main-request",
      conversationId: "main-conversation",
      providerId: "claude-code",
      operation: "bootstrap",
    });
    await repository.armTurnHook("main-turn", {
      kind: "memory-turn",
      turnId: "main-turn",
      conversationId: "main-conversation",
      revision: 0,
      providerId: "claude-code",
      scopes: [{ kind: "conversation", id: "main-conversation" }],
      userContent: "main context",
    });
    await repository.failTurn("main-turn", "failed", "provider failed");

    const curatorRuntime = new LocalAiRuntime({
      adapters: [],
      sessionRepository: repository,
    });
    await Promise.resolve();
    await curatorRuntime.dispose();

    expect(await repository.listReplayableTurnHooks()).toHaveLength(1);
  });

  it("rejects a partial durable hook configuration", () => {
    expect(
      () =>
        new LocalAiRuntime({
          adapters: [],
          turnHooks: {
            prepareDurableTurnHook: () => undefined,
          },
        }),
    ).toThrow(
      "Durable turn hooks must configure both prepare and replay handlers.",
    );
  });

  it("orders a blocked completion replay before conversation deletion", async () => {
    const repository = new InMemorySessionStateRepository();
    await repository.beginTurn({
      turnId: "ordered-turn",
      requestId: "ordered-request",
      conversationId: "ordered-conversation",
      providerId: "codex-cli",
      operation: "bootstrap",
    });
    await repository.armTurnHook("ordered-turn", {
      kind: "memory-turn",
      turnId: "ordered-turn",
      conversationId: "ordered-conversation",
      revision: 0,
      providerId: "codex-cli",
      scopes: [{ kind: "conversation", id: "ordered-conversation" }],
      userContent: "ordered",
    });
    await repository.completeTurn({
      turnId: "ordered-turn",
      nativeSessionId: "thread",
      cwd: "/workspace",
      assistantHookContent: "assistant",
    });
    const order: string[] = [];
    let releaseReplay!: () => void;
    const replayGate = new Promise<void>((resolve) => {
      releaseReplay = resolve;
    });
    const runtime = new LocalAiRuntime({
      adapters: [],
      sessionRepository: repository,
      turnHooks: {
        prepareDurableTurnHook: () => undefined,
        replayDurableTurnHook: async () => {
          order.push("replay:start");
          await replayGate;
          order.push("replay:end");
        },
      },
      memoryService: {
        getMemorySettings: async () => ({
          provider: "off",
          baseURL: "",
          apiKeyConfigured: false,
          subconsciousProvider: "off",
          schedule: "every-turn",
          batchSize: 5,
          idleDelayMs: 30_000,
        }),
        updateMemorySettings: async () => ({
          provider: "off",
          baseURL: "",
          apiKeyConfigured: false,
          subconsciousProvider: "off",
          schedule: "every-turn",
          batchSize: 5,
          idleDelayMs: 30_000,
        }),
        getMemoryStatus: async () => ({
          health: "disabled",
          detail: "test",
          pendingJobs: 0,
          failedJobs: 0,
        }),
        deleteConversation: async () => {
          order.push("delete");
        },
      },
    });
    await vi.waitFor(() => expect(order).toEqual(["replay:start"]));

    let leaseResolved = false;
    const leasePromise = runtime
      .quiesceConversation("ordered-conversation")
      .then((lease) => {
        leaseResolved = true;
        return lease;
      });
    await Promise.resolve();
    expect(leaseResolved).toBe(false);
    releaseReplay();
    const leaseToken = await leasePromise;
    await runtime.deleteConversation({
      conversationId: "ordered-conversation",
      forgetConversationMemory: true,
      leaseToken,
    });
    await runtime.dispose();

    expect(order).toEqual(["replay:start", "replay:end", "delete"]);
  });

  it("drains a hook created by an in-flight abort before disposing providers", async () => {
    const repository = new InMemorySessionStateRepository();
    let releaseStream!: () => void;
    let streamStarted!: () => void;
    const streamGate = new Promise<void>((resolve) => {
      releaseStream = resolve;
    });
    const started = new Promise<void>((resolve) => {
      streamStarted = resolve;
    });
    const order: string[] = [];
    const adapter = fakeAdapter("codex-cli");
    adapter.dispose = vi.fn(async () => {
      order.push("provider:dispose");
    });
    const runtime = new LocalAiRuntime({
      adapters: [adapter],
      sessionRepository: repository,
      streamInvoker: () => ({
        toUIMessageStream: async function* () {
          streamStarted();
          await streamGate;
          yield {
            type: "text-delta" as const,
            id: "text",
            delta: "late",
          };
          yield { type: "finish" as const, finishReason: "stop" as const };
        },
        finishReason: Promise.resolve("stop"),
      }),
      turnHooks: {
        prepareDurableTurnHook: ({ request: value, prepared }) => ({
          kind: "memory-turn",
          turnId: value.turnId,
          conversationId: value.conversationId,
          revision: prepared.turn.revision,
          providerId: "codex-cli",
          scopes: [{ kind: "conversation", id: value.conversationId }],
          userContent: "cleanup after dispose abort",
        }),
        replayDurableTurnHook: async (hook) => {
          order.push(`hook:${hook.outcome}`);
        },
      },
    });
    const chat = runtime.startChat(
      request({
        requestId: "dispose-request",
        conversationId: "dispose-conversation",
        turnId: "dispose-turn",
        providerId: "codex-cli",
      }),
      () => undefined,
    );
    await started;

    const disposing = runtime.dispose();
    releaseStream();
    await Promise.all([chat, disposing]);

    expect(order).toEqual(["hook:failed", "provider:dispose"]);
    expect((await repository.snapshot()).turnHooks).toEqual([]);
  });

  it("unpauses a non-retryable hook after memory settings are repaired", async () => {
    const repository = new InMemorySessionStateRepository();
    await repository.beginTurn({
      turnId: "paused-turn",
      requestId: "paused-request",
      conversationId: "paused-conversation",
      providerId: "codex-cli",
      operation: "bootstrap",
    });
    await repository.armTurnHook("paused-turn", {
      kind: "memory-turn",
      turnId: "paused-turn",
      conversationId: "paused-conversation",
      revision: 0,
      providerId: "codex-cli",
      scopes: [{ kind: "conversation", id: "paused-conversation" }],
      userContent: "retry after settings repair",
    });
    await repository.completeTurn({
      turnId: "paused-turn",
      nativeSessionId: "thread",
      cwd: "/workspace",
      assistantHookContent: "assistant",
    });
    let configured = false;
    const replay = vi.fn(async () => {
      if (!configured) {
        throw Object.assign(new Error("Local memory is not configured."), {
          code: "CONFIGURATION",
          retryable: false,
        });
      }
    });
    const runtime = new LocalAiRuntime({
      adapters: [],
      sessionRepository: repository,
      turnHooks: {
        prepareDurableTurnHook: () => undefined,
        replayDurableTurnHook: replay,
      },
      memoryService: {
        getMemorySettings: async () => ({
          provider: "off",
          baseURL: "",
          apiKeyConfigured: false,
          subconsciousProvider: "off",
          schedule: "every-turn",
          batchSize: 5,
          idleDelayMs: 30_000,
        }),
        updateMemorySettings: async () => {
          configured = true;
          return {
            provider: "off",
            baseURL: "",
            apiKeyConfigured: false,
            subconsciousProvider: "off",
            schedule: "every-turn",
            batchSize: 5,
            idleDelayMs: 30_000,
          };
        },
        getMemoryStatus: async () => ({
          health: "disabled",
          detail: "test",
          pendingJobs: 0,
          failedJobs: 0,
        }),
      },
    });
    await vi.waitFor(async () => {
      expect((await repository.snapshot()).turnHooks?.[0]).toMatchObject({
        retryable: false,
        attempts: 1,
      });
    });

    await runtime.updateMemorySettings({});
    await runtime.dispose();

    expect(replay).toHaveBeenCalledTimes(2);
    expect((await repository.snapshot()).turnHooks).toEqual([]);
  });

  it("barriers settings updates behind an active replay before resetting hooks", async () => {
    const repository = new InMemorySessionStateRepository();
    await repository.beginTurn({
      turnId: "settings-race-turn",
      requestId: "settings-race-request",
      conversationId: "settings-race-conversation",
      providerId: "codex-cli",
      operation: "bootstrap",
    });
    await repository.armTurnHook("settings-race-turn", {
      kind: "memory-turn",
      turnId: "settings-race-turn",
      conversationId: "settings-race-conversation",
      revision: 0,
      providerId: "codex-cli",
      scopes: [{ kind: "conversation", id: "settings-race-conversation" }],
      userContent: "serialize settings and replay",
    });
    await repository.completeTurn({
      turnId: "settings-race-turn",
      nativeSessionId: "thread",
      cwd: "/workspace",
      assistantHookContent: "assistant",
    });
    const order: string[] = [];
    let releaseReplay!: () => void;
    const replayGate = new Promise<void>((resolve) => {
      releaseReplay = resolve;
    });
    let replayAttempt = 0;
    const replay = vi.fn(async () => {
      replayAttempt += 1;
      order.push(`replay:${replayAttempt}:start`);
      if (replayAttempt === 1) {
        await replayGate;
        order.push("replay:1:failed");
        throw Object.assign(new Error("old settings are invalid"), {
          code: "CONFIGURATION",
          retryable: false,
        });
      }
      order.push("replay:2:completed");
    });
    const updateSettings = vi.fn(async () => {
      order.push("settings:update");
      expect((await repository.snapshot()).turnHooks?.[0]).toMatchObject({
        retryable: false,
        pauseReason: "configuration",
      });
      return enabledMemorySettings;
    });
    const runtime = new LocalAiRuntime({
      adapters: [],
      sessionRepository: repository,
      turnHooks: {
        prepareDurableTurnHook: () => undefined,
        replayDurableTurnHook: replay,
      },
      memoryService: {
        getMemorySettings: async () => enabledMemorySettings,
        updateMemorySettings: updateSettings,
        getMemoryStatus: async () => ({
          health: "healthy",
          detail: "test",
          pendingJobs: 0,
          failedJobs: 0,
        }),
      },
    });
    await vi.waitFor(() => expect(order).toEqual(["replay:1:start"]));

    const updating = runtime.updateMemorySettings({ schedule: "batch" });
    await flushMicrotasks();
    expect(updateSettings).not.toHaveBeenCalled();
    releaseReplay();
    await updating;
    await runtime.dispose();

    expect(order).toEqual([
      "replay:1:start",
      "replay:1:failed",
      "settings:update",
      "replay:2:start",
      "replay:2:completed",
    ]);
    expect((await repository.snapshot()).turnHooks).toEqual([]);
  });

  it("re-evaluates only configuration-paused hooks on restart", async () => {
    const repository = new InMemorySessionStateRepository();
    for (const [turnId, conversationId] of [
      ["config-paused-turn", "config-paused-conversation"],
      ["permanent-paused-turn", "permanent-paused-conversation"],
    ] as const) {
      await repository.beginTurn({
        turnId,
        requestId: `${turnId}-request`,
        conversationId,
        providerId: "codex-cli",
        operation: "bootstrap",
      });
      await repository.armTurnHook(turnId, {
        kind: "memory-turn",
        turnId,
        conversationId,
        revision: 0,
        providerId: "codex-cli",
        scopes: [{ kind: "conversation", id: conversationId }],
        userContent: "restart recovery",
      });
      await repository.completeTurn({
        turnId,
        nativeSessionId: `${turnId}-thread`,
        cwd: "/workspace",
        assistantHookContent: "assistant",
      });
    }
    await repository.failTurnHook(
      "config-paused-turn",
      "settings were invalid",
      false,
      "configuration",
    );
    await repository.failTurnHook(
      "permanent-paused-turn",
      "payload is permanently invalid",
      false,
    );
    const replay = vi.fn(async () => undefined);
    const runtime = new LocalAiRuntime({
      adapters: [],
      sessionRepository: repository,
      turnHooks: {
        prepareDurableTurnHook: () => undefined,
        replayDurableTurnHook: replay,
      },
      memoryService: {
        getMemorySettings: async () => enabledMemorySettings,
        updateMemorySettings: async () => enabledMemorySettings,
        getMemoryStatus: async () => ({
          health: "healthy",
          detail: "test",
          pendingJobs: 0,
          failedJobs: 0,
        }),
      },
    });

    await flushMicrotasks(40);
    await runtime.dispose();

    expect(replay).toHaveBeenCalledOnce();
    expect(replay).toHaveBeenCalledWith(
      expect.objectContaining({ turnId: "config-paused-turn" }),
    );
    const remainingHooks = (await repository.snapshot()).turnHooks;
    expect(remainingHooks).toMatchObject([
      { turnId: "permanent-paused-turn", retryable: false },
    ]);
    expect(remainingHooks?.[0]).not.toHaveProperty("pauseReason");
  });

  it("automatically wakes a retryable durable hook at its backoff deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T00:00:00.000Z"));
    try {
      const repository = new InMemorySessionStateRepository();
      await repository.beginTurn({
        turnId: "timer-turn",
        requestId: "timer-request",
        conversationId: "timer-conversation",
        providerId: "codex-cli",
        operation: "bootstrap",
      });
      await repository.armTurnHook("timer-turn", {
        kind: "memory-turn",
        turnId: "timer-turn",
        conversationId: "timer-conversation",
        revision: 0,
        providerId: "codex-cli",
        scopes: [{ kind: "conversation", id: "timer-conversation" }],
        userContent: "retry automatically",
      });
      await repository.completeTurn({
        turnId: "timer-turn",
        nativeSessionId: "thread",
        cwd: "/workspace",
        assistantHookContent: "assistant",
      });
      let releaseRetry!: () => void;
      const retryGate = new Promise<void>((resolve) => {
        releaseRetry = resolve;
      });
      let attempt = 0;
      const replay = vi.fn(async () => {
        attempt += 1;
        if (attempt === 1) {
          throw Object.assign(new Error("temporary outage"), {
            retryable: true,
          });
        }
        await retryGate;
      });
      const runtime = new LocalAiRuntime({
        adapters: [],
        sessionRepository: repository,
        turnHooks: {
          prepareDurableTurnHook: () => undefined,
          replayDurableTurnHook: replay,
        },
      });

      await vi.advanceTimersByTimeAsync(0);
      await flushMicrotasks();
      expect(replay).toHaveBeenCalledTimes(1);
      expect((await repository.snapshot()).turnHooks?.[0]).toMatchObject({
        attempts: 1,
        nextAttemptAt: "2026-07-31T00:00:05.000Z",
      });
      await vi.advanceTimersByTimeAsync(0);
      await flushMicrotasks();
      expect(vi.getTimerCount()).toBe(1);

      await vi.advanceTimersByTimeAsync(4_999);
      expect(replay).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await flushMicrotasks();

      expect(replay).toHaveBeenCalledTimes(2);
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(replay).toHaveBeenCalledTimes(2);
      releaseRetry();
      await flushMicrotasks();
      expect((await repository.snapshot()).turnHooks).toEqual([]);
      expect(vi.getTimerCount()).toBe(0);
      await runtime.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses one global timer for hooks due at five and ten seconds", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T00:00:00.000Z"));
    try {
      const repository = new InMemorySessionStateRepository();
      for (const [turnId, conversationId] of [
        ["five-second-turn", "five-second-conversation"],
        ["ten-second-turn", "ten-second-conversation"],
      ] as const) {
        await repository.beginTurn({
          turnId,
          requestId: `${turnId}-request`,
          conversationId,
          providerId: "codex-cli",
          operation: "bootstrap",
        });
        await repository.armTurnHook(turnId, {
          kind: "memory-turn",
          turnId,
          conversationId,
          revision: 0,
          providerId: "codex-cli",
          scopes: [{ kind: "conversation", id: conversationId }],
          userContent: "global timer ordering",
        });
        await repository.completeTurn({
          turnId,
          nativeSessionId: `${turnId}-thread`,
          cwd: "/workspace",
          assistantHookContent: "assistant",
        });
      }
      await repository.failTurnHook(
        "five-second-turn",
        "temporary outage",
        true,
      );
      await repository.failTurnHook(
        "ten-second-turn",
        "temporary outage",
        true,
      );
      await repository.failTurnHook(
        "ten-second-turn",
        "temporary outage again",
        true,
      );
      const replayed: string[] = [];
      const runtime = new LocalAiRuntime({
        adapters: [],
        sessionRepository: repository,
        turnHooks: {
          prepareDurableTurnHook: () => undefined,
          replayDurableTurnHook: async (hook) => {
            replayed.push(hook.turnId);
          },
        },
      });
      await vi.advanceTimersByTimeAsync(0);
      await flushMicrotasks();
      expect(vi.getTimerCount()).toBe(1);

      await vi.advanceTimersByTimeAsync(5_000);
      await flushMicrotasks();
      expect(replayed).toEqual(["five-second-turn"]);
      expect(vi.getTimerCount()).toBe(1);

      await vi.advanceTimersByTimeAsync(4_999);
      expect(replayed).toEqual(["five-second-turn"]);
      await vi.advanceTimersByTimeAsync(1);
      await flushMicrotasks();
      expect(replayed).toEqual(["five-second-turn", "ten-second-turn"]);
      expect(vi.getTimerCount()).toBe(0);
      await runtime.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("removes a future retry timer when its conversation is deleted", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T00:00:00.000Z"));
    try {
      const repository = new InMemorySessionStateRepository();
      await repository.beginTurn({
        turnId: "delete-future-turn",
        requestId: "delete-future-request",
        conversationId: "delete-future-conversation",
        providerId: "codex-cli",
        operation: "bootstrap",
      });
      await repository.armTurnHook("delete-future-turn", {
        kind: "memory-turn",
        turnId: "delete-future-turn",
        conversationId: "delete-future-conversation",
        revision: 0,
        providerId: "codex-cli",
        scopes: [
          {
            kind: "conversation",
            id: "delete-future-conversation",
          },
        ],
        userContent: "delete before retry",
      });
      await repository.completeTurn({
        turnId: "delete-future-turn",
        nativeSessionId: "thread",
        cwd: "/workspace",
        assistantHookContent: "assistant",
      });
      await repository.failTurnHook(
        "delete-future-turn",
        "temporary outage",
        true,
      );
      const replay = vi.fn(async () => undefined);
      const runtime = new LocalAiRuntime({
        adapters: [],
        sessionRepository: repository,
        turnHooks: {
          prepareDurableTurnHook: () => undefined,
          replayDurableTurnHook: replay,
        },
        memoryService: {
          getMemorySettings: async () => enabledMemorySettings,
          updateMemorySettings: async () => enabledMemorySettings,
          getMemoryStatus: async () => ({
            health: "healthy",
            detail: "test",
            pendingJobs: 0,
            failedJobs: 0,
          }),
          deleteConversation: async () => undefined,
        },
      });
      await vi.advanceTimersByTimeAsync(0);
      await flushMicrotasks();
      expect(vi.getTimerCount()).toBe(1);

      const leaseToken = await runtime.quiesceConversation(
        "delete-future-conversation",
      );
      await runtime.deleteConversation({
        conversationId: "delete-future-conversation",
        forgetConversationMemory: false,
        leaseToken,
      });
      expect(vi.getTimerCount()).toBe(0);

      await vi.advanceTimersByTimeAsync(10_000);
      expect(replay).not.toHaveBeenCalled();
      await runtime.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the durable retry wakeup when the runtime is disposed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T00:00:00.000Z"));
    try {
      const repository = new InMemorySessionStateRepository();
      await repository.beginTurn({
        turnId: "dispose-timer-turn",
        requestId: "dispose-timer-request",
        conversationId: "dispose-timer-conversation",
        providerId: "codex-cli",
        operation: "bootstrap",
      });
      await repository.armTurnHook("dispose-timer-turn", {
        kind: "memory-turn",
        turnId: "dispose-timer-turn",
        conversationId: "dispose-timer-conversation",
        revision: 0,
        providerId: "codex-cli",
        scopes: [
          {
            kind: "conversation",
            id: "dispose-timer-conversation",
          },
        ],
        userContent: "do not wake after dispose",
      });
      await repository.completeTurn({
        turnId: "dispose-timer-turn",
        nativeSessionId: "thread",
        cwd: "/workspace",
        assistantHookContent: "assistant",
      });
      await repository.failTurnHook(
        "dispose-timer-turn",
        "temporary outage",
        true,
      );
      const replay = vi.fn(async () => undefined);
      const runtime = new LocalAiRuntime({
        adapters: [],
        sessionRepository: repository,
        turnHooks: {
          prepareDurableTurnHook: () => undefined,
          replayDurableTurnHook: replay,
        },
      });

      await flushMicrotasks();
      expect(vi.getTimerCount()).toBe(1);
      await runtime.dispose();
      expect(vi.getTimerCount()).toBe(0);

      await vi.advanceTimersByTimeAsync(10_000);
      expect(replay).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
