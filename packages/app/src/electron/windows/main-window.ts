import { inDevelopment } from "@/shared/constants/dev";
import {
  BrowserWindow,
  BrowserWindowConstructorOptions,
  screen,
  shell,
} from "electron";
import path from "path";
import { getLogger } from "../logger";

// Initialize logger for main window
const logger = getLogger("main-window");

// Global reference to the main window
let mainWindow: BrowserWindow | null = null;

export function isBackgroundAutomation(): boolean {
  return process.argv.includes("--convera-automation-background");
}

// Create platform-specific configuration for main window
function createPlatformSpecificConfig(): BrowserWindowConstructorOptions {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } =
    primaryDisplay.workAreaSize;

  // Default window size: 80% of screen, centered
  const width = Math.round(screenWidth * 0.8);
  const height = Math.round(screenHeight * 0.8);
  const x = Math.round((screenWidth - width) / 2);
  const y = Math.round((screenHeight - height) / 2);

  const baseConfig: BrowserWindowConstructorOptions = {
    width,
    height,
    x,
    y,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      devTools: inDevelopment,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      preload: path.join(__dirname, "preload.js"),
    },
    show: false,
    titleBarStyle: "hiddenInset",
    transparent: true,
    frame: false,
    visualEffectState: "active",
    autoHideMenuBar: true,
    hasShadow: true,
    resizable: true,
    maximizable: true,
    fullscreenable: true,
    roundedCorners: true,
    vibrancy: "fullscreen-ui",
  };

  return baseConfig;
}

// Configure platform-specific appearance
function configurePlatformAppearance(window: BrowserWindow) {
  if (process.platform === "darwin") {
    // Show window buttons for standard window behavior
    window.setWindowButtonVisibility(true);
  }
}

// Configure window properties (no-op for resizable window)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function configureWindowProperties(_window: BrowserWindow) {
  // Window is now resizable, no need to prevent resize
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
  // Intercept navigations that might be triggered by OAuth flows and open externally
  const maybeOpenExternal = (targetUrl: string): boolean => {
    try {
      if (targetUrl.startsWith("http://") || targetUrl.startsWith("https://")) {
        shell.openExternal(targetUrl);
        return true;
      }
    } catch (e) {
      console.error("Error handling navigation to external URL:", e);
    }
    return false;
  };

  window.webContents.on("will-navigate", (event, url) => {
    if (maybeOpenExternal(url)) {
      event.preventDefault();
    }
  });

  window.webContents.on("will-redirect", (event, url) => {
    if (maybeOpenExternal(url)) {
      event.preventDefault();
    }
  });

  window.webContents.on("did-finish-load", () => {
    window.webContents
      .executeJavaScript(
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
      )
      .catch((err) => {
        console.error("Failed to execute navigation script:", err);
      });

    if (inDevelopment) {
      window.webContents.openDevTools({ mode: "right" });
    }
  });

  window.webContents.on(
    "did-fail-load",
    (event, errorCode, errorDescription) => {
      console.error("Main window failed to load:", errorCode, errorDescription);
    },
  );

  window.on("closed", () => {
    mainWindow = null;
  });
}

// Pre-create main window
export function preCreateMainWindow(): BrowserWindow | null {
  if (mainWindow) return mainWindow;

  logger.info("Pre-creating main window");

  // Create window with platform-specific configuration
  const config = createPlatformSpecificConfig();
  mainWindow = new BrowserWindow(config);

  logger.debug("Main window created with platform-specific config");

  // Configure appearance and properties
  configurePlatformAppearance(mainWindow);
  configureWindowProperties(mainWindow);

  // Load content
  loadWindowContent(mainWindow);

  // Setup event handlers
  setupWindowEventHandlers(mainWindow);

  logger.info("Main window pre-creation completed");

  return mainWindow;
}

// Create and show main window
export function createMainWindow(): void {
  if (!mainWindow) {
    logger.warn("Main window not pre-created, creating now");
    preCreateMainWindow();
  }

  if (mainWindow && !isBackgroundAutomation()) {
    logger.info("Showing main window");
    mainWindow.show();
    mainWindow.focus();
  } else if (mainWindow) {
    logger.info("Keeping main window hidden for background automation");
  } else {
    logger.error("Failed to create main window");
  }
}

// Get main window reference
export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}
