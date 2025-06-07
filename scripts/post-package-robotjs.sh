#!/bin/bash

# Post-package script to copy robotjs to the correct location
# This ensures robotjs is always available in packaged apps

echo "🔧 Post-package: Copying robotjs to packaged app..."

# Check if this is macOS packaging
if [[ "$OSTYPE" == "darwin"* ]]; then
    RESOURCES_PATH="out/FoxyChat-darwin-arm64/FoxyChat.app/Contents/Resources"
    
    if [ -d "$RESOURCES_PATH" ]; then
        echo "📁 Found Resources directory: $RESOURCES_PATH"
        
        # Copy robotjs to Resources
        if [ -d "node_modules/@hurdlegroup/robotjs" ]; then
            echo "📦 Copying robotjs..."
            cp -r node_modules/@hurdlegroup/robotjs "$RESOURCES_PATH/robotjs"
            echo "✅ Successfully copied robotjs to $RESOURCES_PATH/robotjs"
            
            # Verify the copy
            if [ -f "$RESOURCES_PATH/robotjs/build/Release/robotjs.node" ]; then
                echo "✅ Verified: robotjs.node exists in packaged app"
            else
                echo "❌ Error: robotjs.node not found after copy"
                exit 1
            fi
        else
            echo "❌ Error: robotjs not found in node_modules"
            exit 1
        fi
    else
        echo "❌ Error: Resources directory not found"
        exit 1
    fi
else
    echo "⚠️  Skipping robotjs copy - not running on macOS"
fi

echo "🎉 Post-package robotjs setup complete!" 