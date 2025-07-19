/* eslint-disable @typescript-eslint/no-explicit-any */
import { WindowSizeConfig } from "@/electron/windows/window-size";
import { ThemeMode, WindowType } from "@/shared/types/electron";
import { BrowserWindow, ipcMain, IpcRenderer } from "electron";
import { CHANNELS, IPCServer, methodChannelMap } from "./channels";
import { setupEnvIPC } from "./env-context";
import {
  closeWindow,
  getClipboardText,
  getCurrentTheme,
  getCurrentWindowPosition,
  getCurrentWindowSize,
  getPlatform,
  getPreviousApp,
  getPreviousAppContent,
  getPreviousAppID,
  hideAgentPopoverWindow,
  hideModelSelectorWindow,
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
  toggleAgentPopoverWindow,
  toggleModelSelectorWindow,
  toggleViewMode,
  toggleWindow,
  updateGlobalShortcut,
} from "./ipc-handlers";
import { setupLoggerIPC } from "./logger-context";
import { setupMCPIPC } from "./mcp-context";

// Extended interface that includes additional methods beyond IPCServer
interface ElectronAPI extends IPCServer {
  onFocusChatInput: (callback: () => void) => () => void;
  onAppChanged: (
    callback: (appName: string, appId?: number) => void,
  ) => () => void;
  onToggleSettings: (callback: () => void) => () => void;
  onAgentListUpdated: (callback: () => void) => () => void;
  onSetInputContent: (
    callback: (content: { text?: string; imageData?: string }) => void,
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

  api.onAppChanged = (callback: (appName: string, appId?: number) => void) => {
    const handler = (_: any, appName: string, appId?: number) =>
      callback(appName, appId);
    ipcRenderer.on(CHANNELS.APP.APP_CHANGED, handler);
    return () => {
      ipcRenderer.removeListener(CHANNELS.APP.APP_CHANGED, handler);
    };
  };

  api.onToggleSettings = (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on(CHANNELS.SETTINGS.TOGGLE, handler);
    return () => {
      ipcRenderer.removeListener(CHANNELS.SETTINGS.TOGGLE, handler);
    };
  };

  api.onAgentListUpdated = (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on(CHANNELS.AGENT.LIST_UPDATED, handler);
    return () => {
      ipcRenderer.removeListener(CHANNELS.AGENT.LIST_UPDATED, handler);
    };
  };

  api.onSetInputContent = (
    callback: (content: { text?: string; imageData?: string }) => void,
  ) => {
    const handler = (_: any, content: { text?: string; imageData?: string }) =>
      callback(content);
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
  chatWindow?: () => BrowserWindow | null;
  registerGlobalShortcuts?: () => void;
}

/**
 * Setup Electron API IPC handlers
 * This is a cleaner way to register standard Electron API handlers
 */
export function setupElectronAPIIPC(options: ListenerOptions = {}) {
  const { chatWindow, registerGlobalShortcuts } = options;

  // Unified Window Control
  ipcMain.handle(CHANNELS.WINDOW.TOGGLE, (_event, type: WindowType) => {
    return toggleWindow(type);
  });

  ipcMain.handle(CHANNELS.WINDOW.CLOSE, () => {
    const window = chatWindow?.() || null;
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

  // App functionality
  ipcMain.handle(CHANNELS.APP.GET_PREVIOUS, () => {
    return getPreviousApp();
  });

  ipcMain.handle(CHANNELS.APP.GET_PREVIOUS_ID, () => {
    return getPreviousAppID();
  });

  ipcMain.handle(CHANNELS.APP.GET_PREVIOUS_CONTENT, () => {
    return getPreviousAppContent();
  });

  ipcMain.handle(CHANNELS.CLIPBOARD.GET_TEXT, () => {
    return getClipboardText();
  });

  ipcMain.handle(
    CHANNELS.APP.SET_INPUT_CONTENT,
    (_event, content: { text?: string; imageData?: string }) => {
      const window = chatWindow?.() || null;
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
  ipcMain.handle(CHANNELS.PLATFORM.GET, () => {
    return getPlatform();
  });

  // Unified Theme Control
  ipcMain.handle(CHANNELS.THEME.SET, (_event, mode: ThemeMode) => {
    return setTheme(mode);
  });

  ipcMain.handle(CHANNELS.THEME.GET_CURRENT, () => {
    return getCurrentTheme();
  });

  // Unified Window Management
  ipcMain.handle(CHANNELS.WINDOW.MINIMIZE, () => {
    const window = chatWindow?.() || null;
    return minimizeWindow(window);
  });

  ipcMain.handle(CHANNELS.WINDOW.MAXIMIZE, () => {
    const window = chatWindow?.() || null;
    return maximizeWindow(window);
  });

  ipcMain.handle(
    CHANNELS.WINDOW.RESIZE,
    (_event, width: number, height: number, preserveX?: boolean) => {
      const window = chatWindow?.() || null;
      return resizeWindow(window, width, height, preserveX);
    },
  );

  ipcMain.handle(
    CHANNELS.WINDOW.RESIZE_AND_CENTER,
    (_event, width: number, height: number) => {
      const window = chatWindow?.() || null;
      return resizeAndCenterWindow(window, width, height);
    },
  );

  ipcMain.handle(CHANNELS.WINDOW.GET_POSITION, () => {
    const window = chatWindow?.() || null;
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
    const window = chatWindow?.() || null;
    if (!window) {
      console.warn("No chat window available for view mode toggle");
      return false;
    }
    return toggleViewMode(expanded, window);
  });

  // Model functionality
  ipcMain.handle(CHANNELS.MODEL.MODEL_SELECTED, (_event, modelId: string) => {
    const window = chatWindow?.() || null;
    return modelSelected(window, modelId);
  });

  // File operations
  ipcMain.handle(CHANNELS.FILE.OPEN_PATH, (_event, path: string) => {
    return openPath(path);
  });

  // Model selector functionality
  ipcMain.handle(
    CHANNELS.MODEL.TOGGLE_SELECTOR,
    (_event, x?: number, y?: number, width?: number, height?: number) => {
      return toggleModelSelectorWindow(x, y, width, height);
    },
  );

  ipcMain.handle(CHANNELS.MODEL.HIDE_SELECTOR, () => {
    return hideModelSelectorWindow();
  });

  // Agent popover functionality
  ipcMain.handle(
    CHANNELS.AGENT.TOGGLE_POPOVER,
    (_event, x?: number, y?: number, width?: number, height?: number) => {
      return toggleAgentPopoverWindow(x, y, width, height);
    },
  );

  ipcMain.handle(CHANNELS.AGENT.HIDE_POPOVER, () => {
    return hideAgentPopoverWindow();
  });

  console.log("Electron API IPC handlers registered successfully");
}

// Register all IPC listeners for main process
export function registerListeners(options: ListenerOptions = {}) {
  setupMCPIPC();
  setupLoggerIPC();
  setupElectronAPIIPC(options);
  setupEnvIPC();
  console.log("All IPC listeners registered successfully");
}
