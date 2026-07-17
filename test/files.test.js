// test/files.test.js
// BrightierOS — API consistency tests for /api/files routes.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const express = require('express');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bos-files-'));
process.env.BOS_DATA_DIR = TMP;

const users = require('../lib/users');
const filesRouter = require('../routes/files');

function makeToken(role) {
  const u = users.createUser({ username: role + Date.now(), password: 'pw', role });
  return users.createSession(u, { ip: '127.0.0.1', headers: { 'user-agent': 'test' } });
}

function startApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/files', filesRouter);
  return new Promise((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

function request(srv, method, urlPath, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const buf = body !== undefined ? Buffer.from(JSON.stringify(body)) : null;
    const opts = { method, host: '127.0.0.1', port: srv.address().port, path: urlPath, headers: {} };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    if (buf) {
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = String(buf.length);
    }
    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(raw); } catch {}
        resolve({ status: res.statusCode, body: raw, json });
      });
    });
    req.on('error', reject);
    if (buf) req.write(buf);
    req.end();
  });
}

let server;
let adminToken;
let viewerToken;

before(async () => {
  server = await startApp();
  adminToken = makeToken('admin');
  viewerToken = makeToken('viewer');
});

after(async () => {
  if (server) await new Promise((r) => server.close(r));
  fs.rmSync(TMP, { recursive: true, force: true });
});
test('GET /list sem auth -> 401 success:false', async () => {
  const r = await request(server, 'GET', '/api/files/list');
  assert.equal(r.status, 401);
  assert.equal(r.json.success, false);
  assert.ok(r.json.error);
});

test('GET /list viewer -> retorna data array', async () => {
  const r = await request(server, 'GET', '/api/files/list?path=', { token: viewerToken });
  assert.equal(r.status, 200);
  assert.equal(r.json.success, true);
  assert.ok(Array.isArray(r.json.data));
});

test('POST /create-folder viewer -> 403', async () => {
  const r = await request(server, 'POST', '/api/files/create-folder', { token: viewerToken, body: { path: 'x' } });
  assert.equal(r.status, 403);
  assert.equal(r.json.success, false);
});

test('POST /create-folder admin -> success', async () => {
  const r = await request(server, 'POST', '/api/files/create-folder', { token: adminToken, body: { path: 'foo' } });
  assert.equal(r.status, 200);
  assert.equal(r.json.success, true);
});

test('list contem pasta criada', async () => {
  const r = await request(server, 'GET', '/api/files/list?path=', { token: adminToken });
  assert.ok(r.json.data.some((i) => i.name === 'foo' && i.type === 'folder'));
});

test('path traversal -> 400 success:false', async () => {
  const r = await request(server, 'GET', '/api/files/list?path=../logs', { token: adminToken });
  assert.equal(r.status, 400);
  assert.equal(r.json.success, false);
  assert.ok(r.json.error);
});

test('POST /create-file + save + read + delete round-trip', async () => {
  let r = await request(server, 'POST', '/api/files/create-file', { token: adminToken, body: { path: 'hello.txt' } });
  assert.equal(r.json.success, true);
  r = await request(server, 'POST', '/api/files/save', { token: adminToken, body: { path: 'hello.txt', content: 'world' } });
  assert.equal(r.json.success, true);
  r = await request(server, 'GET', '/api/files/read?path=hello.txt', { token: adminToken });
  assert.equal(r.status, 200);
  assert.equal(r.body, 'world');
  r = await request(server, 'POST', '/api/files/delete', { token: adminToken, body: { path: 'hello.txt' } });
  assert.equal(r.json.success, true);
});

test('GET /read missing -> 404 success:false', async () => {
  const r = await request(server, 'GET', '/api/files/read?path=missing.txt', { token: adminToken });
  assert.equal(r.status, 404);
  assert.equal(r.json.success, false);
});

test('GET /download missing -> 404 success:false', async () => {
  const r = await request(server, 'GET', '/api/files/download?path=missing.txt', { token: adminToken });
  assert.equal(r.status, 404);
  assert.equal(r.json.success, false);
});

test('POST /save em arquivo nao-texto -> 400', async () => {
  fs.writeFileSync(path.join(TMP, 'home', 'pic.png'), 'x');
  const r = await request(server, 'POST', '/api/files/save', { token: adminToken, body: { path: 'pic.png', content: 'x' } });
  assert.equal(r.status, 400);
  assert.equal(r.json.success, false);
});

test('POST /upload-folder cria arquivos aninhados', async () => {
  const r = await request(server, 'POST', '/api/files/upload-folder', {
    token: adminToken,
    body: {
      path: 'pkg',
      files: [
        { path: 'a.txt', type: 'file', content: 'A' },
        { path: 'sub', type: 'directory' }
      ]
    }
  });
  assert.equal(r.json.success, true);
  assert.ok(fs.existsSync(path.join(TMP, 'home', 'pkg', 'a.txt')));
});
