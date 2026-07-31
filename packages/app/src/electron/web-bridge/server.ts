import { getLogger } from "@/electron/logger";
import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { WebBridgeSender } from "./dispatch";
import {
  WEB_BRIDGE_CLIENT_HEADER,
  WEB_BRIDGE_DEFAULT_PORT,
  WEB_BRIDGE_EVENT_PATH,
  WEB_BRIDGE_INVOKE_PATH,
  type WebBridgeEventFrame,
  type WebBridgeInvokeRequest,
  type WebBridgeInvokeResponse,
} from "@/shared/web-bridge/protocol";

const logger = getLogger("web-bridge");

const MAX_BODY_BYTES = 8 * 1024 * 1024;

/**
 * Channels the browser is allowed to reach. Window control, clipboard and
 * global shortcuts are deliberately absent — they are meaningless outside
 * Electron, and every extra channel here is extra attack surface.
 */
const ALLOWED_INVOKE_CHANNELS = new Set([
  "local-ai:list-providers",
  "local-ai:get-provider-status",
  "local-ai:start-chat",
  "local-ai:abort",
  "local-ai:respond-interaction",
  "local-ai:get-conversation-runtime-state",
  "local-ai:get-turn-runtime-state",
  "local-ai:acknowledge-turn-persistence",
  "local-ai:quiesce-conversation",
  "local-ai:resume-conversation",
  "local-ai:branch-conversation",
  "local-ai:delete-conversation",
  "local-ai:reset-conversation-provider-session",
  "local-ai:get-memory-settings",
  "local-ai:update-memory-settings",
  "local-ai:get-memory-status",
  "mcp:getServers",
  "mcp:getAllTools",
  "mcp:startServer",
  "mcp:stopServer",
  "mcp:getConfigurations",
  "mcp:addServer",
  "mcp:updateServer",
  "mcp:removeServer",
  "mcp:callTool",
  "mcp:mcpToolCall",
  "mcp:getAllNonInputParamTool",
]);

/** Channels the main process may push to the browser. */
const ALLOWED_EVENT_CHANNELS = new Set(["local-ai:event"]);

/** How long a dropped tab may reconnect before its stream is abandoned. */
const DEFAULT_RECONNECT_GRACE_MS = 15_000;

export interface WebBridgeOptions {
  /** Dispatch an invoke to the already-registered ipcMain handler. */
  invoke: (
    channel: string,
    args: unknown[],
    sender: WebBridgeSender,
  ) => Promise<unknown>;
  port?: number;
  host?: string;
  /** Renderer dev server URL, used to print a ready-to-open browser link. */
  rendererURL?: string;
  /**
   * Grace period before a disconnected tab's in-flight requests are aborted.
   * A reconnect inside it keeps the stream alive; tests set 0 to assert the
   * abandon path without waiting.
   */
  reconnectGraceMs?: number;
  /**
   * Reuse this token instead of generating one; production callers omit it
   * and get a fresh random token per launch.
   */
  token?: string;
  /**
   * Local dev runs tokenless: it is a localhost app, and the loopback Origin
   * check already turns away cross-site pages. Electron keeps tokens on.
   */
  requireToken?: boolean;
}

export interface WebBridgeHandle {
  url: string;
  token: string;
  /** Renderer URL with bridge + token already attached. */
  browserURL: string;
  /** Live sender identities accepted by local-ai-context. */
  senders: () => WebBridgeSender[];
  close: () => Promise<void>;
}

export function isWebBridgeEnabled(): boolean {
  return process.env.CONVERA_WEB_BRIDGE === "1";
}

function tokensMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Reject cross-origin callers. Combined with binding to loopback this is what
 * stops a random page on the machine from driving the local CLI agents:
 * a browser will not let a page on evil.com set Origin, and a null/absent
 * Origin (curl) still needs the token.
 */
function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // non-browser caller; token check still applies
  try {
    // ponytail: any loopback port is fine — the vite dev port is not fixed.
    const { hostname } = new URL(origin);
    return hostname === "127.0.0.1" || hostname === "localhost";
  } catch {
    return false;
  }
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function sendJSON(response: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers":
      "content-type, x-convera-bridge-token, x-convera-bridge-client",
    "access-control-allow-methods": "POST, OPTIONS",
  });
  response.end(payload);
}

function parseInvokeRequest(raw: string): WebBridgeInvokeRequest | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const candidate = parsed as Record<string, unknown>;
  if (typeof candidate.channel !== "string") return null;
  if (candidate.args !== undefined && !Array.isArray(candidate.args)) {
    return null;
  }
  return {
    channel: candidate.channel,
    args: (candidate.args as unknown[]) ?? [],
  };
}

