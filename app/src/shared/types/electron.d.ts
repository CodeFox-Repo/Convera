// src/types/electron.d.ts

import { WindowSizeConfig } from "@/electron/windows/window-size";

// Define the structure of the API exposed via contextBridge
export interface IElectronAPI {
  // Settings
  toggleSettingsWindow: () => Promise<void>;
  closeSettingsWindow: () => Promise<void>;
  updateGlobalShortcut: (shortcut: string) => Promise<boolean>;
  initGlobalShortcut: (shortcut: string) => Promise<boolean>;
  // History
  toggleHistoryWindow: () => Promise<void>;
  toggleMainWindow: () => Promise<void>;
  // Hello World
  getPlatform: () => string;
  // App
  getPreviousApp: () => Promise<string>;
  getPreviousAppID: () => Promise<number>;
  getClipboardText: () => Promise<string>;
  setInputText: (text: string) => Promise<void>;
  pasteModifiedContent: (content: string) => Promise<void>;
  // Theme (Assuming theme functions return void or specific theme string)
  getCurrentTheme: () => Promise<string>;
  toggleTheme: () => Promise<string>;
  setThemeDark: () => Promise<string>;
  setThemeLight: () => Promise<string>;
  setThemeSystem: () => Promise<string>;
  // Window
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
  resizeWindow: (width: number, height: number) => Promise<void>;
  resizeMessageContent: (
    width: number,
    height: number,
    preserveX?: boolean,
  ) => Promise<void>;
  getCurrentWindowPosition: () => Promise<{ x: number; y: number }>;
  // View Mode
  toggleViewMode: (expanded: boolean) => Promise<boolean>;
  // Agent Popover
  toggleAgentPopover: (
    x?: number,
    y?: number,
    width?: number,
    height?: number,
  ) => Promise<void>;
  // Model Selector
  toggleModelSelector: (
    x?: number,
    y?: number,
    width?: number,
    height?: number,
  ) => Promise<void>;
  modelSelected: (modelId: string) => Promise<boolean>;
  // Listener registration (Main -> Renderer)
  onFocusChatInput: (callback: () => void) => () => void; // Returns a cleanup function
  onAppChanged: (
    callback: (appName: string, appId?: number) => void,
  ) => () => void; // App change event listener
  onToggleSettings: (callback: () => void) => () => void; // Settings toggle event
  onAgentListUpdated: (callback: () => void) => () => void; // Agent list updated event
  onSetInputText: (callback: (text: string) => void) => () => void; // Input text event
  onThemeChanged: (callback: (theme: string) => void) => () => void; // Theme change event listener
  getCurrentWindowSize: (window: WindowSizeConfig) => Promise<{
    width: number;
    height: number;
  }>;
  openPath: (path: string) => Promise<void>;
}

// Extend the global Window interface
declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}
