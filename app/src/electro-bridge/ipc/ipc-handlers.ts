import { BrowserWindow, clipboard, nativeTheme, shell } from "electron";

import { calculateWindowDimensions } from "@/electron/windows/utils";
import {
  resizeWindowAndMaintainPosition,
  toggleChatWindowVisibility,
} from "@/electron/windows/window-position";
import { setMainWindowResizable } from "@/electron/windows/window-resize";
import { WindowSizeConfig } from "@/electron/windows/window-size";
import robot from "@/shared/robot";
import { ThemeMode, WindowType } from "@/shared/types/electron";
import { exec } from "child_process";
import os from "os";
import path from "path";
import { CHANNELS } from "./channels";

// Import window getters and creators
import {
  createAgentPopoverWindow,
  getAgentPopoverWindow,
} from "@/electron/windows/agent-popover-window";
import { getChatWindow } from "@/electron/windows/chat-window";
import {
  createMainWindow,
  getMainWindow,
} from "@/electron/windows/main-window";
import {
  createModelSelectorWindow,
  getModelSelectorWindow,
} from "@/electron/windows/model-selector-window";
// Simple in-memory storage for current shortcut
let currentActivateShortcut = "";
let previousAppName = "";
let previousAppId = 0;

// ========== WINDOW STATE MANAGEMENT ==========

type WindowState = "main" | "chat";

// In-memory storage for current window state
let currentActiveWindow: WindowState = "chat";
let previousActiveWindow: WindowState = "chat";

export function getCurrentActiveWindow(): WindowState {
  return currentActiveWindow;
}

export function setActiveWindow(windowType: WindowState): void {
  previousActiveWindow = currentActiveWindow;
  currentActiveWindow = windowType;
  console.log(
    `Window state changed: ${previousActiveWindow} -> ${currentActiveWindow}`,
  );
}

export function toggleToMain(): void {
  toggleChatWindowVisibility(getChatWindow());
  setActiveWindow("main");
}

export function returnToChat(): void {
  toggleChatWindowVisibility(getChatWindow());
  setActiveWindow("chat");
}

// ========== APP HANDLERS ==========

export function getPreviousApp(): string {
  return previousAppName;
}

export function getPreviousAppID(): number {
  return previousAppId;
}

export function getPlatform(): string {
  return process.platform;
}

export function setPreviousApp(appName: string, appId?: number): void {
  if (
    appName !== previousAppName ||
    (appId !== undefined && appId !== previousAppId)
  ) {
    previousAppName = appName;

    if (appId !== undefined) {
      previousAppId = appId;
    }

    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send(CHANNELS.APP.APP_CHANGED, appName, previousAppId);
      }
    });
  }
}

// ========== UNIFIED WINDOW CONTROL ==========

export function toggleWindow(type: WindowType): void {
  const route = type === "main" ? "/" : "/" + type;

  switch (type) {
    case "settings":
    case "history":
    case "main":
      toggleGenericWindow(getMainWindow, createMainWindow, route);
      break;

    default:
      console.warn(`Unknown window type: ${type}`);
  }
}

function toggleGenericWindow(
  getWindow: (route?: string) => BrowserWindow | null,
  createWindow: (route?: string) => void,
  route?: string,
): void {
  const window = getWindow(route);

  if (!window) {
    toggleToMain();
    createWindow(route);
    return;
  }

  if (window.isVisible()) {
    console.log("Hiding window, returning to chat state");
    returnToChat();
    window.hide();
  } else {
    toggleToMain();
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
    // Check current window state and handle accordingly
    if (currentActiveWindow === "main") {
      console.log("Closing main window, returning to chat state");
      returnToChat();
    }

    // Always toggle chat window visibility
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
  return calculateWindowDimensions(window);
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
    // use to run the app in dev mode

    // const robot = require("@hurdlegroup/robotjs");

    // Write to clipboard first
    if (process.platform === "darwin") {
      // For macOS, use Command+V
      robot?.keyTap("v", "command");
    } else {
      // For Windows/Linux, use Control+V
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

    // Save content to clipboard
    clipboard.writeText(content);

    // Get the previous app name and ID
    const prevApp = getPreviousApp();
    const prevAppId = getPreviousAppID();

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
      } else if (process.platform === "win32" && prevAppId) {
        // For Windows, use node-window-manager
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { windowManager } = require("node-window-manager");

          // Get all windows
          const windows = windowManager.getWindows();

          // Find the target window
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const targetWindow = windows.find((w: any) => {
            // Try to match by process ID first (most reliable)
            if (prevAppId && w.processId === prevAppId) {
              return true;
            }

            // Fall back to title matching
            const title = w.getTitle();
            return title && title.includes(prevApp);
          });

          if (targetWindow) {
            console.log(`Found window for ${prevApp}, activating...`);

            // Restore if minimized
            if (!targetWindow.isVisible()) {
              targetWindow.restore();
            }

            // Bring window to top (activate it)
            targetWindow.bringToTop();

            // Wait a moment for the window to activate, then paste
            setTimeout(() => {
              simulateClipboardPaste();
            }, 300);
          } else {
            console.warn(`Window for "${prevApp}" not found; pasting anyway`);
            simulateClipboardPaste();
          }
        } catch (error) {
          console.error("Error using window-manager:", error);
          // Fallback to just pasting
          simulateClipboardPaste();
        }
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

/**
 * Open file or directory path in system default application
 */
export function openPath(targetPath: string): void {
  // Handle tilde expansion for home directory
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
