// lib/metrics.js
// BrightierOS v0.8.0 — Histórico de Métricas
// Coletor periódico de métricas do sistema (CPU, RAM, Disco, Rede, Temperatura,
// Processos) que roda em background e armazena um histórico limitado em disco.
// Prepara a estrutura para futuras estatísticas/estados sem depender de alguém
// visualizando o dashboard (o histórico agora é registrado continuamente).
const fs = require('fs');
const path = require('path');
const si = require('systeminformation');

const DATA_DIR = process.env.BOS_DATA_DIR
  ? path.resolve(process.env.BOS_DATA_DIR)
  : path.join(__dirname, '..', 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'metrics-history.json');

const DEFAULT_INTERVAL_MS = 15000; // 15s
const DEFAULT_MAX_POINTS = 1000; // histórico retido (estrutura preparada p/ crescer)

let timer = null;
let lastSnapshot = null;
let listeners = [];

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function ensureHistoryFile() {
  ensureDataDir();
  if (!fs.existsSync(HISTORY_FILE)) fs.writeFileSync(HISTORY_FILE, '[]', 'utf8');
}

function readHistory() {
  ensureHistoryFile();
  try {
    const c = fs.readFileSync(HISTORY_FILE, 'utf8').trim();
    return c ? JSON.parse(c) : [];
  } catch {
    return [];
  }
}

function writeHistory(history) {
  ensureDataDir();
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
  } catch (e) {
    console.warn('[Metrics] Falha ao gravar histórico:', e.message);
  }
}

// Coleta um snapshot pontual das métricas. Cada fonte é isolada por try/catch
// e protegida por timeout — chamadas do systeminformation (ex.: fsSize/temperature
// via WMI no Windows) podem pendurar indefinidamente, e não podemos bloquear o
// coletor nem o servidor.
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

async function snapshot() {
  const point = { time: Date.now() };

  try {
    const load = await withTimeout(si.currentLoad(), 4000);
    point.cpu = Number((load.currentLoad || 0).toFixed(1));
  } catch { point.cpu = null; }

  try {
    const mem = await withTimeout(si.mem(), 4000);
    point.ram = Number(((mem.used / mem.total) * 100).toFixed(1));
    point.ramUsed = Number((mem.used / 1024 / 1024 / 1024).toFixed(2));
    point.ramTotal = Number((mem.total / 1024 / 1024 / 1024).toFixed(2));
  } catch { point.ram = null; }

  try {
    const disks = await withTimeout(si.fsSize(), 4000);
    const d = (disks || [])[0];
    if (d) {
      point.disk = Number(((d.used / d.size) * 100).toFixed(1));
      point.diskUsed = Number((d.used / 1024 / 1024 / 1024).toFixed(2));
      point.diskTotal = Number((d.size / 1024 / 1024 / 1024).toFixed(2));
    }
  } catch { point.disk = null; }

  try {
    const net = await withTimeout(si.networkStats(), 4000);
    const n = (net || [])[0] || {};
    point.netRx = Number(((n.rx_sec || 0) / 1024).toFixed(2)); // KB/s
    point.netTx = Number(((n.tx_sec || 0) / 1024).toFixed(2)); // KB/s
  } catch { point.netRx = null; point.netTx = null; }

  // temperature pode não existir nesta versão/plataforma (ex.: Windows sem WMI).
  try {
    if (typeof si.temperature === 'function') {
      const temp = await withTimeout(si.temperature(), 4000);
      const t = (temp && (temp.main != null ? temp.main : temp.cpu)) || null;
      point.temp = t != null ? Number(t.toFixed(1)) : null;
    } else {
      point.temp = null;
    }
  } catch { point.temp = null; }

  lastSnapshot = point;
  return point;
}

// Persiste um ponto no histórico limitado.
function record(point) {
  const history = readHistory();
  history.push(point);
  if (history.length > DEFAULT_MAX_POINTS) {
    history.splice(0, history.length - DEFAULT_MAX_POINTS);
  }
  writeHistory(history);
  for (const cb of listeners) {
    try { cb(point); } catch (_) {}
  }
}

// Inicia a coleta periódica em background. Idempotente.
// Usa um guarda "busy" para SERIALIZAR as coletas: chamadas concorrentes de
// systeminformation podem causar deadlock, então um novo ciclo é pulado se o
// anterior ainda estiver em andamento.
function start(intervalMs = DEFAULT_INTERVAL_MS) {
  if (timer) return;
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const point = await snapshot();
      record(point);
    } catch (e) {
      console.warn('[Metrics] Erro no ciclo de coleta:', e.message);
    } finally {
      busy = false;
    }
  };
  // Primeiro ciclo adiado para o próximo tick do event loop (evita iniciar a
  // coleta sincronamente durante a inicialização do servidor).
  setImmediate(tick);
  timer = setInterval(tick, Math.max(5000, Number(intervalMs) || DEFAULT_INTERVAL_MS));
  if (timer.unref) timer.unref(); // não impede o encerramento do processo
}

function stop() {
  if (timer) { clearInterval(timer); timer = null; }
}

function clearHistory() {
  writeHistory([]);
}

// Subscreve novos pontos (para SSE/futuras integrações).
function onTick(cb) {
  listeners.push(cb);
  return () => { listeners = listeners.filter((l) => l !== cb); };
}

// Resumo agregado para futuras estatísticas (média/máx/mín das últimas N amostras).
function summary(limit = 100) {
  const hist = readHistory().slice(-Math.max(1, Number(limit) || 100));
  const calc = (key) => {
    const vals = hist.map((p) => p[key]).filter((v) => v != null && !isNaN(v));
    if (!vals.length) return null;
    const sum = vals.reduce((a, b) => a + b, 0);
    return {
      avg: Number((sum / vals.length).toFixed(1)),
      min: Number(Math.min(...vals).toFixed(1)),
      max: Number(Math.max(...vals).toFixed(1)),
      samples: vals.length,
    };
  };
  return {
    window: hist.length,
    from: hist.length ? hist[0].time : null,
    to: hist.length ? hist[hist.length - 1].time : null,
    cpu: calc('cpu'),
    ram: calc('ram'),
    disk: calc('disk'),
    netRx: calc('netRx'),
    netTx: calc('netTx'),
    temp: calc('temp'),
  };
}

module.exports = {
  start,
  stop,
  snapshot,
  readHistory,
  clearHistory,
  summary,
  onTick,
  lastSnapshot: () => lastSnapshot,
  HISTORY_FILE,
  DATA_DIR,
  DEFAULT_INTERVAL_MS,
  DEFAULT_MAX_POINTS,
  _internals: { record },
};
