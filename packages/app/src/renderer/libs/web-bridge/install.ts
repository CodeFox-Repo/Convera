import { createLocalAIAPI } from "@/electro-bridge/ipc/local-ai-api";
import { createMcpAPI } from "@/electro-bridge/ipc/mcp-api";
import { createAgentHostAPI } from "@/electro-bridge/ipc/agent-host-api";
import { createWebBridgeIPC, readWebBridgeConfig } from "./ipc-shim";

/**
 * In a plain browser there is no preload, so `window.localAI` / `window.mcpAPI`
 * are missing. Build them from the HTTP shim instead — same factories the
 * preload uses, so the app code below cannot tell the difference.
 *
 * Everything else (window controls, clipboard, global shortcuts, robotjs) has
 * no browser meaning and stays undefined; call sites already guard on it.
 */
export function installWebBridge(): boolean {
  // Under Electron the preload already ran; nothing to do.
  if (typeof window === "undefined" || window.localAI) return false;

  const config = readWebBridgeConfig();
  if (!config) {
    // Without this the UI just says "Local AI runtime is not available",
    // which is true but gives no way to fix it.
    console.warn(
      [
        "Convera: no web bridge configured, so chat is disabled.",
        "Start the app with CONVERA_WEB_BRIDGE=1 pnpm start, then reopen this",
        "page using the URL it prints (it carries the ?token=... this tab needs).",
      ].join(" "),
    );
    return false;
  }

  const ipc = createWebBridgeIPC(config);
  window.localAI = createLocalAIAPI(ipc);
  window.mcpAPI = createMcpAPI(ipc);
  // Without this the browser build reports "Agent Host unavailable" and no
  // agent ever runs — the backend is there, only the client half was missing.
  window.agentHost = createAgentHostAPI(ipc);

  if (!window.logger) {
    // ponytail: console is the browser's logger; no round trip to the main process.
    const level =
      (name: string, method: "debug" | "info" | "warn" | "error") =>
      (message: string, data?: unknown) => {
        console[method](`[${name}]`, message, data ?? "");
        return Promise.resolve();
      };
    window.logger = {
      getLogger: (name = "default") => ({
        debug: level(name, "debug"),
        info: level(name, "info"),
        warn: level(name, "warn"),
        error: level(name, "error"),
      }),
    };
  }

  if (!window.envApi) {
    // ponytail: the browser bridge is a dev tool; nothing here is production.
    window.envApi = { isProduction: () => false };
  }

  // Electron gets its backdrop from the window (vibrancy); a browser has no
  // window layer, so the app's transparent frame renders as black edges.
  document.documentElement.classList.add("web-host");

  console.info(`Convera web bridge connected to ${config.url}`);
  return true;
}

installWebBridge();
