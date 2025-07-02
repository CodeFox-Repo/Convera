import { WindowSizeConfig } from "@/electron/windows/window-size";
import {
  ThemeMode,
  WindowControlOptions,
  WindowType,
} from "@/shared/types/electron";

export interface IPCServer {
  // Unified Window Control
  toggleWindow(type: WindowType, options?: WindowControlOptions): void;
  closeWindow(): void;

  // Global shortcuts
  updateGlobalShortcut(shortcut: string): boolean;
  initGlobalShortcut(shortcut: string): boolean;

  // App functionality
  getPreviousApp(): string;
  getPreviousAppID(): number;
  getClipboardText(): string;
  setInputContent(content: { text?: string; imageData?: string }): void;
  pasteModifiedContent(content: string): void;

  // Platform detection
  getPlatform(): string;

  // Unified Theme Control
  setTheme(mode: ThemeMode): string;
  getCurrentTheme(): string;

  // Unified Window Management
  minimizeWindow(): void;
  maximizeWindow(): void;
  resizeWindow(width: number, height: number, preserveX?: boolean): void;
  resizeAndCenterWindow(width: number, height: number): void;
  getCurrentWindowPosition(): { x: number; y: number };
  getCurrentWindowSize(window: WindowSizeConfig): {
    width: number;
    height: number;
  };

  // View Mode
  toggleViewMode(expanded: boolean): boolean;

  // Model functionality
  modelSelected(modelId: string): boolean;
  toggleModelSelector(
    x?: number,
    y?: number,
    width?: number,
    height?: number,
  ): void;
  hideModelSelector(): void;

  // Agent functionality
  toggleAgentPopover(
    x?: number,
    y?: number,
    width?: number,
    height?: number,
  ): void;
  hideAgentPopover(): void;

  // File operations
  openPath(path: string): void;
}

export const CHANNELS = {
  WINDOW: {
    TOGGLE: "window:toggle",
    CLOSE: "window:close",
    MINIMIZE: "window:minimize",
    MAXIMIZE: "window:maximize",
    RESIZE: "window:resize",
    RESIZE_AND_CENTER: "window:resize-and-center",
    GET_POSITION: "window:get-position",
    GET_CURRENT_SIZE: "window:get-current-size",
  },
  SHORTCUTS: {
    UPDATE: "shortcuts:update",
    INIT: "shortcuts:init",
  },
  APP: {
    GET_PREVIOUS: "app:get-previous",
    GET_PREVIOUS_ID: "app:get-previous-id",
    FOCUS_CHAT_INPUT: "app:focus-chat-input",
    APP_CHANGED: "app:changed",
    TOGGLE_VIEW_MODE: "app:toggle-view-mode",
    SET_INPUT_CONTENT: "app:set-input-content",
    PASTE_MODIFIED_CONTENT: "app:paste-modified-content",
  },
  CLIPBOARD: {
    GET_TEXT: "clipboard:get-text",
  },
  PLATFORM: {
    GET: "platform:get",
  },
  THEME: {
    SET: "theme:set",
    GET_CURRENT: "theme:get-current",
    CHANGED: "theme:changed",
  },
  AGENT: {
    LIST_UPDATED: "agent:list-updated",
    TOGGLE_POPOVER: "agent:toggle-popover",
    HIDE_POPOVER: "agent:hide-popover",
  },
  MODEL: {
    MODEL_SELECTED: "model:selected",
    TOGGLE_SELECTOR: "model:toggle-selector",
    HIDE_SELECTOR: "model:hide-selector",
  },
  FILE: {
    OPEN_PATH: "file:open-path",
  },
  // Legacy channels for backwards compatibility during transition
  SETTINGS: {
    TOGGLE: "settings:toggle",
  },
} as const;

export const methodChannelMap: { [K in keyof IPCServer]: string } = {
  // Unified Window Control
  toggleWindow: CHANNELS.WINDOW.TOGGLE,
  closeWindow: CHANNELS.WINDOW.CLOSE,

  // Global shortcuts
  updateGlobalShortcut: CHANNELS.SHORTCUTS.UPDATE,
  initGlobalShortcut: CHANNELS.SHORTCUTS.INIT,

  // App functionality
  getPreviousApp: CHANNELS.APP.GET_PREVIOUS,
  getPreviousAppID: CHANNELS.APP.GET_PREVIOUS_ID,
  getClipboardText: CHANNELS.CLIPBOARD.GET_TEXT,
  setInputContent: CHANNELS.APP.SET_INPUT_CONTENT,
  pasteModifiedContent: CHANNELS.APP.PASTE_MODIFIED_CONTENT,

  // Platform detection
  getPlatform: CHANNELS.PLATFORM.GET,

  // Unified Theme Control
  setTheme: CHANNELS.THEME.SET,
  getCurrentTheme: CHANNELS.THEME.GET_CURRENT,

  // Unified Window Management
  minimizeWindow: CHANNELS.WINDOW.MINIMIZE,
  maximizeWindow: CHANNELS.WINDOW.MAXIMIZE,
  resizeWindow: CHANNELS.WINDOW.RESIZE,
  resizeAndCenterWindow: CHANNELS.WINDOW.RESIZE_AND_CENTER,
  getCurrentWindowPosition: CHANNELS.WINDOW.GET_POSITION,
  getCurrentWindowSize: CHANNELS.WINDOW.GET_CURRENT_SIZE,

  // View Mode
  toggleViewMode: CHANNELS.APP.TOGGLE_VIEW_MODE,

  // Model functionality
  modelSelected: CHANNELS.MODEL.MODEL_SELECTED,
  toggleModelSelector: CHANNELS.MODEL.TOGGLE_SELECTOR,
  hideModelSelector: CHANNELS.MODEL.HIDE_SELECTOR,

  // Agent functionality
  toggleAgentPopover: CHANNELS.AGENT.TOGGLE_POPOVER,
  hideAgentPopover: CHANNELS.AGENT.HIDE_POPOVER,

  // File operations
  openPath: CHANNELS.FILE.OPEN_PATH,
};
