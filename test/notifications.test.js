// test/notifications.test.js
// BrightierOS v0.8.0 — Testes do sistema de notificações (categorias + SSE emitter)
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bos-notif-'));
process.env.BOS_DATA_DIR = TMP;

const notifications = require('../lib/notifications');

test('add cria notificação com categoria e persiste', () => {
  notifications.clear();
  const note = notifications.add('info', 'Teste', { category: 'service' });
  assert.equal(note.category, 'service');
  assert.equal(note.read, false);
  assert.equal(notifications.list().length, 1);
});

test('categoria inválida cai para general', () => {
  notifications.clear();
  const note = notifications.add('info', 'x', { category: 'naoexiste' });
  assert.equal(note.category, 'general');
});

test('markRead, markAllRead e unreadCount', () => {
  notifications.clear();
  const a = notifications.add('info', 'a');
  notifications.add('info', 'b');
  notifications.markRead(a.id);
  assert.equal(notifications.list().find((n) => n.id === a.id).read, true);
  assert.equal(notifications.unreadCount(), 1);
  notifications.markAllRead();
  assert.equal(notifications.unreadCount(), 0);
});

test('emitter on dispara em add e clear, off cancela', () => {
  notifications.clear();
  let added = null, cleared = false;
  const offAdd = notifications.on('add', (n) => { added = n; });
  const offClear = notifications.on('clear', () => { cleared = true; });
  notifications.add('info', 'evento');
  assert.ok(added && added.message === 'evento');
  notifications.clear();
  assert.equal(cleared, true);
  offAdd(); offClear();
});

test('tipo ok/err normaliza para success/error', () => {
  notifications.clear();
  assert.equal(notifications.add('ok', 'x').type, 'success');
  assert.equal(notifications.add('err', 'x').type, 'error');
});
