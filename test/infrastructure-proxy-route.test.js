// test/infrastructure-proxy-route.test.js
// BrightierOS v0.8.3 — Teste de INTEGRAÇÃO da rota HTTP do proxy de arquivos.
// Diferente do infrastructure-proxy.test.js (que testa só a camada lib), este
// sobe o Express real (routes/infrastructure.js + express.json + auth) e um nó
// remoto mockado, e exercita o endpoint /api/infrastructure/nodes/:id/proxy/files/*
// com autenticação Bearer — o caminho real que o navegador percorre.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const express = require('express');

// Data dir isolado ANTES de carregar qualquer módulo que leia data/.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bos-proxy-route-'));
process.env.BOS_DATA_DIR = TMP;
process.env.PORT = '0';

const users = require('../lib/users');
const infra = require('../lib/infrastructure');

// Cria um admin local (idempotente) e devolve um token Bearer válido.
function adminToken() {
  let admin = users.findUserByUsername('root');
  if (!admin) admin = users.createUser({ username: 'root', password: 'pw', role: 'admin' });
  return users.createSession(admin, { ip: '127.0.0.1', headers: { 'user-agent': 'test' } });
}

// Cria um viewer (files:read, sem files:all) para testar o gate de escrita.
function viewerToken() {
  let viewer = users.findUserByUsername('viewer1');
  if (!viewer) viewer = users.createUser({ username: 'viewer1', password: 'pw', role: 'viewer' });
  return users.createSession(viewer, { ip: '127.0.0.1', headers: { 'user-agent': 'test' } });
}

// Nó remoto mockado: implementa /api/health, /api/users/login e /api/files/* do
// BrightierOS (list/read/create-folder/upload). Espelha o contrato real.
function startMockRemote() {
  return new Promise((resolve) => {
    const tokens = new Set();
    const store = new Map(); // simula o "disco" do remoto: path -> conteúdo
    let lastUploadRaw = null; // último corpo multipart recebido (para o teste inspecionar)
    const srv = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://x');
      if (u.pathname === '/api/health') {
        res.setHeader('content-type', 'application/json');
        return res.end(JSON.stringify({ success: true, status: 'ok' }));
      }
      if (u.pathname === '/api/users/login' && req.method === 'POST') {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          let j = {}; try { j = JSON.parse(body); } catch {}
          if (j.username === 'admin' && j.password === 'secret') {
            const tok = 'mock-' + Date.now() + '-' + Math.random();
            tokens.add(tok);
            res.setHeader('content-type', 'application/json');
            return res.end(JSON.stringify({ success: true, token: tok, user: { role: 'admin' } }));
          }
          res.statusCode = 401;
          return res.end(JSON.stringify({ success: false, error: 'Credenciais inválidas.' }));
        });
        return;
      }
      const auth = (req.headers['authorization'] || '').match(/^Bearer\s+(.+)$/i);
      if (u.pathname.startsWith('/api/files/') && (!auth || !tokens.has(auth[1]))) {
        res.statusCode = 401;
        return res.end(JSON.stringify({ success: false, error: 'Não autenticado.' }));
      }
      if (u.pathname === '/api/files/list' && req.method === 'GET') {
        res.setHeader('content-type', 'application/json');
        return res.end(JSON.stringify([{ name: 'docs', type: 'folder', size: null }, { name: 'readme.md', type: 'file', size: 11 }]));
      }
      if (u.pathname === '/api/files/read' && req.method === 'GET') {
        const p = u.searchParams.get('path') || '';
        res.setHeader('content-type', 'text/plain');
        return res.end(store.get(p) || 'hello remote');
      }
      if (u.pathname === '/api/files/create-folder' && req.method === 'POST') {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          let j = {}; try { j = JSON.parse(body); } catch {}
          store.set(j.path || '', null);
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ success: true }));
        });
        return;
      }
      if (u.pathname === '/api/files/upload' && req.method === 'POST') {
        // Captura o corpo bruto (multipart) para o teste validar que o proxy
        // encaminhou os bytes intactos (incluindo o boundary).
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          lastUploadRaw = Buffer.concat(chunks);
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ success: true }));
        });
        return;
      }
      if (u.pathname === '/api/files/download' && req.method === 'GET') {
        // Binário + content-disposition (contrato do res.download do Express).
        const bin = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // cabeçalho PNG
        res.setHeader('content-type', 'image/png');
        res.setHeader('content-disposition', 'attachment; filename="blob.png"');
        return res.end(bin);
      }
      if (u.pathname === '/api/files/trash' && req.method === 'GET') {
        res.setHeader('content-type', 'application/json');
        return res.end(JSON.stringify([{ trashPath: 'relatorio__1700000000000.txt', name: 'relatorio.txt', type: 'file', size: 42, sizeFormatted: '42 B', deletedAt: '2026-07-16T10:00:00.000Z' }]));
      }
      if (u.pathname === '/api/files/trash/stats' && req.method === 'GET') {
        res.setHeader('content-type', 'application/json');
        return res.end(JSON.stringify({ count: 1, size: 42, sizeFormatted: '42 B' }));
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Not found' }));
    });
    srv.getLastUpload = () => lastUploadRaw; // expõe para o teste de upload
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

function startLocalApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/infrastructure', require('../routes/infrastructure'));
  // fallback 404 igual ao server.js para APIs
  app.use((req, res) => res.status(404).json({ error: 'Not found' }));
  return new Promise((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

// Monta files + trash + infrastructure como no server.js, para testar a auth
// das rotas de lixeira (v0.8.4) no stack real.
function startLocalAppWithFiles() {
  const app = express();
  app.use(express.json());
  app.use('/api/files', require('../routes/files'));
  app.use('/api/files', require('../routes/trash'));
  app.use('/api/infrastructure', require('../routes/infrastructure'));
  app.use((req, res) => res.status(404).json({ error: 'Not found' }));
  return new Promise((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

function reqJSON(srv, method, urlPath, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const bodyBuf = body !== undefined ? Buffer.from(JSON.stringify(body)) : null;
    const opts = {
      method,
      host: '127.0.0.1',
      port: srv.address().port,
      path: urlPath,
      headers: { 'Authorization': 'Bearer ' + token },
    };
    if (bodyBuf) {
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = String(bodyBuf.length);
    }
    const r = http.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        let parsed = null;
        try { parsed = JSON.parse(buf.toString('utf8')); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, body: buf.toString('utf8'), json: parsed });
      });
    });
    r.on('error', reject);
    if (bodyBuf) r.write(bodyBuf);
    r.end();
  });
}

test('proxy HTTP: lista arquivos do nó remoto com auth local', async () => {
  const remote = await startMockRemote();
  const local = await startLocalApp();
  try {
    const token = adminToken();
    const node = infra.addNode({ name: 'Mock', host: '127.0.0.1', port: remote.address().port });
    infra.setNodeCredentials(node.id, { username: 'admin', password: 'secret' });
    const r = await reqJSON(local, 'GET', `/api/infrastructure/nodes/${node.id}/proxy/files/list`, { token });
    assert.equal(r.status, 200, 'esperado 200, veio ' + r.status + ' body=' + r.body);
    assert.ok(Array.isArray(r.json), 'esperado array (contrato do /api/files/list)');
    assert.equal(r.json[0].name, 'docs');
  } finally {
    await new Promise((x) => local.close(x));
    await new Promise((x) => remote.close(x));
  }
});

test('proxy HTTP: le arquivo do no remoto (texto)', async () => {
  const remote = await startMockRemote();
  const local = await startLocalApp();
  try {
    const token = adminToken();
    const node = infra.addNode({ name: 'Mock2', host: '127.0.0.1', port: remote.address().port });
    infra.setNodeCredentials(node.id, { username: 'admin', password: 'secret' });
    const r = await reqJSON(local, 'GET', `/api/infrastructure/nodes/${node.id}/proxy/files/read?path=${encodeURIComponent('readme.md')}`, { token });
    assert.equal(r.status, 200, 'esperado 200, veio ' + r.status + ' body=' + r.body);
    assert.equal(r.body, 'hello remote');
    assert.equal(r.headers['content-type'], 'text/plain');
  } finally {
    await new Promise((x) => local.close(x));
    await new Promise((x) => remote.close(x));
  }
});

