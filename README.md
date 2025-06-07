# FoxyChat

FoxyChat is a monorepo containing the Electron desktop client, a simple marketplace server, and a documentation website. All packages are managed with **pnpm** workspaces.

## Getting Started

Install dependencies in every workspace:

```bash
pnpm install
```

### Running the Desktop App

```
pnpm start
```

### Running the Marketplace Server

```
pnpm start:market
```

### Development Utilities

```bash
pnpm lint      # check lint errors
pnpm format    # verify formatting
pnpm format:write  # fix formatting
pnpm test      # run unit tests
pnpm test:all  # run all tests
```

## Packages

- **app** – Electron application containing the FoxyChat desktop client.
- **website** – Documentation and marketing site.
- **market** – Express server providing a simple MCP marketplace.

Environment variables are no longer required. Any configurable values can be set directly in the application interface.

## Troubleshooting

### macOS "App is damaged" Error

If you encounter "FoxyChat is damaged and can't be opened" error on macOS, run this command in Terminal:

```bash
# Remove quarantine attribute from the app
sudo xattr -rd com.apple.quarantine /Applications/FoxyChat.app
```

This error occurs because the app is not code-signed. The command above removes the quarantine attribute that macOS applies to downloaded applications.

### CI Build Issues with RobotJS

**✅ SOLVED**: RobotJS packaging has been fully automated using a post-package script.

**For local development:**
```bash
# Normal build (may not include robotjs in packaged app)
pnpm run make

# Build with robotjs included (recommended)
pnpm run make:robotjs
```

**For CI/Production:**
The release workflow automatically uses `make:robotjs` which ensures robotjs is properly included.

**Technical Details:**
1. **Automatic Copy**: Post-package script automatically copies robotjs to `Resources/robotjs/`
2. **Smart Loading**: Enhanced robot.ts tries multiple paths to find robotjs
3. **Verification**: Build process verifies robotjs.node exists after packaging
4. **Cross-platform**: Script adapts to different OS packaging structures

The current configuration guarantees robotjs functionality in all packaged applications.

