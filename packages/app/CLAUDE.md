# Claude Code Development Guide for Convera

This guide provides context for future Claude Code instances working with the Convera codebase.

## Project Overview

Convera is an Electron-based AI chat application with Model Context Protocol (MCP) integration. The app allows users to interact with AI models while leveraging MCP servers for extended functionality through tools, resources, and prompts.

## Architecture

- **Frontend**: React-based renderer process (`src/renderer/`)
- **Backend**: Electron main process (`src/electron/`)
- **Bridge**: IPC communication layer (`src/electro-bridge/`)
- **Shared**: Common types and utilities (`src/shared/`)

## Commands

- Use `pnpm` instead of `npm`
- Do not use `build` command

## UI Development Rules

### Critical UI Guidelines

1. **NEVER add `bg-background` or any background colors to components**

   - Only `base-layout.tsx` should have background styling
   - All components should be transparent to follow the design system
   - This maintains the proper glass morphism and blur effects

2. **Component Styling Principles**

   - Use transparency and backdrop blur for glass effects
   - Follow existing patterns in the codebase
   - Keep components minimal and clean
   - Use proper spacing with padding/margin as needed

3. **Tailwind CSS Usage**
   - Avoid problematic classes like `bg-muted/50` or `border-border/20`
   - Use `color-mix()` CSS function for transparency when needed
   - Always check if a Tailwind class is supported before using it

### Chat Window Behavior

1. **Window Activation by Shortcut**

   - Chat state is reset every time window is activated via keyboard shortcut
   - Input field is cleared and focused automatically
   - Provides a fresh chat session for each activation

2. **Input Handling**

   - Input is disabled while AI is processing (loading state)
   - Shows "AI is thinking..." placeholder during loading
   - Auto-refocuses input after AI response completes

3. **Command Mode**
   - Activated by typing "/"
   - Shows styled slash indicator, hides user's typed "/"
   - Backspace on empty command exits command mode
   - Fetches MCP tools that don't require input parameters

## MCP Integration

### Core MCP Files

- `src/electron/mcp/` - MCP connection management
  - `connection.ts` - Standard MCP client implementation
  - `connection-ai.ts` - AI SDK-based MCP client (experimental)
  - `hub.ts` - MCP server orchestration with caching
  - `index.ts` - Public API and global hub management

### MCP Hub Features

- **Tool Caching**: 5-minute cache duration for MCP tools
- **getAllNonInputParamTool()**: Returns tools that don't require input parameters
- **Automatic filtering**: Handles multiple parameter schema formats

### Transport Types

- **stdio**: Process-based communication for local MCP servers
- **SSE**: Server-sent events for remote MCP servers
- **HTTP**: RESTful API communication (used as fallback)

### Tool Parameter Formats

MCP tools can have parameters in different formats:

- `inputSchema`: Frontend-normalized JSON Schema
- `parameters`: Direct JSON Schema from MCP servers
- `parameters.jsonSchema`: Nested JSON Schema format

## AI SDK Integration

- Using AI SDK's `useChat` hook for chat functionality
- **sendMessage** accepts message directly: `sendMessage(message: string)`
- Avoids race conditions by passing message as parameter instead of relying on state

## Development Guidelines

### Code Style

- Use TypeScript with strict typing
- No `any` types - use proper type definitions
- Follow existing patterns and conventions
- Import shared types from `@/shared/types/`
- NO COMMENTS unless specifically requested by user

### Debugging

- Use `window.logger.getLogger()` for logging
- Console logs should be descriptive with emojis for clarity
- Remove debugging code before finalizing

### IPC Communication

- Use unified IPC system in `src/electro-bridge/ipc/`
- Channel definitions in `channels.ts`
- Handlers in `ipc-handlers.ts`
- Listeners registration in `listeners-register.ts`

### Type Safety

- Import types from `@/shared/types/mcp.ts`
- Use proper interfaces for server configurations
- Maintain type compatibility between frontend/backend

## Common Issues & Solutions

### MCP Tool Parameters Not Displaying

**Problem**: Tools show empty parameters in AI interface
**Solution**: Check parameter format conversion in backend `chat-completion.ts`

### First Message Shows "sendMessage"

**Problem**: Literal "sendMessage" appears as user message
**Solution**: Pass message directly to sendMessage function: `sendMessage(messageText)`

### Tailwind CSS Errors

**Problem**: Classes like `bg-muted/50` cause build errors
**Solution**: Use CSS `color-mix()` function or remove problematic classes

### Chat Input Focus Issues

**Problem**: Input doesn't focus properly after AI response
**Solution**: Use `useEffect` with timeout to ensure proper focus after state updates

## File Structure

