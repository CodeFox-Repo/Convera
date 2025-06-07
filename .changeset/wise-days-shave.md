---
"@foxychat/app": patch
---

Optimize RobotJS packaging and CI/CD workflow

- Simplified robotjs loading logic with better TypeScript support
- Added comprehensive type definitions for @hurdlegroup/robotjs
- Removed fallback implementation for cleaner error handling
- Enhanced CI builds with proper native module handling for Ubuntu and macOS
- Optimized forge.config.ts with improved AutoUnpackNativesPlugin configuration
- Added automated release workflow with changeset integration
- Updated build scripts to use pnpm consistently
- Improved package.json scripts for better robotjs rebuilding process

This change improves the reliability of native module packaging and streamlines the development and release process.
