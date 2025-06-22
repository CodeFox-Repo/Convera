import { contextBridge, ipcRenderer } from "electron";
import { CHANNELS } from "./electro-bridge/ipc/channels";
import { exposeEnvContext } from "./electro-bridge/ipc/env-context";
import { createElectronAPI } from "./electro-bridge/ipc/listeners-register";
import { exposeMCPContext } from "./electro-bridge/ipc/mcp-context";

// SOURCE(Sma1lboy): https://www.electronjs.org/docs/latest/tutorial/process-model
// expose electronAPI to renderer process
contextBridge.exposeInMainWorld("electronAPI", createElectronAPI(ipcRenderer));

// Expose MCP API to renderer process
exposeMCPContext();

// Expose Environment API to renderer process (separate from electronAPI)
exposeEnvContext();

// Listen for the custom event to relay agent list updates via IPC
window.addEventListener("agent-list-updated-ipc", () => {
  console.log("Sending agent-list-updated IPC message from preload script");
  ipcRenderer.send(CHANNELS.AGENT.LIST_UPDATED);
});
