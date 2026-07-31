import { contextBridge, ipcRenderer } from "electron";
import { CHANNELS } from "./electro-bridge/ipc/channels";
import { exposeEnvContext } from "./electro-bridge/ipc/env-context";
import { createElectronAPI } from "./electro-bridge/ipc/listeners-register";
import { exposeLoggerContext } from "./electro-bridge/ipc/logger-context";
import { exposeLocalAIContext } from "./electro-bridge/ipc/local-ai-context";
import { exposeMCPContext } from "./electro-bridge/ipc/mcp-context";
import { createAgentHostAPI } from "./electro-bridge/ipc/agent-host-api";

// SOURCE(Sma1lboy): https://www.electronjs.org/docs/latest/tutorial/process-model
// expose electronAPI to renderer process
const electronAPI = createElectronAPI(ipcRenderer);

// Add navigate-to-settings listener
const extendedAPI = {
  ...electronAPI,
  onNavigateToSettings: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("navigate-to-settings", handler);
    return () => {
      ipcRenderer.removeListener("navigate-to-settings", handler);
    };
  },
};

contextBridge.exposeInMainWorld("electronAPI", extendedAPI);

// Expose MCP API to renderer process
exposeMCPContext();

// Expose Logger API to renderer process
exposeLoggerContext();

// Expose Environment API to renderer process (separate from electronAPI)
exposeEnvContext();

// Expose local AI API to renderer process
exposeLocalAIContext();
contextBridge.exposeInMainWorld("agentHost", createAgentHostAPI(ipcRenderer));

// Expose Platform API to renderer process
contextBridge.exposeInMainWorld("platformAPI", {
  getPlatform: () => ipcRenderer.invoke(CHANNELS.PLATFORM.GET),
});

// Listen for the custom event to relay agent list updates via IPC
window.addEventListener("agent-list-updated-ipc", () => {
  console.log("Sending agent-list-updated IPC message from preload script");
  ipcRenderer.send(CHANNELS.AGENT.LIST_UPDATED);
});
