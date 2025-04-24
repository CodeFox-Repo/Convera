import { app, BrowserWindow, globalShortcut, screen } from "electron";
import registerListeners, {
  ListenerOptions,
} from "./helpers/ipc/listeners-register";
import { getPreviousApp, setPreviousApp } from "./helpers/ipc/ipc-handlers";
import path from "path";
import { exec } from "child_process";
import {
  installExtension,
  REACT_DEVELOPER_TOOLS,
} from "electron-devtools-installer";
import {
  positionWindowAtCenterBottom,
  toggleMainWindowVisibility,
} from "./helpers/windows/window-position";
import { injectWindowStyles } from "./helpers/windows/window-styles";
import { initializeChatServer } from "./helpers/chatServer";
import { WINDOW_SIZE_PRESETS } from "./helpers/windows/window-size";

import "./global.css";
import { setMainWindowResizable } from "./helpers/windows/window-resize";
import { calculateWindowDimensions } from "./helpers/windows/utils";

const inDevelopment = process.env.NODE_ENV === "development";
let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
// Use hardcoded default shortcut to avoid circular dependency
const currentActivateShortcut = "Control+Space";

// Separate background process for tracking focused apps
let trackingAppFocus = false;

// Agent popover window
let agentPopoverWindow: BrowserWindow | null = null;

// Model selector popover window
let modelSelectorWindow: BrowserWindow | null = null;

// Flag to track window visibility state
const isHiddenOffscreen = true;

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

// Start background app tracking only on macOS
function startAppFocusTracking() {
  // Only run on macOS and only start once
  if (process.platform !== "darwin" || trackingAppFocus) {
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

    // Use a simpler, faster script just to get the name and store it
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
  }, 200);
}

function registerGlobalShortcuts() {
  // Unregister any existing shortcuts first
  globalShortcut.unregisterAll();

  // Attempt to register the activate shortcut
  console.log(
    `Attempting to register global shortcut: ${currentActivateShortcut}`,
  );
  try {
    const ret = globalShortcut.register(currentActivateShortcut, () => {
      console.log(`${currentActivateShortcut} pressed globally`);

      // Get the previous app but don't use it for auto-switching
      const prevApp = getPreviousApp();
      if (prevApp) {
        console.log(`Previously focused application: ${prevApp}`);
        // No auto-focus back to previous app - intentionally disabled
      }

      // Toggle visibility based on window state
      if (!mainWindow) {
        createMainWindow();
      } else {
        toggleMainWindowVisibility(mainWindow);
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

  // Calculate window dimensions using the utility
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
    resizable: false, // Start in compact mode (not resizable)
    maximizable: false,
    fullscreenable: false,
    roundedCorners: true,
    show: false,
    alwaysOnTop: true,
  });

  // Apply custom window styling
  if (mainWindow && process.platform === "darwin") {
    // macOS specific configuration
    mainWindow.setWindowButtonVisibility(false);
    // On macOS, set a specific corner radius
    mainWindow.setBackgroundColor("#00000000"); // Transparent background
  }

  // Initial state is compact mode, so set up resize prevention
  setMainWindowResizable(false, mainWindow!);

  // Apply consistent window styles
  injectWindowStyles(mainWindow);

  if (mainWindow) {
    mainWindow.setMenuBarVisibility(false);
    mainWindow.setMenu(null);

    // Load the main app interface
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    } else {
      mainWindow.loadFile(
        path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
      );
    }

    mainWindow.once("ready-to-show", () => {
      if (mainWindow) {
        // Position the window at center-bottom using our preset config and default percent margin
        positionWindowAtCenterBottom(
          mainWindow,
          undefined,
          WINDOW_SIZE_PRESETS.MAIN,
        );

        console.log("Main window ready, position set, but hidden initially.");

        // Uncomment the line below to show the window on startup
        // mainWindow.show();
      }
    });
  }

  if (inDevelopment && mainWindow) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  mainWindow?.on("closed", () => {
    mainWindow = null;
  });
}

function preCreateSettingsWindow() {
  if (settingsWindow) return settingsWindow;

  console.log("Pre-creating settings window");
  const preload = path.join(__dirname, "preload.js");

  // Calculate window dimensions using the utility
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

  // For macOS, explicitly hide the traffic light buttons
  if (settingsWindow && process.platform === "darwin") {
    settingsWindow.setWindowButtonVisibility(false);
  }

  // Enforce fixed dimensions
  settingsWindow.on("will-resize", (event) => {
    // Prevent resizing by canceling the event
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
      console.log("Settings window ready, but kept hidden");

      if (inDevelopment) {
        settingsWindow.webContents.openDevTools({ mode: "detach" });
      }
    }
  });

  settingsWindow.on("closed", () => {
    console.log("Settings window closed");
    settingsWindow = null;

    // Ensure main window stays open
    if (mainWindow && !mainWindow.isVisible()) {
      // If main window was hidden, make it visible again
      mainWindow.show();
    }
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

    createMainWindow();
    startAppFocusTracking();
    registerGlobalShortcuts();
    preCreateAgentPopoverWindow();
    preCreateSettingsWindow();
    preCreateModelSelectorWindow(); // Pre-create model selector window
    setupScreenResizeHandlers(); // Setup screen resize handlers

    const mainProcessOptions: ListenerOptions = {
      createSettingsWindow,
      settingsWindow,
      registerGlobalShortcuts,
      createAgentPopoverWindow,
      agentPopoverWindow,
      createModelSelectorWindow,
      modelSelectorWindow,
    };

    // Register IPC listeners if main window exists
    if (mainWindow) {
      registerListeners(mainWindow, mainProcessOptions);
    }

    // On macOS, recreate the window when dock icon is clicked
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
