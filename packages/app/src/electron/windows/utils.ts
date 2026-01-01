import { appConfig } from "@/electron/config";
import {
  WindowDimensions,
  WindowSizeConfig,
} from "@/electron/windows/window-size";
import { screen } from "electron";

/**
 * Calculate window dimensions based on screen size and proportion configuration
 */
export function calculateWindowDimensions(
  config: WindowSizeConfig,
  bottomMarginPixels?: number,
  centerX = true,
  centerY = false,
  bottomMarginPercent: number = appConfig.window.defaultBottomMarginPercent,
): WindowDimensions {
  // Get the primary display's work area
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } =
    primaryDisplay.workAreaSize;

  // Calculate bottom margin in pixels based on percentage of screen height
  // Or use provided pixel value as fallback
  const bottomMargin =
    bottomMarginPercent > 0
      ? Math.round(screenHeight * (bottomMarginPercent / 100))
      : bottomMarginPixels || appConfig.window.fallbackBottomMarginPixels;

  // Calculate proportional dimensions
  let width = Math.round(screenWidth * config.widthProportion);
  // Use heightProportion if available, otherwise use minHeight for dynamic sizing
  let height = config.heightProportion
    ? Math.round(screenHeight * config.heightProportion)
    : config.minHeight;

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
 * Calculate window dimensions with top margin positioning
 */
export function calculateWindowDimensionsWithTopMargin(
  config: WindowSizeConfig,
  topMarginPixels?: number,
  centerX = true,
  topMarginPercent: number = appConfig.window.defaultTopMarginPercent,
): WindowDimensions {
  // Get the primary display's work area
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } =
    primaryDisplay.workAreaSize;
  const { x: workAreaX } = primaryDisplay.workArea;

  // Calculate top margin in pixels based on percentage of screen height
  // Or use provided pixel value as fallback
  const topMargin =
    topMarginPercent > 0
      ? Math.round(screenHeight * (topMarginPercent / 100))
      : topMarginPixels || 50;

  // Calculate proportional dimensions
  let width = Math.round(screenWidth * config.widthProportion);
  // Use heightProportion if available, otherwise use minHeight for dynamic sizing
  let height = config.heightProportion
    ? Math.round(screenHeight * config.heightProportion)
    : config.minHeight;

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
  const x = centerX
    ? workAreaX + Math.round((screenWidth - width) / 2)
    : workAreaX;
  const y = topMargin;

  return { width, height, x, y };
}

/**
 * Resize and reposition a window when screen size changes
 */
export function updateWindowToScreenSize(
  window: Electron.BrowserWindow,
  config: WindowSizeConfig,
  bottomMarginPixels?: number,
  centerX = true,
  centerY = false,
  bottomMarginPercent: number = appConfig.window.defaultBottomMarginPercent,
): void {
  if (!window) return;

  const dimensions = calculateWindowDimensions(
    config,
    bottomMarginPixels,
    centerX,
    centerY,
    bottomMarginPercent,
  );
  window.setBounds(dimensions);
}
