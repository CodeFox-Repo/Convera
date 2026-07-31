/**
 * `pnpm dev:web` — the whole browser dev loop in one command.
 *
 * Starts the renderer dev server and the web bridge together, wires them to
 * each other, and prints one ready-to-open link. Nothing to configure.
 *
 * The bridge runs the real local AI runtime (Claude Code / Codex CLI), so this
 * is a working app in a browser tab — not a mock. Electron is not involved,
 * which is what makes it usable from a non-TTY shell and from an agent.
 *
 * ponytail: dev-only. `CONVERA_WEB_BRIDGE=1 pnpm start` is still the path for
 * the real Electron window, where MCP and the OS integrations exist.
 */
import { config as loadDotenv } from "dotenv";
loadDotenv();

import { LocalAiRuntime } from "@/electron/ai";
import { setupLocalAIIPC } from "@/electro-bridge/ipc/local-ai-context";
import {
  createRecordingIpcMain,
  createWebBridgeEvent,
} from "@/electron/web-bridge/dispatch";
import {
  startWebBridge,
  type WebBridgeHandle,
} from "@/electron/web-bridge/server";
import type { IpcMain } from "electron";
import { createServer } from "vite";

const RENDERER_PORT = Number(process.env.CONVERA_RENDERER_PORT ?? 5199);

process.env.NODE_ENV ??= "production-development";

// Renderer first: it picks the port, so the printed link is always correct
// even when 5199 is taken and vite falls forward to 5200+.
const renderer = await createServer({
  configFile: new URL("../vite.renderer.config.mts", import.meta.url).pathname,
  server: { port: RENDERER_PORT },
});
await renderer.listen();

const rendererURL = renderer.resolvedUrls?.local[0];
if (!rendererURL) throw new Error("Renderer dev server reported no URL");

const runtime = new LocalAiRuntime({
  // ponytail: no MCP hub — it needs Electron's `app` paths. Builtin tools
  // cover the chat loop; run the Electron app when you need MCP servers.
  getToolGroups: async () => [],
  executeTool: async () => {
    throw new Error("MCP tools require the full Electron app");
  },
});

const recordingIPC = createRecordingIpcMain({
  handle: () => {},
  removeHandler: () => {},
} as unknown as IpcMain);

// The bridge owns one sender per connected tab and routes stream events
// through it. Standing up a separate sender here would emit into nothing —
// which is exactly what happened: replies streamed nowhere and only appeared
// after a reload re-read the persisted turn.
// A holder rather than a bare `let`: the closure below reads it after the
// bridge exists, but nothing reassigns the binding itself.
const handle: { bridge?: WebBridgeHandle } = {};

setupLocalAIIPC(
  {
    runtime,
    getAllowedWebContents: () =>
      (handle.bridge?.senders() ?? []).map((sender) => sender as never),
  },
  recordingIPC,
);

handle.bridge = await startWebBridge({
  requireToken: false,
  rendererURL,
  invoke: (channel, args, sender) =>
    recordingIPC.dispatch(channel, args, createWebBridgeEvent(sender)),
});

const shutdown = () => {
  void Promise.allSettled([handle.bridge?.close(), renderer.close()]).then(() =>
    process.exit(0),
  );
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
