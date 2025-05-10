# FoxyChat

## PNPM Workspace Setup

This project uses PNPM workspaces to manage multiple packages in a monorepo structure.

### Requirements

- Node.js >= 18.0.0
- PNPM >= 8.0.0

### Installation

To install PNPM globally:

```bash
npm install -g pnpm
```

### Setup

Initialize the workspace:

```bash
pnpm install
```

### Available Scripts

Run these commands from the root directory:

```bash
# Start the application
pnpm start

# Run linting across all packages
pnpm lint

# Format code
pnpm format

# Format and write changes
pnpm format:write

# Run tests
pnpm test

# Run all tests
pnpm test:all
```

### Workspace Structure

The workspace includes the following packages:

- `app/`: Main Electron application
- `website/`: Website for the project
- `mcps/`: MCP related packages

### Adding Dependencies

To add a dependency to a specific workspace:

```bash
pnpm --filter <package-name> add <dependency>
```

To add a dependency to all workspaces:

```bash
pnpm -r add <dependency>
```

To add a dev dependency to all workspaces:

```bash
pnpm -r add -D <dependency>
``` 