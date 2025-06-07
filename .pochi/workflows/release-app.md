# FoxyChat Release Workflow Instructions for Pochi Agent

This document provides step-by-step instructions for the Pochi agent to perform automated releases of the FoxyChat application.

## Prerequisites

Ensure the following tools are available:

- `git` - Version control
- `gh` - GitHub CLI
- `pnpm` - Package manager
- `node` - Node.js runtime

## Release Commands Overview

### 1. Check Current Status

Before starting any release, verify the current state:

```bash
# Check git status
git status

# Check current branch
git branch --show-current

# Check for pending changesets
pnpm run release:dry
```

### 2. Create Changeset (If Needed)

If no changesets exist, create one to document changes:

```bash
# Create a new changeset
pnpm changeset

# When prompted:
# - Select packages: Choose "@foxychat/app"
# - Select version bump type: patch/minor/major
# - Enter summary: Describe the changes
```

### 3. Preview Release

Check what will be released:

```bash
# Preview the release without executing
pnpm run release:dry
```

Expected output format:

```
🦋  info Packages to be bumped at patch
🦋  - @foxychat/app 0.0.X
```

### 4. Execute Release

Run the automated release process:

```bash
# Execute the complete release workflow
pnpm run release
```

This command will:

- ✅ Apply all pending changesets
- ✅ Update version in `app/package.json`
- ✅ Sync version to root `package.json`
- ✅ Create git commit with changes
- ✅ Create git tag (e.g., `v0.0.10`)
- ✅ Push changes and tag to GitHub
- ✅ Trigger GitHub Actions release workflow

## Error Handling

### Common Issues and Solutions

#### "No changesets found"

```bash
# Solution: Create a changeset first
pnpm changeset
```

#### "Tag already exists"

```bash
# Check existing tags
git tag -l | grep v0.0.

# Delete local tag if needed
git tag -d v0.0.X

# Delete remote tag if needed
git push origin --delete v0.0.X
```

#### "Uncommitted changes"

```bash
# Check what's uncommitted
git status

# Commit changes
git add .
git commit -m "your commit message"
```

#### "Not on main branch"

```bash
# Switch to main branch
git checkout main

# Pull latest changes
git pull origin main
```

## GitHub CLI Commands

### Monitor Release Progress

```bash
# Check GitHub Actions workflow status
gh run list --workflow="Release macOS App"

# View specific workflow run
gh run view <run-id>

# Check latest release
gh release list --limit 5
```

### Manual GitHub Operations (If Needed)

```bash
# Create release manually (if automated release fails)
gh release create v0.0.X \
  --title "Release v0.0.X" \
  --notes-from-tag \
  app/out/make/**/*.dmg \
  app/out/make/**/*.zip

# View release details
gh release view v0.0.X
```

## Complete Release Workflow

Here's the complete sequence for Pochi agent to execute:

```bash
#!/bin/bash
# Complete release workflow for Pochi agent

echo "🤖 Pochi: Starting FoxyChat release process..."

# Step 1: Verify prerequisites
echo "📋 Checking prerequisites..."
git status
pnpm --version

# Step 2: Check for changesets
echo "🔍 Checking for pending changesets..."
if ! pnpm run release:dry | grep -q "Packages to be bumped"; then
    echo "❌ No changesets found. Creating one..."
    echo "Please run: pnpm changeset"
    exit 1
fi

# Step 3: Preview release
echo "👀 Previewing release..."
pnpm run release:dry

# Step 4: Confirm and execute
echo "🚀 Executing release..."
pnpm run release

# Step 5: Monitor GitHub Actions
echo "⏳ Monitoring GitHub Actions..."
sleep 10
gh run list --workflow="Release macOS App" --limit 1

echo "✅ Pochi: Release process initiated successfully!"
echo "📋 Next: Monitor GitHub Actions for completion"
echo "🔗 Check releases: gh release list"
```

## Post-Release Verification

After the release command completes:

```bash
# Verify tag was created and pushed
git tag -l | grep v0.0.

# Check GitHub Actions status
gh run list --workflow="Release macOS App" --limit 1

# Monitor until completion
gh run watch

# Verify release was created
gh release list --limit 1

# Check release assets
gh release view --web
```

## Emergency Rollback

If a release needs to be rolled back:

```bash
# Delete the tag locally and remotely
git tag -d v0.0.X
git push origin --delete v0.0.X

# Delete the GitHub release
gh release delete v0.0.X --yes

# Reset to previous commit if needed
git reset --hard HEAD~1
git push --force-with-lease origin main
```

## Success Indicators

A successful release will show:

- ✅ Git tag created: `v0.0.X`
- ✅ GitHub Actions workflow triggered
- ✅ GitHub Release created with assets
- ✅ DMG and ZIP files available for download

## Notes for Pochi Agent

1. **Always run `release:dry` before `release`** to preview changes
2. **Monitor GitHub Actions** after triggering release
3. **Verify release assets** are properly uploaded
4. **Check for any workflow failures** and report them
5. **Wait for CI to complete** before marking release as successful

## Troubleshooting Commands

```bash
# Check git log for recent commits
git log --oneline -10

# Check remote repository status
git remote -v

# Check GitHub CLI authentication
gh auth status

# Check pnpm workspace configuration
pnpm list --depth=0

# Check for any lock file issues
pnpm install --frozen-lockfile
```
