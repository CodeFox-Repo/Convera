import { calculateWindowDimensions } from "@/electron/windows/utils";
import {
  positionWindowAtCenterBottom,
  resizeWindowAndMaintainPosition,
  setWindowHidden,
  setupWindowPositionTracking,
} from "@/electron/windows/window-position";
import { setMainWindowResizable } from "@/electron/windows/window-resize";
import {
  WINDOW_SIZE_PRESETS,
  WindowDimensions,
} from "@/electron/windows/window-size";
import { injectWindowStyles } from "@/electron/windows/window-styles";
import { inDevelopment } from "@/shared/constants/dev";
import {
  BrowserWindow,
  BrowserWindowConstructorOptions,
  screen,
} from "electron";
import path from "path";

// Extract platform-specific configurations
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
    frame: false,
    autoHideMenuBar: true,
    hasShadow: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    alwaysOnTop: true,
  };

  if (process.platform === "darwin") {
    return {
      ...baseConfig,
      vibrancy: "fullscreen-ui",
      titleBarStyle: "hiddenInset",
      transparent: true,
      visualEffectState: "active",
      thickFrame: false,
      roundedCorners: true,
    };
  } else {
    return {
      ...baseConfig,
      vibrancy: "fullscreen-ui",
      titleBarStyle: "hiddenInset",
      visualEffectState: "active",
      roundedCorners: true,
      transparent: true,
    };
  }
}

// Configure platform-specific appearance
function configurePlatformAppearance(window: BrowserWindow) {
  if (process.platform === "darwin") {
    window.setWindowButtonVisibility(false);
  }
  window.setBackgroundColor("#00000000");
}

// Configure window properties
function configureWindowProperties(window: BrowserWindow) {
  setMainWindowResizable(false, window);
  injectWindowStyles(window);
  window.setMenuBarVisibility(false);
  window.setMenu(null);
}

// Load window content
function loadWindowContent(window: BrowserWindow) {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    window.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
}

// Setup window event handlers
function setupWindowEventHandlers(window: BrowserWindow) {
  // Handle ready-to-show event
  window.once("ready-to-show", () => {
    console.log("Main window ready, positioning and hiding.");
    positionWindowAtCenterBottom(window, undefined, WINDOW_SIZE_PRESETS.MAIN);
    setWindowHidden(window);
  });

  // Handle window closed event
  window.on("closed", () => {
    // Window cleanup will be handled automatically
  });

  // Handle display changes - ensure window fits within new screen bounds
  screen.on("display-metrics-changed", () => {
    if (!window.isDestroyed()) {
      const currentBounds = window.getBounds();

      const isExpanded =
        currentBounds.height > WINDOW_SIZE_PRESETS.MAIN.minHeight! * 2;

      const config = isExpanded
        ? WINDOW_SIZE_PRESETS.EXPANDED_CHAT
        : WINDOW_SIZE_PRESETS.MAIN;

      const newDimensions = calculateWindowDimensions(config, undefined, true);

      resizeWindowAndMaintainPosition(
        window,
        newDimensions.width,
        newDimensions.height,
        true,
        config,
      );
    }
  });

  // Setup position tracking
  setupWindowPositionTracking(window);

  // Open dev tools in development
  if (inDevelopment) {
    window.webContents.openDevTools({ mode: "detach" });
  }
}

export function createMainWindow(): BrowserWindow | null {
  const dimensions = calculateWindowDimensions(WINDOW_SIZE_PRESETS.MAIN);

  console.log(
    `Creating main window with bounds: x=${dimensions.x}, y=${dimensions.y}, w=${dimensions.width}, h=${dimensions.height}`,
  );

  // Create window with platform-specific configuration
  const config = createPlatformSpecificConfig(dimensions);
  const mainWindow = new BrowserWindow(config);

  // Configure appearance and properties
  configurePlatformAppearance(mainWindow);
  configureWindowProperties(mainWindow);

  // Load content
  loadWindowContent(mainWindow);

  // Setup event handlers
  setupWindowEventHandlers(mainWindow);

  return mainWindow;
}
