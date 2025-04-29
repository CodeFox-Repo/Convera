import { app, BrowserWindow, globalShortcut, screen } from "electron";
import registerListeners, {
  ListenerOptions,
} from "./helpers/ipc/listeners-register";
import {
  getPreviousApp,
  setPreviousApp,
  setInputText,
} from "./helpers/ipc/ipc-handlers";
import path from "path";
import { exec } from "child_process";
import {
  installExtension,
  REACT_DEVELOPER_TOOLS,
} from "electron-devtools-installer";
import {
  positionWindowAtCenterBottom,
  toggleMainWindowVisibility,
  setWindowHidden,
  isHiddenOffscreen,
} from "./helpers/windows/window-position";
import { injectWindowStyles } from "./helpers/windows/window-styles";
import { initializeChatServer } from "./helpers/chatServer";
import { WINDOW_SIZE_PRESETS } from "./helpers/windows/window-size";

import "./global.css";
import { setMainWindowResizable } from "./helpers/windows/window-resize";
import { calculateWindowDimensions } from "./helpers/windows/utils";


import { clipboard } from "electron";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const robot = require("@hurdlegroup/robotjs"); // do not change this line
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { activeWindowSync } = process.platform === "win32" ? require("get-windows") : { activeWindowSync: null };

const inDevelopment = process.env.NODE_ENV === "development";
let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
// Use hardcoded default shortcut to avoid circular dependency
const currentActivateShortcut =
process.platform === "darwin" ? "Alt+Space" : "Control+Shift+Space";

// Separate background process for tracking focused appss
let trackingAppFocus = false;

// Agent popover window
let agentPopoverWindow: BrowserWindow | null = null;

// Model selector popover window
let modelSelectorWindow: BrowserWindow | null = null;

/**
 * Simulate a copy command (Ctrl+C or Command+C) to capture selected text
 * @returns Promise that resolves when the copy operation is complete
 */
function simulateClipboardCopy(): Promise<void> {
  return new Promise((resolve) => {
    try {
      console.log("Using RobotJS to simulate copy command");

      if (process.platform === "darwin") {
        // For macOS, use Command+C
        robot.keyTap("c", "command");
      } else {
        // For Windows/Linux, use Control+C
        robot.keyTap("c", "control");
      }

      // Add a delay to ensure clipboard has been updated
      setTimeout(() => {
        resolve();
      }, 100); // Slightly longer delay to ensure clipboard has been updated
    } catch (error) {
      console.error("Error simulating copy command with RobotJS:", error);
      // Even if it fails, we'll resolve to allow the app to continue
      setTimeout(resolve, 50);
    }
  });
}
// Pre-create agent popover window
function preCreateAgentPopoverWindow() {
  if (agentPopoverWindow) return agentPopoverWindow;

  console.log("Pre-creating agent popover window");
  const preload = path.join(__dirname, "preload.js");

  // Get dimensions from presets
  const dimensions = calculateWindowDimensions(
    WINDOW_SIZE_PRESETS.AGENT_POPOVER,
  );

  agentPopoverWindow = new BrowserWindow({
    width: dimensions.width,
    height: dimensions.height,
    x: 0,
    y: 0,
    webPreferences: {
      devTools: inDevelopment,
      contextIsolation: true,
      nodeIntegration: true,
      preload: preload,
    },
    modal: false,
    frame: false,
    transparent: true,
    show: false,
    resizable: false,
    skipTaskbar: true,
    roundedCorners: true,
    thickFrame: false,
    hasShadow: true,
    alwaysOnTop: true,
    type: "popover",
    backgroundColor: "#00000000",
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    agentPopoverWindow.loadURL(
      `${MAIN_WINDOW_VITE_DEV_SERVER_URL}?view=agent-popover`,
    );
  } else {
    agentPopoverWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
      { hash: "agent-popover" },
    );
  }

  // Handle hash parameter
  handleUrlHash(agentPopoverWindow);

  // Click outside to close
  agentPopoverWindow.on("blur", () => {
    if (agentPopoverWindow) {
      agentPopoverWindow.hide();
    }
  });

  agentPopoverWindow.on("closed", () => {
    agentPopoverWindow = null;
  });

  return agentPopoverWindow;
}

