import { calculateWindowDimensions } from "@/electron/windows/utils";
import {
  WINDOW_SIZE_PRESETS,
  WindowDimensions,
} from "@/electron/windows/window-size";
import { inDevelopment } from "@/shared/constants/dev";
import { BrowserWindow, BrowserWindowConstructorOptions } from "electron";
import path from "path";

// Global reference to the settings window
let visionWindow: BrowserWindow | null = null;

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
      "Loading main URL in vision window:",
      MAIN_WINDOW_VITE_DEV_SERVER_URL,
    );
    window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    const mainPath = path.join(
      __dirname,
      `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`,
    );
    console.log("Loading main path in vision window:", mainPath);
    window.loadFile(mainPath);
  }
}

// Setup window event handlers
function setupWindowEventHandlers(window: BrowserWindow) {
  window.webContents.on("did-finish-load", () => {
    console.log("Main page loaded in vision window, redirecting to vision...");

    window.webContents
      .executeJavaScript(
        `
      console.log("Redirecting to vision page...");
      
      if (window.router) {
        console.log("Using router API");
        window.router.navigate({ to: "/vision-automate" });
      } else {
        console.log("Using location.hash");
        window.location.hash = "/vision-automate";
      }
    `,
      )
      .catch((err) => {
        console.error("Failed to execute navigation script:", err);
      });

    if (inDevelopment && window) {
      console.log("Opening DevTools for vision window");
      window.webContents.openDevTools({ mode: "detach" });
    }
  });

  window.webContents.on(
    "did-fail-load",
    (event, errorCode, errorDescription) => {
      console.error(
        "Vision window failed to load:",
        errorCode,
        errorDescription,
      );
    },
  );

  window.once("ready-to-show", () => {
    console.log("Vision window ready, but kept hidden");
  });

  window.on("closed", () => {
    visionWindow = null;
  });
}

// Pre-create vision window
export function preCreateVisionWindow(
  mainWindow?: BrowserWindow,
): BrowserWindow | null {
  if (visionWindow) return visionWindow;

  console.log("Pre-creating vision window");

  const dimensions = calculateWindowDimensions(
    WINDOW_SIZE_PRESETS.VISION,
    undefined,
    true,
    true,
  );

  // Create window with platform-specific configuration
  const config = createPlatformSpecificConfig(dimensions, mainWindow);
  visionWindow = new BrowserWindow(config);

  // Configure appearance and properties
  configurePlatformAppearance(visionWindow);
  configureWindowProperties(visionWindow);

  // Load content
  loadWindowContent(visionWindow);

  // Setup event handlers
  setupWindowEventHandlers(visionWindow);

  return visionWindow;
}

// Create and show vision window
export function createVisionWindow(): void {
  if (!visionWindow) {
    preCreateVisionWindow();
  }

  if (visionWindow) {
    visionWindow.show();
    visionWindow.focus();
  }
}

// Close vision window
export function closeVisionWindow(): void {
  if (visionWindow) {
    // Make sure to just hide the window, not close it
    // This prevents triggering the 'closed' event
    visionWindow.hide();

    // Ensure the window remains valid but not visible
    if (process.platform === "darwin") {
      // On macOS, we might need to also blur the window
      visionWindow.blur();
    }

    console.log("Vision window hidden");
  }
}

// Get vision window reference
export function getVisionWindow(): BrowserWindow | null {
  return visionWindow;
}
