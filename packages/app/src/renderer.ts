// Must come first: populates window.localAI / window.mcpAPI when running in a
// plain browser, before any app module reads them. No-op under Electron.
import "@/renderer/libs/web-bridge/install";
import "@/renderer/app";
