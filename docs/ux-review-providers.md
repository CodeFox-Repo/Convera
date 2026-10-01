# Provider and memory guidance review

Scope: first-use channel copy, provider selection/checking, settings, memory privacy/cost expectations. Source baseline: `0e21210e7f9bcfb6164c95b53338621a98e46cb6`. The UX-writing skill at https://www.skills.sh/content-designer/ux-writing-skill/ux-writing was read, including its full upstream SKILL.md. Copy was reviewed for purpose, concision, conversational tone and factual clarity.

## Before → after

- “Local AI Providers” implied local inference → “AI providers”, with local history and external provider processing explained
- Missing API key / CLI status was a dead end → names the required environment variable or install/sign-in step and how to re-check
- Merely present API keys showed “Ready” → “Configured”, with usage-charge context, without claiming key validation
- Re-check did not re-enter loading, rejected checks were unhandled and could leave stale ready badges → visible checking/error/retry states; failed checks clear stale availability and older results cannot overwrite a newer check
- “Selected/Select” left the scope unclear → “Default/Use by default/Setup required”, with separate colleague-level provider choice explained
- Channel empty state claimed “Nobody here can answer” based only on the default provider → names that provider’s setup need and explains colleague-specific choices; checking no longer displays a false failure
- Suggestions did not explain their behavior → “Choose a suggestion to edit before sending”
- Local memory copy obscured background AI processing → explains that completed turns are sent to the chosen curator and provider charges may apply
- Missing memory status displayed zero pending/failed jobs → “Status unavailable”; memory load errors provide Reload memory settings

## Verification

- Eight new tests exercise provider status guidance, missing bridge, rejected/unsuccessful IPC, stale-ready clearing, retry, checking, and out-of-order responses
- Full unit suite: 586 passed, 3 existing skipped in the cloud checkout
- `Provider UX verification` builds and drives the actual Electron app through the repository’s automation MCP on macOS, in isolated before/after profiles
- Native scenario: open settings, observe unavailable OpenAI API and its disabled choice, re-check, inspect memory guidance and capture screenshots; no credentials or billable model requests
- Evidence: `{before,after}-{workspace,provider-settings,memory-settings}.png` and matching `*-automation.json`

## Boundaries

Cloud-local `automation:prepare` is blocked by a Unix-socket EPERM; the CI scenario supplies the real-machine check. Local whole-app type-check was terminated by the environment, so unit results do not imply that check passed. No configured-provider chat, AI output quality, MCP service account, memory curation request, production rollout or macOS security change is exercised. CI errors fail visibly; they are not converted into a success result.
