import { calculateWindowDimensions } from "@/electron/windows/utils";
import {
  WINDOW_SIZE_PRESETS,
  WindowDimensions,
} from "@/electron/windows/window-size";
import { inDevelopment } from "@/shared/constants/dev";
import { BrowserWindow, BrowserWindowConstructorOptions } from "electron";
import path from "path";

// Global reference to the main window
let mainWindow: BrowserWindow | null = null;

// Create platform-specific configuration for main window
function createPlatformSpecificConfig(
  dimensions: WindowDimensions,
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
  window.on("will-resize", (event) => {
    event.preventDefault();
  });
}

// Load window content
function loadWindowContent(window: BrowserWindow) {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    console.log(
      "Loading main URL in main window:",
      MAIN_WINDOW_VITE_DEV_SERVER_URL,
    );
    window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    const mainPath = path.join(
      __dirname,
      `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`,
    );
    console.log("Loading main path in main window:", mainPath);
    window.loadFile(mainPath);
  }
}

// Setup window event handlers
function setupWindowEventHandlers(window: BrowserWindow) {
  window.webContents.on("did-finish-load", () => {
    console.log("Main page loaded in main window, redirecting to main...");

    const executeNavigation = async () => {
      try {
        await window.webContents.executeJavaScript(
          `
      console.log("Redirecting to main page...");
      
      if (window.router) {
        console.log("Using router API");
        window.router.navigate({ to: "/" });
      } else {
        console.log("Using location.hash");
        window.location.hash = "/";
      }
    `,
        );
      } catch (err) {
        console.error("Failed to execute navigation script:", err);
      }
    };
    executeNavigation();

    if (inDevelopment && window) {
      console.log("Opening DevTools for main window");
      window.webContents.openDevTools({ mode: "detach" });
    }
  });

  window.webContents.on(
    "did-fail-load",
    (event, errorCode, errorDescription) => {
      console.error("Main window failed to load:", errorCode, errorDescription);
    },
  );

  window.once("ready-to-show", () => {
    console.log("Main window ready, but kept hidden");
  });

  window.on("closed", () => {
    console.log("Main window closed, setting reference to null");
    mainWindow = null;
  });
}

// Pre-create main window
export function preCreateMainWindow(
  chatWindow?: BrowserWindow,
): BrowserWindow | null {
  if (mainWindow) return mainWindow;

  console.log("Pre-creating main window");

  const dimensions = calculateWindowDimensions(
    WINDOW_SIZE_PRESETS.SETTINGS,
    undefined,
    true,
    true,
  );

  // Create window with platform-specific configuration
  const config = createPlatformSpecificConfig(dimensions);

  // Add parent window if provided
  if (chatWindow) {
    config.parent = chatWindow;
  }

  mainWindow = new BrowserWindow(config);

  // Configure appearance and properties
  configurePlatformAppearance(mainWindow);
  configureWindowProperties(mainWindow);

  // Load content
  loadWindowContent(mainWindow);

  // Setup event handlers
  setupWindowEventHandlers(mainWindow);

  return mainWindow;
}

// Create and show main window
export function createMainWindow(): void {
  if (!mainWindow) {
    preCreateMainWindow();
  }

  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
}

// Get main window reference
export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}
