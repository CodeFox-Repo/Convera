#!/bin/bash

# Post-package script to copy robotjs to the correct location
# This ensures robotjs is always available in packaged apps

echo "🔧 Post-package: Copying robotjs to packaged app..."
if [ -z "$APPLE_IDENTITY" ]; then
    export APPLE_IDENTITY="Developer ID Application: xxxxx"
fi

# Check if this is macOS packaging
if [[ "$OSTYPE" == "darwin"* ]]; then
    RESOURCES_PATH="out/FoxyChat-darwin-arm64/FoxyChat.app/Contents/Resources"
    
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
        
        else
            # 添加 RobotJS 原生模块代码签名部分
            if [ -n "$APPLE_IDENTITY" ]; then
                IDENT="$APPLE_IDENTITY"
                APP="./out/FoxyChat-darwin-arm64/FoxyChat.app"
                EXP_ALLOC="$(xcrun --find codesign_allocate)"
                
                export CODESIGN_ALLOCATE="$EXP_ALLOC"
                
                echo "🔐 单独签名 RobotJS 原生模块（含架构 x86_64 和 arm64）..."
                # 匹配所有 .node 与 .o 文件
                find "$APP/Contents/Resources/robotjs" -type f \( -name "*.node" -o -name "*.o" \) -print | while read -r BIN; do
                    echo "  签名: $BIN"
                    codesign --force --options runtime --timestamp \
                        --sign "$IDENT" \
                        "$BIN"
                done
                
                echo
                echo "✅ RobotJS 模块签名完成"
            else
                echo "⚠️  Warning: APPLE_IDENTITY environment variable not set, skipping code signing"
            fi
        fi
    else
        echo "❌ Error: Resources directory not found: $RESOURCES_PATH"
        exit 1
    fi
else
    echo "⚠️  Skipping robotjs copy - not running on macOS"
fi

echo "🔐 Deep-signing the entire app..."
codesign --force --deep --options runtime \
  --timestamp \
  --entitlements entitlements.plist \
  --sign "$APPLE_IDENTITY" \
  "$APP"

echo "🎉 Post-package robotjs setup complete!"