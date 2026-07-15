#!/usr/bin/env bash
# BrightierOS launcher / console de gerenciamento (Linux & macOS)
# Uso:
#   ./bOS.sh          -> console interativo (sobe o servidor em background)
#   ./bOS.sh run      -> supervisor em foreground (reinicio automatico em atualizacoes)
set -uo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
export PORT="${PORT:-3000}"
PIDFILE="data/bos.pid"
LOGFILE="logs/bos.log"
RESTART_FLAG="data/.bos-restart"
RESTART_CODE=65

# ---------- helpers ----------
is_running() {
  [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null
}

start_server() {
  mkdir -p logs
  nohup node server.js >> "$LOGFILE" 2>&1 &
  echo $! > "$PIDFILE"
  sleep 1
}

stop_server() {
  if is_running; then
    kill -INT "$(cat "$PIDFILE")" 2>/dev/null
    sleep 1
  fi
  rm -f "$PIDFILE"
}

check_deps() {
  echo "Verificando dependencias..."
  if [ ! -d node_modules ]; then
    echo "  [X] node_modules ausente. Execute 'npm install'."
    return 1
  fi
  if npm ls --omit=dev --depth=0 >/dev/null 2>&1; then
    echo "  [OK] Dependencias instaladas e consistentes."
    return 0
  else
    echo "  [!] Dependencias inconsistentes. Execute 'npm install --production'."
    return 1
  fi
}

maybe_auto_restart() {
  if [ -f "$RESTART_FLAG" ] && ! is_running; then
    echo "[bOS] Atualizacao pendente detectada. Reinstalando deps e reiniciando..."
    rm -f "$RESTART_FLAG"
    check_deps || npm install --production >> "$LOGFILE" 2>&1
    start_server
    echo "[bOS] Servidor reiniciado."
  fi
}

# ---------- console interativo ----------
menu() {
  if ! is_running; then
    echo "Iniciando BrightierOS automaticamente..."
    check_deps || npm install --production >> "$LOGFILE" 2>&1
    start_server
  fi
  while true; do
    maybe_auto_restart
    echo ""
    echo "=========================================="
    echo "       BrightierOS — Console"
    echo "=========================================="
    if is_running; then echo "  Estado: RODANDO (PID $(cat "$PIDFILE"))"; else echo "  Estado: PARADO"; fi
    echo "------------------------------------------"
    echo "  [1] 🚀 Iniciar o BrightierOS"
    echo "  [2] 🛑 Parar o sistema"
    echo "  [3] 🔄 Reiniciar servicos"
    echo "  [4] 📊 Status dos componentes"
    echo "  [5] 🧪 Verificar dependencias"
    echo "  [6] 📝 Gerenciar logs"
    echo "  [7] ⚙️  Carregar configuracoes"
    echo "  [8] 🔌 Controlar modulos/plugins"
    echo "  [9] 🩺 Modo diagnostico"
    echo "  [0] ⏻ Sair (o servidor continua em background)"
    echo "------------------------------------------"
    read -r -t 5 -p "  Escolha: " op || op=""
    case "$op" in
      1) if is_running; then echo "  Ja esta rodando."; else echo "  Iniciando..."; check_deps || npm install --production >> "$LOGFILE" 2>&1; start_server; fi ;;
      2) echo "  Parando..."; stop_server ;;
      3) echo "  Reiniciando..."; stop_server; check_deps || npm install --production >> "$LOGFILE" 2>&1; start_server ;;
      4) node bOS-console.js status ;;
      5) check_deps ;;
      6) echo "=== Logs (ultimas 50 linhas) ==="; [ -f "$LOGFILE" ] && tail -n 50 "$LOGFILE" || echo "  (sem logs ainda)"; echo "  [c] limpar  [v] voltar"; read -r -p "  escolha: " sub; case "$sub" in c|C) : > "$LOGFILE"; echo "  logs limpos.";; f|F) [ -f "$LOGFILE" ] && tail -f "$LOGFILE";; esac ;;
      7) node bOS-console.js config ;;
      8) echo "=== Modulos / Plugins ==="; node bOS-console.js plugins; echo ""; read -r -p "  id para DESINSTALAR (ou Enter p/ voltar): " pid; [ -n "$pid" ] && node bOS-console.js uninstall "$pid" ;;
      9) node bOS-console.js diagnose ;;
      0) echo "  Encerrando console."; break ;;
      *) [ -n "$op" ] && echo "  Opcao invalida." ;;
    esac
    if [ "$op" != "0" ]; then echo ""; read -r -p "  Pressione Enter para continuar..." _; fi
  done
}

# ---------- supervisor em foreground (comportamento anterior) ----------
run_mode() {
  mkdir -p logs
  if [ ! -d node_modules ]; then echo "Instalando dependencias..."; npm install; fi
  while true; do
    echo ""
    echo "=========================================="
    echo "       BrightierOS"
    echo "=========================================="
    echo "Iniciando servidor (log: $LOGFILE)..."
    echo "Acesse: http://localhost:$PORT"
    echo ""
    node server.js >> "$LOGFILE" 2>&1 &
    NODE_PID=$!
    wait "$NODE_PID"
    EXITCODE=$?
    if [ "$EXITCODE" -eq "$RESTART_CODE" ]; then
      echo "[bOS] Atualizacao aplicada. Instalando deps e reiniciando..."
      rm -f "$RESTART_FLAG"
      npm install --production >> "$LOGFILE" 2>&1
      sleep 2
      continue
    fi
    echo "[bOS] Servidor encerrado (codigo $EXITCODE)."
    break
  done
}

case "${1:-menu}" in
  run) run_mode ;;
  *) menu ;;
esac
