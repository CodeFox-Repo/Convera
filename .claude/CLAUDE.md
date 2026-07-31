# Convera Project

Convera is an advanced chat application built with Electron and React, featuring MCP (Model Context Protocol) integration for extensible AI capabilities.

## Core Philosophy: Agents Are Colleagues, Not Features

Convera simulates a real workplace. Humans and agents are **peers standing in
the same position**: both are participants in a shared workspace of channels
and chats. The reference model is `block/buzz` (cloned at `~/i/buzz`, see its
ARCHITECTURE.md) — humans and agents are equal clients of the same event
stream; an agent's only privilege is a different pair of eyes.

Three rules follow, and they override convenience:

1. **Perception is pull-based (the agent's "eyes" are an API).**
   An agent sees the workspace the way a person does — by looking. It reads
   channels, rosters, and channel descriptions through tools
   (`read_channel`, `list_channels`, …) when it decides it needs to. Never
   push workspace content into an agent's system prompt as pre-digested
   "briefings" — the platform must not decide for the agent what matters.
   A prompt carries only: the agent's own persona, where it is standing
   (channel name + description, who's in the room), and the message batch it
   is being asked to respond to. Everything else it fetches itself.

2. **Memory is self-decided.**
   When an agent receives information (a project announcement, a task, a
   correction), *it* decides whether and what to remember, via its own
   memory tools writing into its own sandbox (`memory/`). Curation is the
   agent's job; the platform only provides storage primitives. No automatic
   fact-stuffing.

3. **Channels carry meaning.**
   A channel's name and description are real context (like #announcements
   being the onboarding hall where project direction is posted). Agents are
   expected to read the rooms they are members of to build their own
   understanding — the same way a new hire reads the pinned posts.

The goal is to model genuine collegial behavior: introduce a project in one
channel, assign tasks in another, and expect agents to have coherent context
because they *looked*, not because they were injected.

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

## Solution Selection Principles

**IMPORTANT: Prefer existing solutions over custom implementations.**

When facing architectural decisions or significant feature implementations:

1. **Research first, implement second**
   - Before proposing a custom implementation, search for established libraries/solutions
   - Present existing options to the user with pros/cons
   - Let the user decide between existing solutions vs custom implementation

2. **Examples of preferred existing solutions**
   - Local storage: Dexie.js, PouchDB, sql.js (not custom IndexedDB wrappers)
   - State management: Zustand, Jotai, TanStack Query (not custom stores)
   - Form handling: React Hook Form, Formik (not custom form state)
   - Data fetching: TanStack Query, SWR (not custom fetch wrappers)

3. **When to consider custom implementation**
   - No existing solution fits the specific requirements
   - Existing solutions add unacceptable overhead
   - User explicitly requests custom implementation
   - The scope is small and well-contained

4. **For large architectural changes**
   - Always present 2-3 solution options with trade-offs
   - Include package size, maintenance burden, community support
   - Wait for user approval before proceeding