// Pre-create model selector window
function preCreateModelSelectorWindow() {
  if (modelSelectorWindow) return modelSelectorWindow;

  console.log("Pre-creating model selector window");
  const preload = path.join(__dirname, "preload.js");

  // Get dimensions from presets
  const dimensions = calculateWindowDimensions(
    WINDOW_SIZE_PRESETS.MODEL_SELECTOR,
  );

  modelSelectorWindow = new BrowserWindow({
    width: dimensions.width,
    height: dimensions.height,
    webPreferences: {
      devTools: inDevelopment,
      contextIsolation: true,
      nodeIntegration: true,
      nodeIntegrationInSubFrames: false,
      preload: preload,
    },
    transparent: true,
    frame: false,
    show: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    roundedCorners: true,
    thickFrame: false,
    hasShadow: true,
    type: "popover",
    backgroundColor: "#00000000",
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    modelSelectorWindow.loadURL(
      `${MAIN_WINDOW_VITE_DEV_SERVER_URL}?view=model-selector`,
    );
  } else {
    modelSelectorWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
      { hash: "model-selector" },
    );
  }

  // Handle hash parameter
  handleModelSelectorUrlHash(modelSelectorWindow);

  // Click outside to close
  modelSelectorWindow.on("blur", () => {
    if (modelSelectorWindow) {
      modelSelectorWindow.hide();
    }
  });

  modelSelectorWindow.on("closed", () => {
    modelSelectorWindow = null;
  });

  return modelSelectorWindow;
}

