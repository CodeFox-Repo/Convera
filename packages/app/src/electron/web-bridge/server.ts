import { getLogger } from "@/electron/logger";
import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import {
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

export interface WebBridgeOptions {
  /** Dispatch an invoke to the already-registered ipcMain handler. */
  invoke: (channel: string, args: unknown[]) => Promise<unknown>;
  port?: number;
  host?: string;
  /** Renderer dev server URL, used to print a ready-to-open browser link. */
  rendererURL?: string;
  /**
   * Reuse this token instead of generating one. The dev harness persists it
   * across restarts so an open tab keeps working; production callers omit it
   * and get a fresh random token per launch.
   */
  token?: string;
}

export interface WebBridgeHandle {
  url: string;
  token: string;
  /** Renderer URL with bridge + token already attached. */
  browserURL: string;
  /** Push an event frame to every connected browser client. */
  emit: (channel: string, payload: unknown) => void;
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
    "access-control-allow-headers": "content-type, x-convera-bridge-token",
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
  const clients = new Set<WebSocket>();

  const authorize = (
    tokenHeader: string | string[] | undefined,
    origin: string | undefined,
  ): boolean => {
    const provided = Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader;
    if (!provided || !tokensMatch(provided, token)) return false;
    return isAllowedOrigin(origin);
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

      try {
        const data = await options.invoke(
          invokeRequest.channel,
          invokeRequest.args,
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
    if (
      url.pathname !== WEB_BRIDGE_EVENT_PATH ||
      !authorize(
        url.searchParams.get("token") ?? undefined,
        request.headers.origin,
      )
    ) {
      socket.destroy();
      return;
    }
    wsServer.handleUpgrade(request, socket, head, (ws) => {
      clients.add(ws);
      ws.on("close", () => clients.delete(ws));
      ws.on("error", () => clients.delete(ws));
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
  browserURL.searchParams.set("bridge", url);
  browserURL.searchParams.set("token", token);
  console.log(
    `\n  Convera is ready in the browser:\n\n  ${browserURL}\n\n  (bridge on ${url} — the token in that link is what authorizes this tab)\n`,
  );

  return {
    url,
    token,
    browserURL: browserURL.toString(),
    emit: (channel, payload) => {
      if (!ALLOWED_EVENT_CHANNELS.has(channel)) return;
      const frame: WebBridgeEventFrame = { channel, payload };
      const message = JSON.stringify(frame);
      clients.forEach((client) => {
        try {
          client.send(message);
        } catch {
          clients.delete(client);
        }
      });
    },
    close: async () => {
      clients.forEach((client) => client.close());
      clients.clear();
      wsServer.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}
