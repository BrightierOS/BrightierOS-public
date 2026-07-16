// lib/infrastructure.js
// BrightierOS v0.8.2.2 — Infraestrutura (nós/servidores) com verificação de conectividade
// Registro de nós/servidores com nó local auto-registrado. v0.8.2 adicionou
// healthcheck real (probe HTTP ao /api/health do nó). v0.8.2.2 corrige o bug
// onde nós mal configurados (porta ausente/errada, host inválido) apareciam
// como "offline" com a mensagem opaca "fetch failed" — agora o probe retorna
// mensagens de erro detalhadas e a porta é obrigatória ao adicionar.
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const DATA_DIR = process.env.BOS_DATA_DIR
  ? path.resolve(process.env.BOS_DATA_DIR)
  : path.join(__dirname, '..', 'data');
const NODES_FILE = path.join(DATA_DIR, 'infrastructure.json');

const LOCAL_NODE_ID = 'local';

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function ensureNodesFile() {
  ensureDataDir();
  if (!fs.existsSync(NODES_FILE)) fs.writeFileSync(NODES_FILE, '[]', 'utf8');
}

function readNodes() {
  ensureNodesFile();
  try {
    const c = fs.readFileSync(NODES_FILE, 'utf8').trim();
    return c ? JSON.parse(c) : [];
  } catch {
    return [];
  }
}

function writeNodes(nodes) {
  ensureDataDir();
  fs.writeFileSync(NODES_FILE, JSON.stringify(nodes, null, 2), 'utf8');
}

// Nó local: auto-registrado e sempre presente. Representa a máquina onde o
// BrightierOS está rodando agora. status 'local' (vs 'remote'/'offline').
function localNode() {
  return {
    id: LOCAL_NODE_ID,
    name: os.hostname() || 'Nó local',
    host: '127.0.0.1',
    port: Number(process.env.PORT) || 3000,
    kind: 'local',
    status: 'local',
    platform: os.platform(),
    arch: os.arch(),
    tags: ['brightieros', 'self'],
    addedAt: new Date().toISOString(),
    note: 'Nó local (esta instalação do BrightierOS).',
  };
}

// Garante que o nó local esteja presente no registro (idempotente).
function ensureLocalNode() {
  const nodes = readNodes();
  if (!nodes.find((n) => n.id === LOCAL_NODE_ID)) {
    nodes.unshift(localNode());
    writeNodes(nodes);
  }
  return nodes;
}

function listNodes() {
  const nodes = ensureLocalNode();
  // Atualiza info dinâmica do nó local a cada leitura.
  return nodes.map((n) => (n.id === LOCAL_NODE_ID ? { ...localNode(), ...n, ...localNode() } : n));
}

function findNode(id) {
  return listNodes().find((n) => n.id === id) || null;
}

function addNode({ name, host, port, tags, note }) {
  if (!name || !host) throw new Error('Nome e host são obrigatórios.');
  // v0.8.2.2: porta obrigatória — antes era opcional (null) e o probe batia na
  // porta 80 (ou falhava com "fetch failed"), confundindo o usuário.
  const portNum = Number(port);
  if (!port || !Number.isFinite(portNum) || portNum < 1 || portNum > 65535) {
    throw new Error('Porta inválida (informe um número entre 1 e 65535).');
  }
  const nodes = readNodes();
  const id = `node-${crypto.randomBytes(4).toString('hex')}`;
  const node = {
    id,
    name: String(name).trim(),
    host: String(host).trim(),
    port: portNum,
    kind: 'remote',
    status: 'offline', // verificado por checkNode() (v0.8.2)
    tags: Array.isArray(tags) ? tags.map(String) : [],
    addedAt: new Date().toISOString(),
    note: note ? String(note) : '',
  };
  nodes.push(node);
  writeNodes(nodes);
  return node;
}

