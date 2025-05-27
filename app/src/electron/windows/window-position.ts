import { CHANNELS } from "@/electro-bridge/ipc/channels";
import { getPreviousApp } from "@/electro-bridge/ipc/ipc-handlers";
import { appConfig } from "@/electron/config";
import { calculateWindowDimensions } from "@/electron/windows/utils";
import {
  WINDOW_SIZE_PRESETS,
  WindowDimensions,
  WindowSizeConfig,
} from "@/electron/windows/window-size";
import { exec } from "child_process";
import { BrowserWindow, screen } from "electron";

export let expectedPosition: WindowDimensions | null = null;
let isFixingPosition = false;
/**
 * Position a window at the center bottom of the screen with margin
 * bottomMarginPercent: percentage of screen height to use as bottom margin
 */
export function positionWindowAtCenterBottom(
  window: BrowserWindow,
  bottomMarginPixels?: number,
  config?: WindowSizeConfig,
  bottomMarginPercent: number = appConfig.window.defaultBottomMarginPercent,
) {
  if (!window) return;

  // Get primary display
  const primaryDisplay = screen.getPrimaryDisplay();
  const { height: screenHeight } = primaryDisplay.workAreaSize;

  // Calculate bottom margin in pixels based on percentage of screen height
  // Or use provided pixel value as fallback
  const bottomMargin =
    bottomMarginPercent > 0
      ? Math.round(screenHeight * (bottomMarginPercent / 100))
      : bottomMarginPixels || appConfig.window.fallbackBottomMarginPixels;

  console.log(
    `Using bottom margin: ${bottomMargin}px (${bottomMarginPercent}% of screen height)`,
  );

  // Get current window size
  const windowBounds = window.getBounds();

  // If config is provided, ensure window size matches the config
  if (config) {
    // Calculate dimensions based on config
    const dimensions = calculateWindowDimensions(config, bottomMargin);
    window.setBounds(dimensions);
  } else {
    // Use current size but just reposition
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width } = primaryDisplay.workAreaSize;
    const x = Math.round((width - windowBounds.width) / 2);
    const y = Math.round(
      primaryDisplay.workAreaSize.height - windowBounds.height - bottomMargin,
    );
    window.setPosition(x, y);
  }

  console.log(
    `Positioned window at: x=${window.getBounds().x}, y=${window.getBounds().y}, size=${window.getBounds().width}x${window.getBounds().height}, margin=${bottomMargin}px`,
  );
}

/**
 * Center a window horizontally, maintaining its vertical position
 */
export function centerWindowHorizontally(window: BrowserWindow) {
  if (!window) return;

  // Get current position and size
  const bounds = window.getBounds();

  // Get the primary display's work area
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width } = primaryDisplay.workAreaSize;

  // Calculate new X position to center window horizontally
  const newX = Math.round((width - bounds.width) / 2);

  // Keep the same Y position
  window.setPosition(newX, bounds.y);
}

/**
 * Update expected position when window is manually moved
 */
function updateExpectedPosition(window: BrowserWindow) {
  if (!window || isFixingPosition) return;
  const bounds = window.getBounds();
  // Only update if the current position is valid
  if (bounds.x >= 0 && bounds.y >= 0) {
    expectedPosition = bounds;
    console.log(
      `Updated expected position to: ${JSON.stringify(expectedPosition)}`,
    );
  }
}

/**
 * Restore window to expected position if current position deviates
 */
function restoreToExpectedPosition(window: BrowserWindow): boolean {
  if (!window || !expectedPosition) return false;

  const currentBounds = window.getBounds();
  // Check if current position deviates significantly from expected
  if (
    Math.abs(currentBounds.x - expectedPosition.x) > 100 ||
    currentBounds.x < 0 ||
    Math.abs(currentBounds.y - expectedPosition.y) > 100
  ) {
    console.log(
      `Restoring window to expected position: ${JSON.stringify(expectedPosition)}`,
    );
    isFixingPosition = true;
    window.setBounds(expectedPosition, false);
    isFixingPosition = false;
    return true;
  }
  return false;
}

/**
 * Resize window and maintain its bottom position
 * This keeps the window's bottom edge in the same place when resizing vertically
 * @param preserveX When true, maintains the window's current X position instead of centering
 */
