import { describe, expect, it, vi } from "vitest";
import { createWebBridgeIPC } from "./ipc-shim";

/**
 * Minimal WebSocket double: stays CONNECTING until `open()` is called, so a
 * test can prove `invoke` waits for the handshake.
 */
class FakeSocket {
  static instances: FakeSocket[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;

  readyState = 0;
  private handlers = new Map<string, Array<(event: unknown) => void>>();

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }

  addEventListener(type: string, handler: (event: unknown) => void) {
    const existing = this.handlers.get(type) ?? [];
    existing.push(handler);
    this.handlers.set(type, existing);
  }

  open() {
    this.readyState = 1;
    this.handlers.get("open")?.forEach((handler) => handler({}));
  }

  message(payload: unknown) {
    this.handlers
      .get("message")
      ?.forEach((handler) => handler({ data: JSON.stringify(payload) }));
  }
}

describe("web bridge ipc shim", () => {
  it("waits for the event socket before invoking, so no stream event is lost", async () => {
    vi.stubGlobal("WebSocket", FakeSocket);
    vi.stubGlobal("sessionStorage", undefined);
    FakeSocket.instances = [];

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, data: "accepted" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const ipc = createWebBridgeIPC({
      url: "http://127.0.0.1:45999",
      token: "test-token",
    });

    const invoked = ipc.invoke("local-ai:start-chat", { requestId: "r1" });

    // The socket is still CONNECTING, so the request must not have gone out.
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();

    const socket = FakeSocket.instances[0];
    expect(socket.url).toContain("token=test-token");
    socket.open();

    await expect(invoked).resolves.toBe("accepted");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // And events on that socket reach the registered listener.
    const received: unknown[] = [];
    ipc.on("local-ai:event", (_event, payload) => received.push(payload));
    socket.message({
      channel: "local-ai:event",
      payload: { type: "text-delta", requestId: "r1", delta: "hi" },
    });
    expect(received).toEqual([
      { type: "text-delta", requestId: "r1", delta: "hi" },
    ]);

    vi.unstubAllGlobals();
  });
});