test('proxy HTTP: cria pasta no no remoto (POST JSON encaminhado)', async () => {
  const remote = await startMockRemote();
  const local = await startLocalApp();
  try {
    const token = adminToken();
    const node = infra.addNode({ name: 'Mock3', host: '127.0.0.1', port: remote.address().port });
    infra.setNodeCredentials(node.id, { username: 'admin', password: 'secret' });
    const r = await reqJSON(local, 'POST', `/api/infrastructure/nodes/${node.id}/proxy/files/create-folder`, { token, body: { path: 'nova-pasta' } });
    assert.equal(r.status, 200, 'esperado 200, veio ' + r.status + ' body=' + r.body);
    assert.equal(r.json && r.json.success, true);
  } finally {
    await new Promise((x) => local.close(x));
    await new Promise((x) => remote.close(x));
  }
});

test('proxy HTTP: sem token local -> 401', async () => {
  const remote = await startMockRemote();
  const local = await startLocalApp();
  try {
    const node = infra.addNode({ name: 'Mock4', host: '127.0.0.1', port: remote.address().port });
    infra.setNodeCredentials(node.id, { username: 'admin', password: 'secret' });
    const r = await reqJSON(local, 'GET', `/api/infrastructure/nodes/${node.id}/proxy/files/list`, { token: 'invalido' });
    assert.equal(r.status, 401);
  } finally {
    await new Promise((x) => local.close(x));
    await new Promise((x) => remote.close(x));
  }
});

test('proxy HTTP: no sem credenciais -> 400', async () => {
  const remote = await startMockRemote();
  const local = await startLocalApp();
  try {
    const token = adminToken();
    const node = infra.addNode({ name: 'Mock5', host: '127.0.0.1', port: remote.address().port });
    const r = await reqJSON(local, 'GET', `/api/infrastructure/nodes/${node.id}/proxy/files/list`, { token });
    assert.equal(r.status, 400);
    assert.match((r.json && r.json.error) || '', /credenciais/i);
  } finally {
    await new Promise((x) => local.close(x));
    await new Promise((x) => remote.close(x));
  }
});

test('proxy HTTP: no local recusado no proxy', async () => {
  const local = await startLocalApp();
  try {
    const token = adminToken();
    const r = await reqJSON(local, 'GET', `/api/infrastructure/nodes/${infra.LOCAL_NODE_ID}/proxy/files/list`, { token });
    assert.equal(r.status, 400);
  } finally {
    await new Promise((x) => local.close(x));
  }
});

// Envia multipart/form-data (igual ao FormData do navegador) com campo `file`
// (arquivo) e `path` (texto), retornando a resposta bruta.
function reqMultipart(srv, urlPath, { token, filename, fileContent, pathValue }) {
  return new Promise((resolve, reject) => {
    const boundary = '----bosproxy' + Math.random().toString(36).slice(2);
    const parts = [];
    const enc = (s) => String(s);
    parts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="path"\r\n\r\n` +
      `${enc(pathValue)}\r\n`
    ));
    parts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${enc(filename)}"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`
    ));
    parts.push(Buffer.from(fileContent));
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
    const body = Buffer.concat(parts);

    const opts = {
      method: 'POST',
      host: '127.0.0.1',
      port: srv.address().port,
      path: urlPath,
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'multipart/form-data; boundary=' + boundary,
        'Content-Length': String(body.length),
      },
    };
    const r = http.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        let parsed = null;
        try { parsed = JSON.parse(buf.toString('utf8')); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, body: buf.toString('utf8'), json: parsed });
      });
    });
    r.on('error', reject);
    r.write(body);
    r.end();
  });
}

test('proxy HTTP: upload multipart encaminha o corpo intacto ao remoto', async () => {
  const remote = await startMockRemote();
  const local = await startLocalApp();
  try {
    const token = adminToken();
    const node = infra.addNode({ name: 'MockUp', host: '127.0.0.1', port: remote.address().port });
    infra.setNodeCredentials(node.id, { username: 'admin', password: 'secret' });

    const r = await reqMultipart(local, `/api/infrastructure/nodes/${node.id}/proxy/files/upload`,
      { token, filename: 'nota.txt', fileContent: 'conteudo remoto', pathValue: 'docs' });
    assert.equal(r.status, 200, 'esperado 200, veio ' + r.status + ' body=' + r.body);
    assert.equal(r.json && r.json.success, true);

    // O proxy deve ter encaminhado o multipart intacto (com o nome do arquivo).
    const raw = remote.getLastUpload();
    assert.ok(raw && raw.length, 'remoto não recebeu corpo');
    assert.ok(raw.toString('utf8').includes('filename="nota.txt"'), 'nome do arquivo perdido no proxy');
    assert.ok(raw.toString('utf8').includes('conteudo remoto'), 'conteudo do arquivo perdido no proxy');
  } finally {
    await new Promise((x) => local.close(x));
    await new Promise((x) => remote.close(x));
  }
});

