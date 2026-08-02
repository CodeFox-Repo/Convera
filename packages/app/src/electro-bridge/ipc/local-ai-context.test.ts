import type {
  LocalAIChatRequest,
  LocalAIRuntimeService,
  LocalAIStreamEvent,
} from "@/shared/types/local-ai";
import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld: vi.fn() },
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
  ipcRenderer: {
    invoke: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}));

import {
  createLocalAIAPI,
  LOCAL_AI_CHANNELS,
  serializeLocalAIError,
  setupLocalAIIPC,
} from "./local-ai-context";

type Handler = (event: FakeInvokeEvent, ...args: unknown[]) => unknown;

class FakeWebContents extends EventEmitter {
  readonly id: number;
  readonly mainFrame = {};
  readonly sent: Array<{ channel: string; event: LocalAIStreamEvent }> = [];
  private destroyed = false;

  constructor(id: number) {
    super();
    this.id = id;
  }

  isDestroyed() {
    return this.destroyed;
  }

  send(channel: string, event: LocalAIStreamEvent) {
    this.sent.push({ channel, event });
  }

  destroy() {
    this.destroyed = true;
    this.emit("destroyed");
  }
}

interface FakeInvokeEvent {
  sender: FakeWebContents;
  senderFrame: object;
}

function createMainIPC() {
  const handlers = new Map<string, Handler>();
  return {
    handlers,
    ipc: {
      handle: (channel: string, handler: Handler) => {
        handlers.set(channel, handler);
      },
      removeHandler: (channel: string) => {
        handlers.delete(channel);
      },
    },
  };
}

function createEvent(sender: FakeWebContents): FakeInvokeEvent {
  return { sender, senderFrame: sender.mainFrame };
}

function createRuntime(
  overrides: Partial<LocalAIRuntimeService> = {},
): LocalAIRuntimeService {
  return {
    listProviders: vi.fn(() => []),
    getProviderStatus: vi.fn(() => ({
      id: "codex",
      name: "Codex",
      kind: "codex-cli" as const,
      availability: "available" as const,
    })),
    startChat: vi.fn(),
    abort: vi.fn(() => true),
    respondToInteraction: vi.fn(() => false),
    getConversationRuntimeState: vi.fn(() => null),
    getTurnRuntimeState: vi.fn(() => null),
    acknowledgeTurnPersistence: vi.fn(() => true),
    quiesceConversation: vi.fn(() => "lease-1"),
    resumeConversation: vi.fn(() => true),
    branchConversation: vi.fn((request) => ({
      conversationId: request.targetConversationId,
      revision: 0,
      memoryEpoch: 0,
      memoryVersion: 0,
      transcriptVersion: 0,
      providers: [],
    })),
    deleteConversation: vi.fn(() => true),
    resetConversationProviderSession: vi.fn((request) => ({
      conversationId: request.conversationId,
      revision: 0,
      memoryEpoch: 0,
      memoryVersion: 0,
      transcriptVersion: 0,
      providers: [],
    })),
    getMemorySettings: vi.fn(() => ({
      provider: "off" as const,
      subconsciousProvider: "off" as const,
      schedule: "every-turn" as const,
      batchSize: 5,
      idleDelayMs: 30_000,
    })),
    updateMemorySettings: vi.fn(() => ({
      provider: "off" as const,
      subconsciousProvider: "off" as const,
      schedule: "every-turn" as const,
      batchSize: 5,
      idleDelayMs: 30_000,
    })),
    getMemoryStatus: vi.fn(() => ({
      health: "disabled" as const,
      pendingJobs: 0,
      failedJobs: 0,
    })),
    getConversationMemoryState: vi.fn((conversationId: string) => ({
      conversationId,
      version: 1,
      epoch: 0,
      blocks: [{ label: "policy", readOnly: false, version: 1 }],
    })),
    setMemoryBlockReadOnly: vi.fn((request) => ({
      conversationId: request.conversationId,
      version: 2,
      epoch: 0,
      blocks: [
        { label: request.label, readOnly: request.readOnly, version: 2 },
      ],
    })),
    ...overrides,
  };
}

