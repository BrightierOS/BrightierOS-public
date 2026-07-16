#!/usr/bin/env bash
# BrightierOS Uninstaller - Linux

set -euo pipefail

APP_DIR="/opt/brightieros"
DATA_DIR="/var/lib/brightieros"
LOGS_DIR="/var/log/brightieros"
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


echo "[3/4] Removendo arquivos da aplicação..."

if [[ -d "$APP_DIR" ]]; then
    rm -rf "$APP_DIR"
fi

# Remove usuário de serviço dedicado, se existir e não estiver em uso.
if id -u brightieros >/dev/null 2>&1; then
    echo "Removendo usuário brightieros..."
    userdel brightieros 2>/dev/null || true
fi


echo "[4/4] Dados persistentes..."

PURGE="${PURGE_DATA:-}"
if [[ -z "$PURGE" && -t 0 ]]; then
    echo ""
    echo "Os dados persistentes estão em:"
    echo "  $DATA_DIR"
    echo "  $LOGS_DIR"
    echo ""
    read -r -p "Deseja REMOVER todos os dados (usuários, arquivos, logs, backups)? [s/N] " ans
    [[ "$ans" =~ ^[Ss] ]] && PURGE="yes"
fi

if [[ "$PURGE" == "yes" ]]; then
    echo "Removendo dados persistentes..."
    rm -rf "$DATA_DIR" "$LOGS_DIR"
else
    echo "Dados persistentes preservados em:"
    echo "  $DATA_DIR"
    echo "  $LOGS_DIR"
fi


echo ""
echo "========================================="
echo " BrightierOS removido!"
echo "========================================="
echo ""
