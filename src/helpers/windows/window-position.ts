import { BrowserWindow, screen } from "electron";
import { WindowSizeConfig } from "./window-size";
import { calculateWindowDimensions } from "./utils";

/**
 * Position a window at the center bottom of the screen with margin
 */
export function positionWindowAtCenterBottom(
  window: BrowserWindow,
  bottomMargin = 100,
  config?: WindowSizeConfig,
) {
  if (!window) return;

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
    `Positioned window at: x=${window.getBounds().x}, y=${window.getBounds().y}, size=${window.getBounds().width}x${window.getBounds().height}`,
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
