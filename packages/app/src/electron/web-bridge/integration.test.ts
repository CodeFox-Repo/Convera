import type {
  LocalAIRuntimeService,
  LocalAIStreamEvent,
} from "@/shared/types/local-ai";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/electron/logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld: vi.fn() },
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
  ipcRenderer: { invoke: vi.fn(), on: vi.fn(), removeListener: vi.fn() },
}));

import { createLocalAIAPI } from "@/electro-bridge/ipc/local-ai-api";
import { setupLocalAIIPC } from "@/electro-bridge/ipc/local-ai-context";
import { ipcMain } from "electron";
import WebSocket from "ws";
import { createRecordingIpcMain, createWebBridgeEvent } from "./dispatch";
import { startWebBridge, type WebBridgeHandle } from "./server";
import {
  WEB_BRIDGE_CLIENT_HEADER,
  WEB_BRIDGE_INVOKE_PATH,
  WEB_BRIDGE_TOKEN_HEADER,
  type WebBridgeEventFrame,
} from "@/shared/web-bridge/protocol";

let bridge: WebBridgeHandle | undefined;

afterEach(async () => {
  await bridge?.close();
  bridge = undefined;
});

/**
 * The browser-side shim, minus the DOM: same shape `createLocalAIAPI` expects,
 * talking to the bridge over real HTTP and a real WebSocket.
 */