function updateNode(id, patch = {}) {
  const nodes = readNodes();
  const idx = nodes.findIndex((n) => n.id === id);
  if (idx < 0) throw new Error('Nó não encontrado.');
  if (id === LOCAL_NODE_ID) {
    // O nó local só permite atualizar metadados cosméticos.
    if (patch.name != null) nodes[idx].name = String(patch.name).trim();
    if (patch.tags != null) nodes[idx].tags = Array.isArray(patch.tags) ? patch.tags.map(String) : nodes[idx].tags;
    if (patch.note != null) nodes[idx].note = String(patch.note);
  } else {
    if (patch.name != null) nodes[idx].name = String(patch.name).trim();
    if (patch.host != null) nodes[idx].host = String(patch.host).trim();
    if (patch.port != null) nodes[idx].port = Number(patch.port) || null;
    if (patch.tags != null) nodes[idx].tags = Array.isArray(patch.tags) ? patch.tags.map(String) : nodes[idx].tags;
    if (patch.note != null) nodes[idx].note = String(patch.note);
    if (patch.status != null) nodes[idx].status = String(patch.status);
  }
  nodes[idx].updatedAt = new Date().toISOString();
  writeNodes(nodes);
  return nodes[idx];
}

function removeNode(id) {
  if (id === LOCAL_NODE_ID) throw new Error('O nó local não pode ser removido.');
  const nodes = readNodes();
  const next = nodes.filter((n) => n.id !== id);
  if (next.length === nodes.length) throw new Error('Nó não encontrado.');
  writeNodes(next);
  return true;
}

// ─── Healthcheck (v0.8.2) ───────────────────────────────────────────
// Probe HTTP ao endpoint /api/health do nó (todo BrightierOS o expõe).
// Atualiza status para 'online'/'offline' + lastCheckedAt + latencyMs.
const HEALTH_TIMEOUT_MS = 4000;

