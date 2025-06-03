/* eslint-disable @typescript-eslint/no-explicit-any */
import { WindowSizeConfig } from "@/electron/windows/window-size";
import { BrowserWindow, ipcMain, IpcRenderer } from "electron";
import { CHANNELS, IPCServer, methodChannelMap } from "./channels";
import {
  closeSettingsWindow,
  closeWindow,
  getClipboardText,
  getCurrentTheme,
  getCurrentWindowPosition,
  getCurrentWindowSize,
  getPreviousApp,
  getPreviousAppID,
  initGlobalShortcut,
  maximizeWindow,
  minimizeWindow,
  modelSelected,
  openPath,
  pasteModifiedContent,
  resizeMessageContent,
  resizeWindow,
  setDarkTheme,
  setLightTheme,
  setSystemTheme,
  toggleAgentPopover,
  toggleModelSelector,
  toggleSettingsWindow,
  toggleTheme,
  toggleViewMode,
  toggleWindow,
  updateGlobalShortcut,
} from "./ipc-handlers";

// Extended interface that includes additional methods beyond IPCServer
interface ElectronAPI extends IPCServer {
  onFocusChatInput: (callback: () => void) => () => void;
  onAppChanged: (
    callback: (appName: string, appId?: number) => void,
  ) => () => void;
  onToggleSettings: (callback: () => void) => () => void;
  onAgentListUpdated: (callback: () => void) => () => void;
  onSetInputText: (callback: (text: string) => void) => () => void;
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

