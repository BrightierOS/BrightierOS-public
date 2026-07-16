// test/infrastructure-proxy.test.js
// BrightierOS v0.8.3 — Testes do proxy de arquivos remotos + credenciais
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bos-proxy-'));
process.env.BOS_DATA_DIR = TMP;

const infra = require('../lib/infrastructure');

// Mock de um nó remoto: implementa /api/health, /api/users/login e /api/files/*.
function startMockRemote() {
  return new Promise((resolve) => {
    const tokens = new Set();
    const srv = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://x');
      if (u.pathname === '/api/health') {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ success: true, status: 'ok' }));
        return;
      }
      if (u.pathname === '/api/users/login' && req.method === 'POST') {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          let j = {}; try { j = JSON.parse(body); } catch {}
          if (j.username === 'admin' && j.password === 'secret') {
            const tok = 'mock-token-' + Date.now() + '-' + Math.random();
            tokens.add(tok);
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ success: true, token: tok, user: { role: 'admin' } }));
          } else {
            res.statusCode = 401;
            res.end(JSON.stringify({ success: false, error: 'Credenciais inválidas.' }));
          }
        });
        return;
      }
      // /api/files/* exige Bearer token válido
      const auth = (req.headers['authorization'] || '').match(/^Bearer\s+(.+)$/i);
      if (u.pathname.startsWith('/api/files/') && (!auth || !tokens.has(auth[1]))) {
        res.statusCode = 401;
        res.end(JSON.stringify({ success: false, error: 'Não autenticado.' }));
        return;
      }
      if (u.pathname === '/api/files/list' && req.method === 'GET') {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify([{ name: 'docs', type: 'folder', size: null }, { name: 'readme.md', type: 'file', size: 123 }]));
        return;
      }
      if (u.pathname === '/api/files/read' && req.method === 'GET') {
        res.setHeader('content-type', 'text/plain');
        res.end('hello remote');
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Not found' }));
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

test('remoteProxy lista arquivos do nó remoto autenticado', async () => {
  const srv = await startMockRemote();
  const port = srv.address().port;
  try {
    const node = infra.addNode({ name: 'Mock', host: '127.0.0.1', port });
    infra.setNodeCredentials(node.id, { username: 'admin', password: 'secret' });
    const res = await infra.remoteProxy(infra.findNode(node.id), 'files/list', { method: 'GET' });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body));
    assert.equal(body[0].name, 'docs');
  } finally {
    await new Promise((r) => srv.close(r));
  }
});

test('remoteProxy lê um arquivo do nó remoto', async () => {
  const srv = await startMockRemote();
  const port = srv.address().port;
  try {
    const node = infra.addNode({ name: 'Mock2', host: '127.0.0.1', port });
    infra.setNodeCredentials(node.id, { username: 'admin', password: 'secret' });
    const res = await infra.remoteProxy(infra.findNode(node.id), 'files/read', { method: 'GET', query: { path: 'readme.md' } });
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'hello remote');
  } finally {
    await new Promise((r) => srv.close(r));
  }
});

test('remoteProxy com credenciais erradas falha', async () => {
  const srv = await startMockRemote();
  const port = srv.address().port;
  try {
    const node = infra.addNode({ name: 'MockBad', host: '127.0.0.1', port });
    infra.setNodeCredentials(node.id, { username: 'admin', password: 'wrong' });
    await assert.rejects(() => infra.remoteProxy(infra.findNode(node.id), 'files/list', { method: 'GET' }), /autenticar|credenciais/i);
  } finally {
    await new Promise((r) => srv.close(r));
  }
});

test('remoteProxy sem credenciais lança erro', async () => {
  const node = infra.addNode({ name: 'NoCred', host: '127.0.0.1', port: 3000 });
  await assert.rejects(() => infra.remoteProxy(infra.findNode(node.id), 'files/list', { method: 'GET' }), /credenciais/i);
});

test('credenciais são sanitizadas (não expostas); credentialsConfigured reflete o estado', () => {
  const node = infra.addNode({ name: 'San', host: '127.0.0.1', port: 3000 });
  assert.equal(infra.findNode(node.id).credentialsConfigured, false);
  assert.equal(infra.findNode(node.id).credentials, undefined);
  infra.setNodeCredentials(node.id, { username: 'a', password: 'b' });
  const found = infra.findNode(node.id);
  assert.equal(found.credentialsConfigured, true);
  assert.equal(found.credentials, undefined); // não expõe a senha
  assert.equal(infra.hasNodeCredentials(node.id), true);
  infra.clearNodeCredentials(node.id);
  assert.equal(infra.findNode(node.id).credentialsConfigured, false);
  assert.equal(infra.hasNodeCredentials(node.id), false);
});

test('nó local não aceita credenciais', () => {
  assert.throws(() => infra.setNodeCredentials(infra.LOCAL_NODE_ID, { username: 'a', password: 'b' }), /local/i);
});
