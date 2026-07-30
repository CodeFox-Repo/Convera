/* eslint-disable @typescript-eslint/no-explicit-any */
import { WindowSizeConfig } from "@/electron/windows/window-size";
import { ThemeMode } from "@/shared/types/electron";
import type { LocalAIRuntimeService } from "@/shared/types/local-ai";
import { BrowserWindow, ipcMain, IpcRenderer } from "electron";
import { getAppIcon, getPlatform } from "./active-app-context";
import { CHANNELS, IPCServer, methodChannelMap } from "./channels";
import { setupEnvIPC } from "./env-context";
import {
  closeWindow,
  getClipboardText,
  getCurrentTheme,
  getCurrentWindowPosition,
  getCurrentWindowSize,
  initGlobalShortcut,
  maximizeWindow,
  minimizeWindow,
  modelSelected,
  openPath,
  pasteModifiedContent,
  resizeAndCenterWindow,
  resizeWindow,
  setInputContent,
  setTheme,
  toggleViewMode,
  updateGlobalShortcut,
} from "./ipc-handlers";
import { setupLoggerIPC } from "./logger-context";
import { setupLocalAIIPC } from "./local-ai-context";
import { setupMCPIPC } from "./mcp-context";

// Extended interface that includes additional methods beyond IPCServer
interface ElectronAPI extends IPCServer {
  onFocusChatInput: (callback: () => void) => () => void;
  onAgentListUpdated: (callback: () => void) => () => void;
  onSetInputContent: (
    callback: (content: { text?: string }) => void,
  ) => () => void;
  onThemeChanged: (callback: (theme: string) => void) => () => void;
}

export function createElectronAPI(ipcRenderer: IpcRenderer): ElectronAPI {
  const api = {} as ElectronAPI;

  for (const key in methodChannelMap) {
    if (Object.prototype.hasOwnProperty.call(methodChannelMap, key)) {
      const methodName = key as keyof IPCServer;
      const channel = methodChannelMap[methodName];
      (api as any)[methodName] = (...args: any[]) =>
        ipcRenderer.invoke(channel, ...args);
    }
  }

  api.onFocusChatInput = (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on(CHANNELS.APP.FOCUS_CHAT_INPUT, handler);
    return () => {
      ipcRenderer.removeListener(CHANNELS.APP.FOCUS_CHAT_INPUT, handler);
    };
  };

  api.onAgentListUpdated = (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on(CHANNELS.AGENT.LIST_UPDATED, handler);
    return () => {
      ipcRenderer.removeListener(CHANNELS.AGENT.LIST_UPDATED, handler);
    };
  };

  api.onSetInputContent = (callback: (content: { text?: string }) => void) => {
    const handler = (_: any, content: { text?: string }) => callback(content);
    ipcRenderer.on(CHANNELS.APP.SET_INPUT_CONTENT, handler);
    return () => {
      ipcRenderer.removeListener(CHANNELS.APP.SET_INPUT_CONTENT, handler);
    };
  };

  api.onThemeChanged = (callback: (theme: string) => void) => {
    const handler = (_: any, theme: string) => callback(theme);
    ipcRenderer.on(CHANNELS.THEME.CHANGED, handler);
    return () => {
      ipcRenderer.removeListener(CHANNELS.THEME.CHANGED, handler);
    };
  };

  return api;
}

// Listener options that define what handlers are available for registration
export interface ListenerOptions {
  mainWindow?: () => BrowserWindow | null;
  registerGlobalShortcuts?: () => void;
  localAIRuntime?: LocalAIRuntimeService;
}

/**
 * Setup Electron API IPC handlers
 * This is a cleaner way to register standard Electron API handlers
 */
