// lib/notifications.js
// Sistema de notificações simples baseado em arquivo JSON.
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'data', 'notifications.json');

function ensureFile() {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify([]));
  }
}

function list() {
  ensureFile();
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
}

function add(type, message, meta = {}) {
  // type: 'success', 'warning', 'error', 'info'
  ensureFile();
  const notifications = list();
  const note = {
    id: Date.now() + Math.random().toString(36).slice(2, 8),
    type,
    message,
    timestamp: new Date().toISOString(),
    read: false,
    ...meta,
  };
  notifications.unshift(note);
  fs.writeFileSync(file, JSON.stringify(notifications.slice(0, 100), null, 2));
  return note;
}

function markRead(id) {
  const notifications = list().map(n => n.id === id ? { ...n, read: true } : n);
  fs.writeFileSync(file, JSON.stringify(notifications, null, 2));
}

function clear() {
  fs.writeFileSync(file, JSON.stringify([]));
}

module.exports = { list, add, markRead, clear };