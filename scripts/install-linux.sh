#!/usr/bin/env bash
# BrightierOS Installer
# Linux (systemd)
#
# Evita perda de dados em reinicializações ao isolar os dados persistentes em
# /var/lib/brightieros (FHS), fora do diretório de aplicação /opt/brightieros.

set -Eeuo pipefail

APP_DIR="/opt/brightieros"
DATA_DIR="/var/lib/brightieros"
LOGS_DIR="/var/log/brightieros"
BACKUP_DIR="/var/lib/brightieros/backups"
SERVICE_NAME="brightieros"
SERVICE_USER="brightieros"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

# Caminho para flag de reinício usado pelas rotas de update/restart
RESTART_FLAG="/var/lib/brightieros/.bos-restart"

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

# ─── Usuário de serviço dedicado ───────────────────────────────────────
echo "[1/8] Verificando usuário de serviço..."

if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
    echo "Criando usuário $SERVICE_USER..."
    useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
else
    echo "Usuário $SERVICE_USER já existe."
fi

# ─── Node.js ───────────────────────────────────────────────────────────
echo ""
echo "[2/8] Verificando Node.js..."

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
NODE_VERSION="$(node -v)"
NPM_VERSION="$(npm -v)"

echo "Node: $NODE_PATH"
echo "Versão: $NODE_VERSION"
echo "NPM: $NPM_VERSION"

# ─── Preparar diretórios persistentes ──────────────────────────────────
echo ""
echo "[3/8] Preparando diretórios..."

mkdir -p "$APP_DIR"
mkdir -p "$DATA_DIR"
mkdir -p "$LOGS_DIR"
mkdir -p "$BACKUP_DIR"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# ─── Backup de segurança dos dados existentes ────────────────────────
echo ""
echo "[4/8] Preservando dados existentes..."

# Backup leve: só se houver dados na instalação antiga em /opt/brightieros/data
LEGACY_DATA_DIR="$APP_DIR/data"
if [[ -d "$LEGACY_DATA_DIR" && -n "$(ls -A "$LEGACY_DATA_DIR" 2>/dev/null)" ]]; then
    BACKUP_TS="$(date +%Y%m%d-%H%M%S)"
    SAFETY_BACKUP="$BACKUP_DIR/pre-install-$BACKUP_TS"
    echo "Backup dos dados legados em $LEGACY_DATA_DIR -> $SAFETY_BACKUP"
    cp -a "$LEGACY_DATA_DIR" "$SAFETY_BACKUP"
fi

# Se o novo diretório de dados ainda está vazio e existia dados legados,
# migra automaticamente para o local persistente.
if [[ -d "$LEGACY_DATA_DIR" && -n "$(ls -A "$LEGACY_DATA_DIR" 2>/dev/null)" && -z "$(ls -A "$DATA_DIR" 2>/dev/null)" ]]; then
    echo "Migrando dados legados para $DATA_DIR..."
    cp -a "$LEGACY_DATA_DIR"/. "$DATA_DIR"/
fi

# ─── Copiar arquivos da aplicação ──────────────────────────────────────
echo ""
echo "[5/8] Copiando arquivos da aplicação..."

# Copia tudo, mas NUNCA toca nos dados persistentes. Usamos exclusões explícitas.
if command -v rsync >/dev/null 2>&1; then
    rsync -a \
        --delete \
        --exclude="node_modules/" \
        --exclude="data/" \
        --exclude="logs/" \
        --exclude="backups/" \
        --exclude=".env" \
        "$PROJECT_ROOT"/ "$APP_DIR"/
else
    # Fallback: primeiro limpa arquivos antigos (exceto dados/logs), depois copia.
    find "$APP_DIR" -mindepth 1 -maxdepth 1 \
        ! -name "data" \
        ! -name "logs" \
        ! -name "backups" \
        ! -name ".env" \
        -exec rm -rf {} +
    cp -a "$PROJECT_ROOT"/. "$APP_DIR"/
fi

# Garante que os diretórios de dados existam (a aplicação os criará, mas
# deixar explícito ajuda a evitar erros de permissão no primeiro boot).
mkdir -p "$DATA_DIR"
mkdir -p "$LOGS_DIR"
mkdir -p "$BACKUP_DIR"

# ─── Dependências ─────────────────────────────────────────────────────
echo ""
echo "[6/8] Instalando dependências..."

cd "$APP_DIR"

if [[ -f package-lock.json ]]; then
    npm ci --omit=dev
else
    npm install --omit=dev
fi

# ─── Permissões ───────────────────────────────────────────────────────
echo ""
echo "[7/8] Configurando permissões..."

chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"
chown -R "$SERVICE_USER:$SERVICE_USER" "$DATA_DIR"
chown -R "$SERVICE_USER:$SERVICE_USER" "$LOGS_DIR"
chmod 750 "$APP_DIR"
chmod 750 "$DATA_DIR"
chmod 755 "$LOGS_DIR"

# ─── Serviço systemd ──────────────────────────────────────────────────
echo ""
echo "[8/8] Criando serviço systemd..."

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=BrightierOS
Requires=local-fs.target
After=network-online.target local-fs.target
Wants=network-online.target

[Service]
Type=simple

User=$SERVICE_USER
Group=$SERVICE_USER

WorkingDirectory=$APP_DIR

ExecStartPre=/bin/mkdir -p $DATA_DIR
ExecStartPre=/bin/mkdir -p $LOGS_DIR
ExecStartPre=/bin/chown -R $SERVICE_USER:$SERVICE_USER $DATA_DIR
ExecStartPre=/bin/chown -R $SERVICE_USER:$SERVICE_USER $LOGS_DIR

ExecStart=$NODE_PATH server.js

Environment=NODE_ENV=production
Environment=BOS_DATA_DIR=$DATA_DIR
Environment=PORT=3000

Restart=always
RestartSec=5

StandardOutput=journal
StandardError=journal

SyslogIdentifier=brightieros

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"

# Para garantir que um eventual update/restart do painel funcione corretamente,
# removemos qualquer flag de reinício antiga antes de iniciar.
rm -f "$RESTART_FLAG"

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
    echo "App     : $APP_DIR"
    echo "Dados   : $DATA_DIR"
    echo "Logs    : $LOGS_DIR"
    echo ""
    echo "Acesse:"
    echo "http://localhost:3000"
    echo ""

    # Verificação de persistência: grava um flag, pede para o usuário reiniciar
    # manualmente se o servidor estiver em ambiente volátil.
    PERSIST_TEST="$DATA_DIR/.persist-test"
    date +%s > "$PERSIST_TEST"
    chown "$SERVICE_USER:$SERVICE_USER" "$PERSIST_TEST"

    echo "Dica: os dados agora ficam em $DATA_DIR (fora de $APP_DIR)."
    echo "Se após reiniciar o servidor os dados sumirem, verifique se a partição"
    echo "que contém /var/lib/brightieros é persistente (não tmpfs/ramdisk)."
    echo ""
else
    echo "========================================="
    echo " BrightierOS falhou ao iniciar"
    echo "========================================="
    echo ""

    journalctl -u "$SERVICE_NAME" --no-pager -n 50

    exit 1
fi
