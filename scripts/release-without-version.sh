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
    echo "⚠️  Tag $TAG_NAME already exists!"
    echo "What would you like to do?"
    echo "  [r] Replace existing tag (delete and recreate)"
    echo "  [s] Skip tag creation and just push commits"
    echo "  [c] Cancel release"
    read -p "Choose an option (r/s/c): " choice
    
    case $choice in
        r|R)
            echo "🗑️  Deleting existing local tag..."
            git tag -d "$TAG_NAME"
            echo "🗑️  Deleting existing remote tag..."
            git push origin ":refs/tags/$TAG_NAME" 2>/dev/null || echo "Remote tag might not exist"
            echo "✅ Existing tags deleted, proceeding with new tag creation..."
            ;;
        s|S)
            echo "⏭️  Skipping tag creation, pushing commits only..."
            git push origin main
            echo "✅ Commits pushed successfully!"
            echo "🎉 Released version: $APP_VERSION (no new tag created)"
            exit 0
            ;;
        c|C|*)
            echo "❌ Release cancelled by user"
            exit 0
            ;;
    esac
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