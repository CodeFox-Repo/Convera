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
import { LocalAiRuntime } from "@/electron/ai";
import { setupLocalAIIPC } from "@/electro-bridge/ipc/local-ai-context";
import {
  createRecordingIpcMain,
  createWebBridgeEvent,
  WebBridgeSender,
} from "@/electron/web-bridge/dispatch";
import {
  startWebBridge,
  type WebBridgeHandle,
} from "@/electron/web-bridge/server";
import type { IpcMain } from "electron";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

// Deferred lookup: the sender exists before the bridge it emits through.
const emit = { to: undefined as WebBridgeHandle["emit"] | undefined };
const sender = new WebBridgeSender((channel, payload) =>
  emit.to?.(channel, payload),
);

setupLocalAIIPC(
  { runtime, getAllowedWebContents: () => [sender as never] },
  recordingIPC,
);

// A stable dev token: restarting the harness must not strand open tabs.
const tokenFile = join(tmpdir(), "convera-web-bridge-dev-token");
let devToken: string | undefined;
try {
  devToken = readFileSync(tokenFile, "utf8").trim() || undefined;
} catch {
  devToken = undefined;
}
if (!devToken) {
  devToken = randomBytes(24).toString("hex");
  writeFileSync(tokenFile, devToken);
}

const bridge = await startWebBridge({
  token: devToken,
  rendererURL,
  invoke: (channel, args) =>
    recordingIPC.dispatch(channel, args, createWebBridgeEvent(sender)),
});

emit.to = bridge.emit;

const shutdown = () => {
  sender.destroy();
  void Promise.allSettled([bridge.close(), renderer.close()]).then(() =>
    process.exit(0),
  );
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