function buildNodeUrl(node) {
  const host = String(node.host || '').trim();
  if (!host) return null;
  // v0.8.2.2: porta obrigatória para o probe — sem ela o fetch iria para a
  // porta 80 (geramente fechada num BrightierOS) e falharia com "fetch failed".
  const portNum = Number(node.port);
  if (!Number.isFinite(portNum) || portNum < 1 || portNum > 65535) return null;
  const port = ':' + portNum;
  // Aceita host já com protocolo; senão assume http:// (rede local/LAN).
  if (/^https?:\/\//i.test(host)) return host.replace(/\/+$/, '') + port + '/api/health';
  return `http://${host}${port}/api/health`;
}

// Traduz o erro de rede do fetch numa mensagem legível (v0.8.2.2).
// O Node lança TypeError ("fetch failed") com cause indicando o motivo real
// (ECONNREFUSED, ENOTFOUND, ECONNRESET, ETIMEDOUT...). O cause.code nem sempre
// está presente (ex.: porta inválida -> cause.message "bad port"), então
// inspecionamos também a mensagem.
function describeFetchError(err, aborted) {
  if (aborted) return 'tempo esgotado (timeout)';
  const cause = err && err.cause;
  const code = cause && (cause.code || cause.errno);
  const msg = String((cause && cause.message) || (err && err.message) || '');
  const map = {
    ECONNREFUSED: 'conexão recusada (host/porta inacessíveis ou serviço parado)',
    ENOTFOUND: 'host não encontrado (DNS inválido)',
    ECONNRESET: 'conexão reiniciada pelo peer',
    ETIMEDOUT: 'tempo esgotado (timeout)',
    EHOSTUNREACH: 'host inalcançável',
    EACCES: 'permissão negada (porta?)',
    EAFNOSUPPORT: 'endereço/família não suportado',
  };
  if (code && map[code]) return map[code] + ' [' + code + ']';
  if (code) return 'erro de rede [' + code + ']';
  // Sem code: tenta adivinhar pela mensagem (undici usa "bad port", etc.).
  const low = msg.toLowerCase();
  if (/bad port|invalid port|port out of range/.test(low)) return 'porta inválida ou fora do intervalo';
  if (/refused|econnrefused/.test(low)) return 'conexão recusada (host/porta inacessíveis ou serviço parado)';
  if (/not found|enotfound|getaddrinfo/.test(low)) return 'host não encontrado (DNS inválido)';
  if (/timeout|etimedout/.test(low)) return 'tempo esgotado (timeout)';
  if (/unreachable|ehostunreach/.test(low)) return 'host inalcançável';
  if (msg && msg !== 'fetch failed') return msg;
  return 'erro de rede (host/porta inacessíveis ou serviço parado)';
}

async function probeNode(node) {
  const url = buildNodeUrl(node);
  const started = Date.now();
  if (!url) {
    const hasPort = Number.isFinite(Number(node.port)) && Number(node.port) > 0;
    return {
      status: 'offline',
      reachable: false,
      latencyMs: 0,
      detail: hasPort ? 'host inválido' : 'porta não informada (informe host:porta)',
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    const latencyMs = Date.now() - started;
    if (!res.ok) return { status: 'offline', reachable: true, latencyMs, detail: 'HTTP ' + res.status + ' (o nó respondeu, mas não é um /api/health válido)' };
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    const ok = body && body.status === 'ok';
    return { status: ok ? 'online' : 'offline', reachable: true, latencyMs, detail: ok ? 'ok' : 'resposta de health inválida' };
  } catch (err) {
    const aborted = err && err.name === 'AbortError';
    return { status: 'offline', reachable: false, latencyMs: Date.now() - started, detail: describeFetchError(err, aborted) };
  } finally {
    clearTimeout(timer);
  }
}

// Verifica a conectividade de um nó e persiste o status. O nó local é sempre
// considerado ativo (status 'local'). Retorna o nó atualizado.
async function checkNode(id) {
  if (id === LOCAL_NODE_ID) {
    const nodes = readNodes();
    const idx = nodes.findIndex((n) => n.id === id);
    const now = new Date().toISOString();
    if (idx >= 0) {
      nodes[idx].status = 'local';
      nodes[idx].reachable = true;
      nodes[idx].latencyMs = 0;
      nodes[idx].lastCheckedAt = now;
      writeNodes(nodes);
      return { ...localNode(), ...nodes[idx], status: 'local', reachable: true, latencyMs: 0, lastCheckedAt: now };
    }
    return { ...localNode(), status: 'local', reachable: true, latencyMs: 0, lastCheckedAt: now };
  }
  const nodes = readNodes();
  const idx = nodes.findIndex((n) => n.id === id);
  if (idx < 0) throw new Error('Nó não encontrado.');
  const result = await probeNode(nodes[idx]);
  const now = new Date().toISOString();
  nodes[idx].status = result.status;
  nodes[idx].reachable = result.reachable;
  nodes[idx].latencyMs = result.latencyMs;
  nodes[idx].lastDetail = result.detail;
  nodes[idx].lastCheckedAt = now;
  nodes[idx].updatedAt = now;
  writeNodes(nodes);
  return { ...nodes[idx] };
}

// Verifica todos os nós remotos em paralelo (útil para "atualizar status").
async function checkAllNodes() {
  const nodes = listNodes();
  const remote = nodes.filter((n) => n.id !== LOCAL_NODE_ID);
  await Promise.all(remote.map((n) => checkNode(n.id).catch(() => null)));
  return listNodes();
}

// Visão geral da infraestrutura (preparada para dashboards futuros).
function overview() {
  const nodes = listNodes();
  return {
    total: nodes.length,
    local: nodes.filter((n) => n.kind === 'local').length,
    remote: nodes.filter((n) => n.kind === 'remote').length,
    platforms: [...new Set(nodes.map((n) => n.platform).filter(Boolean))],
    nodes,
  };
}

module.exports = {
  LOCAL_NODE_ID,
  ensureLocalNode,
  listNodes,
  findNode,
  addNode,
  updateNode,
  removeNode,
  checkNode,
  checkAllNodes,
  probeNode,
  overview,
  NODES_FILE,
};
