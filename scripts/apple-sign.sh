#!/bin/bash

# Apple code signing script for Convera
# This script handles code signing for the packaged app

echo "🔐 Starting Apple code signing process..."

# Check if this is macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "⚠️  Skipping code signing - not running on macOS"
    exit 0
fi

APP="./out/Convera-darwin-arm64/Convera.app"

# Check if app exists
if [ ! -d "$APP" ]; then
    echo "❌ Error: App not found at $APP"
    echo "Please run packaging first"
    exit 1
fi

IDENT="$APPLE_IDENTITY"
EXP_ALLOC="$(xcrun --find codesign_allocate)"
export CODESIGN_ALLOCATE="$EXP_ALLOC"

echo "🔐 Using identity: $IDENT"

# Sign RobotJS native modules if they exist
if [ -d "$APP/Contents/Resources/robotjs" ]; then
    echo "🔐 Signing RobotJS native modules..."
    find "$APP/Contents/Resources/robotjs" -type f \( -name "*.node" -o -name "*.o" \) -print | while read -r BIN; do
        echo "  Signing: $BIN"
        codesign --force --options runtime --timestamp \
            --sign "$IDENT" \
            "$BIN"
    done
    echo "✅ RobotJS modules signed successfully"
else
    echo "ℹ️  No RobotJS modules found, skipping native module signing"
fi

# Deep sign the entire app
echo "🔐 Deep-signing the entire app..."
codesign --force --deep --options runtime \
  --timestamp \
  --entitlements entitlements.plist \
  --sign "$APPLE_IDENTITY" \
  "$APP"

if [ $? -eq 0 ]; then
    echo "✅ App signing completed successfully!"
    echo "🎉 Convera.app is now signed with: $IDENT"
else
    echo "❌ App signing failed!"
    exit 1
fi