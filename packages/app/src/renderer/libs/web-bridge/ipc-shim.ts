import {
  WEB_BRIDGE_CLIENT_HEADER,
  WEB_BRIDGE_DEFAULT_PORT,
  WEB_BRIDGE_EVENT_PATH,
  WEB_BRIDGE_INVOKE_PATH,
  WEB_BRIDGE_TOKEN_HEADER,
  type WebBridgeEventFrame,
  type WebBridgeInvokeResponse,
} from "@/shared/web-bridge/protocol";

type Listener = (event: unknown, payload: unknown) => void;

export interface RendererIPCLike {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  on: (channel: string, listener: Listener) => void;
  removeListener: (channel: string, listener: Listener) => void;
}

const TOKEN_STORAGE_KEY = "convera:web-bridge-token";
const URL_STORAGE_KEY = "convera:web-bridge-url";

export interface WebBridgeConfig {
  url: string;
  token: string;
}

/**
 * Reads the bridge target from `?bridge=...&token=...` and remembers it for
 * the tab, so a reload does not need the query string again.
 */
export function readWebBridgeConfig(): WebBridgeConfig | null {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const tokenParam = params.get("token");
  const urlParam = params.get("bridge");

  if (tokenParam || urlParam) {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, tokenParam ?? "");
    sessionStorage.setItem(
      URL_STORAGE_KEY,
      urlParam ?? `http://127.0.0.1:${WEB_BRIDGE_DEFAULT_PORT}`,
    );
  }

  // Tokenless local default: a plain http://localhost:5199/ tab just works.
  const token = sessionStorage.getItem(TOKEN_STORAGE_KEY) ?? "";
  const url =
    sessionStorage.getItem(URL_STORAGE_KEY) ??
    `http://127.0.0.1:${WEB_BRIDGE_DEFAULT_PORT}`;
  return { url, token };
}

/**
 * An `ipcRenderer`-shaped object backed by HTTP + WebSocket. The existing
 * `create*API(ipcRenderer)` factories consume this unchanged, so the browser
 * and Electron builds share one API implementation.
 */
export function createWebBridgeIPC(config: WebBridgeConfig): RendererIPCLike {
  const listeners = new Map<string, Set<Listener>>();
  const clientId = globalThis.crypto.randomUUID();
  let socket: WebSocket | null = null;
  let ready: Promise<void> | null = null;

  /**
   * Resolves once the event socket is live. `invoke` awaits this so a request
   * can never be sent before the channel that carries its stream events —
   * otherwise the first deltas are emitted into a socket nobody is reading.
   */
  const ensureSocket = (): Promise<void> => {
    if (ready && socket && socket.readyState <= WebSocket.OPEN) return ready;

    const wsURL = new URL(WEB_BRIDGE_EVENT_PATH, config.url);
    wsURL.protocol = wsURL.protocol === "https:" ? "wss:" : "ws:";
    wsURL.searchParams.set("token", config.token);
    wsURL.searchParams.set("client", clientId);

    const next = new WebSocket(wsURL.toString());
    socket = next;

    next.addEventListener("message", (event) => {
      let frame: WebBridgeEventFrame;
      try {
        frame = JSON.parse(String(event.data)) as WebBridgeEventFrame;
      } catch {
        return;
      }
      listeners
        .get(frame.channel)
        ?.forEach((listener) => listener(null, frame.payload));
    });
    next.addEventListener("close", () => {
      if (socket === next) {
        socket = null;
        ready = null; // ponytail: reconnect on next use, no backoff timer.
      }
    });

    ready = new Promise<void>((resolve, reject) => {
      next.addEventListener("open", () => resolve());
      next.addEventListener("error", () =>
        reject(new Error("Web bridge event socket failed to connect")),
      );
    });
    return ready;
  };

  return {
    invoke: async (channel, ...args) => {
      await ensureSocket();
      const response = await fetch(
        new URL(WEB_BRIDGE_INVOKE_PATH, config.url).toString(),
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            [WEB_BRIDGE_TOKEN_HEADER]: config.token,
            [WEB_BRIDGE_CLIENT_HEADER]: clientId,
          },
          body: JSON.stringify({ channel, args }),
        },
      );

      if (!response.ok) {
        throw new Error(
          `Web bridge rejected "${channel}" (${response.status})`,
        );
      }

      const body = (await response.json()) as WebBridgeInvokeResponse;
      if (!body.ok) throw new Error(body.error);
      return body.data;
    },

    on: (channel, listener) => {
      void ensureSocket();
      const existing = listeners.get(channel) ?? new Set<Listener>();
      existing.add(listener);
      listeners.set(channel, existing);
    },

    removeListener: (channel, listener) => {
      listeners.get(channel)?.delete(listener);
    },
  };
}
