import { app, BrowserWindow, globalShortcut, screen } from "electron";

import { getLogger, initializeLogger } from "@/electron/logger";
import { getMCPHub, initializeMCPHub } from "@/electron/mcp";
import {
  expectedPosition,
  isHiddenOffscreen,
  toggleChatWindowVisibility,
} from "@/electron/windows/window-position";
import { WINDOW_SIZE_PRESETS } from "@/electron/windows/window-size";
import { exec } from "child_process";
import {
  installExtension,
  REACT_DEVELOPER_TOOLS,
} from "electron-devtools-installer";

import { calculateWindowDimensions } from "@/electron/windows/utils";

import {
  getCurrentShortcut,
  getPreviousApp,
  setInputText,
  setPreviousApp,
} from "@/electro-bridge/ipc/ipc-handlers";

import robot from "@/shared/robot";
import { clipboard } from "electron";

import {
  ListenerOptions,
  registerListeners,
} from "@/electro-bridge/ipc/listeners-register";
import { createSystemTray, destroySystemTray } from "./tray";
import { preCreateAgentPopoverWindow } from "./windows/agent-popover-window";
import { getChatWindow } from "./windows/chat-window";
import { preCreateHistoryWindow } from "./windows/history-window";
import { preCreateMainWindow } from "./windows/main-window";
import { preCreateModelSelectorWindow } from "./windows/model-selector-window";
import {
  getSettingsWindow,
  preCreateSettingsWindow,
} from "./windows/settings-window";
import { isInExpandedViewMode } from "./windows/window-resize";

const { activeWindowSync } =
  process.platform === "win32"
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("get-windows")
    : { activeWindowSync: null };

// Determine if the app is running from source or packaged
const inDevelopment = !app.isPackaged;

let trackingAppFocus = false;

// Clipboard buffer for restoring original content
let originalClipboardContent = "";

// Initialize logger for main process
const logger = getLogger("main-process");

/**
 * Simulate a copy command (Ctrl+C or Command+C) to capture selected text
 * @returns Promise that resolves when the copy operation is complete
 */
async function simulateClipboardCopy(): Promise<void> {
  try {
    logger.debug("Preserving original clipboard content");
    originalClipboardContent = clipboard.readText();
    
    logger.debug("Simulating copy command with RobotJS");

    // Release modifier keys first to prevent conflicts
    robot?.keyToggle("shift", "up");
    robot?.keyToggle("control", "up");
    robot?.keyToggle("alt", "up");

    // Small delay to ensure modifiers are released
    await new Promise(resolve => setTimeout(resolve, 50));

    // Perform the copy operation
    if (process.platform === "darwin") {
      robot?.keyTap("c", "command");
    } else {
      robot?.keyTap("c", "control");
    }

    // Wait for clipboard to be updated
    await new Promise(resolve => setTimeout(resolve, 100));
    
  } catch (error) {
    logger.error("Error simulating copy command:", error);
    throw error;
  }
}

/**
 * Restore the original clipboard content
 */
function restoreClipboard(): void {
  try {
    if (originalClipboardContent !== undefined) {
      clipboard.writeText(originalClipboardContent);
      logger.debug("Original clipboard content restored");
    }
  } catch (error) {
    logger.error("Error restoring clipboard content:", error);
  }
}

// Start background app tracking on macOS and Windows
function startAppFocusTracking() {
  // Only run on supported platforms and only start once
  if (
    (process.platform !== "darwin" && process.platform !== "win32") ||
    trackingAppFocus
  ) {
    return;
  }

  trackingAppFocus = true;

  // Use a timer to periodically check the focused app in the background
  setInterval(() => {
    // Don't run the check if our app is in focus to avoid unnecessary processing
    const ourAppIsFocused = BrowserWindow.getAllWindows().some((win) =>
      win.isFocused(),
    );
    if (ourAppIsFocused) {
      return;
    }

    if (process.platform === "darwin") {
      // macOS implementation
      const script =
        'tell application "System Events" to get name of first application process whose frontmost is true';
      exec(`osascript -e '${script}'`, (error, stdout) => {
        if (!error && stdout) {
          const appName = stdout.trim();

          // Ignore self-referential applications
          const ignoreList = ["Electron", "FoxyChat", "foxfoxy"];
          if (appName && !ignoreList.some((name) => appName.includes(name))) {
            setPreviousApp(appName);
          }
        }
      });
    } else if (process.platform === "win32") {
      // Windows implementation using get-windows package
      try {
        const activeWindow = activeWindowSync();
        if (activeWindow && activeWindow.owner) {
          const appName = activeWindow.owner.name;
          const appId = activeWindow.owner.processId;
          // console.log(`Detected active application: ${appName}`);

          // Ignore self-referential applications
          const ignoreList = ["electron", "FoxyChat", "foxfoxy"];
          if (
            appName &&
            !ignoreList.some((name) =>
              appName.toLowerCase().includes(name.toLowerCase()),
            )
          ) {
            setPreviousApp(appName, appId);
          }
        }
      } catch (error) {
        console.error("Error using get-windows:", error);
      }
    }
  }, 500);
}

