import { BrowserWindow, clipboard, nativeTheme, screen, shell } from "electron";

import { calculateWindowDimensions } from "@/electron/windows/utils";
import {
  resizeWindowAndMaintainPosition,
  toggleChatWindowVisibility,
} from "@/electron/windows/window-position";
import { setMainWindowResizable } from "@/electron/windows/window-resize";
import { WindowSizeConfig } from "@/electron/windows/window-size";
import robot from "@/shared/robot";
import { ThemeMode, WindowType } from "@/shared/types/electron";
import os from "os";
import path from "path";
import { activatePreviousApp } from "./active-app-context";
import { CHANNELS } from "./channels";

// Import window getters and creators
import {
  createAgentPopoverWindow,
  getAgentPopoverWindow,
} from "@/electron/windows/agent-popover-window";
import { getChatWindow } from "@/electron/windows/chat-window";
import {
  createHistoryWindow,
  getHistoryWindow,
} from "@/electron/windows/history-window";
import {
  createMainWindow,
  getMainWindow,
} from "@/electron/windows/main-window";
import {
  createModelSelectorWindow,
  getModelSelectorWindow,
} from "@/electron/windows/model-selector-window";
import {
  createSettingsWindow,
  getSettingsWindow,
} from "@/electron/windows/settings-window";

// Simple in-memory storage for current shortcut
let currentActivateShortcut = "";

// ========== UNIFIED WINDOW CONTROL ==========

export function toggleWindow(type: WindowType): void {
  switch (type) {
    case "settings":
      toggleGenericWindow(getSettingsWindow, createSettingsWindow);
      break;

    case "history":
      toggleGenericWindow(getHistoryWindow, createHistoryWindow);
      break;

    case "main":
      toggleGenericWindow(getMainWindow, createMainWindow);
      break;

    case "chat":
      toggleChatWindowVisibility(getChatWindow());
      break;

    default:
      console.warn(`Unknown window type: ${type}`);
  }
}

function toggleGenericWindow(
  getWindow: () => BrowserWindow | null,
  createWindow: () => void,
): void {
  const window = getWindow();

  if (!window) {
    createWindow();
    return;
  }

  if (window.isVisible()) {
    window.hide();
  } else {
    window.show();
    window.focus();
  }
}

// ========== UNIFIED THEME CONTROL ==========

// Helper function to broadcast theme change to all windows
function broadcastThemeChange(theme: string) {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send(CHANNELS.THEME.CHANGED, theme);
    }
  });
}

export function setTheme(mode: ThemeMode): string {
  let resultTheme: string;

  switch (mode) {
    case "dark":
      nativeTheme.themeSource = "dark";
      resultTheme = "dark";
      break;
    case "light":
      nativeTheme.themeSource = "light";
      resultTheme = "light";
      break;
    case "system":
      nativeTheme.themeSource = "system";
      resultTheme = nativeTheme.shouldUseDarkColors ? "dark" : "light";
      break;
    default:
      console.warn(`Unknown theme mode: ${mode}`);
      resultTheme = getCurrentTheme();
  }

  // Broadcast the theme change to all windows
  broadcastThemeChange(resultTheme);

  return resultTheme;
}

export function getCurrentTheme(): string {
  return nativeTheme.themeSource === "system"
    ? nativeTheme.shouldUseDarkColors
      ? "dark"
      : "light"
    : nativeTheme.themeSource;
}

// ========== LEGACY METHODS (for backwards compatibility) ==========

export function toggleTheme(): string {
  const newTheme = nativeTheme.shouldUseDarkColors ? "light" : "dark";
  return setTheme(newTheme as ThemeMode);
}

export function setDarkTheme(): string {
  return setTheme("dark");
}

export function setLightTheme(): string {
  return setTheme("light");
}

export function setSystemTheme(): string {
  return setTheme("system");
}

export function toggleSettingsWindow(): void {
  console.log("Legacy toggleSettingsWindow called");
  toggleWindow("settings");
}

export function closeSettingsWindow(): void {
  console.log("Legacy closeSettingsWindow called");
  const settingsWindow = getSettingsWindow();
  if (settingsWindow) {
    settingsWindow.hide();
  }
}

// ========== GLOBAL SHORTCUTS ==========

