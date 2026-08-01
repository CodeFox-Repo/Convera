import { WindowSizeConfig } from "@/electron/windows/window-size";
import { ThemeMode } from "@/shared/types/electron";

export interface IPCServer {
  // Unified Window Control
  closeWindow(): void;

  // Global shortcuts
  updateGlobalShortcut(shortcut: string): boolean;
  initGlobalShortcut(shortcut: string): boolean;

  // App functionality
  getClipboardText(): string;
  setInputContent(content: { text?: string }): void;

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

  // File operations
  openPath(path: string): void;

  // Process icon operations
  getProcessIcon(appName: string): Promise<{
    success: boolean;
    iconData?: string;
    error?: string;
  }>;
}

export const CHANNELS = {
  WINDOW: {
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
    FOCUS_CHAT_INPUT: "app:focus-chat-input",
    TOGGLE_VIEW_MODE: "app:toggle-view-mode",
    SET_INPUT_CONTENT: "app:set-input-content",
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
  },
  MODEL: {
    MODEL_SELECTED: "model:selected",
  },
  FILE: {
    OPEN_PATH: "file:open-path",
  },
  PROCESS_ICON: {
    GET: "process-icon:get",
  },
} as const;

export const methodChannelMap: { [K in keyof IPCServer]: string } = {
  // Unified Window Control
  closeWindow: CHANNELS.WINDOW.CLOSE,

  // Global shortcuts
  updateGlobalShortcut: CHANNELS.SHORTCUTS.UPDATE,
  initGlobalShortcut: CHANNELS.SHORTCUTS.INIT,

  // App functionality
  getClipboardText: CHANNELS.CLIPBOARD.GET_TEXT,
  setInputContent: CHANNELS.APP.SET_INPUT_CONTENT,

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

  // File operations
  openPath: CHANNELS.FILE.OPEN_PATH,

  // Process icon operations
  getProcessIcon: CHANNELS.PROCESS_ICON.GET,
};
