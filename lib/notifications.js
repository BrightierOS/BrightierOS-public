// lib/notifications.js
// BrightierOS v0.7+/v0.8.0 — Sistema de notificações
// Baseado em arquivo JSON (persistência) + emitter para tempo real (SSE).
// Suporta categorias (system, service, security, update, infrastructure, general)
// e mantém total compatibilidade com a API anterior (list/add/markRead/clear).
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.BOS_DATA_DIR
  ? path.resolve(process.env.BOS_DATA_DIR)
  : path.join(__dirname, '..', 'data');
const file = path.join(DATA_DIR, 'notifications.json');
const MAX_NOTIFICATIONS = 200;

const VALID_CATEGORIES = ['system', 'service', 'security', 'update', 'infrastructure', 'general'];

// Emitter simples para tempo real (sem dependências).
const listeners = { add: [], clear: [] };

function ensureFile() {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify([]));
  }
}

function list() {
  ensureFile();
  try {
    const c = fs.readFileSync(file, 'utf8').trim();
    return c ? JSON.parse(c) : [];
  } catch {
    return [];
  }
}

function persist(notifications) {
  ensureFile();
  fs.writeFileSync(file, JSON.stringify(notifications.slice(0, MAX_NOTIFICATIONS), null, 2));
}

function add(type, message, meta = {}) {
  // type: 'success'|'warning'|'error'|'info'  (alias 'ok'->'success', 'err'->'error')
  const normType = type === 'ok' ? 'success' : type === 'err' ? 'error' : type;
  ensureFile();
  const notifications = list();
  const category = meta.category && VALID_CATEGORIES.includes(meta.category) ? meta.category : 'general';
  const note = {
    id: Date.now() + Math.random().toString(36).slice(2, 8),
    type: normType,
    message,
    category,
    timestamp: new Date().toISOString(),
    read: false,
  };
  // Copia meta extras (exceto category, já tratada) preservando compatibilidade.
  for (const k of Object.keys(meta)) {
    if (k !== 'category') note[k] = meta[k];
  }
  notifications.unshift(note);
  persist(notifications);
  emit('add', note);
  return note;
}

function markRead(id) {
  const notifications = list().map(n => n.id === id ? { ...n, read: true } : n);
  persist(notifications);
}

function markAllRead() {
  const notifications = list().map(n => ({ ...n, read: true }));
  persist(notifications);
}

function clear() {
  persist([]);
  emit('clear', {});
}

function unreadCount() {
  return list().filter(n => !n.read).length;
}

function on(event, cb) {
  if (!listeners[event]) listeners[event] = [];
  listeners[event].push(cb);
  return () => off(event, cb);
}

function off(event, cb) {
  if (!listeners[event]) return;
  listeners[event] = listeners[event].filter((l) => l !== cb);
}

function emit(event, payload) {
  if (!listeners[event]) return;
  for (const cb of listeners[event]) {
    try { cb(payload); } catch (e) { console.error('[Notifications] listener error:', e); }
  }
}

module.exports = {
  list, add, markRead, markAllRead, clear, unreadCount,
  on, off, emit, VALID_CATEGORIES,
};
