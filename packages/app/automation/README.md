# Convera atomic automation

This is a local MCP server for AI-driven atomic operations against the real
Convera Electron UI. It keeps one WebdriverIO Electron session alive and does
not require test spec files or a CI job.

## Prepare and run

The automation packages require Node.js 22.12 or newer.

```bash
pnpm automation:prepare
pnpm automation
```

`automation:prepare` builds the Electron bundle used by the default launch
path. It is only needed after a clean checkout or when the app bundle changes.
The MCP server communicates over stdio, so an MCP client normally starts
`pnpm automation` itself.

Example MCP client configuration:

```json
{
  "mcpServers": {
    "convera-automation": {
      "command": "pnpm",
      "args": ["automation"],
      "cwd": "/absolute/path/to/convera"
    }
  }
}
```

## Tool flow

1. `convera_session` with `action: "launch"`
2. `convera_observe` with `action: "snapshot"` to obtain current selectors
3. one `convera_interact` call per atomic action
4. `convera_wait` where the UI changes asynchronously
5. `convera_observe` again to verify the resulting state

`convera_execute` is the escape hatch for an operation that cannot be expressed
with the semantic tools. It accepts a JavaScript function body and exposes
`args`; the main-process context also exposes `electron`.

By design, launch explicitly reuses Convera's normal persistent user-data
directory (for example `~/Library/Application Support/Convera` on macOS), so a
test account can be signed in once and reused. Pass `user_data_path` to
`convera_session` only when a different persistent profile is intentional.
Screenshots and WDIO logs are kept under the ignored
`packages/app/.automation/` directory.
