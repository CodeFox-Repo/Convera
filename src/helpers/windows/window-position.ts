import { exec } from "child_process";
import { BrowserWindow, screen } from "electron";
import { CHANNELS } from "../ipc/channels";
import { getPreviousApp } from "../ipc/ipc-handlers";

/**
 * Position a window at the center bottom of the screen with margin
 */
export function positionWindowAtCenterBottom(
  window: BrowserWindow,
  bottomMargin = 100,
) {
  if (!window) return;

  // Get the primary display's work area
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  // Calculate window position
  const windowSize = window.getSize();
  const x = Math.round((width - windowSize[0]) / 2);
  const y = Math.round(height - windowSize[1] - bottomMargin);

  console.log(
    `Positioning window at: x=${x}, y=${y}, size=${windowSize[0]}x${windowSize[1]}`,
  );

  // Set the window position
  window.setPosition(x, y);
}

/**
 * Center a window horizontally, maintaining its vertical position
 */
export function centerWindowHorizontally(window: BrowserWindow) {
  if (!window) return;

  // Get current position and size
  const position = window.getPosition();
  const windowSize = window.getSize();

  // Get the primary display's work area
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width } = primaryDisplay.workAreaSize;

  // Calculate new X position to center window horizontally
  const newX = Math.round((width - windowSize[0]) / 2);

  // Keep the same Y position
  window.setPosition(newX, position[1]);
}

/**
 * Resize window and maintain its bottom position
 * This keeps the window's bottom edge in the same place when resizing vertically
 */
export function resizeWindowAndMaintainPosition(
  window: BrowserWindow,
  width: number,
  height: number,
) {
  if (!window) {
    console.error("resizeWindowAndMaintainPosition: Window is null");
    return;
  }

  console.log(
    `resizeWindowAndMaintainPosition called with size ${width}x${height}`,
  );

  try {
    // Get current bounds
    const bounds = window.getBounds();

    // Additional logging for debugging
    console.log(`Current window bounds: ${JSON.stringify(bounds)}`);

    // Calculate the bottom edge position
    const bottomEdgeY = bounds.y + bounds.height;

    // Calculate new Y to maintain bottom edge position
    const newY = bottomEdgeY - height;

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

    // Set the new bounds in a single operation
    window.setBounds(newBounds, true); // true for animate

    // Verify final position
    setTimeout(() => {
      const finalBounds = window.getBounds();
      console.log(`Final window bounds: ${JSON.stringify(finalBounds)}`);

      // Check if the position was applied correctly
      if (finalBounds.y !== newY || finalBounds.x !== newX) {
        console.warn(
          "Position not applied correctly, trying again without animation",
        );
        window.setBounds(newBounds, false);
      }
    }, 100);
  } catch (error) {
    console.error("Error in resizeWindowAndMaintainPosition:", error);
  }
}

let isHiddenOffscreen = true;
let lastVisibleBounds: Electron.Rectangle | null = null;

export function toggleMainWindowVisibility(mainWindow: BrowserWindow) {
  // Toggle the main window’s visibility by moving it offscreen instead of hiding
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
