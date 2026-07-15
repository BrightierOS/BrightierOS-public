#!/usr/bin/env bash
# BrightierOS Uninstaller - Linux

set -euo pipefail

APP_DIR="/opt/brightieros"
SERVICE_NAME="brightieros"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

echo "========================================="
echo "      BrightierOS Uninstaller"
echo "========================================="
echo ""

if [[ $EUID -ne 0 ]]; then
    echo "Execute como root:"
    echo "sudo bash $0"
    exit 1
fi

echo "[1/4] Parando serviço..."

if systemctl is-active --quiet "$SERVICE_NAME"; then
    systemctl stop "$SERVICE_NAME"
fi


echo "[2/4] Removendo serviço systemd..."

systemctl disable "$SERVICE_NAME" 2>/dev/null || true

if [[ -f "$SERVICE_FILE" ]]; then
    rm -f "$SERVICE_FILE"
fi

systemctl daemon-reload


echo "[3/4] Removendo arquivos..."

if [[ -d "$APP_DIR" ]]; then
    rm -rf "$APP_DIR"
fi


echo "[4/4] Finalizando..."

echo ""
echo "========================================="
echo " BrightierOS removido!"
echo "========================================="
echo ""
