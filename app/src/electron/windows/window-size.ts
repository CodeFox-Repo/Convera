// this is common area for all windows
/**
 * Window size configuration interface
 */
export interface WindowSizeConfig {
  widthProportion: number;
  heightProportion: number;
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
 * Window size presets for different window types
 */
export const WINDOW_SIZE_PRESETS = {
  MAIN: {
    widthProportion: 0.3,
    heightProportion: 0.15,
    minWidth: 500,
    minHeight: 90,
    maxWidth: 800,
  },
  EXPANDED_CHAT: {
    widthProportion: 0.3,
    heightProportion: 0.6,
    minWidth: 500,
    minHeight: 400,
    maxWidth: 800,
    maxHeight: 800,
  },
  SETTINGS: {
    widthProportion: 0.6,
    heightProportion: 0.7,
    minWidth: 800,
    minHeight: 600,
  },
  AGENT_POPOVER: {
    widthProportion: 0.3,
    heightProportion: 0.4,
    minWidth: 320,
    minHeight: 350,
  },
  MODEL_SELECTOR: {
    widthProportion: 0.15,
    heightProportion: 0.25,
    minWidth: 280,
    minHeight: 240,
    maxWidth: 280,
    maxHeight: 240,
  },
};
