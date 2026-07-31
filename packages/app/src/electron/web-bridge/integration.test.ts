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
import {
  createRecordingIpcMain,
  createWebBridgeEvent,
  WebBridgeSender,
} from "./dispatch";
import { startWebBridge, type WebBridgeHandle } from "./server";
import {
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
function createBrowserIPC(handle: WebBridgeHandle, socket: WebSocket) {
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
      abort: async () => true,
      respondToInteraction: async () => false,
    };

    const recordingIPC = createRecordingIpcMain(ipcMain);
    const sender = new WebBridgeSender((channel, payload) =>
      bridge?.emit(channel, payload),
    );

    setupLocalAIIPC(
      { runtime, getAllowedWebContents: () => [sender as never] },
      recordingIPC,
    );

    bridge = await startWebBridge({
      port: 45921,
      invoke: (channel, args) =>
        recordingIPC.dispatch(channel, args, createWebBridgeEvent(sender)),
    });

    const socket = new WebSocket(
      `ws://127.0.0.1:45921/ipc/events?token=${bridge.token}`,
    );
    await new Promise((resolve) => socket.on("open", resolve));

    const api = createLocalAIAPI(createBrowserIPC(bridge, socket));

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
      providerId: "claude-code",
      messages: [{ role: "user", content: "hi" }],
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

    unsubscribe();
    socket.close();
  });
});
