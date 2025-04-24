import { WindowDimensions, WindowSizeConfig } from "./window-size";
import { screen } from "electron";
/**
 * Calculate window dimensions based on screen size and proportion configuration
 */
export function calculateWindowDimensions(
  config: WindowSizeConfig,
  bottomMargin = 100,
  centerX = true,
  centerY = false,
): WindowDimensions {
  // Get the primary display's work area
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } =
    primaryDisplay.workAreaSize;

  // Calculate proportional dimensions
  let width = Math.round(screenWidth * config.widthProportion);
  let height = Math.round(screenHeight * config.heightProportion);

  // Apply min/max constraints
  width = Math.max(config.minWidth, width);
  height = Math.max(config.minHeight, height);

  if (config.maxWidth) {
    width = Math.min(config.maxWidth, width);
  }

  if (config.maxHeight) {
    height = Math.min(config.maxHeight, height);
  }

  // Calculate position
  const x = centerX ? Math.round((screenWidth - width) / 2) : 0;
  const y = centerY
    ? Math.round((screenHeight - height) / 2)
    : Math.round(screenHeight - height - bottomMargin);

  return { width, height, x, y };
}

/**
 * Resize and reposition a window when screen size changes
 */
export function updateWindowToScreenSize(
  window: Electron.BrowserWindow,
  config: WindowSizeConfig,
  bottomMargin = 100,
  centerX = true,
  centerY = false,
): void {
  if (!window) return;

  const dimensions = calculateWindowDimensions(
    config,
    bottomMargin,
    centerX,
    centerY,
  );
  window.setBounds(dimensions);
}
