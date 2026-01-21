#!/bin/bash

EXTENSION_ID="cervyn.cervyn-visualizer"
EXTENSION_DIR="$(cd "$(dirname "$0")" && pwd)"
VSIX_PATTERN="cervyn-visualizer-*.vsix"
VSCODE_EXT_DIR="$HOME/.vscode/extensions"

echo "🔄  Starting Clean Reinstall Process..."

# Navigate to directory
cd "$EXTENSION_DIR" || exit

# 1. Uninstall existing extension 
echo "🗑️   Uninstalling existing extension..."
code --uninstall-extension $EXTENSION_ID

# 2. Clean old build artifacts
echo "🧹  Cleaning old build artifacts..."
rm -rf out/
echo "    ✓ Removed out/ directory"

# 3. Install dependencies (ensure esbuild is available)
echo "📦  Checking dependencies..."
if [ ! -d "node_modules" ] || [ ! -d "node_modules/esbuild" ]; then
    echo "    Installing npm dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌  npm install failed!"
        exit 1
    fi
fi
echo "    ✓ Dependencies ready"

# 4. Compile extension and bundle webview
echo "🔨  Compiling extension (TypeScript + esbuild)..."
npm run compile
if [ $? -ne 0 ]; then
    echo "❌  Compilation failed!"
    exit 1
fi
echo "    ✓ Extension compiled"
echo "    ✓ Webview bundled with esbuild"

# Verify webview bundle was created
if [ ! -f "out/webview/main.js" ]; then
    echo "❌  Webview bundle not found! (out/webview/main.js)"
    exit 1
fi
BUNDLE_SIZE=$(du -h out/webview/main.js | cut -f1)
echo "    ✓ Webview bundle created ($BUNDLE_SIZE)"

# 5. Package
echo "📦  Packaging VSIX..."
# Remove old VSIX files to avoid confusion
rm -f $VSIX_PATTERN
# Create new package
vsce package
if [ $? -ne 0 ]; then
    echo "❌  Packaging failed!"
    exit 1
fi

# Find the newly created VSIX file
NEW_VSIX=$(ls -t $VSIX_PATTERN | head -1)
echo "    ✓ Packaged: $NEW_VSIX"

# 6. Install
echo "🚀  Installing new version..."
code --install-extension "$NEW_VSIX"
if [ $? -ne 0 ]; then
    echo "❌  Installation failed!"
    exit 1
fi

echo ""
echo "✅  Clean reinstall complete!"
echo "    - Extension compiled with TypeScript"
echo "    - Webview bundled with esbuild ($BUNDLE_SIZE)"
echo "    - VSIX installed: $NEW_VSIX"
echo ""
echo "📋  Next step: Reload VS Code window (Cmd+R or Ctrl+R)"
