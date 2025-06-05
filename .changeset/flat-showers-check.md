---
"@foxychat/docs": patch
---

adding a main window, change the name of origin 'mainWindow' to 'chatWindow', refactor all window to itself file

# Window Renaming Changelog

## Major Refactor: Window Architecture Reorganization

### Overview

Renamed and reorganized window architecture to better reflect the actual purpose and functionality of each window type.

### Changes Made

#### 1. Main Window → Chat Window

- **File**: `app/src/electron/windows/main-window.ts` → `app/src/electron/windows/chat-window.ts`
- **Function**: `createMainWindow()` → `createChatWindow()`
- **Purpose**: This is now the quick popup chat interface that appears when the global shortcut is pressed
- **Characteristics**:
  - Always on top
  - Quick popup interface
  - Bottom-center positioning
  - Resizable for expanded/compact modes
  - **Loads `/chat` route** (dedicated chat interface)

#### 2. Hello World Window → Main Window

- **File**: `app/src/electron/windows/helloworld-window.ts` → `app/src/electron/windows/main-window.ts`
- **Function**: `createHelloWorldWindow()` → `createMainWindow()`
- **Purpose**: This is now the primary application interface window
- **Characteristics**:
  - Settings-sized window
  - Main application interface
  - Fixed size
  - Standard window behavior
  - **Loads `/` route** (home page)

#### 3. Updated Files

- `app/src/electron/main.ts` - Updated imports and variable names
- `app/src/electro-bridge/ipc/channels.ts` - Updated HELLO_WORLD → MAIN_WINDOW channels
- `app/src/electro-bridge/ipc/listeners-register.ts` - Updated function names and handlers
- `app/src/shared/types/electron.d.ts` - Updated interface definitions
- `app/src/renderer/pages/settings.tsx` - Updated developer mode controls
- `app/src/renderer/routes/routes.tsx` - Removed HelloWorldRoute, main window navigates to home page
- `app/src/renderer/pages/hello-world.tsx` - Deleted (functionality moved to home page)
- `app/src/renderer/pages/home.tsx` - Updated to serve as main application interface
- **`app/src/renderer/pages/chat.tsx`** - **NEW**: Dedicated chat page for chat window
- **`app/src/electron/windows/chat-window.ts`** - **FIXED**: Now navigates to `/chat` route

#### 4. Architecture Improvements

- **Variable Naming**: `mainWindow` (now refers to chat window) → `chatWindow`
- **Function Consistency**: All window modules follow the same pattern:
  - `preCreateXXXWindow()`
  - `createXXXWindow()`
  - `getXXXWindow()`
- **IPC Updates**: Channel names and method signatures updated consistently
- **Developer Controls**: Settings page developer mode reflects new naming
- **Route Separation**: Chat window loads `/chat`, main window loads `/`

### Technical Impact

- **Backwards Compatibility**: Breaking change - old IPC method names no longer work
- **UI/UX**: More intuitive naming that matches actual functionality
- **Code Clarity**: Functions and variables now clearly indicate their purpose
- **Window Management**: Clean separation between quick chat popup and main application interface
- **Content Routing**: Each window type loads its appropriate interface

### Bug Fixes

- **Chat Window Content**: Fixed issue where chat window was loading main application interface instead of chat interface
- **Global Shortcut**: Ensured global shortcut always opens the chat window with proper chat interface

### Migration Notes

If updating from previous versions:

1. Any external scripts calling `toggleHelloWorldWindow()` should now call `toggleMainWindow()`
2. The main application interface is now accessed via the main window, not hello world window
3. The quick chat popup is now properly identified as the chat window
4. Global shortcut (Alt+Space) now correctly opens chat interface

### Developer Benefits

- Clear distinction between chat popup and main application
- More intuitive variable and function names
- Easier to understand window hierarchy
- Better alignment with user mental model
- Proper content separation between window types