function chatRequest(
  overrides: Partial<LocalAIChatRequest> = {},
): LocalAIChatRequest {
  return {
    requestId: "request-1",
    conversationId: "conversation-1",
    turnId: "turn-1",
    providerId: "codex-cli",
    operation: {
      kind: "append",
      message: { role: "user", content: "hello" },
    },
    ...overrides,
  };
}

describe("local AI IPC", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("isolates stream events by request id and removes its exact listener", () => {
    const listeners = new Map<string, (...args: unknown[]) => void>();
    const rendererIPC = {
      invoke: vi.fn(),
      on: vi.fn((channel: string, handler: (...args: unknown[]) => void) => {
        listeners.set(channel, handler);
      }),
      removeListener: vi.fn(
        (channel: string, handler: (...args: unknown[]) => void) => {
          if (listeners.get(channel) === handler) listeners.delete(channel);
        },
      ),
    };
    const api = createLocalAIAPI(rendererIPC as never);
    const callback = vi.fn();

    const unsubscribe = api.onEvent("request-1", callback);
    const listener = listeners.get(LOCAL_AI_CHANNELS.EVENT);
    listener?.(
      {},
      {
        type: "ui-message",
        requestId: "request-2",
        chunk: { type: "text-delta", id: "text-1", delta: "ignore" },
      },
    );
    listener?.(
      {},
      {
        type: "ui-message",
        requestId: "request-1",
        chunk: { type: "text-delta", id: "text-1", delta: "hello" },
      },
    );

    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith({
      type: "ui-message",
      requestId: "request-1",
      chunk: { type: "text-delta", id: "text-1", delta: "hello" },
    });

    unsubscribe();
    expect(rendererIPC.removeListener).toHaveBeenCalledWith(
      LOCAL_AI_CHANNELS.EVENT,
      listener,
    );
    expect(listeners.has(LOCAL_AI_CHANNELS.EVENT)).toBe(false);
  });

  it("streams only to the sender that owns an accepted request", async () => {
    const allowedSender = new FakeWebContents(1);
    const otherSender = new FakeWebContents(2);
    const runtime = createRuntime({
      startChat: vi.fn((_request, emit) => {
        emit({
          type: "ui-message",
          requestId: "runtime-cannot-change-owner",
          chunk: { type: "text-delta", id: "text-1", delta: "hello" },
        });
        emit({
          type: "finish",
          requestId: "runtime-cannot-change-owner",
          finishReason: "stop",
        });
      }),
    });
    const { handlers, ipc } = createMainIPC();
    setupLocalAIIPC(
      {
        runtime,
        getAllowedWebContents: () => allowedSender as never,
      },
      ipc as never,
    );
    const start = handlers.get(LOCAL_AI_CHANNELS.START_CHAT);
    const request = chatRequest();

    const forbidden = start?.(createEvent(otherSender), request);
    expect(forbidden).toMatchObject({
      success: false,
      accepted: false,
      error: { code: "LOCAL_AI_FORBIDDEN" },
    });

    const accepted = start?.(createEvent(allowedSender), request);
    expect(accepted).toEqual({ success: true, accepted: true });
    await vi.waitFor(() => {
      expect(allowedSender.sent).toHaveLength(2);
    });
    expect(allowedSender.sent).toEqual([
      {
        channel: LOCAL_AI_CHANNELS.EVENT,
        event: {
          type: "ui-message",
          requestId: "request-1",
          chunk: { type: "text-delta", id: "text-1", delta: "hello" },
        },
      },
      {
        channel: LOCAL_AI_CHANNELS.EVENT,
        event: {
          type: "finish",
          requestId: "request-1",
          finishReason: "stop",
        },
      },
    ]);
    expect(otherSender.sent).toEqual([]);
  });

  it("rejects unsupported providers and oversized renderer input", () => {
    const sender = new FakeWebContents(1);
    const runtime = createRuntime();
    const { handlers, ipc } = createMainIPC();
    setupLocalAIIPC(
      {
        runtime,
        getAllowedWebContents: () => sender as never,
      },
      ipc as never,
    );
    const start = handlers.get(LOCAL_AI_CHANNELS.START_CHAT);
    const baseRequest = chatRequest();

    expect(
      start?.(createEvent(sender), {
        ...baseRequest,
        providerId: "remote-service",
      }),
    ).toMatchObject({
      success: false,
      accepted: false,
      error: { code: "LOCAL_AI_INVALID_REQUEST" },
    });
    expect(
      start?.(createEvent(sender), {
        ...baseRequest,
        providerId: "claude-code",
        operation: {
          kind: "append",
          message: { role: "user", content: "x".repeat(200_001) },
        },
      }),
    ).toMatchObject({
      success: false,
      accepted: false,
      error: { code: "LOCAL_AI_INVALID_REQUEST" },
    });
    expect(runtime.startChat).not.toHaveBeenCalled();
  });

  it("rejects malformed metadata, generation options, and oversized prompts", () => {
    const sender = new FakeWebContents(1);
    const runtime = createRuntime();
    const { handlers, ipc } = createMainIPC();
    setupLocalAIIPC(
      {
        runtime,
        getAllowedWebContents: () => sender as never,
      },
      ipc as never,
    );
    const start = handlers.get(LOCAL_AI_CHANNELS.START_CHAT);
    const baseRequest = chatRequest();
    const invalidRequests = [
      { ...baseRequest, modelId: { id: "not-a-string" } },
      { ...baseRequest, agent: { systemPrompt: 42 } },
      {
        ...baseRequest,
        agent: { id: "fizz", memberId: "agent:honey" },
      },
      {
        ...baseRequest,
        agent: { id: "../fizz", memberId: "agent:../fizz" },
      },
      {
        ...baseRequest,
        agentHost: {
          jobId: "job-1",
          taskId: "task-1",
          channelKind: "channel",
          collaborationTargets: [
            { agentId: "reviewer", memberId: "agent:someone-else" },
          ],
        },
      },
      { ...baseRequest, options: { temperature: Number.NaN } },
      { ...baseRequest, options: { maxOutputTokens: 0 } },
      {
        ...baseRequest,
        operation: {
          kind: "append",
          message: { id: "latest", role: "user", content: "latest" },
          recoveryMessages: [
            { id: "different", role: "user", content: "different" },
          ],
        },
      },
      {
        ...baseRequest,
        agent: { systemPrompt: "x" },
        operation: {
          kind: "bootstrap",
          messages: Array.from({ length: 6 }, () => ({
            role: "user",
            content: "x".repeat(200_000),
          })),
        },
      },
    ];

    for (const invalidRequest of invalidRequests) {
      expect(start?.(createEvent(sender), invalidRequest)).toMatchObject({
        success: false,
        accepted: false,
        error: { code: "LOCAL_AI_INVALID_REQUEST" },
      });
    }
    expect(runtime.startChat).not.toHaveBeenCalled();
  });

  it("accepts a provider-switch rebase through privileged validation", () => {
    const sender = new FakeWebContents(1);
    const runtime = createRuntime();
    const { handlers, ipc } = createMainIPC();
    setupLocalAIIPC(
      {
        runtime,
        getAllowedWebContents: () => sender as never,
      },
      ipc as never,
    );
    const start = handlers.get(LOCAL_AI_CHANNELS.START_CHAT);
    const request = chatRequest({
      operation: {
        kind: "rebase",
        reason: "provider-switch",
        messages: [{ role: "user", content: "authoritative transcript" }],
      },
    });

    expect(start?.(createEvent(sender), request)).toMatchObject({
      success: true,
      accepted: true,
    });
  });

  it("accepts interaction responses only from the active request owner", async () => {
    const allowedSender = new FakeWebContents(1);
    const otherSender = new FakeWebContents(2);
    const runtime = createRuntime({
      startChat: vi.fn(() => new Promise<void>(() => undefined)),
      respondToInteraction: vi.fn(() => true),
    });
    const { handlers, ipc } = createMainIPC();
    setupLocalAIIPC(
      {
        runtime,
        getAllowedWebContents: () => allowedSender as never,
      },
      ipc as never,
    );
    const start = handlers.get(LOCAL_AI_CHANNELS.START_CHAT);
    const respond = handlers.get(LOCAL_AI_CHANNELS.RESPOND_INTERACTION);

    start?.(
      createEvent(allowedSender),
      chatRequest({ providerId: "claude-code" }),
    );

    await expect(
      respond?.(createEvent(allowedSender), "request-1", "interaction-1", {
        approved: true,
      }),
    ).resolves.toEqual({
      success: true,
      data: { accepted: true },
    });
    expect(runtime.respondToInteraction).toHaveBeenCalledWith(
      "request-1",
      "interaction-1",
      { approved: true },
    );

    await expect(
      respond?.(createEvent(otherSender), "request-1", "interaction-1", {
        approved: true,
      }),
    ).resolves.toMatchObject({
      success: false,
      error: { code: "LOCAL_AI_FORBIDDEN" },
    });
  });

  it("accepts an answer to a turn the renderer did not start", async () => {
    // Agent Host turns are started by the main process, so they were never in
    // activeRequests. Refusing those answers left an agent that had called a
    // tool waiting forever — a colleague stuck at "typing" that never speaks.
    const sender = new FakeWebContents(1);
    const runtime = createRuntime({
      respondToInteraction: vi.fn(() => true),
    });
    const { handlers, ipc } = createMainIPC();
    setupLocalAIIPC(
      { runtime, getAllowedWebContents: () => sender as never },
      ipc as never,
    );
    const respond = handlers.get(LOCAL_AI_CHANNELS.RESPOND_INTERACTION);

    await expect(
      respond?.(createEvent(sender), "host-request-1", "interaction-9", {
        value: "{}",
      }),
    ).resolves.toEqual({ success: true, data: { accepted: true } });
    // The runtime remains the judge of whether the interaction is real.
    expect(runtime.respondToInteraction).toHaveBeenCalledWith(
      "host-request-1",
      "interaction-9",
      { value: "{}" },
    );
  });

  it("rejects malformed interaction responses", async () => {
    const sender = new FakeWebContents(1);
    const runtime = createRuntime();
    const { handlers, ipc } = createMainIPC();
    setupLocalAIIPC(
      {
        runtime,
        getAllowedWebContents: () => sender as never,
      },
      ipc as never,
    );
    const respond = handlers.get(LOCAL_AI_CHANNELS.RESPOND_INTERACTION);

    await expect(
      respond?.(createEvent(sender), "request-1", "interaction-1", {
        approved: "yes",
      }),
    ).resolves.toMatchObject({
      success: false,
      error: { code: "LOCAL_AI_INVALID_REQUEST" },
    });
    expect(runtime.respondToInteraction).not.toHaveBeenCalled();
  });

  it("aborts active work when its webContents is destroyed", async () => {
    const sender = new FakeWebContents(1);
    let resolveChat: (() => void) | undefined;
    const runtime = createRuntime({
      startChat: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveChat = resolve;
          }),
      ),
    });
    const { handlers, ipc } = createMainIPC();
    setupLocalAIIPC(
      {
        runtime,
        getAllowedWebContents: () => sender as never,
      },
      ipc as never,
    );
    const start = handlers.get(LOCAL_AI_CHANNELS.START_CHAT);

    start?.(createEvent(sender), chatRequest());
    expect(resolveChat).toBeTypeOf("function");
    sender.destroy();

    expect(runtime.abort).toHaveBeenCalledWith("request-1");
    resolveChat?.();
  });

  it("waits for the authoritative runtime terminal after an accepted abort", async () => {
    const sender = new FakeWebContents(1);
    const pendingChats: Array<() => void> = [];
    let emitRuntimeEvent: ((event: LocalAIStreamEvent) => void) | undefined;
    const runtime = createRuntime({
      startChat: vi.fn(
        (_request, emit) =>
          new Promise<void>((resolve) => {
            emitRuntimeEvent = emit;
            pendingChats.push(resolve);
          }),
      ),
      abort: vi.fn(() => true),
    });
    const { handlers, ipc } = createMainIPC();
    setupLocalAIIPC(
      {
        runtime,
        getAllowedWebContents: () => sender as never,
      },
      ipc as never,
    );
    const start = handlers.get(LOCAL_AI_CHANNELS.START_CHAT);
    const abort = handlers.get(LOCAL_AI_CHANNELS.ABORT);
    const request = chatRequest();

    expect(start?.(createEvent(sender), request)).toEqual({
      success: true,
      accepted: true,
    });
    await expect(abort?.(createEvent(sender), "request-1")).resolves.toEqual({
      success: true,
      data: { aborted: true },
    });
    expect(sender.sent).toEqual([]);
    expect(start?.(createEvent(sender), request)).toMatchObject({
      success: false,
      accepted: false,
      error: { code: "LOCAL_AI_DUPLICATE_REQUEST" },
    });

    emitRuntimeEvent?.({
      type: "finish",
      requestId: "request-1",
      finishReason: "aborted",
      conversationId: "conversation-1",
      turnId: "turn-1",
      revision: 4,
    });
    pendingChats.shift()?.();
    await vi.waitFor(() =>
      expect(sender.sent.at(-1)).toEqual({
        channel: LOCAL_AI_CHANNELS.EVENT,
        event: {
          type: "finish",
          requestId: "request-1",
          finishReason: "aborted",
          conversationId: "conversation-1",
          turnId: "turn-1",
          revision: 4,
        },
      }),
    );

    expect(start?.(createEvent(sender), request)).toEqual({
      success: true,
      accepted: true,
    });
    pendingChats.forEach((resolve) => resolve());
  });

  it("serializes a synchronous runtime failure and releases the request", async () => {
    const sender = new FakeWebContents(1);
    const runtime = createRuntime({
      startChat: vi.fn(() => {
        throw Object.assign(new Error("CLI failed"), {
          code: "CLI_EXITED",
        });
      }),
    });
    const { handlers, ipc } = createMainIPC();
    setupLocalAIIPC(
      {
        runtime,
        getAllowedWebContents: () => sender as never,
      },
      ipc as never,
    );
    const start = handlers.get(LOCAL_AI_CHANNELS.START_CHAT);
    const request = chatRequest();

    expect(start?.(createEvent(sender), request)).toEqual({
      success: true,
      accepted: true,
    });
    await vi.waitFor(() => {
      expect(sender.sent).toHaveLength(2);
    });
    expect(sender.sent).toMatchObject([
      {
        event: {
          type: "error",
          requestId: "request-1",
          error: { code: "CLI_EXITED", message: "CLI failed" },
        },
      },
      {
        event: {
          type: "finish",
          requestId: "request-1",
          finishReason: "error",
        },
      },
    ]);

    expect(start?.(createEvent(sender), request)).toEqual({
      success: true,
      accepted: true,
    });
  });

  it("validates and forwards conversation lifecycle requests", async () => {
    const sender = new FakeWebContents(1);
    const runtime = createRuntime();
    const { handlers, ipc } = createMainIPC();
    setupLocalAIIPC(
      {
        runtime,
        getAllowedWebContents: () => sender as never,
      },
      ipc as never,
    );

    const branch = handlers.get(LOCAL_AI_CHANNELS.BRANCH_CONVERSATION);
    const quiesce = handlers.get(LOCAL_AI_CHANNELS.QUIESCE_CONVERSATION);
    const resume = handlers.get(LOCAL_AI_CHANNELS.RESUME_CONVERSATION);
    const remove = handlers.get(LOCAL_AI_CHANNELS.DELETE_CONVERSATION);
    const reset = handlers.get(
      LOCAL_AI_CHANNELS.RESET_CONVERSATION_PROVIDER_SESSION,
    );
    const branchRequest = {
      sourceConversationId: "conversation-1",
      targetConversationId: "conversation-2",
      throughMessageId: "message-2",
      bootstrapMessages: [{ role: "user", content: "hello" }],
    };

    await expect(
      branch?.(createEvent(sender), branchRequest),
    ).resolves.toMatchObject({
      success: true,
      data: { conversationId: "conversation-2", revision: 0 },
    });
    expect(runtime.branchConversation).toHaveBeenCalledWith(branchRequest);

    await expect(
      quiesce?.(createEvent(sender), "conversation-1"),
    ).resolves.toEqual({
      success: true,
      data: { quiesced: true, leaseToken: "lease-1" },
    });
    expect(runtime.quiesceConversation).toHaveBeenCalledWith("conversation-1");
    await expect(
      resume?.(createEvent(sender), {
        conversationId: "conversation-1",
        leaseToken: "lease-1",
      }),
    ).resolves.toEqual({
      success: true,
      data: { resumed: true },
    });
    expect(runtime.resumeConversation).toHaveBeenCalledWith(
      "conversation-1",
      "lease-1",
    );

    await quiesce?.(createEvent(sender), "conversation-1");

    await expect(
      remove?.(createEvent(sender), {
        conversationId: "conversation-1",
        forgetConversationMemory: false,
        leaseToken: "lease-1",
      }),
    ).resolves.toEqual({
      success: true,
      data: { deleted: true },
    });

    await expect(
      reset?.(createEvent(sender), {
        conversationId: "conversation-1",
        providerId: "codex-cli",
      }),
    ).resolves.toMatchObject({
      success: true,
      data: { conversationId: "conversation-1" },
    });
  });

  it("releases a renderer-owned lease when its sender is destroyed", async () => {
    const sender = new FakeWebContents(1);
    const runtime = createRuntime({
      quiesceConversation: vi.fn(() => "lease-1"),
      resumeConversation: vi.fn(() => true),
    });
    const { handlers, ipc } = createMainIPC();
    setupLocalAIIPC(
      {
        runtime,
        getAllowedWebContents: () => sender as never,
      },
      ipc as never,
    );

    await handlers.get(LOCAL_AI_CHANNELS.QUIESCE_CONVERSATION)?.(
      createEvent(sender),
      "conversation-1",
    );
    sender.destroy();

    await vi.waitFor(() => {
      expect(runtime.resumeConversation).toHaveBeenCalledWith(
        "conversation-1",
        "lease-1",
      );
    });
  });

  it("requires the owning lease token for resume and delete", async () => {
    const sender = new FakeWebContents(1);
    const runtime = createRuntime();
    const { handlers, ipc } = createMainIPC();
    setupLocalAIIPC(
      {
        runtime,
        getAllowedWebContents: () => sender as never,
      },
      ipc as never,
    );
    await handlers.get(LOCAL_AI_CHANNELS.QUIESCE_CONVERSATION)?.(
      createEvent(sender),
      "conversation-1",
    );

    await expect(
      handlers.get(LOCAL_AI_CHANNELS.RESUME_CONVERSATION)?.(
        createEvent(sender),
        { conversationId: "conversation-1", leaseToken: "wrong-lease" },
      ),
    ).resolves.toMatchObject({
      success: false,
      error: { code: "LOCAL_AI_CONVERSATION_LEASE_INVALID" },
    });
    await expect(
      handlers.get(LOCAL_AI_CHANNELS.DELETE_CONVERSATION)?.(
        createEvent(sender),
        {
          conversationId: "conversation-1",
          forgetConversationMemory: true,
          leaseToken: "wrong-lease",
        },
      ),
    ).resolves.toMatchObject({
      success: false,
      error: { code: "LOCAL_AI_CONVERSATION_LEASE_INVALID" },
    });
    expect(runtime.deleteConversation).not.toHaveBeenCalled();
  });

  it("queries and acknowledges durable terminal turn state", async () => {
    const sender = new FakeWebContents(1);
    const turnRequest = {
      conversationId: "conversation-1",
      turnId: "turn-1",
    };
    const runtime = createRuntime({
      getTurnRuntimeState: vi.fn(() => ({
        ...turnRequest,
        requestId: "request-1",
        providerId: "codex-cli",
        revision: 2,
        status: "completed" as const,
        startedAt: "2026-07-31T00:00:00.000Z",
        completedAt: "2026-07-31T00:00:01.000Z",
        finishReason: "stop" as const,
        assistantText: "replay me",
      })),
      acknowledgeTurnPersistence: vi.fn(() => true),
    });
    const { handlers, ipc } = createMainIPC();
    setupLocalAIIPC(
      {
        runtime,
        getAllowedWebContents: () => sender as never,
      },
      ipc as never,
    );

    await expect(
      handlers.get(LOCAL_AI_CHANNELS.GET_TURN_RUNTIME_STATE)?.(
        createEvent(sender),
        turnRequest,
      ),
    ).resolves.toMatchObject({
      success: true,
      data: { status: "completed", assistantText: "replay me" },
    });
    await expect(
      handlers.get(LOCAL_AI_CHANNELS.ACKNOWLEDGE_TURN_PERSISTENCE)?.(
        createEvent(sender),
        turnRequest,
      ),
    ).resolves.toEqual({
      success: true,
      data: { acknowledged: true },
    });
    expect(runtime.acknowledgeTurnPersistence).toHaveBeenCalledWith(
      turnRequest,
    );
  });

  it("validates memory settings before they reach privileged storage", async () => {
    const sender = new FakeWebContents(1);
    const runtime = createRuntime();
    const { handlers, ipc } = createMainIPC();
    setupLocalAIIPC(
      {
        runtime,
        getAllowedWebContents: () => sender as never,
      },
      ipc as never,
    );
    const update = handlers.get(LOCAL_AI_CHANNELS.UPDATE_MEMORY_SETTINGS);
    const validUpdate = {
      provider: "local",
      subconsciousProvider: "follow-active",
      schedule: "batch",
      batchSize: 5,
      idleDelayMs: 30_000,
    };

    await expect(
      update?.(createEvent(sender), validUpdate),
    ).resolves.toMatchObject({ success: true });
    expect(runtime.updateMemorySettings).toHaveBeenCalledWith(validUpdate);

    await expect(
      update?.(createEvent(sender), {
        apiKey: 42,
        unknownSetting: true,
      }),
    ).resolves.toMatchObject({
      success: false,
      error: { code: "LOCAL_AI_INVALID_REQUEST" },
    });
    expect(runtime.updateMemorySettings).toHaveBeenCalledOnce();
  });

  it.each(["openai-api", "fireworks-api"] as const)(
    "accepts the registered %s provider as a memory curator",
    async (subconsciousProvider) => {
      const sender = new FakeWebContents(1);
      const runtime = createRuntime();
      const { handlers, ipc } = createMainIPC();
      setupLocalAIIPC(
        {
          runtime,
          getAllowedWebContents: () => sender as never,
        },
        ipc as never,
      );

      await expect(
        handlers.get(LOCAL_AI_CHANNELS.UPDATE_MEMORY_SETTINGS)?.(
          createEvent(sender),
          { subconsciousProvider },
        ),
      ).resolves.toMatchObject({ success: true });
      expect(runtime.updateMemorySettings).toHaveBeenCalledWith({
        subconsciousProvider,
      });
    },
  );

  it("validates read-only block changes before they reach memory storage", async () => {
    const sender = new FakeWebContents(1);
    const runtime = createRuntime();
    const { handlers, ipc } = createMainIPC();
    setupLocalAIIPC(
      {
        runtime,
        getAllowedWebContents: () => sender as never,
      },
      ipc as never,
    );

    await expect(
      handlers.get(LOCAL_AI_CHANNELS.GET_CONVERSATION_MEMORY_STATE)?.(
        createEvent(sender),
        "conversation-1",
      ),
    ).resolves.toMatchObject({
      success: true,
      data: { blocks: [{ label: "policy", readOnly: false }] },
    });
    await expect(
      handlers.get(LOCAL_AI_CHANNELS.SET_MEMORY_BLOCK_READ_ONLY)?.(
        createEvent(sender),
        {
          conversationId: "conversation-1",
          label: "policy",
          readOnly: true,
        },
      ),
    ).resolves.toMatchObject({
      success: true,
      data: { blocks: [{ label: "policy", readOnly: true }] },
    });
    expect(runtime.setMemoryBlockReadOnly).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      label: "policy",
      readOnly: true,
    });

    await expect(
      handlers.get(LOCAL_AI_CHANNELS.SET_MEMORY_BLOCK_READ_ONLY)?.(
        createEvent(sender),
        {
          conversationId: "conversation-1",
          label: "invalid label",
          readOnly: true,
        },
      ),
    ).resolves.toMatchObject({
      success: false,
      error: { code: "LOCAL_AI_INVALID_REQUEST" },
    });
    expect(runtime.setMemoryBlockReadOnly).toHaveBeenCalledOnce();
  });

  it("accepts local and paused memory providers", async () => {
    const sender = new FakeWebContents(1);
    const runtime = createRuntime();
    const { handlers, ipc } = createMainIPC();
    setupLocalAIIPC(
      {
        runtime,
        getAllowedWebContents: () => sender as never,
      },
      ipc as never,
    );
    const update = handlers.get(LOCAL_AI_CHANNELS.UPDATE_MEMORY_SETTINGS);

    await expect(
      update?.(createEvent(sender), { provider: "local" }),
    ).resolves.toMatchObject({ success: true });
    await expect(
      update?.(createEvent(sender), { provider: "off" }),
    ).resolves.toMatchObject({ success: true });

    expect(runtime.updateMemorySettings).toHaveBeenNthCalledWith(1, {
      provider: "local",
    });
    expect(runtime.updateMemorySettings).toHaveBeenNthCalledWith(2, {
      provider: "off",
    });
    expect(runtime.getMemorySettings).not.toHaveBeenCalled();
  });

  it("rejects the removed Letta provider and connection fields", async () => {
    const sender = new FakeWebContents(1);
    const runtime = createRuntime();
    const { handlers, ipc } = createMainIPC();
    setupLocalAIIPC(
      {
        runtime,
        getAllowedWebContents: () => sender as never,
      },
      ipc as never,
    );
    const update = handlers.get(LOCAL_AI_CHANNELS.UPDATE_MEMORY_SETTINGS);

    await expect(
      update?.(createEvent(sender), { apiKey: "must-not-leak" }),
    ).resolves.toMatchObject({
      success: false,
      error: { code: "LOCAL_AI_INVALID_REQUEST" },
    });
    await expect(
      update?.(createEvent(sender), {
        provider: "letta",
      }),
    ).resolves.toMatchObject({
      success: false,
      error: { code: "LOCAL_AI_INVALID_REQUEST" },
    });

    expect(runtime.updateMemorySettings).not.toHaveBeenCalled();
  });

  it("serializes Error fields without crossing the process boundary", () => {
    const error = Object.assign(new Error("CLI failed"), {
      code: "CLI_EXITED",
      retryable: false,
    });

    expect(serializeLocalAIError(error)).toMatchObject({
      name: "Error",
      message: "CLI failed",
      code: "CLI_EXITED",
      retryable: false,
    });
  });
});
