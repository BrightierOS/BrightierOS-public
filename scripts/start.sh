#!/usr/bin/env bash
# BrightierOS v0.2.1 — Multiplatform bootstrap script
# Compatible with Linux and macOS

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

echo ""
echo "=========================="
echo "       BrightierOS"
echo "=========================="
echo ""

if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

echo ""
echo "BrightierOS started!"
echo "Access:"
echo "http://localhost:3000"
echo ""

node server.js
