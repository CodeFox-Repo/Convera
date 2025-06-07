import { calculateWindowDimensions } from "@/electron/windows/utils";
import {
  WINDOW_SIZE_PRESETS,
  WindowDimensions,
} from "@/electron/windows/window-size";
import { inDevelopment } from "@/shared/constants/dev";
import { BrowserWindow, BrowserWindowConstructorOptions } from "electron";
import path from "path";

// Global reference to the history window
let historyWindow: BrowserWindow | null = null;

// Create platform-specific configuration for history window
function createPlatformSpecificConfig(
  dimensions: WindowDimensions,
  mainWindow?: BrowserWindow,
): BrowserWindowConstructorOptions {
  const baseConfig: BrowserWindowConstructorOptions = {
    width: dimensions.width,
    height: dimensions.height,
    x: dimensions.x,
    y: dimensions.y,
    webPreferences: {
      devTools: inDevelopment,
      contextIsolation: true,
      nodeIntegration: true,
      nodeIntegrationInSubFrames: false,
      preload: path.join(__dirname, "preload.js"),
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
  };

  return baseConfig;
}

// Configure platform-specific appearance
function configurePlatformAppearance(window: BrowserWindow) {
  if (process.platform === "darwin") {
    window.setWindowButtonVisibility(false);
  }
}

// Configure window properties
function configureWindowProperties(window: BrowserWindow) {
  // Enforce fixed dimensions
  window.on("will-resize", (event) => {
    // Prevent resizing by canceling the event
    event.preventDefault();
  });
}

// Load window content
function loadWindowContent(window: BrowserWindow) {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    console.log(
      "Loading main URL in history window:",
      MAIN_WINDOW_VITE_DEV_SERVER_URL,
    );
    window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    const mainPath = path.join(
      __dirname,
      `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`,
    );
    console.log("Loading main path in history window:", mainPath);
    window.loadFile(mainPath);
  }
}

// Setup window event handlers
function setupWindowEventHandlers(window: BrowserWindow) {
  window.webContents.on("did-finish-load", () => {
    console.log(
      "Main page loaded in history window, redirecting to history...",
    );

    const executeNavigation = async () => {
      try {
        await window.webContents.executeJavaScript(
          `
      console.log("Redirecting to history page...");
      
      if (window.router) {
        console.log("Using router API");
        window.router.navigate({ to: "/history" });
      } else {
        console.log("Using location.hash");
        window.location.hash = "/history";
      }
    `,
        );
      } catch (err) {
        console.error("Failed to execute navigation script:", err);
      }
    };
    executeNavigation();
  });

  window.webContents.on(
    "did-fail-load",
    (event, errorCode, errorDescription) => {
      console.error(
        "History window failed to load:",
        errorCode,
        errorDescription,
      );
    },
  );

  window.once("ready-to-show", () => {
    console.log("History window ready, but kept hidden");

    if (inDevelopment) {
      window.webContents.openDevTools({ mode: "detach" });
    }
  });

  window.on("closed", () => {
    console.log("History window closed");
    historyWindow = null;
  });
}

// Pre-create history window
export function preCreateHistoryWindow(
  mainWindow?: BrowserWindow,
): BrowserWindow | null {
  if (historyWindow) return historyWindow;

  console.log("Pre-creating history window");

  // Calculate window dimensions using the utility
  const dimensions = calculateWindowDimensions(
    WINDOW_SIZE_PRESETS.SETTINGS, // Reuse settings size for now
    undefined,
    true,
    true,
  );

  // Create window with platform-specific configuration
  const config = createPlatformSpecificConfig(dimensions, mainWindow);
  historyWindow = new BrowserWindow(config);

  // Configure appearance and properties
  configurePlatformAppearance(historyWindow);
  configureWindowProperties(historyWindow);

  // Load content
  loadWindowContent(historyWindow);

  // Setup event handlers
  setupWindowEventHandlers(historyWindow);

  return historyWindow;
}

// Create and show history window
export function createHistoryWindow(): void {
  if (!historyWindow) {
    preCreateHistoryWindow();
  }

  if (historyWindow) {
    historyWindow.show();
    historyWindow.focus();
  }
}

// Get history window reference
export function getHistoryWindow(): BrowserWindow | null {
  return historyWindow;
}
