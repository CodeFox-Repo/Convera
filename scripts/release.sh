#!/bin/bash

# Release script for Convera
# This script handles version bumping using changesets and creates git tags

set -e

echo "🚀 Starting Convera release process..."

# Check if we're on main branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "main" ]; then
    echo "❌ Error: Must be on main branch to release. Current branch: $CURRENT_BRANCH"
    exit 1
fi

# Check for uncommitted changes
if ! git diff --quiet; then
    echo "❌ Error: There are uncommitted changes. Please commit or stash them first."
    exit 1
fi

# Check if there are any changesets to process
if ! pnpm changeset status --verbose | grep -q "Packages to be bumped"; then
    echo "❌ No changesets found. Please create a changeset first with 'pnpm changeset'"
    exit 1
fi

echo "📝 Processing changesets and updating versions..."

# Apply changesets to update versions
pnpm changeset version

# Get the new version from app/package.json
APP_VERSION=$(node -p "require('./app/package.json').version")
echo "📦 App version: $APP_VERSION"

# Update root package.json version to match app version
echo "🔄 Syncing root package.json version..."
node -e "
const pkg = require('./package.json');
pkg.version = '$APP_VERSION';
require('fs').writeFileSync('./package.json', JSON.stringify(pkg, null, 2) + '\n');
"

# Stage the version changes
git add .

# Commit the version changes if there are any
if ! git diff --cached --quiet; then
    echo "💾 Committing version changes..."
    git commit -m "chore: release v$APP_VERSION"
fi

# Create and push git tag
TAG_NAME="v$APP_VERSION"
echo "🏷️  Creating git tag: $TAG_NAME"

if git rev-parse "$TAG_NAME" >/dev/null 2>&1; then
    echo "❌ Tag $TAG_NAME already exists!"
    exit 1
fi

git tag -a "$TAG_NAME" -m "Release $TAG_NAME"

echo "📤 Pushing changes and tag to remote..."
git push origin main
git push origin "$TAG_NAME"

echo "✅ Release process completed successfully!"
echo "🎉 Released version: $APP_VERSION"
echo "🏷️  Tag created: $TAG_NAME"
echo ""
echo "📋 Next steps:"
echo "   • The release workflow will automatically trigger"
echo "   • Check GitHub Actions for build progress"
echo "   • Release artifacts will be available when complete" 