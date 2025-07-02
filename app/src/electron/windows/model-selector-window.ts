import { calculateWindowDimensions } from "@/electron/windows/utils";
import {
  WINDOW_SIZE_PRESETS,
  WindowDimensions,
} from "@/electron/windows/window-size";
import { inDevelopment } from "@/shared/constants/dev";
import { BrowserWindow, BrowserWindowConstructorOptions } from "electron";
import path from "path";
import { getLogger } from "../logger";

// Initialize logger for model selector window
const logger = getLogger("model-selector");

// Global reference to the model selector window
let modelSelectorWindow: BrowserWindow | null = null;

// Create platform-specific configuration for model selector window
function createPlatformSpecificConfig(
  dimensions: WindowDimensions,
  x: number,
  y: number,
  mainWindow: BrowserWindow | null,
): BrowserWindowConstructorOptions {
  const baseConfig: BrowserWindowConstructorOptions = {
    width: dimensions.width,
    height: dimensions.height,
    x: x || dimensions.x,
    y: y || dimensions.y,
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
    parent: mainWindow || undefined,
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

  logger.info("Pre-creating model selector window");

  // Get dimensions from presets
  const dimensions = calculateWindowDimensions(
    WINDOW_SIZE_PRESETS.MODEL_SELECTOR,
  );

  logger.debug("Model selector dimensions calculated", { dimensions });

  // Create window with platform-specific configuration
  const config = createPlatformSpecificConfig(
    dimensions,
    dimensions.x,
    dimensions.y,
    null,
  );
  modelSelectorWindow = new BrowserWindow(config);

  logger.debug("Model selector window created with platform-specific config");

  // Load content
  loadWindowContent(modelSelectorWindow);

  // Setup event handlers
  setupWindowEventHandlers(modelSelectorWindow);

  logger.info("Model selector window pre-creation completed");

  return modelSelectorWindow;
}

// Create model selector window at a specific position or show existing one
export function createModelSelectorWindow(
  x: number,
  y: number,
  width = 0,
  height = 0,
): BrowserWindow | null {
  logger.info("Showing model selector window", { x, y, width, height });

  if (!modelSelectorWindow) {
    logger.warn("Model selector window not pre-created, creating now");
    preCreateModelSelectorWindow();
  }

  if (modelSelectorWindow) {
    // Get dimensions from presets - directly override like agent popover
    const presetDimensions = calculateWindowDimensions(
      WINDOW_SIZE_PRESETS.MODEL_SELECTOR,
    );
    width = presetDimensions.width;
    height = presetDimensions.height;

    logger.debug("Repositioning model selector window", {
      x,
      y,
      width,
      height,
    });
    modelSelectorWindow.setBounds({ x, y, width, height });
    modelSelectorWindow.show();
    modelSelectorWindow.focus();
  } else {
    logger.error("Failed to create model selector window");
  }

  return modelSelectorWindow;
}

// Get model selector window reference
export function getModelSelectorWindow(): BrowserWindow | null {
  return modelSelectorWindow;
}