function createBrowserIPC(
  handle: WebBridgeHandle,
  socket: WebSocket,
  clientId: string,
) {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  socket.on("message", (raw) => {
    const frame = JSON.parse(String(raw)) as WebBridgeEventFrame;
    listeners
      .get(frame.channel)
      ?.forEach((listener) => listener(null, frame.payload));
  });

  return {
    invoke: async (channel: string, ...args: unknown[]) => {
      const response = await fetch(`${handle.url}${WEB_BRIDGE_INVOKE_PATH}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [WEB_BRIDGE_TOKEN_HEADER]: handle.token,
          [WEB_BRIDGE_CLIENT_HEADER]: clientId,
        },
        body: JSON.stringify({ channel, args }),
      });
      const body = await response.json();
      if (!body.ok) throw new Error(body.error);
      return body.data;
    },
    on: (channel: string, listener: (...args: unknown[]) => void) => {
      const set = listeners.get(channel) ?? new Set();
      set.add(listener);
      listeners.set(channel, set);
    },
    removeListener: (
      channel: string,
      listener: (...args: unknown[]) => void,
    ) => {
      listeners.get(channel)?.delete(listener);
    },
  };
}

describe("web bridge end to end", () => {
  it("drives a local AI chat from a browser client and streams events back", async () => {
    const abort = vi.fn(async () => true);
    const resumeConversation = vi.fn(async () => true);
    const runtime: LocalAIRuntimeService = {
      listProviders: async () => [
        {
          id: "claude-code",
          name: "Claude Code",
          kind: "claude-code",
          availability: "available",
        },
      ],
      getProviderStatus: async () => ({
        id: "claude-code",
        name: "Claude Code",
        kind: "claude-code",
        availability: "available",
      }),
      startChat: async (request, emit) => {
        if (
          request.operation.kind === "append" &&
          request.operation.message.content === "hang"
        ) {
          await new Promise<void>(() => undefined);
        }
        emit({
          type: "ui-message",
          requestId: request.requestId,
          chunk: {
            type: "text-delta",
            id: "t1",
            delta: "hello from the runtime",
          },
        });
      },
      abort,
      respondToInteraction: async () => false,
      getConversationRuntimeState: async () => null,
      getTurnRuntimeState: async () => null,
      acknowledgeTurnPersistence: async () => true,
      quiesceConversation: async (conversationId) =>
        `lease-for-${conversationId}`,
      resumeConversation,
      branchConversation: async (request) => ({
        conversationId: request.targetConversationId,
        revision: 0,
        transcriptVersion: 0,
        memoryEpoch: 0,
        memoryVersion: 0,
        providers: [],
      }),
      deleteConversation: async () => true,
      resetConversationProviderSession: async (request) => ({
        conversationId: request.conversationId,
        revision: 0,
        transcriptVersion: 0,
        memoryEpoch: 0,
        memoryVersion: 0,
        providers: [],
      }),
      getMemorySettings: async () => ({
        provider: "off",
        subconsciousProvider: "off",
        schedule: "every-turn",
        batchSize: 5,
        idleDelayMs: 30_000,
      }),
      updateMemorySettings: async () => ({
        provider: "off",
        subconsciousProvider: "off",
        schedule: "every-turn",
        batchSize: 5,
        idleDelayMs: 30_000,
      }),
      getMemoryStatus: async () => ({
        health: "disabled",
        pendingJobs: 0,
        failedJobs: 0,
      }),
    };

    const recordingIPC = createRecordingIpcMain(ipcMain);

    setupLocalAIIPC(
      {
        runtime,
        getAllowedWebContents: () =>
          (bridge?.senders() ?? []).map((sender) => sender as never),
      },
      recordingIPC,
    );

    bridge = await startWebBridge({
      port: 45921,
      invoke: (channel, args, sender) =>
        recordingIPC.dispatch(channel, args, createWebBridgeEvent(sender)),
    });

    const clientId = "integration-client-one";
    const socket = new WebSocket(
      `${bridge.url.replace(/^http/, "ws")}/ipc/events?token=${bridge.token}&client=${clientId}`,
    );
    await new Promise((resolve) => socket.on("open", resolve));

    const api = createLocalAIAPI(createBrowserIPC(bridge, socket, clientId));

    // The browser reaches the real ipcMain handler through the bridge.
    const providers = await api.listProviders();
    expect(providers).toEqual({
      success: true,
      data: [
        {
          id: "claude-code",
          name: "Claude Code",
          kind: "claude-code",
          availability: "available",
        },
      ],
    });

    const received: LocalAIStreamEvent[] = [];
    const unsubscribe = api.onEvent("req-1", (event) => received.push(event));

    const started = await api.startChat({
      requestId: "req-1",
      conversationId: "conversation-1",
      turnId: "turn-1",
      providerId: "claude-code",
      operation: {
        kind: "append",
        message: { role: "user", content: "hi" },
      },
    });
    expect(started).toEqual({ success: true, accepted: true });

    // Stream events travel main process -> WebSocket -> browser callback.
    await vi.waitFor(() =>
      expect(received.some((event) => event.type === "finish")).toBe(true),
    );
    expect(received[0]).toMatchObject({
      type: "ui-message",
      requestId: "req-1",
      chunk: { type: "text-delta", delta: "hello from the runtime" },
    });

    const clientId2 = "integration-client-two";
    const socket2 = new WebSocket(
      `${bridge.url.replace(/^http/, "ws")}/ipc/events?token=${bridge.token}&client=${clientId2}`,
    );
    await new Promise((resolve) => socket2.on("open", resolve));
    const api2 = createLocalAIAPI(createBrowserIPC(bridge, socket2, clientId2));
    const leaked: LocalAIStreamEvent[] = [];
    const received2: LocalAIStreamEvent[] = [];
    const unsubscribeLeak = api.onEvent("req-2", (event) => leaked.push(event));
    const unsubscribe2 = api2.onEvent("req-2", (event) =>
      received2.push(event),
    );
    await api2.startChat({
      requestId: "req-2",
      conversationId: "conversation-2",
      turnId: "turn-2",
      providerId: "claude-code",
      operation: {
        kind: "append",
        message: { role: "user", content: "second socket" },
      },
    });
    await vi.waitFor(() =>
      expect(received2.some((event) => event.type === "finish")).toBe(true),
    );
    expect(leaked).toEqual([]);

    await api2.startChat({
      requestId: "req-hang",
      conversationId: "conversation-hang",
      turnId: "turn-hang",
      providerId: "claude-code",
      operation: {
        kind: "append",
        message: { role: "user", content: "hang" },
      },
    });
    const lease = await api2.quiesceConversation("conversation-lease");
    expect(lease.success).toBe(true);
    socket2.close();
    await vi.waitFor(() => {
      expect(abort).toHaveBeenCalledWith("req-hang");
      expect(resumeConversation).toHaveBeenCalledWith(
        "conversation-lease",
        "lease-for-conversation-lease",
      );
    });

    unsubscribeLeak();
    unsubscribe2();
    unsubscribe();
    socket.close();
  });
});
