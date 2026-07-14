#!/usr/bin/env bash
# BrightierOS v0.3.0 — Instalação para Linux
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/brightieros}"
SERVICE_NAME="brightieros"
CURRENT_USER="${SUDO_USER:-$USER}"

echo ""
echo "=========================="
echo "   BrightierOS Installer"
echo "=========================="
echo ""

if [[ $EUID -ne 0 ]]; then
    echo "Execute como root: sudo bash $0"
    exit 1
fi

if command -v apt-get >/dev/null 2>&1; then
    echo "Instalando Node.js via apt..."
    apt-get update -y
    apt-get install -y curl gnupg
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
elif command -v dnf >/dev/null 2>&1; then
    echo "Instalando Node.js via dnf..."
    dnf install -y nodejs npm
elif command -v pacman >/dev/null 2>&1; then
    echo "Instalando Node.js via pacman..."
    pacman -Sy --noconfirm nodejs npm
else
    echo "Gerenciador de pacotes nao suportado. Instale Node.js manualmente."
    exit 1
fi

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

if [[ -f "$APP_DIR/scripts/linux/brightieros.service" ]]; then
    echo "Configurando service systemd..."
    cat > /etc/systemd/system/${SERVICE_NAME}.service <<SERVICE
[Unit]
Description=BrightierOS
After=network.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
SERVICE
    systemctl daemon-reload
    systemctl enable --now ${SERVICE_NAME}.service
fi

echo ""
echo "Instalacao concluida!"
echo "Acesse: http://localhost:3000"
echo ""
