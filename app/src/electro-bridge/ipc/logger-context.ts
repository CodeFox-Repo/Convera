import { contextBridge, ipcMain, ipcRenderer } from "electron";
import { log } from "../../electron/logger";

export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Setup Logger IPC handlers in main process
 */
export function setupLoggerIPC() {
  // Simple log message handler
  ipcMain.handle(
    "logger:log",
    async (
      _,
      level: LogLevel,
      name: string,
      message: string,
      data?: unknown,
    ) => {
      try {
        log(level, name, message, data);
        return { success: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  );

  console.log("Simple Logger IPC handlers registered");
}

/**
 * Expose Logger context to renderer process
 */
export function exposeLoggerContext() {
  // Create a convenient logger interface
  contextBridge.exposeInMainWorld("logger", {
    getLogger: (name: string = "default") => ({
      debug: (message: string, data?: unknown) =>
        ipcRenderer.invoke("logger:log", "debug", name, message, data),
      info: (message: string, data?: unknown) =>
        ipcRenderer.invoke("logger:log", "info", name, message, data),
      warn: (message: string, data?: unknown) =>
        ipcRenderer.invoke("logger:log", "warn", name, message, data),
      error: (message: string, data?: unknown) =>
        ipcRenderer.invoke("logger:log", "error", name, message, data),
    }),
  });
}
