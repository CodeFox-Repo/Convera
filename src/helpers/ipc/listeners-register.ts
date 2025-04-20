/* eslint-disable @typescript-eslint/no-explicit-any */
import { ipcMain, BrowserWindow, IpcRenderer } from "electron";
import {
  getPreviousApp,
  closeSettingsWindow,
  toggleSettingsWindow,
  updateGlobalShortcut,
  initGlobalShortcut,
  minimizeWindow,
  maximizeWindow,
  closeWindow,
  resizeWindow,
  resizeMessageContent,
  getCurrentTheme,
  toggleTheme,
  setDarkTheme,
  setLightTheme,
  setSystemTheme,
  toggleAgentPopover,
  getCurrentWindowPosition,
  toggleModelSelector,
  modelSelected,
} from "./ipc-handlers";
import { CHANNELS, IPCServer, methodChannelMap } from "./channels";

// Extended interface that includes additional methods beyond IPCServer
interface ElectronAPI extends IPCServer {
  onFocusChatInput: (callback: () => void) => () => void;
  onAppChanged: (callback: (appName: string) => void) => () => void;
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

  api.onAppChanged = (callback: (appName: string) => void) => {
    const handler = (_: any, appName: string) => callback(appName);
    ipcRenderer.on(CHANNELS.APP.APP_CHANGED, handler);
    return () => {
      ipcRenderer.removeListener(CHANNELS.APP.APP_CHANGED, handler);
    };
  };

  return api;
}
export type ListenerOptions = {
  createSettingsWindow: () => void;
  settingsWindow: BrowserWindow | null;
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
    (event, width: number, height: number) => {
      console.log(
        `Handling WINDOW.RESIZE_MESSAGE_CONTENT to ${width}x${height}`,
      );
      resizeMessageContent(mainWindow, width, height);
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

  console.log("All IPC listeners registered successfully.");
}