  api.onSetInputText = (callback: (text: string) => void) => {
    const handler = (_: any, text: string) => callback(text);
    ipcRenderer.on(CHANNELS.APP.SET_INPUT_TEXT, handler);
    return () => {
      ipcRenderer.removeListener(CHANNELS.APP.SET_INPUT_TEXT, handler);
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

export type ListenerOptions = {
  createSettingsWindow: () => void;
  settingsWindow: BrowserWindow | null;
  createHistoryWindow: () => void;
  historyWindow: BrowserWindow | null;
  registerGlobalShortcuts: () => void;
  createAgentPopoverWindow?: (
    x: number,
    y: number,
    width?: number,
    height?: number,
  ) => BrowserWindow | null | undefined;
  agentPopoverWindow?: BrowserWindow | null;
  createModelSelectorWindow?: (
    x: number,
    y: number,
    width?: number,
    height?: number,
  ) => BrowserWindow | null | undefined;
  modelSelectorWindow?: BrowserWindow | null;
};

export default function registerListeners(
  mainWindow: BrowserWindow,
  options: ListenerOptions,
) {
  console.log("Registering IPC listeners...");

  ipcMain.handle(CHANNELS.SETTINGS.TOGGLE, () => {
    console.log("Handling SETTINGS.TOGGLE");
    toggleSettingsWindow(options.settingsWindow, options.createSettingsWindow);
  });

  ipcMain.handle(CHANNELS.SETTINGS.CLOSE, () => {
    console.log("Handling SETTINGS.CLOSE");
    console.log("Settings window:", options.settingsWindow);
    closeSettingsWindow(options.settingsWindow);
  });

  ipcMain.handle(CHANNELS.HISTORY.OPEN, () => {
    console.log("Handling HISTORY.OPEN");
    toggleWindow(options.historyWindow, options.createHistoryWindow);
  });

  ipcMain.handle(CHANNELS.HISTORY.CLOSE, () => {
    console.log("Handling HISTORY.CLOSE");
    toggleWindow(options.historyWindow);
  });

  ipcMain.handle(
    CHANNELS.SETTINGS.UPDATE_SHORTCUT,
    (event, shortcut: string) => {
      console.log(`Handling SETTINGS.UPDATE_SHORTCUT with: ${shortcut}`);
      return updateGlobalShortcut(shortcut, options.registerGlobalShortcuts);
    },
  );

  ipcMain.handle(CHANNELS.SETTINGS.INIT_SHORTCUT, (event, shortcut: string) => {
    console.log(`Handling SETTINGS.INIT_SHORTCUT with: ${shortcut}`);
    return initGlobalShortcut(shortcut, options.registerGlobalShortcuts);
  });

  ipcMain.handle(CHANNELS.APP.GET_PREVIOUS, () => {
    console.log("Handling APP.GET_PREVIOUS");
    return getPreviousApp();
  });

  ipcMain.handle(CHANNELS.APP.GET_PREVIOUS_ID, () => {
    console.log("Handling APP.GET_PREVIOUS_ID");
    return getPreviousAppID();
  });

  ipcMain.handle(CHANNELS.WINDOW.MINIMIZE, () => {
    console.log("Handling WINDOW.MINIMIZE");
    minimizeWindow(mainWindow);
  });

  ipcMain.handle(CHANNELS.WINDOW.MAXIMIZE, () => {
    console.log("Handling WINDOW.MAXIMIZE");
    maximizeWindow(mainWindow);
  });

  ipcMain.handle(CHANNELS.WINDOW.CLOSE, () => {
    console.log("Handling WINDOW.CLOSE");
    closeWindow(mainWindow);
  });

  ipcMain.handle(
    CHANNELS.WINDOW.RESIZE,
    (event, width: number, height: number) => {
      console.log(`Handling WINDOW.RESIZE to ${width}x${height}`);
      resizeWindow(mainWindow, width, height);
    },
  );

  ipcMain.handle(
    CHANNELS.WINDOW.RESIZE_MESSAGE_CONTENT,
    (event, width: number, height: number, preserveX: boolean = false) => {
      console.log(
        `Handling WINDOW.RESIZE_MESSAGE_CONTENT to ${width}x${height}, preserveX: ${preserveX}`,
      );
      resizeMessageContent(mainWindow, width, height, preserveX);
    },
  );

  ipcMain.handle(CHANNELS.WINDOW.GET_POSITION, () => {
    console.log("Handling WINDOW.GET_POSITION");
    return getCurrentWindowPosition(mainWindow);
  });

  ipcMain.handle(CHANNELS.THEME.GET_CURRENT, () => {
    console.log("Handling THEME.GET_CURRENT");
    return getCurrentTheme();
  });

  ipcMain.handle(CHANNELS.THEME.TOGGLE, () => {
    console.log("Handling THEME.TOGGLE");
    return toggleTheme();
  });

  // Handle set dark theme request
  ipcMain.handle(CHANNELS.THEME.SET_DARK, () => {
    console.log("Handling THEME.SET_DARK");
    return setDarkTheme();
  });

  // Handle set light theme request
  ipcMain.handle(CHANNELS.THEME.SET_LIGHT, () => {
    console.log("Handling THEME.SET_LIGHT");
    return setLightTheme();
  });

  // Handle set system theme request
  ipcMain.handle(CHANNELS.THEME.SET_SYSTEM, () => {
    console.log("Handling THEME.SET_SYSTEM");
    return setSystemTheme();
  });

  ipcMain.handle(
    CHANNELS.WINDOW.GET_CURRENT_SIZE,
    (event, window: WindowSizeConfig) => {
      return getCurrentWindowSize(window);
    },
  );

  // Agent popover handlers
  ipcMain.handle(
    CHANNELS.AGENT.TOGGLE_POPOVER,
    (event, x?: number, y?: number, width?: number, height?: number) => {
      if (options.createAgentPopoverWindow) {
        toggleAgentPopover(
          options.agentPopoverWindow ?? null,
          mainWindow,
          options.createAgentPopoverWindow,
          x,
          y,
          width,
          height,
        );
      }
    },
  );

  // Handle agent list updated events - relay to agent popover window if it exists
  ipcMain.on(CHANNELS.AGENT.LIST_UPDATED, () => {
    console.log(
      "Handling AGENT.LIST_UPDATED - relaying to agent popover window",
    );
    if (options.agentPopoverWindow && options.agentPopoverWindow.isVisible()) {
      options.agentPopoverWindow.webContents.send(CHANNELS.AGENT.LIST_UPDATED);
    }
  });

  // Model selector handlers
  ipcMain.handle(
    CHANNELS.MODEL.TOGGLE_SELECTOR,
    (event, x?: number, y?: number, width?: number, height?: number) => {
      console.log(
        `Handling MODEL.TOGGLE_SELECTOR at ${x},${y} with size ${width}x${height}`,
      );
      if (options.createModelSelectorWindow) {
        toggleModelSelector(
          options.modelSelectorWindow ?? null,
          mainWindow,
          options.createModelSelectorWindow,
          x,
          y,
          width,
          height,
        );
      }
    },
  );

  // Handle model selection from the model selector window
  ipcMain.handle(CHANNELS.MODEL.MODEL_SELECTED, (event, modelId: string) => {
    console.log(`Handling MODEL.MODEL_SELECTED: ${modelId}`);
    // Forward the selected model to the main window
    modelSelected(mainWindow, modelId);
    return true;
  });

  // View mode toggle
  ipcMain.handle(CHANNELS.APP.TOGGLE_VIEW_MODE, (_event, expanded: boolean) => {
    console.log(
      `Handling APP.TOGGLE_VIEW_MODE: ${expanded ? "expanded" : "compact"}`,
    );
    return toggleViewMode(expanded, mainWindow);
  });

  // Clipboard handlers
  ipcMain.handle(CHANNELS.CLIPBOARD.GET_TEXT, () => {
    console.log("Handling CLIPBOARD.GET_TEXT");
    return getClipboardText();
  });

  ipcMain.handle(
    CHANNELS.APP.PASTE_MODIFIED_CONTENT,
    (event, content: string) => {
      console.log("Handling APP.PASTE_MODIFIED_CONTENT");
      pasteModifiedContent(content);
      return true;
    },
  );

  ipcMain.handle(CHANNELS.FILE.OPEN_PATH, (event, path: string) => {
    console.log(`Handling FILE.OPEN_PATH: ${path}`);
    openPath(path);
  });

  console.log("All IPC listeners registered successfully.");
}
