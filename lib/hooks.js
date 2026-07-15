// lib/hooks.js
// Sistema de eventos/hooks para plugins.
const listeners = {};

function on(event, callback) {
  if (!listeners[event]) listeners[event] = [];
  listeners[event].push(callback);
}

function emit(event, payload) {
  if (!listeners[event]) return;
  for (const cb of listeners[event]) {
    try { cb(payload); } catch (e) { console.error(`[Hook] Erro em listener ${event}:`, e); }
  }
}

module.exports = { on, emit };