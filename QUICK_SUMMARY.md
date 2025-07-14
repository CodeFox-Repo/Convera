# FoxyChat - Quick Summary

## What is FoxyChat?

FoxyChat is a cross-platform desktop AI chat application built with Electron and React. It provides a unified interface for interacting with multiple AI models while supporting extensible capabilities through Model Context Protocol (MCP) integration.

## Key Highlights

🤖 **Multi-AI Support** - Works with OpenAI, OpenRouter, and other AI providers  
🔧 **MCP Integration** - Extensible tool system via Model Context Protocol  
🎨 **Modern UI** - Clean interface with dark/light themes and i18n support  
⚡ **Real-time Chat** - Streaming responses with markdown and syntax highlighting  
🎤 **Voice Input** - Built-in voice recognition capabilities  
🔧 **Highly Configurable** - Comprehensive settings and keyboard shortcuts  
🔒 **Privacy-Focused** - Local processing with encrypted storage  

## Technical Stack

- **Frontend**: React 19 + TypeScript + TailwindCSS
- **Desktop**: Electron 34.5.8
- **Build**: Vite + Electron Forge + pnpm workspaces
- **UI**: Radix UI + shadcn/ui components
- **Testing**: Vitest + Playwright
- **Server**: Local Hono server for chat management

## Quick Start

```bash
pnpm install    # Install dependencies
pnpm start      # Launch the app
pnpm make       # Build for distribution
```

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React UI      │    │  Electron Main  │    │   Chat Server   │
│   (Renderer)    │◄──►│    Process      │◄──►│     (Hono)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   MCP Servers   │
                    │   (External)    │
                    └─────────────────┘
```

## Use Cases

- **AI-Powered Conversations** with multiple models
- **Development Workflow** integration via MCP tools
- **Privacy-Focused** AI interactions
- **Cross-Platform** desktop AI experience
- **Extensible** tool ecosystem

## Project Structure

- `app/` - Main Electron application
- `website/` - Marketing/documentation site  
- `docs/` - Documentation site
- `scripts/` - Build and deployment scripts

Perfect for developers and power users who want a sophisticated, extensible, and privacy-focused AI chat experience on their desktop.