export async function startWebBridge(
  options: WebBridgeOptions,
): Promise<WebBridgeHandle> {
  const host = options.host ?? "127.0.0.1";
  const port =
    options.port ??
    Number(process.env.CONVERA_WEB_BRIDGE_PORT ?? WEB_BRIDGE_DEFAULT_PORT);
  const token = options.token ?? randomBytes(24).toString("hex");
  const clients = new Map<
    string,
    { socket: WebSocket; sender: WebBridgeSender }
  >();

  const requireToken = options.requireToken ?? true;
  const reconnectGraceMs =
    options.reconnectGraceMs ?? DEFAULT_RECONNECT_GRACE_MS;
  const authorize = (
    tokenHeader: string | string[] | undefined,
    origin: string | undefined,
  ): boolean => {
    if (!isAllowedOrigin(origin)) return false;
    if (!requireToken) return true;
    const provided = Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader;
    return !!provided && tokensMatch(provided, token);
  };

  const httpServer = createServer((request, response) => {
    if (request.method === "OPTIONS") {
      sendJSON(response, 204, {});
      return;
    }
    if (request.method !== "POST" || request.url !== WEB_BRIDGE_INVOKE_PATH) {
      sendJSON(response, 404, { error: "Not found" });
      return;
    }
    if (
      !authorize(
        request.headers["x-convera-bridge-token"],
        request.headers.origin,
      )
    ) {
      sendJSON(response, 403, { error: "Forbidden" });
      return;
    }

    void (async () => {
      let invokeRequest: WebBridgeInvokeRequest | null = null;
      try {
        invokeRequest = parseInvokeRequest(await readBody(request));
      } catch (error) {
        sendJSON(response, 413, { error: String(error) });
        return;
      }

      if (!invokeRequest) {
        sendJSON(response, 400, { error: "Malformed invoke request" });
        return;
      }
      if (!ALLOWED_INVOKE_CHANNELS.has(invokeRequest.channel)) {
        sendJSON(response, 403, {
          error: `Channel "${invokeRequest.channel}" is not exposed over the web bridge`,
        });
        return;
      }

      const clientHeader = request.headers[WEB_BRIDGE_CLIENT_HEADER];
      const clientId = Array.isArray(clientHeader)
        ? clientHeader[0]
        : clientHeader;
      const client =
        typeof clientId === "string" ? clients.get(clientId) : undefined;
      if (!client || client.sender.isDestroyed()) {
        sendJSON(response, 409, {
          error: "A live event socket is required before invoking IPC",
        });
        return;
      }

      try {
        const data = await options.invoke(
          invokeRequest.channel,
          invokeRequest.args,
          client.sender,
        );
        sendJSON(response, 200, {
          ok: true,
          data,
        } satisfies WebBridgeInvokeResponse);
      } catch (error) {
        sendJSON(response, 200, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        } satisfies WebBridgeInvokeResponse);
      }
    })();
  });

  const wsServer = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", `http://${host}:${port}`);
    const clientId = url.searchParams.get("client") ?? "";
    if (
      url.pathname !== WEB_BRIDGE_EVENT_PATH ||
      !/^[A-Za-z0-9_-]{16,128}$/.test(clientId) ||
      !authorize(
        url.searchParams.get("token") ?? undefined,
        request.headers.origin,
      )
    ) {
      socket.destroy();
      return;
    }
    wsServer.handleUpgrade(request, socket, head, (ws) => {
      const emit = (channel: string, payload: unknown) => {
        if (!ALLOWED_EVENT_CHANNELS.has(channel) || ws.readyState !== ws.OPEN) {
          return;
        }
        const frame: WebBridgeEventFrame = { channel, payload };
        ws.send(JSON.stringify(frame));
      };

      // Same tab, new socket: keep the sender so an in-flight turn keeps
      // streaming instead of being orphaned mid-reply.
      const previous = clients.get(clientId);
      previous?.socket.close();
      const sender = previous?.sender.isDestroyed() === false
        ? previous.sender
        : new WebBridgeSender(emit);
      sender.rebind(emit);
      const client = { socket: ws, sender };
      clients.set(clientId, client);
      // Don't tear the sender down the instant the socket drops: a reconnect
      // within the grace window reuses it, so a turn in flight survives an HMR
      // reload or a sleeping laptop. Only a tab that stays gone is abandoned,
      // which is what aborts its requests.
      const disconnect = () => {
        if (clients.get(clientId) !== client) return;
        const timer = setTimeout(() => {
          if (clients.get(clientId) !== client) return;
          clients.delete(clientId);
          sender.destroy();
        }, reconnectGraceMs);
        timer.unref?.();
      };
      ws.once("close", disconnect);
      ws.once("error", disconnect);
    });
  });

  // Fall forward when the port is taken, the way vite does — a second dev
  // instance should just work rather than crash on EADDRINUSE.
  const boundPort = await new Promise<number>((resolve, reject) => {
    let candidate = port;

    const onError = (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE" && candidate < port + 20) {
        candidate += 1;
        httpServer.listen(candidate, host);
        return;
      }
      reject(error);
    };

    httpServer.on("error", onError);
    httpServer.listen(candidate, host, () => {
      httpServer.removeListener("error", onError);
      resolve(candidate);
    });
  });

  const url = `http://${host}:${boundPort}`;
  logger.info(`Web bridge listening on ${url}`);

  // Print the whole link, not just the token: without the query string the
  // page loads but installs nothing, and the UI can only say "runtime is not
  // available". The token never leaves this machine.
  const rendererURL = options.rendererURL ?? "http://localhost:5199/";
  const browserURL = new URL(rendererURL);
  if (requireToken) {
    browserURL.searchParams.set("bridge", url);
    browserURL.searchParams.set("token", token);
  }
  console.log(
    `\n  Convera is ready in the browser:\n\n  ${browserURL}\n\n  (bridge on ${url} — the token in that link is what authorizes this tab)\n`,
  );

  return {
    url,
    token,
    browserURL: browserURL.toString(),
    senders: () => [...clients.values()].map((client) => client.sender),
    close: async () => {
      clients.forEach(({ socket, sender }) => {
        sender.destroy();
        socket.terminate();
      });
      clients.clear();
      wsServer.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}
