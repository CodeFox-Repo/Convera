import { BrowserWindow, nativeTheme } from "electron";
import {
  resizeWindowAndMaintainPosition,
  toggleMainWindowVisibility,
} from "../windows/window-position";
import { CHANNELS } from "./channels";
import { setMainWindowResizable } from "../windows/window-resize";
import { WindowSizeConfig } from "../windows/window-size";
import { calculateWindowDimensions } from "../windows/utils";

let currentActivateShortcut = "Control+Space";
let previousAppName = "";

// ========== APP HANDLERS ==========

export function getPreviousApp(): string {
  return previousAppName;
}

export function setPreviousApp(appName: string): void {
  if (appName !== previousAppName) {
    previousAppName = appName;

    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send(CHANNELS.APP.APP_CHANGED, appName);
      }
    });
  }
}

// ========== WINDOW COMMON HANDLERS ==========

export function toggleWindow(
  window: BrowserWindow | null,
  createWindowFn?: () => void,
): void {
  if (!window) {
    if (createWindowFn) {
      createWindowFn();
    }
    return;
  }

  if (window.isVisible()) {
    window.hide();
  } else {
    window.show();
    window.focus();
  }
}

// ========== SETTINGS HANDLERS ==========

export function toggleSettingsWindow(
  settingsWindow: BrowserWindow | null,
  createSettingsWindow: () => void,
): void {
  console.log("Toggling settings window");
  toggleWindow(settingsWindow, createSettingsWindow);
}

export function closeSettingsWindow(
  settingsWindow: BrowserWindow | null,
): void {
  if (settingsWindow) {
    // Make sure to just hide the window, not close it
    // This prevents triggering the 'closed' event
    settingsWindow.hide();

    // Ensure the window remains valid but not visible
    if (process.platform === "darwin") {
      // On macOS, we might need to also blur the window
      settingsWindow.blur();
    }

    console.log("Settings window hidden");
  }
}

export function updateGlobalShortcut(
  shortcut: string,
  registerGlobalShortcuts: () => void,
): boolean {
  if (shortcut && shortcut !== currentActivateShortcut) {
    currentActivateShortcut = shortcut;
    registerGlobalShortcuts();
    return true;
  }
  return false;
}

export function initGlobalShortcut(
  shortcut: string,
  registerGlobalShortcuts: () => void,
): boolean {
  if (shortcut && shortcut !== currentActivateShortcut) {
    currentActivateShortcut = shortcut;
    registerGlobalShortcuts();
    return true;
  }
  return false;
}

export function getCurrentShortcut(): string {
  return currentActivateShortcut;
}

// ========== WINDOW HANDLERS ==========

export function minimizeWindow(mainWindow: BrowserWindow | null): void {
  if (mainWindow) {
    mainWindow.minimize();
  }
}

export function maximizeWindow(mainWindow: BrowserWindow | null): void {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
}

export function closeWindow(mainWindow: BrowserWindow | null): void {
  if (mainWindow) {
    toggleMainWindowVisibility(mainWindow);
  }
}

export function resizeMessageContent(
  mainWindow: BrowserWindow | null,
  width: number,
  height: number,
): void {
  if (mainWindow) {
    resizeWindowAndMaintainPosition(mainWindow, width, height);
  }
}

export function resizeWindow(
  mainWindow: BrowserWindow | null,
  width: number,
  height: number,
): void {
  if (mainWindow) {
    mainWindow.setSize(width, height);
  }
}

export function getCurrentWindowPosition(mainWindow: BrowserWindow | null): {
  x: number;
  y: number;
} {
  if (mainWindow) {
    const position = mainWindow.getPosition();
    return { x: position[0], y: position[1] };
  }
  return { x: 0, y: 0 };
}

// ========== THEME HANDLERS ==========

export function getCurrentTheme(): string {
  return nativeTheme.themeSource === "system"
    ? nativeTheme.shouldUseDarkColors
      ? "dark"
      : "light"
    : nativeTheme.themeSource;
}

