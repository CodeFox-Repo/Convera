export interface IPCServer {
  toggleSettingsWindow(): void;
  closeSettingsWindow(): void;
  updateGlobalShortcut(shortcut: string): boolean;
  initGlobalShortcut(shortcut: string): boolean;

  getPreviousApp(): string;

  getCurrentTheme(): string;
  toggleTheme(): string;
  setThemeDark(): string;
  setThemeLight(): string;
  setThemeSystem(): string;

  minimizeWindow(): void;
  maximizeWindow(): void;
  closeWindow(): void;
  resizeWindow(width: number, height: number): void;
  resizeMessageContent(width: number, height: number): void;
  getCurrentWindowPosition(): { x: number; y: number };

  // Agent Popover
  toggleAgentPopover(
    x?: number,
    y?: number,
    width?: number,
    height?: number,
  ): void;

  // Model Selector
  toggleModelSelector(
    x?: number,
    y?: number,
    width?: number,
    height?: number,
  ): void;
  modelSelected(modelId: string): boolean;
}

export const CHANNELS = {
  SETTINGS: {
    TOGGLE: "settings:toggle",
    CLOSE: "settings:close",
    UPDATE_SHORTCUT: "settings:update-shortcut",
    INIT_SHORTCUT: "settings:init-shortcut",
  },
  APP: {
    GET_PREVIOUS: "app:get-previous",
    FOCUS_CHAT_INPUT: "app:focus-chat-input",
    APP_CHANGED: "app:changed",
  },
  THEME: {
    GET_CURRENT: "theme:get-current",
    TOGGLE: "theme:toggle",
    SET_DARK: "theme:set-dark",
    SET_LIGHT: "theme:set-light",
    SET_SYSTEM: "theme:set-system",
  },
  WINDOW: {
    MINIMIZE: "window:minimize",
    MAXIMIZE: "window:maximize",
    CLOSE: "window:close",
    RESIZE: "window:resize",
    RESIZE_MESSAGE_CONTENT: "window:resize-message-content",
    GET_POSITION: "window:get-position",
  },
  AGENT: {
    TOGGLE_POPOVER: "agent:toggle-popover",
  },
  MODEL: {
    TOGGLE_SELECTOR: "model:toggle-selector",
    MODEL_SELECTED: "model:selected",
  },
} as const;

export const methodChannelMap: { [K in keyof IPCServer]: string } = {
  // Settings
  toggleSettingsWindow: CHANNELS.SETTINGS.TOGGLE,
  closeSettingsWindow: CHANNELS.SETTINGS.CLOSE,
  updateGlobalShortcut: CHANNELS.SETTINGS.UPDATE_SHORTCUT,
  initGlobalShortcut: CHANNELS.SETTINGS.INIT_SHORTCUT,
  // App
  getPreviousApp: CHANNELS.APP.GET_PREVIOUS,
  // Theme
  getCurrentTheme: CHANNELS.THEME.GET_CURRENT,
  toggleTheme: CHANNELS.THEME.TOGGLE,
  setThemeDark: CHANNELS.THEME.SET_DARK,
  setThemeLight: CHANNELS.THEME.SET_LIGHT,
  setThemeSystem: CHANNELS.THEME.SET_SYSTEM,
  // Window
  minimizeWindow: CHANNELS.WINDOW.MINIMIZE,
  maximizeWindow: CHANNELS.WINDOW.MAXIMIZE,
  closeWindow: CHANNELS.WINDOW.CLOSE,
  resizeWindow: CHANNELS.WINDOW.RESIZE,
  resizeMessageContent: CHANNELS.WINDOW.RESIZE_MESSAGE_CONTENT,
  getCurrentWindowPosition: CHANNELS.WINDOW.GET_POSITION,
  // Agent Popover
  toggleAgentPopover: CHANNELS.AGENT.TOGGLE_POPOVER,
  // Model Selector
  toggleModelSelector: CHANNELS.MODEL.TOGGLE_SELECTOR,
  modelSelected: CHANNELS.MODEL.MODEL_SELECTED,
};
