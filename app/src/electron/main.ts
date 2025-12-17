import {
  app,
  BrowserWindow,
  CookiesSetDetails,
  globalShortcut,
  screen,
} from "electron";

import { getLogger, initializeLogger } from "@/electron/logger";
import { getMCPHub, initializeMCPHub } from "@/electron/mcp";
import {
  expectedPosition,
  isHiddenOffscreen,
  toggleChatWindowVisibility,
} from "@/electron/windows/window-position";
import { WINDOW_SIZE_PRESETS } from "@/electron/windows/window-size";
import { exec } from "child_process";

import { calculateWindowDimensions } from "@/electron/windows/utils";

import {
  setPreviousApp,
  preloadAllAppData,
} from "@/electro-bridge/ipc/active-app-context";
import {
  getCurrentShortcut,
  setInputContent,
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
import { getMainWindow, preCreateMainWindow } from "./windows/main-window";
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

let trackingAppFocus = false;

// Clipboard buffer for restoring original content
let originalClipboardContent = "";

// Previous clipboard buffer to avoid duplicates
let prevClipboardContent = "";

// Prevent duplicate shortcut processing
let shortcutInProgress = false;

// Initialize logger for main process
const logger = getLogger("main-process");

async function simulateClipboardCopy(): Promise<void> {
  try {
    originalClipboardContent = clipboard.readText();

    robot?.keyToggle("shift", "up");
    robot?.keyToggle("control", "up");
    robot?.keyToggle("alt", "up");

    // Use setImmediate for minimal delay without blocking
    await new Promise((resolve) => setImmediate(resolve));

    if (process.platform === "darwin") {
      robot?.keyTap("c", "command");
    } else {
      robot?.keyTap("c", "control");
    }

    // Minimal delay for copy operation to complete
    await new Promise((resolve) => setTimeout(resolve, 30));
  } catch (error) {
    logger.error("Error simulating copy command:", error);
    throw error;
  }
}

function restoreClipboard(): void {
  try {
    if (originalClipboardContent !== undefined) {
      clipboard.writeText(originalClipboardContent);
    }

    originalClipboardContent = "";
  } catch (error) {
    logger.error("Error restoring clipboard:", error);
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
          const ignoreList = ["Electron", "Convera", "convera"];
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
          const ignoreList = ["electron", "Convera", "convera"];
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
      if (shortcutInProgress) return;

      shortcutInProgress = true;

      try {
        await simulateClipboardCopy();

        const selectedText = clipboard.readText();

        // Check for duplicates
        let isTextDuplicate = false;

        if (selectedText && selectedText === prevClipboardContent) {
          isTextDuplicate = true;
        }

        // Skip content processing if all content is duplicate or no content
        const noContent = !selectedText;

        const chatWindow = getChatWindow();
        if (chatWindow) {
          // Toggle chat window visibility using the proper function
          toggleChatWindowVisibility(chatWindow);

          // Process content immediately if we have new content
          if (!isTextDuplicate && !noContent) {
            const contentToSend: { text?: string } = {};

            if (selectedText && !isTextDuplicate) {
              contentToSend.text = selectedText;
              prevClipboardContent = selectedText;
            }

            if (contentToSend.text) {
              setInputContent(chatWindow, contentToSend);
            }
          }
        }

        // Restore clipboard asynchronously
        setImmediate(() => {
          restoreClipboard();
        });
      } catch (error) {
        logger.error("Clipboard operation failed:", error);
        restoreClipboard();
      } finally {
        shortcutInProgress = false;
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
        // Update main window if it exists
        const mainWindow = getMainWindow();
        if (mainWindow && !isHiddenOffscreen && !isInExpandedViewMode()) {
          const dimensions = expectedPosition
            ? expectedPosition
            : calculateWindowDimensions(WINDOW_SIZE_PRESETS.CHAT);
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

    // Initialize synchronous components first
    initializeLogger();

    // Initialize MCP Hub asynchronously but don't block startup
    initializeMCPHub()
      .then(() => {
        logger.info("MCP Hub initialization completed");
      })
      .catch((error) => {
        logger.error("MCP Hub initialization failed:", error);
      });

    // Start app data preloading immediately (in background)
    console.log("Starting app data preloading immediately...");
    preloadAllAppData()
      .then(() => {
        console.log("App data preloading completed successfully");
        logger.info("App data preloading completed");
      })
      .catch((error) => {
        console.error("App data preloading failed:", error);
        logger.error("App data preloading failed:", error);
      });

    // Start background processes that don't block UI
    startAppFocusTracking();
    registerGlobalShortcuts();
    setupScreenResizeHandlers();

    // Pre-create windows
    preCreateAgentPopoverWindow();
    preCreateSettingsWindow();
    preCreateModelSelectorWindow();
    preCreateHistoryWindow();
    preCreateMainWindow();

    // Set up options for the new unified listener system
    const listenerOptions: ListenerOptions = {
      chatWindow: () => getChatWindow(),
      registerGlobalShortcuts,
    };

    logger.debug("Registering IPC listeners");
    registerListeners(listenerOptions);

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        logger.info("App activated, creating chat window");
      }
    });

    createSystemTray();

    // Register custom protocol for deep link callbacks (macOS)
    try {
      if (process.platform === "darwin") {
        app.setAsDefaultProtocolClient("convera");
        logger.info(`Registered custom protocol 'convera': ok`);
      }
    } catch (e) {
      logger.error("Failed to register custom protocol:", e);
    }
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
  if (process.platform !== "darwin" && getMainWindow() === null) {
    app.quit();
  }
});

// Handle deep link callbacks like convera://auth/callback?next=/settings
app.on("open-url", (event, urlStr) => {
  try {
    event.preventDefault();
    logger.info("Received open-url:", urlStr);

    const url = new URL(urlStr);
    const exchangeToken = url.searchParams.get("token");

    const afterNavigate = () => {
      const win = getSettingsWindow() || preCreateSettingsWindow();
      if (win) {
        win.show();
        win.focus();
        win.webContents.reload();
      }
    };

    if (exchangeToken) {
      // Redeem token then write cookie into Electron session
      fetch("https://api.foxychat.net/api/auth/exchange/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: exchangeToken }),
      })
        .then((r) => r.json())
        .then(async (data) => {
          try {
            logger.info("Received exchange token:", data);
            const cookies = data?.cookies as { name: string; value: string }[];
            const domain = data?.domain || "api.foxychat.net";
            const secure = !!data?.secure;
            if (Array.isArray(cookies)) {
              for (const ck of cookies) {
                await BrowserWindow.getFocusedWindow()?.webContents.session.cookies.set(
                  {
                    url: `https://${domain}`,
                    name: ck.name,
                    value: ck.value,
                    domain,
                    path: "/",
                    secure,
                    httpOnly: true,
                    sameSite: "no_restriction",
                  } as unknown as CookiesSetDetails,
                );
              }
            }
          } catch (e) {
            logger.error("Failed to set session cookies:", e);
          }
        })
        .finally(() => {
          afterNavigate();
        });
      return;
    }

    afterNavigate();
  } catch (e) {
    logger.error("Error handling open-url:", e);
  }
});
