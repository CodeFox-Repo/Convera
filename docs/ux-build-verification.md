# Verify Electron build results

An independent validation fix discovered while testing provider UX changes.

Before: Build Check run https://github.com/CodeFox-Repo/Convera/actions/runs/36857249679 reported success even though its package and make logs each contained `FATAL ERROR: ... heap out of memory`. The Electron Forge subprocess failure did not reliably reach the job exit status. A green badge alone therefore did not establish a usable renderer.

After:
- Give the build a bounded 4 GiB Node heap, also verified by the actual Electron before/after UX workflow
- Preserve strict shell/pipeline exit codes and reject fatal/OOM log output
- Require nonempty main, preload and renderer entry files plus a packaged Convera.app
- Make the distribution from the already verified package rather than building a second time
- Require a nonempty DMG and retain diagnostics on success or failure

This does not sign, publish, merge, deploy or change production. It changes only pull-request build verification. Review independently of the website and provider-copy PRs.
