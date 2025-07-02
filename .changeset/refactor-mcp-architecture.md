---
"@foxychat/app": patch
---

Refactor MCP and agent architecture to use remote server

- Migrated all server-side logic to remote server, removing local chat-server, agents, and API modules
- Updated MCP integration to use AI SDK experimental client for better compatibility
- Implemented cross-window state synchronization using localStorage and storage events
- Enhanced MCP connection management with concurrent initialization and better error handling
- Added centralized logging system for improved debugging and monitoring
- Improved clipboard management with image support
- Migrated chat history from custom hook to Zustand store for better state management
- Enhanced UI with new MCP tools panel and tab-based settings structure
- Optimized window management with dynamic resizing and centering capabilities
