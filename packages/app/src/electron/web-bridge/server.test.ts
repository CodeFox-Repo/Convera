import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";

vi.mock("@/electron/logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import {
  WEB_BRIDGE_CLIENT_HEADER,
  WEB_BRIDGE_TOKEN_HEADER,
} from "@/shared/web-bridge/protocol";
import { startWebBridge, type WebBridgeHandle } from "./server";

let bridge: WebBridgeHandle | undefined;
const sockets = new Set<WebSocket>();

afterEach(async () => {
  sockets.forEach((socket) => socket.terminate());
  sockets.clear();
  await bridge?.close();
  bridge = undefined;
});

async function connect(
  handle: WebBridgeHandle,
  clientId = "server-test-client",
): Promise<WebSocket> {
  const socket = new WebSocket(
    `${handle.url.replace(/^http/, "ws")}/ipc/events?token=${handle.token}&client=${clientId}`,
  );
  sockets.add(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  return socket;
}

async function invoke(
  handle: WebBridgeHandle,
  channel: string,
  args: unknown[] = [],
  overrides: { token?: string; origin?: string; clientId?: string } = {},
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    [WEB_BRIDGE_TOKEN_HEADER]: overrides.token ?? handle.token,
    [WEB_BRIDGE_CLIENT_HEADER]: overrides.clientId ?? "server-test-client",
  };
  if (overrides.origin) headers.origin = overrides.origin;

  return fetch(`${handle.url}/ipc/invoke`, {
    method: "POST",
    headers,
    body: JSON.stringify({ channel, args }),
  });
}

describe("web bridge server", () => {
  it("dispatches allowlisted channels and blocks everything else", async () => {
    const invokeSpy = vi.fn(async (channel: string, args: unknown[]) => ({
      channel,
      args,
    }));
    bridge = await startWebBridge({ invoke: invokeSpy, port: 45911 });
    await connect(bridge);

    const allowed = await invoke(bridge, "local-ai:list-providers", []);
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toEqual({
      ok: true,
      data: { channel: "local-ai:list-providers", args: [] },
    });

    // Window control is deliberately not reachable from a browser tab.
    const blocked = await invoke(bridge, "window:close", []);
    expect(blocked.status).toBe(403);
    expect(invokeSpy).toHaveBeenCalledTimes(1);
  });

  it("rejects a wrong token and a non-loopback origin", async () => {
    const invokeSpy = vi.fn(async () => "ok");
    bridge = await startWebBridge({ invoke: invokeSpy, port: 45912 });
    await connect(bridge);

    const badToken = await invoke(bridge, "local-ai:list-providers", [], {
      token: "wrong-token",
    });
    expect(badToken.status).toBe(403);

    const badOrigin = await invoke(bridge, "local-ai:list-providers", [], {
      origin: "https://evil.example.com",
    });
    expect(badOrigin.status).toBe(403);

    const goodOrigin = await invoke(bridge, "local-ai:list-providers", [], {
      origin: "http://127.0.0.1:5199",
    });
    expect(goodOrigin.status).toBe(200);

    expect(invokeSpy).toHaveBeenCalledTimes(1);
  });

  it("reports handler failures as ok:false instead of throwing", async () => {
    bridge = await startWebBridge({
      invoke: async () => {
        throw new Error("runtime exploded");
      },
      port: 45913,
    });
    await connect(bridge);

    const response = await invoke(bridge, "mcp:getServers", []);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: false,
      error: "runtime exploded",
    });
  });

  it("refuses invokes that are not bound to a live event socket", async () => {
    const invokeSpy = vi.fn(async () => "ok");
    bridge = await startWebBridge({ invoke: invokeSpy, port: 45914 });

    const response = await invoke(bridge, "local-ai:list-providers");

    expect(response.status).toBe(409);
    expect(invokeSpy).not.toHaveBeenCalled();
  });
});
