import {
  app,
  BrowserWindow,
  CookiesSetDetails,
  globalShortcut,
} from "electron";

import { getLogger, initializeLogger } from "@/electron/logger";
import { getMCPHub, initializeMCPHub } from "@/electron/mcp";
import { exec } from "child_process";

import {
  setPreviousApp,
  preloadAllAppData,
} from "@/electro-bridge/ipc/active-app-context";
import { getCurrentShortcut } from "@/electro-bridge/ipc/ipc-handlers";

import {
  ListenerOptions,
  registerListeners,
} from "@/electro-bridge/ipc/listeners-register";
import { createSystemTray, destroySystemTray } from "./tray";
import {
  createMainWindow,
  getMainWindow,
  preCreateMainWindow,
} from "./windows/main-window";

const { activeWindowSync } =
  process.platform === "win32"
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("get-windows")
    : { activeWindowSync: null };

let trackingAppFocus = false;

// Initialize logger for main process
const logger = getLogger("main-process");

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
    const ret = globalShortcut.register(currentShortcut, () => {
      // Show and focus main window
      const mainWindow = getMainWindow();
      if (mainWindow) {
        if (mainWindow.isMinimized()) {
          mainWindow.restore();
        }
        mainWindow.show();
        mainWindow.focus();
      } else {
        // Create main window if it doesn't exist
        createMainWindow();
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

// Handle screen resize events - simplified for single window
function setupScreenResizeHandlers() {
  // No special handling needed for resizable single window
  // The window will handle resize naturally
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

    // Pre-create and show main window
    const mainWindow = preCreateMainWindow();
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }

    // Set up options for the new unified listener system
    const listenerOptions: ListenerOptions = {
      mainWindow: () => getMainWindow(),
      registerGlobalShortcuts,
    };

    logger.debug("Registering IPC listeners");
    registerListeners(listenerOptions);

    app.on("activate", () => {
      const mainWin = getMainWindow();
      if (mainWin) {
        mainWin.show();
        mainWin.focus();
      } else if (BrowserWindow.getAllWindows().length === 0) {
        logger.info("App activated, creating main window");
        createMainWindow();
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
      const win = getMainWindow();
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
