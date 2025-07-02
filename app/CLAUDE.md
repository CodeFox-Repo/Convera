# Claude Code Development Guide for FoxyChat

This guide provides context for future Claude Code instances working with the FoxyChat codebase.

## Project Overview

FoxyChat is an Electron-based AI chat application with Model Context Protocol (MCP) integration. The app allows users to interact with AI models while leveraging MCP servers for extended functionality through tools, resources, and prompts.

## Architecture

- **Frontend**: React-based renderer process (`src/renderer/`)
- **Backend**: Electron main process (`src/electron/`)
- **Bridge**: IPC communication layer (`src/electro-bridge/`)
- **Shared**: Common types and utilities (`src/shared/`)

Do not use npm commands, use pnpm

do not use build

## MCP Integration

### Core MCP Files

- `src/electron/mcp/` - MCP connection management
  - `connection.ts` - Standard MCP client implementation
  - `connection-ai.ts` - AI SDK-based MCP client (experimental)
  - `hub.ts` - MCP server orchestration
  - `index.ts` - Public API and global hub management

### MCP Architecture

- **MCPHub**: Manages multiple MCP server connections
- **MCPConnection**: Handles individual server connections (stdio/SSE)
- **MCPConnectionAI**: AI SDK-based alternative with hybrid transport

### Transport Types

- **stdio**: Process-based communication for local MCP servers
- **SSE**: Server-sent events for remote MCP servers
- **HTTP**: RESTful API communication (used as fallback)

### Tool Parameter Formats

MCP tools can have parameters in different formats:

- `inputSchema`: Frontend-normalized JSON Schema
- `parameters`: Direct JSON Schema from MCP servers
- `parameters.jsonSchema`: Nested JSON Schema format

### Backend Integration

The backend server (`foxychat-server`) receives tools via the chat completion endpoint at `/chat/completions`. Tools are converted from JSON Schema to Zod format in `src/utils/chat-completion.ts`.

## Development Guidelines

### Code Style

- Use TypeScript with strict typing
- No `any` types - use proper type definitions
- Follow existing patterns and conventions
- Import shared types from `@/shared/types/`

### MCP Development

- Use `MCPHub` for server management
- Prefer `connection.ts` for stable implementations
- Use `connection-ai.ts` for AI SDK experiments
- Always handle connection errors gracefully
- Set `useAiSdk = true` for AI SDK connections

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

### SSE Connection Stuck

**Problem**: Remote MCP servers stuck in "connecting" status
**Solution**: Ensure proper SSE transport implementation with fallback

### Tool Discovery Issues

**Problem**: Tools not appearing (toolCount: 0)
**Solution**: Verify `useAiSdk` flag is set correctly for connection type

### Type Errors

**Problem**: TypeScript errors with MCP types
**Solution**: Use proper type imports and avoid `any` casting

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
│   ├── libs/          # Utilities and stores
│   └── pages/         # Application pages
├── electro-bridge/    # IPC communication
│   └── ipc/          # IPC channels and handlers
└── shared/           # Shared utilities
    ├── types/        # TypeScript definitions
    └── robot/        # System automation
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

1. Run `npm run lint` and fix all issues
2. Run `npm run type-check` and resolve type errors
3. Test MCP connections and tool functionality
4. Verify IPC communication works correctly

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
- **ai**: AI SDK for experimental features
- **zod**: Schema validation
- **robotjs**: System automation

## Cross-Window State Synchronization

### Problem

Electron creates separate JavaScript contexts for each window, meaning Zustand stores are independent instances that don't automatically sync between windows.

### Solution: localStorage + storage Events Pattern

Use the same pattern as `model-store` for elegant cross-window synchronization:

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
- Reference `model-store.ts` and `mcp-store.ts` for implementation examples

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

## Notes for Future Development

- MCP integration is actively evolving - prefer stable `connection.ts` over experimental `connection-ai.ts`
- Always handle both stdio and SSE transport types
- Parameter format normalization is critical for tool functionality
- Type safety is prioritized - avoid `any` types
- IPC system is unified - use existing patterns for new features
- **For cross-window sync**: Always use localStorage + storage events pattern, never custom IPC
