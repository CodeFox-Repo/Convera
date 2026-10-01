# Website UX copy review

Scope: home, download, pricing expectations, mobile navigation. Based on source at `0e21210e7f9bcfb6164c95b53338621a98e46cb6` and the public website observed on October 1, 2026. The UX-writing skill at https://www.skills.sh/content-designer/ux-writing-skill/ux-writing was read, including its full upstream SKILL.md. Copy was reviewed for purpose, concision, conversational tone and factual clarity.

## Before → after

- “Everything you say stays…” / “keys never leave” → local history is distinguished from requests to AI providers and connected tools
- Generic download invitation → macOS beta / Apple Silicon / provider setup expectations
- A failed release request invented version 0.0.8, a release date and release notes → unavailable state, retry and GitHub release fallback; no invented data
- “Coming Soon” with unverified Windows/Linux requirements → not available, no confirmed date or requirements
- Clipboard success was announced without waiting → success only after the write resolves, actionable failure otherwise
- “Previous Versions” and “Report Issues” opened coming-soon toasts → actual repository releases and issues
- “Toggle menu” → Open/Close menu plus expanded-state semantics
- Pricing omitted separate AI-provider costs → provider subscriptions/API usage may cost extra; existing prices and checkout behavior unchanged
- Installation copy guaranteed a “damaged” build was safe → explains the non-notarized beta and what removing quarantine does, without running any command

## Evidence and acceptance

- `pnpm --filter @convera/website test:copy`: missing release, real ARM64 asset, bad date and missing-note cases
- `pnpm exec vite build` in the website: production bundle
- `Website UX verification`: actual baseline and modified website rendered at desktop and mobile widths, with documented release-response fixtures and no production authentication requests
- Browser checks: visible successful release, failure without invented data, retry recovery, disabled missing DMG, rejected clipboard write without a false success toast, mobile menu expanded/collapsed state
- Screenshot names: `{before,after}-{desktop,mobile}-{home,privacy,download,release-error}.png`, plus after copy-error views

## Boundaries

This is source/preview verification, not a production rollout. No checkout, account creation, model call, download installation, security-setting change or deployment is performed. Commercial plan prices, limits, support promises, Discord membership, notarization and future release timing are not independently certified. Existing checkout/backend behavior is outside this copy change. Full website type-check reports React 18/19 cross-workspace dependency conflicts; a clean-baseline re-check was terminated by the cloud environment, so no clean type-check pass is claimed. Changed-file lint and bundling are separate checks, not a type-check substitute.