// Start background app tracking on macOS and Windows
function startAppFocusTracking() {
  // Only run on supported platforms and only start once
  if ((process.platform !== "darwin" && process.platform !== "win32") || trackingAppFocus) {
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
          if (appName && !ignoreList.some((name) => appName.toLowerCase().includes(name.toLowerCase()))) {
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

  console.log(
    `Attempting to register global shortcut: ${currentActivateShortcut}`,
  );
  try {
    const ret = globalShortcut.register(currentActivateShortcut, async () => {
      console.log(`${currentActivateShortcut} pressed globally`);

      const prevApp = getPreviousApp();
      if (prevApp) {
        console.log(`Previously focused application: ${prevApp}`);
      }

      await simulateClipboardCopy();

      const selectedText = clipboard.readText();
      console.log(
        `Selected text from clipboard: ${selectedText ? "Found" : "None"}`,
      );

      clipboard.writeText("");

      if (!mainWindow) {
        createMainWindow();
      } else {
        toggleMainWindowVisibility(mainWindow);
      }
      
      if (mainWindow && mainWindow.isVisible()) {
        setTimeout(() => {
          console.log("Setting input text with selected text from clipboard");
          setInputText(mainWindow, selectedText);
        }, 100);
      }
    });

    if (!ret) {
      console.error(
        `Failed to register global shortcut: ${currentActivateShortcut}. It might be already in use.`,
      );
    } else {
      console.log(
        `Global shortcut ${currentActivateShortcut} registered successfully.`,
      );
    }
  } catch (error) {
    console.error(
      `Error registering global shortcut ${currentActivateShortcut}:`,
      error,
    );
  }
}

function createMainWindow() {
  const preload = path.join(__dirname, "preload.js");

  const dimensions = calculateWindowDimensions(WINDOW_SIZE_PRESETS.MAIN);

  console.log(
    `Creating main window with bounds: x=${dimensions.x}, y=${dimensions.y}, w=${dimensions.width}, h=${dimensions.height}`,
  );

  mainWindow = new BrowserWindow({
    width: dimensions.width,
    height: dimensions.height,
    x: dimensions.x,
    y: dimensions.y,
    webPreferences: {
      devTools: inDevelopment,
      contextIsolation: true,
      nodeIntegration: true,
      nodeIntegrationInSubFrames: false,
      preload: preload,
    },
    vibrancy: "fullscreen-ui",
    titleBarStyle: "hiddenInset",
    transparent: true,
    frame: false,
    visualEffectState: "active",
    thickFrame: false,
    autoHideMenuBar: true,
    hasShadow: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    roundedCorners: true,
    show: false,
    alwaysOnTop: true,
  });

  if (mainWindow && process.platform === "darwin") {
    mainWindow.setWindowButtonVisibility(false);
    mainWindow.setBackgroundColor("#00000000");
  }

  setMainWindowResizable(false, mainWindow!);
  injectWindowStyles(mainWindow);

  if (mainWindow) {
    mainWindow.setMenuBarVisibility(false);
    mainWindow.setMenu(null);

    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    } else {
      mainWindow.loadFile(
        path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
      );
    }

    mainWindow.once("ready-to-show", () => {
      if (mainWindow) {
        positionWindowAtCenterBottom(
          mainWindow,
          undefined,
          WINDOW_SIZE_PRESETS.MAIN,
        );

        console.log("Main window ready, position set, keeping hidden.");
        
        setWindowHidden(mainWindow);
      }
    });
  }

  if (inDevelopment && mainWindow) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  mainWindow?.on("closed", () => {
    mainWindow = null;
  });
  
  const mainProcessOptions: ListenerOptions = {
    createSettingsWindow,
    settingsWindow,
    registerGlobalShortcuts,
    createAgentPopoverWindow,
    agentPopoverWindow,
    createModelSelectorWindow,
    modelSelectorWindow,
  };
  console.log("Registering listeners: ", mainProcessOptions);
  registerListeners(mainWindow, mainProcessOptions);
  
  return mainWindow;
}

function preCreateSettingsWindow() {
  if (settingsWindow) return settingsWindow;
  console.log("Pre-creating settings window");
  const preload = path.join(__dirname, "preload.js");

  const dimensions = calculateWindowDimensions(
    WINDOW_SIZE_PRESETS.SETTINGS,
    undefined,
    true,
    true,
  );

  settingsWindow = new BrowserWindow({
    width: dimensions.width,
    height: dimensions.height,
    x: dimensions.x,
    y: dimensions.y,
    webPreferences: {
      devTools: inDevelopment,
      contextIsolation: true,
      nodeIntegration: true,
      nodeIntegrationInSubFrames: false,
      preload: preload,
    },
    parent: mainWindow || undefined,
    modal: false,
    show: false,
    titleBarStyle: "hiddenInset",
    transparent: true,
    frame: false,
    visualEffectState: "active",
    thickFrame: false,
    autoHideMenuBar: true,
    hasShadow: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    roundedCorners: true,
    vibrancy: "fullscreen-ui",
  });

  if (settingsWindow && process.platform === "darwin") {
    settingsWindow.setWindowButtonVisibility(false);
  }

  settingsWindow.on("will-resize", (event) => {
    event.preventDefault();
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    console.log(
      "Loading main URL in settings window:",
      MAIN_WINDOW_VITE_DEV_SERVER_URL,
    );
    settingsWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    const mainPath = path.join(
      __dirname,
      `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`,
    );
    console.log("Loading main path in settings window:", mainPath);
    settingsWindow.loadFile(mainPath);
  }

  settingsWindow.webContents.on("did-finish-load", () => {
    console.log(
      "Main page loaded in settings window, redirecting to settings...",
    );

    settingsWindow?.webContents
      .executeJavaScript(
        `
      console.log("Redirecting to settings page...");
      
      if (window.router) {
        console.log("Using router API");
        window.router.navigate({ to: "/settings" });
      } else {
        console.log("Using location.hash");
        window.location.hash = "/settings";
      }
    `,
      )
      .catch((err) => {
        console.error("Failed to execute navigation script:", err);
      });
  });

  settingsWindow.webContents.on(
    "did-fail-load",
    (event, errorCode, errorDescription) => {
      console.error(
        "Settings window failed to load:",
        errorCode,
        errorDescription,
      );
    },
  );

  settingsWindow.once("ready-to-show", () => {
    if (settingsWindow) {
    }
  });

  settingsWindow.on("closed", () => {
    console.log("Settings window closed, setting reference to null");
    settingsWindow = null;
  });

  return settingsWindow;
}

function createSettingsWindow() {
  if (!settingsWindow) {
    preCreateSettingsWindow();
  }

  if (settingsWindow) {
    settingsWindow.show();
    settingsWindow.focus();
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
  // Listen for primary display metrics change (resolution or scale factor change)
  screen.on("display-metrics-changed", (event, display, changedMetrics) => {
    if (display.id === screen.getPrimaryDisplay().id) {
      console.log("Primary display metrics changed:", changedMetrics);

      // Update main window if it exists
      if (mainWindow && !isHiddenOffscreen) {
        const dimensions = calculateWindowDimensions(WINDOW_SIZE_PRESETS.MAIN);
        mainWindow.setBounds(dimensions);
      }

      // Update settings window if visible
      if (settingsWindow && settingsWindow.isVisible()) {
        const dimensions = calculateWindowDimensions(
          WINDOW_SIZE_PRESETS.SETTINGS,
          undefined,
          true,
          true,
        );
        settingsWindow.setBounds(dimensions);
      }
    }
  });
}

app.whenReady().then(async () => {
  try {
    if (inDevelopment) {
      await installExtensions();
    }

    await initializeChatServer();
    console.log("Chat server is fully initialized");

    
    startAppFocusTracking();
    registerGlobalShortcuts();
    preCreateAgentPopoverWindow();
    preCreateSettingsWindow();
    preCreateModelSelectorWindow();
    setupScreenResizeHandlers();
    createMainWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  } catch (error) {
    console.error("Error during app initialization", error);
  }
});

app.on("will-quit", () => {
  console.log("Unregistering all global shortcuts.");
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  // Only quit the app if mainWindow is closed and we're not on macOS
  if (process.platform !== "darwin" && mainWindow === null) {
    app.quit();
  }
});

// Create agent popover window at a specific position or show existing one
function createAgentPopoverWindow(x: number, y: number, width = 0, height = 0) {
  console.log("Showing agent popover window");
  if (!agentPopoverWindow) {
    // Create if it doesn't exist
    preCreateAgentPopoverWindow();
  }

  if (agentPopoverWindow) {
    // Get dimensions from presets if not provided
    if (width === 0 || height === 0) {
      const dimensions = calculateWindowDimensions(
        WINDOW_SIZE_PRESETS.AGENT_POPOVER,
      );
      width = dimensions.width;
      height = dimensions.height;
    }

    // Reposition and show
    console.log(
      `Repositioning agent popover to: x=${x}, y=${y}, width=${width}, height=${height}`,
    );
    agentPopoverWindow.setBounds({ x, y, width, height });
    agentPopoverWindow.show();
    agentPopoverWindow.focus();
  }

  return agentPopoverWindow;
}

// Handle url hash to render different views
function handleUrlHash(window: BrowserWindow) {
  window.webContents.on("did-finish-load", () => {
    // Check for specific view hash
    const url = new URL(window.webContents.getURL());
    if (url.hash === "#agent-popover") {
      console.log("Rendering agent popover view");
      // Inject any specific styles or scripts if needed
    }
  });
}

// Create model selector window at a specific position or show existing one
function createModelSelectorWindow(
  x: number,
  y: number,
  width = 0,
  height = 0,
) {
  console.log("Showing model selector window");
  if (!modelSelectorWindow) {
    // Create if it doesn't exist
    preCreateModelSelectorWindow();
  }

  if (modelSelectorWindow) {
    // Get dimensions from presets if not provided
    if (width === 0 || height === 0) {
      const dimensions = calculateWindowDimensions(
        WINDOW_SIZE_PRESETS.MODEL_SELECTOR,
      );
      width = dimensions.width;
      height = dimensions.height;
    }

    // Reposition and show
    console.log(
      `Repositioning model selector to: x=${x}, y=${y}, width=${width}, height=${height}`,
    );
    modelSelectorWindow.setBounds({ x, y, width, height });
    modelSelectorWindow.show();
    modelSelectorWindow.focus();
  }

  return modelSelectorWindow;
}

// Handle url hash for model selector
function handleModelSelectorUrlHash(window: BrowserWindow) {
  window.webContents.on("did-finish-load", () => {
    // Check for specific view hash
    const url = new URL(window.webContents.getURL());
    if (url.hash === "#model-selector") {
      console.log("Rendering model selector view");
      // Inject any specific styles or scripts if needed
    }
  });
}