```
src/
├── electron/           # Main process
│   ├── mcp/           # MCP integration
│   ├── windows/       # Window management
│   ├── logger/        # Logging system
│   └── main.ts        # Entry point
├── renderer/          # Renderer process
│   ├── components/    # React components
│   │   └── chat/      # Chat UI components
│   │       ├── index.tsx              # Main chat component
│   │       ├── command-input.tsx      # Unified input field
│   │       ├── command-results.tsx    # Results dropdown
│   │       └── command-content.tsx    # Content display area
│   ├── libs/          # Utilities and stores
│   └── pages/         # Application pages
├── electro-bridge/    # IPC communication
│   └── ipc/          # IPC channels and handlers
└── shared/           # Shared utilities
    ├── types/        # TypeScript definitions
```

## Configuration

### MCP Server Configuration

Servers are configured in the app settings with support for:

- **stdio**: `command`, `args`, `cwd`, `env`
- **SSE**: `url`, `apiKey`
- **Common**: `name`, `description`, `enabled`

### Environment Variables

- Development mode detected via `!app.isPackaged`
- Platform-specific features for macOS/Windows/Linux

## Testing & Quality

### Before Committing

1. Run `pnpm lint` and fix all issues
2. Run `pnpm type-check` and resolve type errors
3. Test MCP connections and tool functionality
4. Verify IPC communication works correctly
5. Ensure no background colors are added to components

### MCP Testing

- Test both stdio and SSE connections
- Verify tool parameter formats are handled correctly
- Check error handling and connection recovery
- Ensure proper cleanup on app shutdown

## Key Dependencies

- **Electron**: Desktop app framework
- **React**: UI framework
- **Vite**: Build tool
- **@modelcontextprotocol/sdk**: MCP implementation
- **ai**: AI SDK for chat functionality
- **zod**: Schema validation

## Cross-Window State Synchronization

### Problem

Electron creates separate JavaScript contexts for each window, meaning Zustand stores are independent instances that don't automatically sync between windows.

### Solution: localStorage + storage Events Pattern

Use the same pattern as `model-config-store` for elegant cross-window synchronization:

#### 1. Data Persistence

Always write state changes to localStorage:

```typescript
// In store actions
set({ data: newData });
localStorage.setItem("storeKey", JSON.stringify(newData));
```

#### 2. Storage Event Listener

Create a subscription method that listens for storage changes:

```typescript
subscribeToChanges: () => {
  const storageEventHandler = ((event: StorageEvent) => {
    if (event.key === "storeKey" && event.newValue) {
      const parsedData = JSON.parse(event.newValue);
      set({ data: parsedData });
    }
  }) as EventListener;

  window.addEventListener("storage", storageEventHandler);

  return () => {
    window.removeEventListener("storage", storageEventHandler);
  };
};
```

#### 3. Component Integration

Subscribe to changes in useEffect:

```typescript
useEffect(() => {
  const unsubscribe = store.subscribeToChanges();
  return unsubscribe;
}, []);
```

### Why This Works

- Browser automatically sends `storage` events to all same-origin windows when localStorage changes
- No need for complex IPC event forwarding in main process
- Leverages native browser functionality
- Consistent pattern across all stores

### When to Use

- Any Zustand store that needs cross-window synchronization
- Prefer this over custom IPC solutions for window-to-window state sync
- Reference `model-config-store.ts` and `mcp-store.ts` for implementation examples

### Window Initialization Pattern

For popover/modal windows that may be opened at any time:

1. **Fetch fresh data** on component mount to ensure latest state
2. **Subscribe to changes** for real-time updates while open
3. **Example pattern**:

```typescript
useEffect(() => {
  // Always fetch fresh data when window opens
  refreshData();

  // Subscribe for real-time updates
  const unsubscribe = subscribeToChanges();

  return unsubscribe;
}, []);
```

This ensures popover windows always show current data, even if they were closed when changes occurred in other windows.

## Chat Component Architecture

### Key Components

1. **CommandInput**: Unified input for both AI chat and command mode

   - Handles "/" command mode activation
   - Shows loading state with disabled input
   - Auto-focuses on window activation

2. **CommandResults**: Dynamic results dropdown

   - Shows MCP tool commands in command mode
   - Shows "Ask AI" option for regular input
   - Keyboard navigation support

3. **CommandContent**: Full-window content display
   - Shows chat messages with proper formatting
   - Displays MCP tool execution results
   - Auto-scrolls to bottom on new messages

### State Management

- Chat state managed by `useChatContext()` from chat-store
- Local UI state for input, command mode, and results
- Reset on window activation via `onFocusChatInput` event

## Notes for Future Development

- MCP integration is actively evolving - prefer stable `connection.ts` over experimental `connection-ai.ts`
- Always handle both stdio and SSE transport types
- Parameter format normalization is critical for tool functionality
- Type safety is prioritized - avoid `any` types
- IPC system is unified - use existing patterns for new features
- **For cross-window sync**: Always use localStorage + storage events pattern, never custom IPC
- **UI components**: Never add background colors - only base-layout should have background
- **Chat behavior**: Window activation always resets chat for fresh session
