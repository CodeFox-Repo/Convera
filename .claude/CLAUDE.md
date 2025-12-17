# Convera Project

Convera is an advanced chat application built with Electron and React, featuring MCP (Model Context Protocol) integration for extensible AI capabilities.

## Project Structure

- `app/` - Main Electron application

## Related Repositories

### Remote-MCP-Servers

**Location**: `/Volumes/ssd/i/Remote-MCP-Servers`

This repository contains the Convera MCP servers collection, providing stdio and SSE protocol implementations for various integrations:

#### Available Servers:

- **apple-imessages**: stdio MCP server for macOS iMessage integration

  - Send/receive iMessages
  - Contact management
  - Message history access
  - Requires Full Disk Access on macOS

- **gmail-mcp-server**: SSE MCP server for Gmail integration
  - OAuth2 authentication
  - Email management
  - Label operations
  - Attachment handling

#### Architecture:

- **stdio servers**: Direct stdio communication for local integrations
- **SSE servers**: Server-Sent Events for real-time web integrations
- All servers written in TypeScript with proper type safety
- Uses @modelcontextprotocol/sdk for MCP implementation

#### Development:

- Node.js 18+ required
- TypeScript compilation
- Individual package.json for each server
- Root-level coordination via main package.json

## MCP Integration

Convera integrates with MCP servers to provide extensible AI capabilities. The MCP servers are managed separately in the Remote-MCP-Servers repository but can be configured within Convera for seamless operation.

### Usage:

1. Build desired MCP servers from Remote-MCP-Servers
2. Configure Convera to connect to the servers
3. Use the integrated tools within Convera interface

## Development Notes

- Use TypeScript for all new code
- Follow existing code patterns and conventions
- MCP servers should be developed in Remote-MCP-Servers repository
- Main Convera app development happens in this repository
