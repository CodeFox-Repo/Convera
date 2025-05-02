import { WindowSizeConfig } from "../windows/window-size";

export interface IPCServer {
  toggleSettingsWindow(): void;
  closeSettingsWindow(): void;
  updateGlobalShortcut(shortcut: string): boolean;
  initGlobalShortcut(shortcut: string): boolean;
  toggleHistoryWindow(): void;

  getPreviousApp(): string;
  getClipboardText(): string;
  setInputText(text: string): void;
  pasteModifiedContent(content: string): void;

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

  // View Mode
  toggleViewMode(expanded: boolean): boolean;

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
  getCurrentWindowSize(window: WindowSizeConfig): {
    width: number;
    height: number;
  };
}

export const CHANNELS = {
  SETTINGS: {
    TOGGLE: "settings:toggle",
    CLOSE: "settings:close",
    UPDATE_SHORTCUT: "settings:update-shortcut",
    INIT_SHORTCUT: "settings:init-shortcut",
  },
  HISTORY: {
    OPEN: "history:open",
    CLOSE: "history:close",
  },
  APP: {
    GET_PREVIOUS: "app:get-previous",
    FOCUS_CHAT_INPUT: "app:focus-chat-input",
    APP_CHANGED: "app:changed",
    TOGGLE_VIEW_MODE: "app:toggle-view-mode",
    SET_INPUT_TEXT: "app:set-input-text",
    PASTE_MODIFIED_CONTENT: "app:paste-modified-content",
  },
  CLIPBOARD: {
    GET_TEXT: "clipboard:get-text",
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
    GET_CURRENT_SIZE: "window:get-current-size",
  },
  AGENT: {
    TOGGLE_POPOVER: "agent:toggle-popover",
    LIST_UPDATED: "agent:list-updated",
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
  // History
  toggleHistoryWindow: CHANNELS.HISTORY.OPEN,
  // App
  getPreviousApp: CHANNELS.APP.GET_PREVIOUS,
  getClipboardText: CHANNELS.CLIPBOARD.GET_TEXT,
  setInputText: CHANNELS.APP.SET_INPUT_TEXT,
  pasteModifiedContent: CHANNELS.APP.PASTE_MODIFIED_CONTENT,
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
  // View Mode
  toggleViewMode: CHANNELS.APP.TOGGLE_VIEW_MODE,
  // Agent
  toggleAgentPopover: CHANNELS.AGENT.TOGGLE_POPOVER,
  // Model Selector
  toggleModelSelector: CHANNELS.MODEL.TOGGLE_SELECTOR,
  // Model
  modelSelected: CHANNELS.MODEL.MODEL_SELECTED,
  getCurrentWindowSize: CHANNELS.WINDOW.GET_CURRENT_SIZE,
};
