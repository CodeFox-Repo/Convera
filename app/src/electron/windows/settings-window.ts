import { calculateWindowDimensions } from "@/electron/windows/utils";
import {
  WINDOW_SIZE_PRESETS,
  WindowDimensions,
} from "@/electron/windows/window-size";
import { inDevelopment } from "@/shared/constants/dev";
import { BrowserWindow, BrowserWindowConstructorOptions } from "electron";
import path from "path";

// Global reference to the settings window
let settingsWindow: BrowserWindow | null = null;

// Create platform-specific configuration for settings window
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
  window.on("will-resize", (event) => {
    event.preventDefault();
  });
}

// Load window content
function loadWindowContent(window: BrowserWindow) {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    console.log(
      "Loading main URL in settings window:",
      MAIN_WINDOW_VITE_DEV_SERVER_URL,
    );
    window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    const mainPath = path.join(
      __dirname,
      `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`,
    );
    console.log("Loading main path in settings window:", mainPath);
    window.loadFile(mainPath);
  }
}

// Setup window event handlers
function setupWindowEventHandlers(window: BrowserWindow) {
  window.webContents.on("did-finish-load", () => {
    console.log(
      "Main page loaded in settings window, redirecting to settings...",
    );

    window.webContents
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

    if (inDevelopment && window) {
      console.log("Opening DevTools for settings window");
      window.webContents.openDevTools({ mode: "detach" });
    }
  });

  window.webContents.on(
    "did-fail-load",
    (event, errorCode, errorDescription) => {
      console.error(
        "Settings window failed to load:",
        errorCode,
        errorDescription,
      );
    },
  );

  window.once("ready-to-show", () => {
    console.log("Settings window ready, but kept hidden");
  });

  window.on("closed", () => {
    settingsWindow = null;
  });
}

// Pre-create settings window
export function preCreateSettingsWindow(
  mainWindow?: BrowserWindow,
): BrowserWindow | null {
  if (settingsWindow) return settingsWindow;

  console.log("Pre-creating settings window");

  const dimensions = calculateWindowDimensions(
    WINDOW_SIZE_PRESETS.SETTINGS,
    undefined,
    true,
    true,
  );

  // Create window with platform-specific configuration
  const config = createPlatformSpecificConfig(dimensions, mainWindow);
  settingsWindow = new BrowserWindow(config);

  // Configure appearance and properties
  configurePlatformAppearance(settingsWindow);
  configureWindowProperties(settingsWindow);

  // Load content
  loadWindowContent(settingsWindow);

  // Setup event handlers
  setupWindowEventHandlers(settingsWindow);

  return settingsWindow;
}

// Create and show settings window
export function createSettingsWindow(): void {
  if (!settingsWindow) {
    preCreateSettingsWindow();
  }

  if (settingsWindow) {
    settingsWindow.show();
    settingsWindow.focus();
  }
}

// Close settings window
export function closeSettingsWindow(): void {
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

// Get settings window reference
export function getSettingsWindow(): BrowserWindow | null {
  return settingsWindow;
}