test('proxy HTTP: download binario encaminha bytes + content-disposition', async () => {
  const remote = await startMockRemote();
  const local = await startLocalApp();
  try {
    const token = adminToken();
    const node = infra.addNode({ name: 'MockDl', host: '127.0.0.1', port: remote.address().port });
    infra.setNodeCredentials(node.id, { username: 'admin', password: 'secret' });

    const r = await reqJSON(local, 'GET', `/api/infrastructure/nodes/${node.id}/proxy/files/download?path=${encodeURIComponent('blob.png')}`, { token });
    assert.equal(r.status, 200, 'esperado 200, veio ' + r.status + ' body=' + r.body);
    assert.equal(r.headers['content-type'], 'image/png');
    assert.ok((r.headers['content-disposition'] || '').includes('blob.png'), 'content-disposition não encaminhado');
  } finally {
    await new Promise((x) => local.close(x));
    await new Promise((x) => remote.close(x));
  }
});



test('proxy HTTP: lixeira (list + stats) do no remoto via proxy', async () => {
  const remote = await startMockRemote();
  const local = await startLocalApp();
  try {
    const token = adminToken();
    const node = infra.addNode({ name: 'MockTrash', host: '127.0.0.1', port: remote.address().port });
    infra.setNodeCredentials(node.id, { username: 'admin', password: 'secret' });

    const rList = await reqJSON(local, 'GET', `/api/infrastructure/nodes/${node.id}/proxy/files/trash`, { token });
    assert.equal(rList.status, 200, 'list: esperado 200, veio ' + rList.status + ' body=' + rList.body);
    assert.ok(Array.isArray(rList.json), 'list: esperado array (contrato do /api/files/trash)');
    assert.equal(rList.json[0].name, 'relatorio.txt');

    const rStats = await reqJSON(local, 'GET', `/api/infrastructure/nodes/${node.id}/proxy/files/trash/stats`, { token });
    assert.equal(rStats.status, 200);
    assert.equal(rStats.json && rStats.json.count, 1);
  } finally {
    await new Promise((x) => local.close(x));
    await new Promise((x) => remote.close(x));
  }
});

test('lixeira local: GET sem token -> 401 (auth adicionada em v0.8.3.2)', async () => {
  const local = await startLocalAppWithFiles();
  try {
    const r = await reqJSON(local, 'GET', '/api/files/trash', { token: 'invalido' });
    assert.equal(r.status, 401);
  } finally {
    await new Promise((x) => local.close(x));
  }
});

test('lixeira local: GET com admin -> 200 (lista vazia ou itens)', async () => {
  const local = await startLocalAppWithFiles();
  try {
    const token = adminToken();
    const r = await reqJSON(local, 'GET', '/api/files/trash', { token });
    assert.equal(r.status, 200, 'esperado 200, veio ' + r.status + ' body=' + r.body);
    assert.ok(Array.isArray(r.json), 'esperado array');
  } finally {
    await new Promise((x) => local.close(x));
  }
});

test('lixeira local: escrita (POST /trash) com viewer -> 403 (exige files:all)', async () => {
  const local = await startLocalAppWithFiles();
  try {
    const token = viewerToken();
    const r = await reqJSON(local, 'POST', '/api/files/trash', { token, body: { path: 'algo.txt' } });
    assert.equal(r.status, 403);
  } finally {
    await new Promise((x) => local.close(x));
  }
});

test('lixeira local: escrita com admin passa na auth (nao 401/403)', async () => {
  const local = await startLocalAppWithFiles();
  try {
    const token = adminToken();
    // admin tem files:all -> auth passa. O item nao existe -> 404 (nao 401/403).
    const r = await reqJSON(local, 'POST', '/api/files/trash', { token, body: { path: 'inexistente.txt' } });
    assert.ok(r.status !== 401 && r.status !== 403, 'admin nao deve ser barrado na auth, veio ' + r.status);
  } finally {
    await new Promise((x) => local.close(x));
  }
});

