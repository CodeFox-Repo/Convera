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
import { inDevelopment } from "@/shared/constants/dev";
import {
  BrowserWindow,
  BrowserWindowConstructorOptions,
  screen,
} from "electron";
import path from "path";

// Extract platform-specific configurations for chat window
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

// Configure platform-specific appearance for chat window
function configurePlatformAppearance(window: BrowserWindow) {
  if (process.platform === "darwin") {
    window.setWindowButtonVisibility(false);
  }
  window.setBackgroundColor("#00000000");
}

// Configure chat window properties
function configureWindowProperties(window: BrowserWindow) {
  setMainWindowResizable(false, window);
  window.setMenuBarVisibility(false);
  window.setMenu(null);
}

// Load chat window content
function loadWindowContent(window: BrowserWindow) {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    window.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
}

// Setup chat window event handlers
function setupWindowEventHandlers(window: BrowserWindow) {
  // Handle ready-to-show event
  window.once("ready-to-show", () => {
    console.log("Chat window ready, positioning and hiding.");
    positionWindowAtCenterBottom(window, undefined, WINDOW_SIZE_PRESETS.MAIN);
    setWindowHidden(window);
  });

  // Navigate to chat page after loading
  window.webContents.on("did-finish-load", () => {
    console.log("Chat window loaded, redirecting to chat page...");

    window.webContents
      .executeJavaScript(
        `
      console.log("Redirecting to chat page...");
      
      if (window.router) {
        console.log("Using router API");
        window.router.navigate({ to: "/chat" });
      } else {
        console.log("Using location.hash");
        window.location.hash = "/chat";
      }
    `,
      )
      .catch((err) => {
        console.error("Failed to execute navigation script:", err);
      });
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

// Create chat window (quick popup chat interface)
export function createChatWindow(): BrowserWindow | null {
  const dimensions = calculateWindowDimensions(WINDOW_SIZE_PRESETS.MAIN);

  console.log(
    `Creating chat window with bounds: x=${dimensions.x}, y=${dimensions.y}, w=${dimensions.width}, h=${dimensions.height}`,
  );

  // Create window with platform-specific configuration
  const config = createPlatformSpecificConfig(dimensions);
  const chatWindow = new BrowserWindow(config);

  // Configure appearance and properties
  configurePlatformAppearance(chatWindow);
  configureWindowProperties(chatWindow);

  // Load content
  loadWindowContent(chatWindow);

  // Setup event handlers
  setupWindowEventHandlers(chatWindow);

  return chatWindow;
}
