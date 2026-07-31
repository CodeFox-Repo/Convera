/**
 * Wire format shared by the main-process web bridge server and the browser
 * shim. Both sides speak the same channel names as Electron IPC, so the
 * existing `create*API(ipcRenderer)` factories work unchanged over HTTP.
 */

export const WEB_BRIDGE_DEFAULT_PORT = 5200;
export const WEB_BRIDGE_INVOKE_PATH = "/ipc/invoke";
export const WEB_BRIDGE_EVENT_PATH = "/ipc/events";
export const WEB_BRIDGE_TOKEN_HEADER = "x-convera-bridge-token";

export interface WebBridgeInvokeRequest {
  channel: string;
  args: unknown[];
}

export type WebBridgeInvokeResponse =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

export interface WebBridgeEventFrame {
  channel: string;
  payload: unknown;
}
