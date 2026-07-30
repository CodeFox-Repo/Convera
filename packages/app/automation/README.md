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

Each MCP server process gets its own profile under `.automation/profiles` by
default, so multiple agents can run hidden Electron sessions concurrently
without sharing Chromium database locks. Pass a stable `profile_id` to reuse
one agent's test state across launches. A profile remains single-writer: do not
give two concurrent sessions the same `profile_id` or `user_data_path`.

Claude Code and Codex CLI authentication remain in their normal host
configuration and are available to every agent profile. Pass `user_data_path`
only when a specific external Electron profile is intentional.
The Electron window stays hidden by default while WebdriverIO continues to
control and inspect it. Pass `show_window: true` to `convera_session` only for
visual debugging.
Screenshots and WDIO logs are kept under the ignored
`packages/app/.automation/` directory.
