import { exec } from "child_process";
import { BrowserWindow, screen } from "electron";
import { WindowSizeConfig } from "./window-size";
import { calculateWindowDimensions } from "./utils";
import { appConfig } from "../config";
import { CHANNELS } from "../ipc/channels";
import { getPreviousApp } from "../ipc/ipc-handlers";

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

// Track the last known good position and a timestamp of when it was set
let expectedWindowPosition: {x: number, y: number, height: number, timestamp: number} | null = null;
// Track if we're currently in a position fix attempt to avoid correction loops
let isFixingPosition = false;

/**
 * Resize window and maintain its bottom position
 * This keeps the window's bottom edge in the same place when resizing vertically
 */
export function resizeWindowAndMaintainPosition(
  window: BrowserWindow,
  width: number,
  height: number,
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
    `resizeWindowAndMaintainPosition called with size ${width}x${height}`,
  );

  try {
    // Get current bounds
    const bounds = window.getBounds();

    // Additional logging for debugging
    console.log(`Current window bounds: ${JSON.stringify(bounds)}`);

    // Only check for unexpected changes if enough time has passed (1 second)
    // This prevents position correction loops
    const now = Date.now();
    const isHeightChange = expectedWindowPosition && Math.abs(height - expectedWindowPosition.height) > 10;
    const timeSinceLastPositionSet = expectedWindowPosition ? now - expectedWindowPosition.timestamp : 0;
    
    // Restore position if it changed unexpectedly, but not during height changes and not too frequently
    if (expectedWindowPosition && 
        !isHeightChange && 
        !isFixingPosition &&
        timeSinceLastPositionSet > 1000 &&
        (bounds.x < 0 || Math.abs(bounds.x - expectedWindowPosition.x) > 100)) {
      console.warn(`Window position changed unexpectedly: expected (${expectedWindowPosition.x}, ${expectedWindowPosition.y}), got (${bounds.x}, ${bounds.y})`);
      
      // Force restore to expected position
      bounds.x = expectedWindowPosition.x;
      bounds.y = expectedWindowPosition.y;
    }

    // Calculate the bottom edge position
    const bottomEdgeY = bounds.y + bounds.height;

    // Calculate new Y to maintain bottom edge position
    // Ensure newY is never negative to prevent window from going above screen
    const newY = Math.max(0, bottomEdgeY - height);

    // Center horizontally
    const primaryDisplay = screen.getPrimaryDisplay();
    const screenWidth = primaryDisplay.workAreaSize.width;
    const newX = Math.round((screenWidth - width) / 2);

    // Log change details
    console.log(
      `Bottom edge: ${bottomEdgeY}, New position: (${newX}, ${newY}), New size: ${width}x${height}`,
    );

    // Create new bounds
    const newBounds = {
      x: newX,
      y: newY,
      width: width,
      height: height,
    };

    // Mark that we're in a position fixing state
    isFixingPosition = true;

    // Save expected position for future reference with current time
    expectedWindowPosition = {
      x: newX, 
      y: newY, 
      height: height,
      timestamp: now
    };

    // Disable animation for more reliable positioning
    window.setBounds(newBounds, false);

    // Force window to be visible
    window.show();

    // Verify final position but only make one correction attempt to avoid loops
    setTimeout(() => {
      const finalBounds = window.getBounds();
      console.log(`Final window bounds: ${JSON.stringify(finalBounds)}`);

      // Check if position is significantly different than requested
      // Use a higher tolerance to avoid minor corrections
      const xPositionDifference = Math.abs(finalBounds.x - newX);
      
      if (xPositionDifference > 100 || finalBounds.x < 0) {
        console.warn(
          `Window off screen or severely mispositioned, applying final correction`
        );
        
        // Only fix extreme positioning issues
        window.setPosition(newX, newY, false);
        window.show();
      }
      
      // We're done with position fixing
      isFixingPosition = false;
    }, 200);
  } catch (error) {
    console.error("Error in resizeWindowAndMaintainPosition:", error);
    isFixingPosition = false;
  }
}

let isHiddenOffscreen = true;
let lastVisibleBounds: Electron.Rectangle | null = null;

export function toggleMainWindowVisibility(mainWindow: BrowserWindow) {
  // Toggle the main window's visibility by moving it offscreen instead of hiding
  if (!isHiddenOffscreen) {
    exec(`osascript -e 'tell application "${getPreviousApp()}" to activate'`);
    // === Pseudo-hide ===
    // 1) Save current window bounds
    lastVisibleBounds = mainWindow.getBounds();

    // 2) Ignore mouse events so clicks pass through to the app underneath
    mainWindow.setIgnoreMouseEvents(true, { forward: true });

    // 3) Make the window fully transparent
    mainWindow.setOpacity(0);

    // 4) Move the window off the visible screen
    mainWindow.setBounds({
      x: -9999,
      y: -9999,
      width: lastVisibleBounds.width,
      height: lastVisibleBounds.height,
    });

    isHiddenOffscreen = true;
  } else {
    // === Restore display ===

    // 1) Restore the saved bounds, or center if no bounds were saved
    if (lastVisibleBounds) {
      mainWindow.setBounds(lastVisibleBounds);
    } else {
      positionWindowAtCenterBottom(mainWindow);
    }

    // 2) Re-enable mouse events so the window can receive input again
    mainWindow.setIgnoreMouseEvents(false);

    // 3) Make the window opaque again
    mainWindow.setOpacity(1);

    // 4) Show and focus the window, then send focus event to the chat input
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send(CHANNELS.APP.FOCUS_CHAT_INPUT);

    isHiddenOffscreen = false;
  }
}
