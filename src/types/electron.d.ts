// src/types/electron.d.ts

import { WindowSizeConfig } from "@/helpers/windows/window-size";

// Define the structure of the API exposed via contextBridge
export interface IElectronAPI {
  // Settings
  toggleSettingsWindow: () => Promise<void>;
  closeSettingsWindow: () => Promise<void>;
  updateGlobalShortcut: (shortcut: string) => Promise<boolean>;
  initGlobalShortcut: (shortcut: string) => Promise<boolean>;
  // App
  getPreviousApp: () => Promise<string>;
  getClipboardText: () => Promise<string>;
  pasteModifiedContent: (content: string) => Promise<boolean>;
  // Theme (Assuming theme functions return void or specific theme string)
  getCurrentTheme: () => Promise<string>;
  toggleTheme: () => Promise<void>;
  setThemeDark: () => Promise<void>;
  setThemeLight: () => Promise<void>;
  setThemeSystem: () => Promise<void>;
  // Window
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
  resizeWindow: (width: number, height: number) => Promise<void>;
  resizeMessageContent: (width: number, height: number) => Promise<void>;
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
  onAppChanged: (callback: (appName: string) => void) => () => void; // App change event listener
  onSetInputText: (callback: (text: string) => void) => () => void; // Input text event
  getCurrentWindowSize: (window: WindowSizeConfig) => Promise<{
    width: number;
    height: number;
  }>;
}

// Extend the global Window interface
declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}
