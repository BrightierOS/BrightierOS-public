// test/infrastructure-probe.test.js
// BrightierOS v0.8.2.2 — Testes de diagnóstico do healthcheck (mensagens claras)
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bos-probe-'));
process.env.BOS_DATA_DIR = TMP;

const infra = require('../lib/infrastructure');

// Porta livre aberta e fechada -> conexão recusada (ECONNREFUSED).
function freeClosedPort() {
  return new Promise((resolve) => {
    const s = http.createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
}

test('addNode exige porta válida (v0.8.2.2)', () => {
  assert.throws(() => infra.addNode({ name: 'X', host: '127.0.0.1' }), /porta/i);
  assert.throws(() => infra.addNode({ name: 'X', host: '127.0.0.1', port: 0 }), /porta/i);
  assert.throws(() => infra.addNode({ name: 'X', host: '127.0.0.1', port: 70000 }), /porta/i);
  assert.throws(() => infra.addNode({ name: 'X', host: '127.0.0.1', port: 'abc' }), /porta/i);
});

test('addNode aceita porta numérica válida', () => {
  const n = infra.addNode({ name: 'OK', host: '127.0.0.1', port: 3000 });
  assert.equal(n.port, 3000);
  assert.equal(typeof n.port, 'number');
});

test('probeNode sem porta retorna detalhe "porta não informada" (não "fetch failed")', async () => {
  // Constrói um nó sem porta e chama probeNode diretamente (não via addNode,
  // que agora exige porta — isto simula dado legado/inválido no disco).
  const node = { id: 'node-test-noport', name: 'sem porta', host: '127.0.0.1', port: null, kind: 'remote', status: 'offline' };
  const r = await infra.probeNode(node);
  assert.equal(r.status, 'offline');
  assert.ok(/porta não informada/i.test(r.detail), 'deve indicar porta ausente, recebeu: ' + r.detail);
});

test('probeNode em porta fechada retorna detalhe "conexão recusada" (não "fetch failed")', async () => {
  const port = await freeClosedPort();
  const node = { id: 'node-test-refused', name: 'fechada', host: '127.0.0.1', port, kind: 'remote', status: 'offline' };
  const r = await infra.probeNode(node);
  assert.equal(r.status, 'offline');
  assert.equal(r.reachable, false);
  assert.ok(/conexão recusada|ECONNREFUSED/i.test(r.detail), 'deve indicar conexão recusada, recebeu: ' + r.detail);
});

test('probeNode em host inexistente retorna detalhe de DNS (não "fetch failed")', async () => {
  const node = { id: 'node-test-dns', name: 'dns', host: 'brightieros-host-que-nao-existe.invalid', port: 3000, kind: 'remote', status: 'offline' };
  const r = await infra.probeNode(node);
  assert.equal(r.status, 'offline');
  assert.ok(/não encontrado|ENOTFOUND|inalcançável|rede/i.test(r.detail), 'deve indicar problema de DNS/rede, recebeu: ' + r.detail);
});
