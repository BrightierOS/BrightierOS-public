#!/usr/bin/env bash
# BrightierOS Installer
# Linux

set -Eeuo pipefail

APP_DIR="/opt/brightieros"
SERVICE_NAME="brightieros"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

SERVICE_USER="${SUDO_USER:-$USER}"

echo ""
echo "========================================="
echo "        BrightierOS Installer"
echo "========================================="
echo ""

if [[ $EUID -ne 0 ]]; then
    echo "Execute como root:"
    echo "sudo bash $0"
    exit 1
fi


echo "[1/6] Verificando Node.js..."

if command -v node >/dev/null 2>&1; then
    echo "Node encontrado: $(node -v)"
else
    echo "Node não encontrado. Instalando..."

    if command -v apt-get >/dev/null 2>&1; then
        apt-get update -y
        apt-get install -y curl ca-certificates gnupg

        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y nodejs

    elif command -v dnf >/dev/null 2>&1; then
        dnf install -y nodejs npm

    elif command -v pacman >/dev/null 2>&1; then
        pacman -Sy --noconfirm nodejs npm

    else
        echo "Sistema não suportado."
        exit 1
    fi
fi


NODE_PATH="$(command -v node)"

echo "Node: $NODE_PATH"
echo "Versão: $(node -v)"


echo ""
echo "[2/6] Preparando diretório..."

mkdir -p "$APP_DIR"
mkdir -p "$APP_DIR/data"
mkdir -p "$APP_DIR/logs"
mkdir -p "$APP_DIR/backups"


SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"


echo ""
echo "[3/6] Copiando arquivos..."

if command -v rsync >/dev/null 2>&1; then

    rsync -a \
        --delete \
        --exclude="node_modules/" \
        --exclude="logs/" \
        --exclude="data/" \
        --exclude="backups/" \
        --exclude=".env" \
        "$PROJECT_ROOT"/ "$APP_DIR"/

else

    cp -a "$PROJECT_ROOT"/. "$APP_DIR"/

fi


echo ""
echo "[4/6] Instalando dependências..."

cd "$APP_DIR"

if [[ -f package-lock.json ]]; then
    npm ci --omit=dev
else
    npm install --omit=dev
fi


echo ""
echo "[5/6] Configurando permissões..."

chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"


echo ""
echo "[6/6] Criando serviço systemd..."

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=BrightierOS
After=network.target

[Service]
Type=simple

User=$SERVICE_USER
Group=$SERVICE_USER

WorkingDirectory=$APP_DIR

ExecStart=$NODE_PATH server.js

Environment=NODE_ENV=production

Restart=always
RestartSec=5

StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF


systemctl daemon-reload

systemctl enable "$SERVICE_NAME"

systemctl restart "$SERVICE_NAME"


sleep 3


echo ""

if systemctl is-active --quiet "$SERVICE_NAME"; then

    echo "========================================="
    echo " BrightierOS instalado com sucesso!"
    echo "========================================="
    echo ""
    echo "Serviço : $SERVICE_NAME"
    echo "Usuário : $SERVICE_USER"
    echo "Pasta   : $APP_DIR"
    echo ""
    echo "Acesse:"
    echo "http://localhost:3000"
    echo ""

else

    echo "========================================="
    echo " BrightierOS falhou ao iniciar"
    echo "========================================="
    echo ""

    journalctl -u "$SERVICE_NAME" --no-pager -n 50

    exit 1

fi
