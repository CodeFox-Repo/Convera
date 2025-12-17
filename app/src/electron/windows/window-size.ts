// this is common area for all windows
/**
 * Window size configuration interface
 */
export interface WindowSizeConfig {
  widthProportion: number;
  heightProportion?: number; // Optional: allows disabling initial height proportion for dynamic sizing
  minWidth: number;
  minHeight: number;
  maxWidth?: number;
  maxHeight?: number;
}

/**
 * Window dimension object
 */
export interface WindowDimensions {
  width: number;
  height: number;
  x: number;
  y: number;
}

/**
 * Window size presets for single-window mode
 */
export const WINDOW_SIZE_PRESETS = {
  // Main window - single window mode
  CHAT: {
    widthProportion: 0.5,
    heightProportion: 0.7,
    minWidth: 900,
    minHeight: 600,
  },
  // Settings view uses same size as main window
  SETTINGS: {
    widthProportion: 0.5,
    heightProportion: 0.7,
    minWidth: 900,
    minHeight: 600,
  },
};
