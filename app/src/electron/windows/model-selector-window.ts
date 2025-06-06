import { calculateWindowDimensions } from "@/electron/windows/utils";
import {
  WINDOW_SIZE_PRESETS,
  WindowDimensions,
} from "@/electron/windows/window-size";
import { inDevelopment } from "@/shared/constants/dev";
import { BrowserWindow, BrowserWindowConstructorOptions } from "electron";
import path from "path";

// Global reference to the model selector window
let modelSelectorWindow: BrowserWindow | null = null;

// Create platform-specific configuration for model selector window
function createPlatformSpecificConfig(
  dimensions: WindowDimensions,
): BrowserWindowConstructorOptions {
  const baseConfig: BrowserWindowConstructorOptions = {
    width: dimensions.width,
    height: dimensions.height,
    webPreferences: {
      devTools: inDevelopment,
      contextIsolation: true,
      nodeIntegration: true,
      nodeIntegrationInSubFrames: false,
      preload: path.join(__dirname, "preload.js"),
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
  };

  return baseConfig;
}

// Load window content
function loadWindowContent(window: BrowserWindow) {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    window.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}?view=model-selector`);
  } else {
    window.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
      { hash: "model-selector" },
    );
  }
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

// Setup window event handlers
function setupWindowEventHandlers(window: BrowserWindow) {
  // Handle hash parameter
  handleModelSelectorUrlHash(window);

  // Click outside to close
  window.on("blur", () => {
    if (window) {
      window.hide();
    }
  });

  window.on("closed", () => {
    modelSelectorWindow = null;
  });
}

// Pre-create model selector window
export function preCreateModelSelectorWindow(): BrowserWindow | null {
  if (modelSelectorWindow) return modelSelectorWindow;

  console.log("Pre-creating model selector window");

  // Get dimensions from presets
  const dimensions = calculateWindowDimensions(
    WINDOW_SIZE_PRESETS.MODEL_SELECTOR,
  );

  // Create window with platform-specific configuration
  const config = createPlatformSpecificConfig(dimensions);
  modelSelectorWindow = new BrowserWindow(config);

  // Load content
  loadWindowContent(modelSelectorWindow);

  // Setup event handlers
  setupWindowEventHandlers(modelSelectorWindow);

  return modelSelectorWindow;
}

// Create model selector window at a specific position or show existing one
export function createModelSelectorWindow(
  x: number,
  y: number,
  width = 0,
  height = 0,
): BrowserWindow | null {
  console.log("Showing model selector window");
  if (!modelSelectorWindow) {
    // Create if it doesn't exist
    preCreateModelSelectorWindow();
  }

  if (modelSelectorWindow) {
    // Get dimensions from presets - directly override like agent popover
    const presetDimensions = calculateWindowDimensions(
      WINDOW_SIZE_PRESETS.MODEL_SELECTOR,
    );
    width = presetDimensions.width;
    height = presetDimensions.height;

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

// Get model selector window reference
export function getModelSelectorWindow(): BrowserWindow | null {
  return modelSelectorWindow;
}
