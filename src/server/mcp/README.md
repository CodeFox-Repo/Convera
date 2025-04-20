# Model Context Protocol (MCP) Implementation

*This documentation was AI-generated on [current date] to provide an overview of the MCP directory structure and functionality.*

## Overview

The Model Context Protocol (MCP) module provides a framework for managing and communicating with various AI language model backends. It handles server discovery, configuration, tool execution, and context management, allowing the application to interact with different AI models through a unified interface.

## Directory Structure

```
/src/server/mcp/
├── index.ts              # Main entry point and public API
├── mcp-registry.ts       # Registry for managing MCP servers
├── server-manager.ts     # Manages server instances and lifecycle
├── config-manager.ts     # Configuration management and persistence
├── mcp-client.ts         # Client for communicating with MCP servers
└── types.ts              # TypeScript type definitions
```

## Component Descriptions

### index.ts (Entry Point)

The main module that exposes the public API for MCP functionality. It provides methods for:
- Initializing the MCP system
- Starting and stopping MCP servers
- Listing available tools
- Executing tools across multiple servers
- Managing MCP configurations

```typescript
// Key functions:
initializeMCP(): void
startMCPServers(): Promise<void>
stopMCPServers(): Promise<void>
listAllTools(): Promise<Tool[]>
runTool(toolName: string, args: any): Promise<any>
getMCPToolsForChat(): Promise<Tool[]>
```

### mcp-registry.ts

The central registry that keeps track of all MCP servers. It:
- Maintains the collection of available servers
- Provides server discovery
- Routes tool execution requests to appropriate servers
- Manages server registration and deregistration

```typescript
// Key classes:
class MCPRegistry {
  registerServer(server: ServerManager): void
  unregisterServer(serverId: string): void
  listAllTools(): Promise<Tool[]>
  runToolByName(toolName: string, args: any): Promise<any>
  findToolByName(toolName: string): Promise<{ tool: Tool, server: ServerManager } | null>
}
```

### server-manager.ts

Manages the lifecycle and communication with individual MCP servers. Responsibilities include:
- Starting and stopping server processes
- Maintaining server state
- Providing client connections
- Executing tools on specific servers

```typescript
// Key classes:
class ServerManager {
  start(): Promise<boolean>
  stop(): Promise<void>
  isRunning(): boolean
  getClient(): MCPClient
  getStatus(): ServerStatus
  listTools(): Promise<Tool[]>
  updateTools(): Promise<Tool[]>
}
```

### config-manager.ts

Manages the configuration for MCP servers, providing:
- Configuration loading and saving
- Default settings
- Configuration validation
- Import/export capabilities

```typescript
// Key classes:
class MCPConfigManager {
  loadConfig(): void
  saveConfig(): void
  getConfig(): MCPConfig
  getServerConfig(serverId: string): MCPServerConfig | undefined
  addServerConfig(config: MCPServerConfig): void
  updateServerConfig(serverId: string, config: Partial<MCPServerConfig>): void
  removeServerConfig(serverId: string): void
}
```

### mcp-client.ts

Provides communication with MCP servers through HTTP or other protocols:
- Tool execution
- Server interrogation
- Connection management
- Error handling

```typescript
// Key classes:
class MCPClient {
  constructor(serverUrl: string, options?: MCPClientOptions)
  checkConnection(): Promise<boolean>
  listTools(): Promise<Tool[]>
  runTool(toolName: string, args: any, context?: any): Promise<any>
}
```

### types.ts

Contains TypeScript type definitions for the MCP module:
- Server configuration interfaces
- Tool descriptions
- Status enumerations
- Client options
- Runtime contexts

```typescript
// Key types:
interface MCPServerConfig {
  id: string
  name?: string
  enabled: boolean
  url?: string
  command?: string
  // ... additional properties
}

interface Tool {
  name: string
  description: string
  parameters: any
  returns?: any
}
```

## Usage Flow

1. The application initializes the MCP module via `initializeMCP()`
2. Configurations are loaded from persistent storage
3. Enabled servers are started automatically
4. The application can discover available tools via `listAllTools()`
5. Tools are executed via `runTool()` which:
   - Finds the appropriate server
   - Forwards the request to that server
   - Returns the result to the application
6. When the application exits, servers are gracefully stopped

## Integration Points

- **Settings UI** - For configuring MCP servers and tools
- **Chat Interface** - For executing tools in response to user requests
- **Storage** - For persisting configuration between sessions
- **Error Handling** - For managing server failures and connection issues

---

*This module follows a modular design pattern with clear separation of concerns between registry, server management, configuration, and client communication layers.* 