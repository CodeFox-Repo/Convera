import { BrowserWindow, nativeTheme, clipboard } from "electron";

import {
  resizeWindowAndMaintainPosition,
  toggleMainWindowVisibility,
} from "../windows/window-position";
import { CHANNELS } from "./channels";
import { exec } from "child_process";

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

// ========== CLIPBOARD HANDLERS ==========

export function getClipboardText(): string {
  return clipboard.readText();
}

export function setInputText(
  mainWindow: BrowserWindow | null,
  text: string,
): void {
  if (mainWindow) {
    // Send the text to the renderer to set as input
    mainWindow.webContents.send(CHANNELS.APP.SET_INPUT_TEXT, text);
  }
}

// Function to simulate a paste operation using robotjs
export function simulateClipboardPaste(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const robot = require("robotjs");

    // Write to clipboard first
    if (process.platform === "darwin") {
      // For macOS, use Command+V
      robot.keyTap("v", "command");
    } else {
      // For Windows/Linux, use Control+V
      robot.keyTap("v", "control");
    }

    console.log("Paste operation simulated successfully");
  } catch (error) {
    console.error("Error simulating paste operation:", error);
  }
}

// Handler for pasting modified content
export function pasteModifiedContent(content: string): void {
  try {
    console.log("Pasting modified content to previous app");

    // Save content to clipboard
    clipboard.writeText(content);

    // Get the previous app name
    const prevApp = getPreviousApp();

    if (prevApp) {
      // Activate the previous app
      if (process.platform === "darwin") {
        // For macOS, use AppleScript
        exec(
          `osascript -e 'tell application "${prevApp}" to activate'`,
          (error) => {
            if (error) {
              console.error(`Error activating ${prevApp}:`, error);
              return;
            }

            // Wait a moment for the app to come to foreground, then paste
            setTimeout(() => {
              simulateClipboardPaste();
            }, 500);
          },
        );
      } else {
        // For other platforms, just simulate paste (without app switching)
        simulateClipboardPaste();
      }
    } else {
      console.log("No previous app detected, can't switch focus");
    }
  } catch (error) {
    console.error("Error in pasteModifiedContent:", error);
  }
}
