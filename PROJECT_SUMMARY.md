# FoxyChat Project Summary

## Overview

**FoxyChat** is a modern, cross-platform desktop chat application built with Electron and React that provides an all-in-one AI chat experience. The application features extensive AI model support, Model Context Protocol (MCP) integration for extensible capabilities, and a polished user interface designed for seamless interaction with various AI assistants.

## Key Features

### 🤖 AI Chat Capabilities
- **Multiple AI Provider Support**: Integration with OpenAI, OpenRouter, and other AI services
- **Real-time Streaming**: Live response streaming for immediate feedback
- **Message Management**: Edit, regenerate, and manage conversation history
- **Voice Input**: Built-in voice recognition and input capabilities
- **Markdown Support**: Rich text rendering with syntax highlighting and mathematical expressions

### 🔧 MCP (Model Context Protocol) Integration
- **Extensible Tool System**: Connect to external MCP servers for enhanced functionality
- **Server Management**: Configure and manage multiple MCP servers
- **Tool Execution**: Execute tools from connected MCP servers within chat conversations
- **Protocol Support**: Both stdio and Server-Sent Events (SSE) protocols supported
- **Marketplace Integration**: Browse and install MCP tools from marketplace

### 🎨 User Experience
- **Modern UI**: Clean, responsive interface built with Radix UI components
- **Theme Support**: Light, dark, and system theme options
- **Internationalization**: Multi-language support (i18n)
- **Keyboard Shortcuts**: Customizable global shortcuts and hotkeys
- **Window Management**: Resizable, draggable windows with position memory
- **Cross-platform**: Native support for Windows, macOS, and Linux

### ⚙️ Configuration & Settings
- **Flexible Configuration**: Comprehensive settings panel for all features
- **MCP Server Configuration**: Easy setup and management of MCP connections
- **API Key Management**: Secure storage and management of API credentials
- **Shortcut Customization**: Configurable keyboard shortcuts
- **Export/Import**: Settings backup and restore functionality

## Technical Architecture

### 🏗️ Tech Stack
- **Frontend**: React 19, TypeScript, TailwindCSS
- **Desktop Framework**: Electron 34.5.8
- **Routing**: TanStack Router with file-based routing
- **State Management**: Zustand for global state
- **UI Components**: Radix UI primitives with shadcn/ui styling
- **Build Tools**: Vite, Electron Forge
- **Testing**: Vitest (unit tests), Playwright (E2E tests)
- **Package Management**: pnpm workspaces

### 📦 Project Structure
```
foxychat/
├── app/                    # Main Electron application
│   ├── src/
│   │   ├── renderer/       # React frontend code
│   │   ├── electron/       # Electron main process
│   │   ├── shared/         # Shared utilities and types
│   │   └── server/         # Local chat server and MCP integration
├── website/                # Documentation and marketing site
├── docs/                   # Documentation site (Next.js)
└── scripts/                # Build and deployment scripts
```

### 🔄 Core Architecture
- **Main Process**: Electron main process handles window management, system integration, and IPC
- **Renderer Process**: React application providing the user interface
- **Chat Server**: Local Hono server managing AI interactions and MCP connections
- **MCP Integration**: Dedicated system for managing external MCP servers and tools
- **Settings Management**: Centralized configuration system with persistent storage

## Development Setup

### Prerequisites
- Node.js 18+ 
- pnpm 8+
- Platform-specific dependencies for Electron

### Installation
```bash
# Clone the repository
git clone https://github.com/CodeFox-Repo/foxychat.git
cd foxychat

# Install dependencies
pnpm install

# Start development server
pnpm start
```

### Development Commands
```bash
pnpm start           # Start the desktop app
pnpm dev:start       # Start with development environment
pnpm make            # Build distributable packages
pnpm test            # Run unit tests
pnpm test:e2e        # Run end-to-end tests
pnpm lint            # Check code style
pnpm format:write    # Fix code formatting
```

## Key Components

### Chat Interface
- **ChatContent**: Main chat display with message rendering
- **ChatInput**: Input field with voice recording and attachment support
- **MessageRenderer**: Markdown processing with syntax highlighting
- **ToolCallRenderer**: Visual display of MCP tool executions

### MCP System
- **MCPRegistry**: Central registry for managing MCP servers
- **ServerManager**: Handles server lifecycle and connections
- **ConfigManager**: Manages MCP server configurations
- **MCPClient**: Handles communication with individual MCP servers

### Settings & Configuration
- **SettingsPage**: Comprehensive settings interface
- **ThemeManager**: Theme switching and persistence
- **ShortcutManager**: Keyboard shortcut configuration
- **LanguageManager**: Internationalization support

## Distribution & Deployment

### Build Process
- **Electron Forge**: Handles application packaging and distribution
- **Multi-platform**: Automated builds for Windows, macOS, and Linux
- **Code Signing**: Configured for release builds
- **Auto-updater**: Built-in update mechanism

### Release Management
- **Changesets**: Automated version management and changelog generation
- **GitHub Actions**: Continuous integration and deployment
- **Release Automation**: Automated release process with proper versioning

## Notable Features

### RobotJS Integration
- **Automation Support**: Screen capture and automation capabilities
- **Cross-platform**: Works across all supported platforms
- **Smart Loading**: Fallback mechanisms for different packaging scenarios

### Window Management
- **Position Memory**: Remembers window positions across sessions
- **Responsive Design**: Adapts to different screen sizes
- **System Integration**: Native OS integration for notifications and shortcuts

### Security & Privacy
- **Local Processing**: Chat server runs locally for privacy
- **Secure Storage**: Encrypted storage for sensitive configuration
- **No Telemetry**: Privacy-focused design with no data collection

## Future Extensibility

The project is designed with extensibility in mind through:
- **MCP Protocol**: Standard interface for tool integration
- **Plugin Architecture**: Modular design for adding new features
- **API Integration**: Easy addition of new AI providers
- **Theme System**: Customizable UI theming
- **Internationalization**: Support for additional languages

## Target Audience

- **Power Users**: Advanced users who need sophisticated AI chat capabilities
- **Developers**: Software developers who want to integrate AI tools into their workflow
- **Privacy-Conscious Users**: Users who prefer local processing and data control
- **AI Enthusiasts**: Users who want to experiment with different AI models and tools

## Conclusion

FoxyChat represents a comprehensive, extensible, and privacy-focused approach to AI chat applications. With its robust MCP integration, modern technical stack, and focus on user experience, it provides a solid foundation for AI-powered desktop interactions while maintaining the flexibility to adapt to evolving AI technologies and user needs.