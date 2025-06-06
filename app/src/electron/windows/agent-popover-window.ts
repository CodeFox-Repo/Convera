import { calculateWindowDimensions } from "@/electron/windows/utils";
import {
  WINDOW_SIZE_PRESETS,
  WindowDimensions,
} from "@/electron/windows/window-size";
import { inDevelopment } from "@/shared/constants/dev";
import { BrowserWindow, BrowserWindowConstructorOptions } from "electron";
import path from "path";

// Global reference to the agent popover window
let agentPopoverWindow: BrowserWindow | null = null;

// Create platform-specific configuration for agent popover window
function createPlatformSpecificConfig(
  dimensions: WindowDimensions,
): BrowserWindowConstructorOptions {
  const baseConfig: BrowserWindowConstructorOptions = {
    width: dimensions.width,
    height: dimensions.height,
    x: 0,
    y: 0,
    webPreferences: {
      devTools: inDevelopment,
      contextIsolation: true,
      nodeIntegration: true,
      preload: path.join(__dirname, "preload.js"),
    },
    modal: false,
    frame: false,
    transparent: true,
    show: false,
    resizable: false,
    skipTaskbar: true,
    roundedCorners: true,
    thickFrame: false,
    hasShadow: true,
    alwaysOnTop: true,
    type: "popover",
    backgroundColor: "#00000000",
  };

  return baseConfig;
}

// Load window content
function loadWindowContent(window: BrowserWindow) {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    window.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}?view=agent-popover`);
  } else {
    window.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
      { hash: "agent-popover" },
    );
  }
}

// Handle url hash to render different views
function handleUrlHash(window: BrowserWindow) {
  window.webContents.on("did-finish-load", () => {
    // Check for specific view hash
    const url = new URL(window.webContents.getURL());
    if (url.hash === "#agent-popover") {
      console.log("Rendering agent popover view");
      // Inject any specific styles or scripts if needed
    }
  });
}

// Setup window event handlers
function setupWindowEventHandlers(window: BrowserWindow) {
  // Handle hash parameter
  handleUrlHash(window);

  // Click outside to close
  window.on("blur", () => {
    if (window) {
      window.hide();
    }
  });

  window.on("closed", () => {
    agentPopoverWindow = null;
  });
}

// Pre-create agent popover window
export function preCreateAgentPopoverWindow(): BrowserWindow | null {
  if (agentPopoverWindow) return agentPopoverWindow;

  console.log("Pre-creating agent popover window");

  // Get dimensions from presets
  const dimensions = calculateWindowDimensions(
    WINDOW_SIZE_PRESETS.AGENT_POPOVER,
  );

  // Create window with platform-specific configuration
  const config = createPlatformSpecificConfig(dimensions);
  agentPopoverWindow = new BrowserWindow(config);

  // Load content
  loadWindowContent(agentPopoverWindow);

  // Setup event handlers
  setupWindowEventHandlers(agentPopoverWindow);

  return agentPopoverWindow;
}

// Create agent popover window at a specific position or show existing one
export function createAgentPopoverWindow(
  x: number,
  y: number,
  width = 0,
  height = 0,
): BrowserWindow | null {
  console.log("Showing agent popover window");
  if (!agentPopoverWindow) {
    // Create if it doesn't exist
    preCreateAgentPopoverWindow();
  }

  if (agentPopoverWindow) {
    // Get dimensions from presets if not provided
    if (width === 0 || height === 0) {
      const dimensions = calculateWindowDimensions(
        WINDOW_SIZE_PRESETS.AGENT_POPOVER,
      );
      width = dimensions.width;
      height = dimensions.height;
    }

    // Reposition and show
    console.log(
      `Repositioning agent popover to: x=${x}, y=${y}, width=${width}, height=${height}`,
    );
    agentPopoverWindow.setBounds({ x, y, width, height });
    agentPopoverWindow.show();
    agentPopoverWindow.focus();
  }

  return agentPopoverWindow;
}

// Get agent popover window reference
export function getAgentPopoverWindow(): BrowserWindow | null {
  return agentPopoverWindow;
}