function registerGlobalShortcuts() {
  globalShortcut.unregisterAll();

  const currentShortcut = getCurrentShortcut();

  // Don't register anything if no shortcut is set yet (renderer hasn't initialized)
  if (!currentShortcut) {
    console.log("No shortcut set yet, waiting for renderer initialization");
    return;
  }

  console.log(`Attempting to register global shortcut: ${currentShortcut}`);
  try {
    const ret = globalShortcut.register(currentShortcut, async () => {
      logger.debug(`Global shortcut ${currentShortcut} triggered`);

      const prevApp = getPreviousApp();
      if (prevApp) {
        logger.debug(`Previously focused application: ${prevApp}`);
      }

      try {
        await simulateClipboardCopy();

        const selectedText = clipboard.readText();
        logger.debug(`Selected text captured: ${selectedText ? "Found" : "None"}`);

        // Show the chat window and set input text
        if (getChatWindow()) {
          toggleChatWindowVisibility(getChatWindow());
          setTimeout(() => {
            setInputText(getChatWindow(), selectedText);
            // Restore clipboard after a delay to ensure input is set
            setTimeout(() => {
              restoreClipboard();
            }, 200);
          }, 100);
        } else {
          // If no chat window, restore clipboard immediately
          restoreClipboard();
        }
      } catch (error) {
        logger.error("Error in clipboard operation:", error);
        // Always restore clipboard on error
        restoreClipboard();
      }
    });

    if (!ret) {
      console.error(
        `Failed to register global shortcut: ${currentShortcut}. It might be already in use.`,
      );
    } else {
      console.log(
        `Global shortcut ${currentShortcut} registered successfully.`,
      );
    }
  } catch (error) {
    console.error(
      `Error registering global shortcut ${currentShortcut}:`,
      error,
    );
  }
}

async function installExtensions() {
  try {
    const result = await installExtension(REACT_DEVELOPER_TOOLS);
    console.log(`Extensions installed successfully: ${result.name}`);
  } catch {
    console.error("Failed to install extensions");
  }
}

// Handle screen resize events
function setupScreenResizeHandlers() {
  let resizeTimeout: NodeJS.Timeout | null = null;

  // Listen for primary display metrics change (resolution or scale factor change)
  screen.on("display-metrics-changed", (_event, display, changedMetrics) => {
    if (display.id === screen.getPrimaryDisplay().id) {
      console.log("Primary display metrics changed:", changedMetrics);

      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }

      resizeTimeout = setTimeout(() => {
        // Update chat window if it exists
        if (getChatWindow() && !isHiddenOffscreen && !isInExpandedViewMode()) {
          const dimensions = expectedPosition
            ? expectedPosition
            : calculateWindowDimensions(WINDOW_SIZE_PRESETS.COMPACT_CHAT);
          getChatWindow().setBounds(dimensions);
        }

        // Update settings window if visible
        const settingsWindow = getSettingsWindow();

        if (settingsWindow && settingsWindow.isVisible()) {
          const dimensions = expectedPosition
            ? expectedPosition
            : calculateWindowDimensions(WINDOW_SIZE_PRESETS.SETTINGS);
          settingsWindow.setBounds(dimensions);
        }

        resizeTimeout = null;
      }, 150);
    }
  });
}

app.whenReady().then(async () => {
  try {
    logger.info("Application ready, starting initialization");

    if (inDevelopment) {
      await installExtensions();
    }

    // Initialize Simple Logger
    initializeLogger();

    // Initialize MCP Hub
    initializeMCPHub();
    logger.info("MCP Hub initialization completed");

    logger.debug("Starting app focus tracking");
    startAppFocusTracking();

    logger.debug("Registering global shortcuts");
    registerGlobalShortcuts();

    logger.debug("Pre-creating windows");
    preCreateAgentPopoverWindow();
    preCreateSettingsWindow();
    preCreateModelSelectorWindow(); // Pre-create model selector window
    preCreateHistoryWindow(); // Pre-create history window
    setupScreenResizeHandlers(); // Setup screen resize handlers
    preCreateMainWindow(getChatWindow() || undefined); // Pre-create main window

    // Set up options for the new unified listener system
    const listenerOptions: ListenerOptions = {
      chatWindow: () => getChatWindow(),
      registerGlobalShortcuts,
    };

    logger.debug("Registering IPC listeners");
    // Register IPC listeners with the new unified system
    registerListeners(listenerOptions);

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        logger.info("App activated, creating chat window");
      }
    });

    createSystemTray(getChatWindow());
  } catch (error) {
    logger.error("Error during app initialization", error);
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  destroySystemTray();
  const hub = getMCPHub();
  if (hub) {
    hub.cleanup();
    console.log("MCP Hub cleaned up");
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && getChatWindow() === null) {
    app.quit();
  }
});
