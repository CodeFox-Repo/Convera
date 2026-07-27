# Convera

Convera is a monorepo containing the Electron desktop client, a simple marketplace server, and a documentation website. All packages are managed with **pnpm** workspaces....

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

- **app** – Electron application containing the Convera desktop client.
- **website** – Documentation and marketing site.
- **market** – Express server providing a simple MCP marketplace.

Environment variables are no longer required. Any configurable values can be set directly in the application interface.

## Troubleshooting

### macOS "App is damaged" Error

If you encounter "Convera is damaged and can't be opened" error on macOS, run this command in Terminal:

```bash
# Remove quarantine attribute from the app
sudo xattr -rd com.apple.quarantine /Applications/Convera.app
```

This error occurs because the app is not code-signed. The command above removes the quarantine attribute that macOS applies to downloaded applications.


