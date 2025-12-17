#!/bin/bash

# Post-package script to copy robotjs to the correct location
# This ensures robotjs is always available in packaged apps

echo "🔧 Post-package: Copying robotjs to packaged app..."

# Check if this is macOS packaging
if [[ "$OSTYPE" == "darwin"* ]]; then
    RESOURCES_PATH="out/Convera-darwin-arm64/Convera.app/Contents/Resources"
    
    if [ -d "$RESOURCES_PATH" ]; then
        echo "📁 Found Resources directory: $RESOURCES_PATH"
        
        # Try multiple possible locations for robotjs
        ROBOTJS_PATHS=(
            "node_modules/@hurdlegroup/robotjs"
            "../node_modules/@hurdlegroup/robotjs"
            "../../node_modules/@hurdlegroup/robotjs"
        )
        
        ROBOTJS_FOUND=false
        
        for ROBOTJS_PATH in "${ROBOTJS_PATHS[@]}"; do
            if [ -d "$ROBOTJS_PATH" ]; then
                echo "📦 Found robotjs at: $ROBOTJS_PATH"
                echo "📦 Copying robotjs..."
                cp -r "$ROBOTJS_PATH" "$RESOURCES_PATH/robotjs"
                echo "✅ Successfully copied robotjs to $RESOURCES_PATH/robotjs"
                
                # Verify the copy
                if [ -f "$RESOURCES_PATH/robotjs/build/Release/robotjs.node" ]; then
                    echo "✅ Verified: robotjs.node exists in packaged app"
                    ROBOTJS_FOUND=true
                    break
                else
                    echo "⚠️  Warning: robotjs.node not found after copy from $ROBOTJS_PATH"
                fi
            fi
        done
        
        if [ "$ROBOTJS_FOUND" = false ]; then
            echo "❌ Error: robotjs not found in any of the expected locations:"
            for path in "${ROBOTJS_PATHS[@]}"; do
                echo "  - $path"
            done
            echo "📁 Available directories:"
            ls -la . || echo "  - Cannot list current directory"
            ls -la node_modules/ 2>/dev/null || echo "  - node_modules not found in current directory"
            ls -la ../node_modules/ 2>/dev/null || echo "  - node_modules not found in parent directory"
            echo "⚠️  Continuing without robotjs - app may not have native module functionality"
        fi
    else
        echo "❌ Error: Resources directory not found: $RESOURCES_PATH"
        exit 1
    fi
else
    echo "⚠️  Skipping robotjs copy - not running on macOS"
fi

echo "🎉 Post-package robotjs setup complete!" 