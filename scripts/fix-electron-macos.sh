#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT"

echo "[fix-electron] pruning pnpm store..."
pnpm store prune || true

if [ -d "node_modules/electron" ]; then
  echo "[fix-electron] removing electron dist..."
  rm -rf node_modules/electron/dist || true
fi

echo "[fix-electron] reinstalling (force)..."
pnpm install --force

echo "[fix-electron] rerunning electron postinstall..."
cd node_modules/electron
rm -rf dist || true
npm run postinstall
echo "[fix-electron] done"
