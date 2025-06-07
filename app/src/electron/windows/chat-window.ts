import {
  positionWindowAtCenterBottom,
  setWindowHidden,
  setupWindowPositionTracking,
} from "@/electron/windows/window-position";
import { setMainWindowResizable } from "@/electron/windows/window-resize";
import { inDevelopment } from "@/shared/constants/dev";
import {
  BrowserWindow,
  BrowserWindowConstructorOptions,
  screen,
} from "electron";
import path from "path";

const CHAT_WINDOW_DIMENSIONS = {
  width: 600,
  height: 700,
};

// Extract platform-specific configurations for chat window
function createPlatformSpecificConfig(): BrowserWindowConstructorOptions {
  const { width, height } = CHAT_WINDOW_DIMENSIONS;

  const baseConfig: BrowserWindowConstructorOptions = {
    width,
    height,
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
    backgroundColor: "#00000000", // Fully transparent
    transparent: true,
  };

  if (process.platform === "darwin") {
    return {
      ...baseConfig,
      vibrancy: "fullscreen-ui",
      titleBarStyle: "hiddenInset",
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
    // Position the window at center bottom without changing size
    positionWindowAtCenterBottom(window);
    setWindowHidden(window);
  });

  // Navigate to chat page after loading
  window.webContents.on("did-finish-load", () => {
    console.log("Chat window loaded, redirecting to chat page...");

    const executeNavigation = async () => {
      try {
        await window.webContents.executeJavaScript(
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
        );
      } catch (err) {
        console.error("Failed to execute navigation script:", err);
      }
    };
    executeNavigation();
  });

  // Handle display changes - just reposition, no resizing needed
  screen.on("display-metrics-changed", () => {
    if (!window.isDestroyed()) {
      // Just reposition the window, size stays fixed
      positionWindowAtCenterBottom(window);
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
  const { width, height } = CHAT_WINDOW_DIMENSIONS;

  console.log(
    `Creating chat window with fixed transparent bounds: w=${width}, h=${height}`,
  );

  // Create window with platform-specific configuration
  const config = createPlatformSpecificConfig();
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
