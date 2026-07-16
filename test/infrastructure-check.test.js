// test/infrastructure-check.test.js
// BrightierOS v0.8.2 — Testes do healthcheck de nós (checkNode / checkAllNodes)
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bos-infra-check-'));
process.env.BOS_DATA_DIR = TMP;

const infra = require('../lib/infrastructure');

function startHealthServer() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      if (req.url === '/api/health') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, status: 'ok' }));
      } else {
        res.statusCode = 404;
        res.end();
      }
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

// Obtém uma porta livre e a fecha imediatamente -> conexão recusada (offline).
function freeClosedPort() {
  return new Promise((resolve) => {
    const s = http.createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
}

test('checkNode marca nó remoto como online quando /api/health responde ok', async () => {
  const srv = await startHealthServer();
  const port = srv.address().port;
  try {
    const node = infra.addNode({ name: 'Remoto OK', host: '127.0.0.1', port });
    const checked = await infra.checkNode(node.id);
    assert.equal(checked.status, 'online');
    assert.ok(checked.lastCheckedAt);
    assert.equal(typeof checked.latencyMs, 'number');
  } finally {
    await new Promise((r) => srv.close(r));
  }
});

test('checkNode marca nó como offline quando o host não responde', async () => {
  const port = await freeClosedPort();
  const node = infra.addNode({ name: 'Remoto morto', host: '127.0.0.1', port });
  const checked = await infra.checkNode(node.id);
  assert.equal(checked.status, 'offline');
  assert.ok(checked.lastCheckedAt);
});

test('checkNode do nó local retorna status local', async () => {
  const checked = await infra.checkNode(infra.LOCAL_NODE_ID);
  assert.equal(checked.status, 'local');
});

test('checkNode lança erro para id inexistente', async () => {
  await assert.rejects(() => infra.checkNode('node-inexistente'), /não encontrado/i);
});
