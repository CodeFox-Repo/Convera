import type {
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
        type: "delta",
        requestId: "request-2",
        text: "ignore",
      },
    );
    listener?.(
      {},
      {
        type: "delta",
        requestId: "request-1",
        text: "hello",
      },
    );

    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith({
      type: "delta",
      requestId: "request-1",
      text: "hello",
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
          type: "delta",
          requestId: "runtime-cannot-change-owner",
          text: "hello",
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
    const request = {
      requestId: "request-1",
      providerId: "codex",
      messages: [{ role: "user", content: "hello" }],
    };

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
          type: "delta",
          requestId: "request-1",
          text: "hello",
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

    start?.(createEvent(sender), {
      requestId: "request-1",
      providerId: "codex",
      messages: [{ role: "user", content: "hello" }],
    });
    sender.destroy();

    expect(runtime.abort).toHaveBeenCalledWith("request-1");
    resolveChat?.();
  });

  it("makes an accepted abort terminal and releases the request id", async () => {
    const sender = new FakeWebContents(1);
    const pendingChats: Array<() => void> = [];
    const runtime = createRuntime({
      startChat: vi.fn(
        () =>
          new Promise<void>((resolve) => {
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
    const request = {
      requestId: "request-1",
      providerId: "codex",
      messages: [{ role: "user", content: "hello" }],
    };

    expect(start?.(createEvent(sender), request)).toEqual({
      success: true,
      accepted: true,
    });
    await expect(abort?.(createEvent(sender), "request-1")).resolves.toEqual({
      success: true,
      data: { aborted: true },
    });
    expect(sender.sent.at(-1)).toEqual({
      channel: LOCAL_AI_CHANNELS.EVENT,
      event: {
        type: "finish",
        requestId: "request-1",
        finishReason: "aborted",
      },
    });

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
    const request = {
      requestId: "request-1",
      providerId: "codex",
      messages: [{ role: "user", content: "hello" }],
    };

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

  it("serializes Error fields without crossing the process boundary", () => {
    const error = Object.assign(new Error("CLI failed"), {
      code: "CLI_EXITED",
    });

    expect(serializeLocalAIError(error)).toMatchObject({
      name: "Error",
      message: "CLI failed",
      code: "CLI_EXITED",
    });
  });
});
