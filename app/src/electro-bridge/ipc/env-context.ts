import { config } from "dotenv";
import { contextBridge, ipcMain, ipcRenderer } from "electron";
config();

/**
 * Check if the application is running in production mode
 */
function isProduction(): boolean {
  try {
    const nodeEnv = process.env.NODE_ENV;
    if (!nodeEnv || nodeEnv === "production-development") {
      return true;
    }

    const developmentValues = ["development", "dev", "test"];
    return !developmentValues.includes(nodeEnv?.toLowerCase() || "");
  } catch {
    return true; // Default to production for safety
  }
}

/**
 * Setup Environment IPC handlers in main process
 */
export function setupEnvIPC() {
  ipcMain.handle("env:isProduction", () => {
    return isProduction();
  });
}

/**
 * Expose Environment context to renderer process
 */
export function exposeEnvContext() {
  contextBridge.exposeInMainWorld("envApi", {
    isProduction: () => ipcRenderer.invoke("env:isProduction"),
  });
}