export function toggleTheme(): string {
  nativeTheme.themeSource = nativeTheme.shouldUseDarkColors ? "light" : "dark";
  return nativeTheme.themeSource;
}

export function setDarkTheme(): string {
  nativeTheme.themeSource = "dark";
  return "dark";
}

export function setLightTheme(): string {
  nativeTheme.themeSource = "light";
  return "light";
}

export function setSystemTheme(): string {
  nativeTheme.themeSource = "system";
  return nativeTheme.shouldUseDarkColors ? "dark" : "light";
}

// ========== AGENT POPOVER HANDLERS ==========

export function toggleAgentPopover(
  agentPopoverWindow: BrowserWindow | null,
  mainWindow: BrowserWindow | null,
  createAgentPopoverFn: (
    x: number,
    y: number,
    width?: number,
    height?: number,
  ) => BrowserWindow | null | undefined,
  x?: number,
  y?: number,
  width?: number,
  height?: number,
): void {
  if (agentPopoverWindow && agentPopoverWindow.isVisible()) {
    agentPopoverWindow.hide();
  } else if (mainWindow && x !== undefined && y !== undefined) {
    createAgentPopoverFn(x, y, width, height);
  }
}

// ========== MODEL SELECTOR HANDLERS ==========

export function toggleModelSelector(
  modelSelectorWindow: BrowserWindow | null,
  mainWindow: BrowserWindow | null,
  createModelSelectorFn: (
    x: number,
    y: number,
    width?: number,
    height?: number,
  ) => BrowserWindow | null | undefined,
  x?: number,
  y?: number,
  width?: number,
  height?: number,
): void {
  if (modelSelectorWindow && modelSelectorWindow.isVisible()) {
    modelSelectorWindow.hide();
  } else if (mainWindow && x !== undefined && y !== undefined) {
    createModelSelectorFn(x, y, width, height);
  }
}

export function modelSelected(
  mainWindow: BrowserWindow | null,
  modelId: string,
): void {
  if (!mainWindow) return;

  console.log(`Broadcasting model selection to main window: ${modelId}`);

  // Send the selected model to the main window
  mainWindow.webContents.send(CHANNELS.MODEL.MODEL_SELECTED, modelId);

  // Also save to localStorage as a fallback mechanism
  mainWindow.webContents.executeJavaScript(
    `
    try {
      localStorage.setItem("selectedModelId", "${modelId}");
      // Try to dispatch a custom event
      window.dispatchEvent(new CustomEvent("model-selected", { 
        detail: { modelId: "${modelId}" } 
      }));
      console.log("Model selection saved and event dispatched: ${modelId}");
    } catch(e) {
      console.error("Error in model selection handler:", e);
    }
    `,
  );
}

// Toggle window view mode between compact and expanded
export function toggleViewMode(expanded: boolean, mainWindow: BrowserWindow) {
  console.log(`Toggling view mode to: ${expanded ? "expanded" : "compact"}`);

  try {
    // Call setMainWindowResizable with the mainWindow parameter
    setMainWindowResizable(expanded, mainWindow);

    // You might want to also adjust the window size when toggling to expanded mode
    if (expanded) {
      // Optionally set a larger size when switching to expanded mode
      const currentBounds = mainWindow.getBounds();
      const newHeight = Math.max(currentBounds.height, 600);

      // Use resizeWindowAndMaintainPosition instead of directly using setBounds
      resizeWindowAndMaintainPosition(
        mainWindow,
        currentBounds.width,
        newHeight,
      );
    }

    return true;
  } catch (error) {
    console.error("Error toggling view mode:", error);
    return false;
  }
}
// ========== WINDOW SIZE HANDLERS ==========

export function getCurrentWindowSize(window: WindowSizeConfig): {
  width: number;
  height: number;
} {
  return calculateWindowDimensions(window);
}
