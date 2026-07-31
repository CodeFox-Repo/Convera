# Convera Agent Instructions

## Real Application Verification

For changes that affect application behavior, Electron main/preload/renderer
integration, local AI providers, MCP servers or tools, settings, or
user-visible flows, unit tests, lint, and typecheck are not sufficient by
themselves.

Before reporting the work complete:

1. Read `packages/app/automation/README.md` completely.
2. After a clean checkout or any app bundle/source change, run
   `pnpm --filter @convera/app automation:prepare`.
3. Start the automation MCP with `pnpm --filter @convera/app automation` and
   drive the real Electron app with `convera_session`, `convera_observe`,
   `convera_interact`, and `convera_wait`. Use `convera_execute` only when the
   semantic actions cannot express the required step.
4. Use an isolated `profile_id` and verify the production-facing behavior,
   including visible success and the relevant failure or degraded state. Do
   not substitute mocks or unit tests for this verification.
5. Inspect the actual UI state and capture a screenshot or log artifact under
   the ignored `packages/app/.automation/` directory when it provides useful
   evidence.
6. Close the automation session and clean up only the exact temporary
   configuration and profile data created by the test. Never modify a real
   user profile, session memo, or conversation database.
7. Report the exercised scenario, provider/runtime, evidence, and any remaining
   real-machine boundary. For provider work, do not run real Claude unless the
   user explicitly asks; use real Codex when requested or available.

If real application automation cannot run, do not silently call the feature
complete. Report the blocker and the exact unverified boundary.
