import { contextBridge, ipcRenderer } from "electron";
import { CHANNELS } from "./electro-bridge/ipc/channels";
import { createElectronAPI } from "./electro-bridge/ipc/listeners-register";
import { exposeMCPContext } from "./electron/bridge/ipc/mcp";

// SOURCE(Sma1lboy): https://www.electronjs.org/docs/latest/tutorial/process-model
// expose electronAPI to renderer process
contextBridge.exposeInMainWorld("electronAPI", createElectronAPI(ipcRenderer));

// Expose MCP API to renderer process
exposeMCPContext();

// Listen for the custom event to relay agent list updates via IPC
window.addEventListener("agent-list-updated-ipc", () => {
  console.log("Sending agent-list-updated IPC message from preload script");
  ipcRenderer.send(CHANNELS.AGENT.LIST_UPDATED);
});