export function setupElectronAPIIPC(options: ListenerOptions = {}) {
  const { mainWindow, registerGlobalShortcuts } = options;
  // Unified Window Control
  ipcMain.handle(CHANNELS.WINDOW.CLOSE, () => {
    const window = mainWindow?.() || null;
    return closeWindow(window);
  });

  // Global Shortcuts
  ipcMain.handle(CHANNELS.SHORTCUTS.UPDATE, (_event, shortcut: string) => {
    if (!registerGlobalShortcuts) {
      console.warn(
        "registerGlobalShortcuts not provided to setupElectronAPIIPC",
      );
      return false;
    }
    return updateGlobalShortcut(shortcut, registerGlobalShortcuts);
  });

  ipcMain.handle(CHANNELS.SHORTCUTS.INIT, (_event, shortcut: string) => {
    if (!registerGlobalShortcuts) {
      console.warn(
        "registerGlobalShortcuts not provided to setupElectronAPIIPC",
      );
      return false;
    }
    return initGlobalShortcut(shortcut, registerGlobalShortcuts);
  });

  ipcMain.handle(CHANNELS.CLIPBOARD.GET_TEXT, () => {
    return getClipboardText();
  });

  ipcMain.handle(
    CHANNELS.APP.SET_INPUT_CONTENT,
    (_event, content: { text?: string }) => {
      const window = mainWindow?.() || null;
      return setInputContent(window, content);
    },
  );

  ipcMain.handle(
    CHANNELS.APP.PASTE_MODIFIED_CONTENT,
    (_event, content: string) => {
      return pasteModifiedContent(content);
    },
  );

  // Platform detection
  ipcMain.handle(CHANNELS.PLATFORM.GET, getPlatform);

  // Unified Theme Control
  ipcMain.handle(CHANNELS.THEME.SET, (_event, mode: ThemeMode) => {
    return setTheme(mode);
  });

  ipcMain.handle(CHANNELS.THEME.GET_CURRENT, () => {
    return getCurrentTheme();
  });

  // Unified Window Management
  ipcMain.handle(CHANNELS.WINDOW.MINIMIZE, () => {
    const window = mainWindow?.() || null;
    return minimizeWindow(window);
  });

  ipcMain.handle(CHANNELS.WINDOW.MAXIMIZE, () => {
    const window = mainWindow?.() || null;
    return maximizeWindow(window);
  });

  ipcMain.handle(
    CHANNELS.WINDOW.RESIZE,
    (_event, width: number, height: number, preserveX?: boolean) => {
      const window = mainWindow?.() || null;
      return resizeWindow(window, width, height, preserveX);
    },
  );

  ipcMain.handle(
    CHANNELS.WINDOW.RESIZE_AND_CENTER,
    (_event, width: number, height: number) => {
      const window = mainWindow?.() || null;
      return resizeAndCenterWindow(window, width, height);
    },
  );

  ipcMain.handle(CHANNELS.WINDOW.GET_POSITION, () => {
    const window = mainWindow?.() || null;
    return getCurrentWindowPosition(window);
  });

  ipcMain.handle(
    CHANNELS.WINDOW.GET_CURRENT_SIZE,
    (_event, windowConfig: WindowSizeConfig) => {
      return getCurrentWindowSize(windowConfig);
    },
  );

  // View Mode
  ipcMain.handle(CHANNELS.APP.TOGGLE_VIEW_MODE, (_event, expanded: boolean) => {
    const window = mainWindow?.() || null;
    if (!window) {
      console.warn("No chat window available for view mode toggle");
      return false;
    }
    return toggleViewMode(expanded, window);
  });

  // Model functionality
  ipcMain.handle(CHANNELS.MODEL.MODEL_SELECTED, (_event, modelId: string) => {
    const window = mainWindow?.() || null;
    return modelSelected(window, modelId);
  });

  // File operations
  ipcMain.handle(CHANNELS.FILE.OPEN_PATH, (_event, path: string) => {
    return openPath(path);
  });

  // Process icon operations
  ipcMain.handle(CHANNELS.PROCESS_ICON.GET, (_event, appName: string) => {
    return getAppIcon(appName);
  });

  // Model selector and Agent popover now use inline popovers in renderer
  // No separate window IPC handlers needed

  console.log("Electron API IPC handlers registered successfully");
}

// Register all IPC listeners for main process
export function registerListeners(options: ListenerOptions = {}) {
  setupMCPIPC();
  setupLoggerIPC();
  setupElectronAPIIPC(options);
  setupEnvIPC();
  setupLocalAIIPC({
    runtime: options.localAIRuntime,
    getAllowedWebContents: () => {
      const window = options.mainWindow?.();
      return window && !window.isDestroyed() ? window.webContents : null;
    },
  });
  console.log("All IPC listeners registered successfully");
}
