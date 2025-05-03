import { contextBridge, ipcRenderer } from "electron";
import { createElectronAPI } from "./helpers/ipc/listeners-register";
import { CHANNELS } from "./helpers/ipc/channels";

// SOURCE(Sma1lboy): https://www.electronjs.org/docs/latest/tutorial/process-model
// expose electronAPI to renderer process
contextBridge.exposeInMainWorld("electronAPI", {
  ...createElectronAPI(ipcRenderer),
  getPlatform: () => process.platform,
});

// Listen for the custom event to relay agent list updates via IPC
window.addEventListener("agent-list-updated-ipc", () => {
  console.log("Sending agent-list-updated IPC message from preload script");
  ipcRenderer.send(CHANNELS.AGENT.LIST_UPDATED);
});
