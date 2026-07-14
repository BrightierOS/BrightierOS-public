#!/usr/bin/env bash
# BrightierOS v0.3.0 — Instalação para macOS
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/brightieros}"
PLIST_LABEL="com.brightieros.server"
PLIST_DEST="/Library/LaunchDaemons/${PLIST_LABEL}.plist"

echo ""
echo "=========================="
echo "   BrightierOS Installer"
echo "=========================="
echo ""

if [[ $EUID -ne 0 ]]; then
    echo "Execute como root: sudo bash $0"
    exit 1
fi

if ! command -v brew >/dev/null 2>&1; then
    echo "Homebrew nao encontrado. Instalando..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    echo "Adicione o Homebrew no PATH antes de continuar."
    exit 1
fi

echo "Instalando Node.js via Homebrew..."
brew install node

echo "Node: $(node -v)"
echo "NPM: $(npm -v)"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "Copiando arquivos para $APP_DIR ..."
mkdir -p "$APP_DIR"
cp -a "$PROJECT_ROOT"/. "$APP_DIR"/

echo "Instalando dependencias..."
cd "$APP_DIR"
npm install --production

mkdir -p "$APP_DIR/logs"

if [[ -f "$APP_DIR/scripts/macos/com.brightieros.server.plist" ]]; then
    echo "Configurando launchd..."
    cp "$APP_DIR/scripts/macos/com.brightieros.server.plist" "$PLIST_DEST"
    chown root:wheel "$PLIST_DEST"
    chmod 644 "$PLIST_DEST"
    launchctl bootstrap system "$PLIST_DEST" || true
    launchctl enable system/$PLIST_LABEL || true
fi

echo ""
echo "Instalacao concluida!"
echo "Acesse: http://localhost:3000"
echo ""