export function updateGlobalShortcut(
  shortcut: string,
  registerGlobalShortcuts: () => void,
): boolean {
  if (shortcut && shortcut !== currentActivateShortcut) {
    console.log(`Updating global shortcut to: ${shortcut}`);
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
  if (shortcut) {
    console.log(`Initializing global shortcut to: ${shortcut}`);
    currentActivateShortcut = shortcut;
    registerGlobalShortcuts();
    return true;
  }
  return false;
}

export function getCurrentShortcut(): string {
  return currentActivateShortcut;
}

// ========== UNIFIED WINDOW MANAGEMENT ==========

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
    toggleChatWindowVisibility(mainWindow);
  }
}

export function resizeWindow(
  mainWindow: BrowserWindow | null,
  width: number,
  height: number,
  preserveX: boolean = false,
): void {
  if (mainWindow) {
    // Use resizeWindowAndMaintainPosition which will automatically update expectedPosition
    resizeWindowAndMaintainPosition(mainWindow, width, height, preserveX);
  }
}

export function resizeAndCenterWindow(
  mainWindow: BrowserWindow | null,
  width: number,
  height: number,
): void {
  if (mainWindow) {
    // Get screen dimensions
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } =
      primaryDisplay.workAreaSize;

    // Calculate center position
    const x = Math.round((screenWidth - width) / 2);
    const y = Math.round((screenHeight - height) / 2);

    // Set size and position in one operation
    mainWindow.setBounds({ x, y, width, height });
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

// ========== LEGACY METHODS (for backwards compatibility) ==========

export function resizeMessageContent(
  mainWindow: BrowserWindow | null,
  width: number,
  height: number,
  preserveX: boolean = false,
): void {
  console.log("Legacy resizeMessageContent called, using resizeWindow");
  resizeWindow(mainWindow, width, height, preserveX);
}

// ========== AGENT POPOVER HANDLERS ==========

export function toggleAgentPopoverWindow(
  x?: number,
  y?: number,
  width?: number,
  height?: number,
): void {
  const agentWindow = getAgentPopoverWindow();

  if (agentWindow && agentWindow.isVisible()) {
    agentWindow.hide();
  } else if (x !== undefined && y !== undefined) {
    createAgentPopoverWindow(x, y, width, height);
  }
}

export function hideAgentPopoverWindow(): void {
  const agentWindow = getAgentPopoverWindow();
  if (agentWindow && agentWindow.isVisible()) {
    agentWindow.hide();
  }
}

// ========== MODEL SELECTOR HANDLERS ==========

export function toggleModelSelectorWindow(
  x?: number,
  y?: number,
  width?: number,
  height?: number,
): void {
  const modelWindow = getModelSelectorWindow();

  if (modelWindow && modelWindow.isVisible()) {
    modelWindow.hide();
  } else if (x !== undefined && y !== undefined) {
    createModelSelectorWindow(x, y, width, height);
  }
}

export function hideModelSelectorWindow(): void {
  const modelWindow = getModelSelectorWindow();
  if (modelWindow && modelWindow.isVisible()) {
    modelWindow.hide();
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
        true, // Preserve X position
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
  // Get the actual current window size, not the calculated config size
  const focusedWindow = BrowserWindow.getFocusedWindow();
  if (focusedWindow) {
    const [width, height] = focusedWindow.getSize();
    return { width, height };
  }

  // Fallback to calculated dimensions if no focused window
  return calculateWindowDimensions(window);
}

// ========== CLIPBOARD HANDLERS ==========

export function getClipboardText(): string {
  return clipboard.readText();
}

export function setInputContent(
  mainWindow: BrowserWindow | null,
  content: { text?: string },
): void {
  if (mainWindow) {
    // Send the content to the renderer to set as input
    mainWindow.webContents.send(CHANNELS.APP.SET_INPUT_CONTENT, content);
  }
}

// Function to simulate a paste operation using robotjs
export function simulateClipboardPaste(): void {
  try {
    if (process.platform === "darwin") {
      robot?.keyTap("v", "command");
    } else {
      robot?.keyTap("v", "control");
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
    clipboard.writeText(content);
    activatePreviousApp();

    // Wait a moment for the app to come to foreground, then paste
    setTimeout(() => {
      simulateClipboardPaste();
    }, 500);
  } catch (error) {
    console.error("Error in pasteModifiedContent:", error);
  }
}

/**
 * Open file or directory path in system default application
 */
export function openPath(targetPath: string): void {
  let resolvedPath = targetPath;
  if (targetPath.startsWith("~/")) {
    resolvedPath = path.join(os.homedir(), targetPath.slice(2));
  } else if (targetPath === "~") {
    resolvedPath = os.homedir();
  }

  shell.openPath(resolvedPath).catch((error) => {
    console.error(`Error opening path ${resolvedPath}:`, error);
  });
}
