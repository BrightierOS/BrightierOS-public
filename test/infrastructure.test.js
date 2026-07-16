// test/infrastructure.test.js
// BrightierOS v0.8.0 — Testes do registro de infraestrutura (nós)
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bos-infra-'));
process.env.BOS_DATA_DIR = TMP;

const infra = require('../lib/infrastructure');

test('ensureLocalNode registra o nó local', () => {
  const nodes = infra.ensureLocalNode();
  assert.ok(nodes.find((n) => n.id === infra.LOCAL_NODE_ID));
});

test('listNodes sempre inclui o nó local', () => {
  const list = infra.listNodes();
  assert.ok(list.find((n) => n.id === infra.LOCAL_NODE_ID));
  assert.equal(list.find((n) => n.id === infra.LOCAL_NODE_ID).kind, 'local');
});

test('CRUD de nó remoto: add, update, remove', () => {
  const node = infra.addNode({ name: 'Servidor A', host: '10.0.0.5', port: 3000, tags: ['prod'], note: 'principal' });
  assert.ok(node.id);
  assert.equal(node.kind, 'remote');
  assert.equal(node.status, 'offline');

  const upd = infra.updateNode(node.id, { name: 'Servidor A (prod)', status: 'online' });
  assert.equal(upd.name, 'Servidor A (prod)');
  assert.equal(upd.status, 'online');

  assert.equal(infra.removeNode(node.id), true);
  assert.equal(infra.findNode(node.id), null);
});

test('não permite remover o nó local', () => {
  assert.throws(() => infra.removeNode(infra.LOCAL_NODE_ID), /não pode ser removido/);
});

test('overview agrega contagens', () => {
  infra.addNode({ name: 'Nó B', host: '10.0.0.6', port: 3000 });
  const o = infra.overview();
  assert.ok(o.total >= 2);
  assert.ok(o.local >= 1);
  assert.ok(o.remote >= 1);
});

test('addNode exige nome e host', () => {
  assert.throws(() => infra.addNode({ host: '1.2.3.4' }));
  assert.throws(() => infra.addNode({ name: 'x' }));
});

test('addNode exige porta (v0.8.2.2)', () => {
  assert.throws(() => infra.addNode({ name: 'x', host: '1.2.3.4' }), /porta/i);
});