export function resizeWindowAndMaintainPosition(
  window: BrowserWindow,
  width: number,
  height: number,
  preserveX?: boolean,
  config?: WindowSizeConfig,
) {
  if (!window) {
    console.error("resizeWindowAndMaintainPosition: Window is null");
    return;
  }

  // If config is provided, calculate dimensions based on proportion
  if (config) {
    const dimensions = calculateWindowDimensions(config);
    width = dimensions.width;
    height = dimensions.height;
  }

  console.log(
    `resizeWindowAndMaintainPosition called with size ${width}x${height}, preserveX: ${preserveX}`,
  );

  try {
    // Get current bounds
    const bounds = window.getBounds();
    console.log(`Current window bounds: ${JSON.stringify(bounds)}`);

    // Calculate the bottom edge position
    const bottomEdgeY = bounds.y + bounds.height;

    // Calculate new Y to maintain bottom edge position
    // Ensure newY is never negative to prevent window from going above screen
    const newY = Math.max(0, bottomEdgeY - height);

    // Determine X position - preserve current X if requested, otherwise center
    let newX;
    if (preserveX && expectedPosition) {
      newX = expectedPosition.x;
      console.log(`Using expected X position: ${newX}`);
    } else {
      // Center horizontally
      const primaryDisplay = screen.getPrimaryDisplay();
      const screenWidth = primaryDisplay.workAreaSize.width;
      newX = Math.round((screenWidth - width) / 2);
    }

    // Create new bounds
    const newBounds = {
      x: newX,
      y: newY,
      width: width,
      height: height,
    };

    // Mark that we're in a position fixing state
    isFixingPosition = true;

    // Disable animation for more reliable positioning
    window.setBounds(newBounds, false);

    // Force window to be visible
    window.show();

    // Done with position fixing
    isFixingPosition = false;
  } catch (error) {
    console.error("Error in resizeWindowAndMaintainPosition:", error);
    isFixingPosition = false;
  }
}

export let isHiddenOffscreen = true;
export let lastVisibleBounds: Electron.Rectangle | null = null;

/**
 * Set up window position tracking
 * This should be called when the window is created
 */
export function setupWindowPositionTracking(window: BrowserWindow) {
  if (!window) return;

  // Update expected position when window is manually moved
  window.on("move", () => {
    if (!window.isDestroyed()) {
      updateExpectedPosition(window);
    }
  });
}

export function toggleMainWindowVisibility(mainWindow: BrowserWindow) {
  if (!mainWindow) return;

  // Check actual window state instead of relying only on isHiddenOffscreen
  const bounds = mainWindow.getBounds();
  const isCurrentlyOffscreen = bounds.x < -1000 || bounds.y < -1000;

  // Check opacity as another indicator
  const isCurrentlyTransparent = mainWindow.getOpacity() < 0.1;

  // If window is offscreen OR has low opacity, consider it hidden
  if (isCurrentlyOffscreen || isCurrentlyTransparent) {
    console.log("Window is currently hidden, making it visible");

    // === Restore display ===
    // Try position restoration in order of preference:
    // 1. Expected position (from manual moves)
    // 2. Last visible bounds
    // 3. Default centered position
    let restored = false;

    // First try expected position
    if (expectedPosition) {
      restored = restoreToExpectedPosition(mainWindow);
    }

    // If that fails, try last visible bounds
    if (!restored && lastVisibleBounds) {
      restored = restoreToExpectedPosition(mainWindow);
    }

    // If all else fails, use default position
    if (!restored) {
      const dimensions = calculateWindowDimensions(
        WINDOW_SIZE_PRESETS.MAIN,
        undefined,
        true,
      );
      mainWindow.setBounds(dimensions, false);
    }

    // Re-enable mouse events and make window visible
    mainWindow.setIgnoreMouseEvents(false);
    mainWindow.setOpacity(1);
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send(CHANNELS.APP.FOCUS_CHAT_INPUT);

    isHiddenOffscreen = false;
  } else {
    console.log("Window is currently visible, hiding it");

    // Try to activate previous app
    try {
      const prevApp = getPreviousApp();
      if (prevApp) {
        exec(`osascript -e 'tell application "${prevApp}" to activate'`);
      }
    } catch (error) {
      console.error("Error activating previous app:", error);
    }

    // Save current position only if it's valid
    const currentBounds = mainWindow.getBounds();
    if (currentBounds.x >= 0 && currentBounds.y >= 0) {
      expectedPosition = currentBounds;
      lastVisibleBounds = currentBounds;
    }

    // Hide window
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
    mainWindow.setOpacity(0);
    mainWindow.setBounds({
      x: -9999,
      y: -9999,
      width: currentBounds.width,
      height: currentBounds.height,
    });

    isHiddenOffscreen = true;
  }
}

/**
 * Set window to hidden state without toggling
 * This is used for initial setup of the window
 */
export function setWindowHidden(mainWindow: BrowserWindow) {
  if (!mainWindow) return;

  // Save current bounds before hiding
  lastVisibleBounds = mainWindow.getBounds();

  // Make window ignore mouse events
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  // Make window transparent
  mainWindow.setOpacity(0);

  // Move window off-screen
  mainWindow.setBounds({
    x: -9999,
    y: -9999,
    width: lastVisibleBounds.width,
    height: lastVisibleBounds.height,
  });

  // Set state to hidden
  isHiddenOffscreen = true;
}
