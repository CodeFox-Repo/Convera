
<p align="center">
  <img src="images/logo.png" alt="FoxyFox Logo" width="200"/>
</p>

# FoxyFox

 FoxyFox is an all-in-one desktop AI assistant built with Electron that supports multiple AI models through a unified interface. It features convenient keyboard shortcuts, a modern UI, and seamless desktop integration.

## Features

- **Multi-Model Support**: Connect to various LLM services including Claude, OpenAI, local models, and custom endpoints
- **Model Context Protocol (MCP)**: Standardized interface for AI services integration
- **Modern UI**: Built with React, TailwindCSS, and Radix UI components
- **Desktop Integration**: Global keyboard shortcuts, system tray, theme integration
- **Tool Execution**: Support for web search, code execution, edit images/files, etc.
- **Internationalization**: Multi-language support via i18next

## Demos
https://github.com/user-attachments/assets/44f5dd78-5c69-4e1d-a800-0ef043abaee8

https://github.com/user-attachments/assets/1b0ba5e1-fd63-40c0-bd51-de0c4d0ccf40

https://github.com/user-attachments/assets/c5333113-bfcd-490c-aaa3-67ca38b1dc8c

Browser

<img src="https://github.com/user-attachments/assets/cc4bfb28-a03c-4995-9d41-577b318716b6" height="200"/>

<img src="https://github.com/user-attachments/assets/a96eda6b-fdf0-427f-b26f-b438a0b09292" height="200"/>

## Installation & Setup

```bash
# Install dependencies
yarn

# Start the development server
yarn start

# Package the application
yarn package

# Make distributable installers
yarn make
```

For Mac make sure you have Xcode Command Line Tools

For Windows make sure you have
windows-build-tools npm package (`npm install --global --production windows-build-tools` from an elevated PowerShell or CMD.exe)

## Keyboard Shortcuts

### Quick Launch

- Press `Control+Shift+Space` to activate Foxyfox from anywhere on your system
- If Foxyfox is already visible and focused, pressing `Control+Shift+Space` will hide it
- When the app appears, the chat input will be automatically focused

### Settings

- Press `Command+e` to open the Settings window
- In Settings, you can customize keyboard shortcuts under the "Keyboard Shortcuts" tab
- Click on any shortcut to record a new key combination

### Customization

You can change the global activation shortcut in the Settings:
1. Open Settings (`Command+e`)
2. Go to "Keyboard Shortcuts" tab
3. Click on "Activate App" and press your preferred key combination
4. The new shortcut will take effect immediately

Your shortcuts are saved automatically and will persist between application restarts.

## Model Context Protocol (MCP) Integration

FoxyFox uses the Model Context Protocol (MCP) to provide a unified interface for interacting with various AI services. The MCP implementation includes:

- **MCP Client**: Communicates with MCP servers using the MCP SDK
- **MCP Registry**: Manages and discovers available MCP servers
- **Server Manager**: Handles server lifecycle and configuration
- **Tool Execution**: Standardized interface for executing tools across different AI models

This integration allows FoxyFox to:
- Connect to any MCP-compatible service
- Switch seamlessly between different AI models
- Use local models through standard protocols
- Execute tools consistently across different models

## Architecture

 FoxyFox is built with the following technologies:

- **Electron**: cross-platform desktop application
- **React**: UI components and state management
- **TypeScript**: type-safe code
- **TailwindCSS**: styling
- **Radix UI**: accessible UI components
- **Vite**: fast development and building
- **Electron Forge**: packaging and distribution

The application is organized into the following main directories:
- `src/`: Source code
  - `components/`: UI components
  - `pages/`: Application pages
  - `server/`: Server-side code, including MCP implementation
  - `utils/`: Utility functions
  - `hooks/`: React hooks
  - `localization/`: Internationalization files
- `mcps/`: MCP server implementations

## Contributing

We welcome contributions to FoxyFox! Please feel free to submit issues, feature requests, or pull requests.

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Commit your changes: `git commit -m 'Add some feature'`
4. Push to the branch: `git push origin feature/your-feature-name`
5. Open a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
