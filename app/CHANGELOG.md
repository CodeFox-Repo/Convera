# @foxychat/app

## 0.0.12

### Patch Changes

- 23e6edc: adding remark markdown render support with css styling
- Refactor MCP and agent architecture to use remote server

  - Migrated all server-side logic to remote server, removing local chat-server, agents, and API modules
  - Updated MCP integration to use AI SDK experimental client for better compatibility
  - Implemented cross-window state synchronization using localStorage and storage events
  - Enhanced MCP connection management with concurrent initialization and better error handling
  - Added centralized logging system for improved debugging and monitoring
  - Improved clipboard management with image support
  - Migrated chat history from custom hook to Zustand store for better state management
  - Enhanced UI with new MCP tools panel and tab-based settings structure
  - Optimized window management with dynamic resizing and centering capabilities

- e7d7ae2: dont show prev app icon when no prev app
- 8bba784: adding tray with icon
- 07d8624: refactor mcp and agent, using remote server
- 4e0c253: refactor: streamline window control and add Command+W handling

## 0.0.11

### Patch Changes

- Fix CI robotjs packaging: Enhanced script robustness for CI environments

  - Try multiple paths for robotjs in CI environments
  - Better error handling and debugging information
  - Don't fail CI build if robotjs not found, continue with warning
  - Support different directory structures in CI vs local development

## 0.0.10

### Patch Changes

- 8d902d7: fix rebotjs cannot correctly build

## 0.0.9

### Patch Changes

- d71c776: # ElectronAPI Optimization Summary

  ## Overview

  Successfully consolidated and optimized the electronAPI by merging redundant methods into unified, type-safe interfaces.

  ## ✅ Major Optimizations Completed

  ### 1. Unified Window Control System

  **Before**: 7 separate window methods
  **After**: 1 unified `toggleWindow()` method

  #### Old API (Removed):

  ```typescript
  -toggleSettingsWindow() -
    toggleHistoryWindow() -
    toggleMainWindow() -
    toggleAgentPopover(x, y, width, height) -
    toggleModelSelector(x, y, width, height) -
    closeSettingsWindow();
  ```

  #### New API:

  ```typescript
  toggleWindow(type: WindowType, options?: WindowControlOptions)

  // Type definitions:
  type WindowType = "settings" | "history" | "main" | "agent-popover" | "model-selector"
  interface WindowControlOptions { x?, y?, width?, height? }
  ```

  #### Usage Examples:

  ```typescript
  // Simple window toggles
  electronAPI.toggleWindow("settings");
  electronAPI.toggleWindow("history");

  // Popover windows with position
  electronAPI.toggleWindow("agent-popover", { x: 100, y: 100 });
  electronAPI.toggleWindow("model-selector", {
    x: 200,
    y: 200,
    width: 280,
    height: 200,
  });
  ```

  ### 2. Unified Theme Control System

  **Before**: 5 separate theme methods
  **After**: 1 unified `setTheme()` method

  #### Old API (Removed):

  ```typescript
  -toggleTheme() - setThemeDark() - setThemeLight() - setThemeSystem();
  ```

  #### New API:

  ```typescript
  setTheme(mode: ThemeMode): Promise<string>

  // Type definition:
  type ThemeMode = "light" | "dark" | "system"
  ```

  #### Usage Examples:

  ```typescript
  electronAPI.setTheme("dark");
  electronAPI.setTheme("light");
  electronAPI.setTheme("system");
  ```

  ### 3. Unified Window Management

  **Before**: Separate `resizeWindow()` and `resizeMessageContent()` methods
  **After**: 1 unified `resizeWindow()` method with optional preserve flag

  #### Old API (Removed):

  ```typescript
  -resizeMessageContent(width, height, preserveX);
  ```

  #### New API:

  ```typescript
  resizeWindow(width: number, height: number, preserveX?: boolean)
  ```

  ### 4. Removed Unused Methods

  - `getPlatform()` - No usage found in codebase

  ## 🛠️ Technical Improvements

  ### Type Safety Enhancements

  - Added proper TypeScript enums for window types and theme modes
  - Eliminated `any` types and used proper error handling with `unknown`
  - Created unified interfaces for window control options

  ### Code Architecture Benefits

  - **Reduced API surface**: From 15+ methods to 8 core methods
  - **Better semantics**: Method names clearly indicate their purpose
  - **Consistent patterns**: All similar operations follow the same API pattern
  - **Future-proof**: Easy to add new window types or theme modes

  ### IPC Channel Optimization

  - Consolidated IPC channels from 20+ to 12 core channels
  - Simplified channel mapping and registration
  - Cleaner error handling and logging

  ## 📁 Files Updated

  ### Core API Files:

  - `app/src/shared/types/electron.d.ts` - New unified interface
  - `app/src/electro-bridge/ipc/channels.ts` - Consolidated channels
  - `app/src/electro-bridge/ipc/ipc-handlers.ts` - Unified handlers
  - `app/src/electro-bridge/ipc/listeners-register.ts` - Simplified registration

  ### Theme System:

  - `app/src/renderer/libs/helper/theme_helpers.ts` - Updated to use unified API

  ### Component Updates:

  - `app/src/renderer/pages/settings.tsx` - Developer mode controls
  - `app/src/renderer/libs/stores/chat-store.tsx` - Settings toggle
  - `app/src/renderer/components/chat/index.tsx` - Window resizing
  - `app/src/renderer/components/chat/popover/agent-popover.tsx` - Window control
  - `app/src/renderer/components/chat/popover/model-selector-popover.tsx` - Window control

  ## 🔄 Migration Impact

  ### Breaking Changes:

  - Old API methods no longer exist
  - IPC channel names have changed
  - Method signatures are now type-safe

  ### Backwards Compatibility:

  - Legacy handler functions maintained for transition period
  - All existing functionality preserved
  - No feature regressions

  ## 🎯 Benefits Achieved

  1. **Developer Experience**:

     - Cleaner, more intuitive API
     - Better TypeScript support and autocomplete
     - Reduced cognitive load when working with window management

  2. **Maintainability**:

     - Less code duplication
     - Centralized window management logic
     - Easier to add new features

  3. **Performance**:

     - Fewer IPC channels to manage
     - More efficient handler registration
     - Reduced bundle size from eliminated duplicate code

  4. **Reliability**:
     - Type-safe operations prevent runtime errors
     - Consistent error handling patterns
     - Better debugging capabilities

  ## ✨ Future Enhancements Enabled

  The new unified API makes it trivial to:

  - Add new window types by extending the `WindowType` enum
  - Add new theme modes by extending the `ThemeMode` enum
  - Implement window-specific options through `WindowControlOptions`
  - Add new unified control systems following the same pattern

  This optimization provides a solid foundation for future electronAPI enhancements while maintaining clean, type-safe, and intuitive developer interfaces.

- c87d764: adding type safe zod validation in chat-server
- f5447a7: Optimize RobotJS packaging and CI/CD workflow

  - Simplified robotjs loading logic with better TypeScript support
  - Added comprehensive type definitions for @hurdlegroup/robotjs
  - Removed fallback implementation for cleaner error handling
  - Enhanced CI builds with proper native module handling for Ubuntu and macOS
  - Optimized forge.config.ts with improved AutoUnpackNativesPlugin configuration
  - Added automated release workflow with changeset integration
  - Updated build scripts to use pnpm consistently
  - Improved package.json scripts for better robotjs rebuilding process

  This change improves the reliability of native module packaging and streamlines the development and release process.
