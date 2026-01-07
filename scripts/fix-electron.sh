#!/usr/bin/env bash
set -euo pipefail

# Always treat the directory containing THIS script as the anchor.
# Project root = script_dir's parent (because script is in <root>/scripts).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "[fix-electron] script_dir=$SCRIPT_DIR"
echo "[fix-electron] root=$ROOT"

cd "$ROOT"
echo "[fix-electron] pwd=$(pwd)"

if [ ! -f "$ROOT/package.json" ]; then
  echo "[fix-electron] ERROR: package.json not found at $ROOT"
  echo "[fix-electron] Put this script under <repo>/scripts/ so ROOT resolves correctly."
  exit 1
fi

# Warn if install scripts are disabled (Electron needs postinstall)
if [ "${npm_config_ignore_scripts:-}" = "true" ] || [ "${PNPM_IGNORE_SCRIPTS:-}" = "true" ]; then
  echo "[fix-electron] WARNING: install scripts appear disabled."
  echo "              npm_config_ignore_scripts=${npm_config_ignore_scripts:-}"
  echo "              PNPM_IGNORE_SCRIPTS=${PNPM_IGNORE_SCRIPTS:-}"
fi

echo "[fix-electron] pruning pnpm store..."
pnpm store prune || true

# Remove potentially broken Electron dist (common cause of missing framework)
if [ -d "$ROOT/node_modules/electron/dist" ]; then
  echo "[fix-electron] removing $ROOT/node_modules/electron/dist"
  rm -rf "$ROOT/node_modules/electron/dist"
fi

echo "[fix-electron] reinstalling (force)..."
pnpm install --force

# Re-run Electron postinstall explicitly
if [ -d "$ROOT/node_modules/electron" ]; then
  echo "[fix-electron] rerunning electron postinstall..."
  pushd "$ROOT/node_modules/electron" >/dev/null
  rm -rf dist || true
  npm run postinstall
  popd >/dev/null
else
  echo "[fix-electron] ERROR: node_modules/electron not found after install."
  exit 2
fi

FRAMEWORK="$ROOT/node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Framework.framework/Electron Framework"
echo "[fix-electron] verifying Electron Framework..."
if [ -f "$FRAMEWORK" ]; then
  echo "[fix-electron] SUCCESS: Electron Framework found."
else
  echo "[fix-electron] ERROR: Electron Framework not found at:"
  echo "              $FRAMEWORK"
  exit 3
fi

echo "[fix-electron] done."
