// test/security-routes.test.js
// BrightierOS v0.8.5.7 — Testes de segurança para rotas críticas:
//   • autenticação em /api/users/reset, /api/notifications, /api/update/backups
//   • path traversal em /api/files, /api/files/trash, /api/plugins, /api/store
const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const express = require('express');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bos-sec-'));
process.env.BOS_DATA_DIR = TMP;
process.env.PORT = '0';

// v0.8.5.7 — Limpa o require.cache de módulos do projeto para garantir que
// BOS_DATA_DIR seja respeitado neste arquivo e não vaze entre testes.
const PROJECT_ROOT = path.resolve(__dirname, '..');
function clearProjectCache() {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(PROJECT_ROOT) && !key.includes('node_modules')) {
      delete require.cache[key];
    }
  }
}
clearProjectCache();

const users = require('../lib/users');

function adminToken() {
  let admin = users.findUserByUsername('secadmin');
  if (!admin) admin = users.createUser({ username: 'secadmin', password: 'pw', role: 'admin' });
  return users.createSession(admin, { ip: '127.0.0.1', headers: { 'user-agent': 'test' } });
}

function viewerToken() {
  let viewer = users.findUserByUsername('secviewer');
  if (!viewer) viewer = users.createUser({ username: 'secviewer', password: 'pw', role: 'viewer' });
  return users.createSession(viewer, { ip: '127.0.0.1', headers: { 'user-agent': 'test' } });
}

function startApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/users', require('../routes/user'));
  const { router: coreRouter } = require('../routes/core');
  app.use('/', coreRouter);
  app.use('/api/update', require('../routes/update'));
  app.use('/api/files', require('../routes/files'));
  app.use('/api/files', require('../routes/trash'));
  require('../routes/plugin')(app);
  require('../routes/store')(app);
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
      headers: {},
    };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
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
        resolve({ status: res.statusCode, body: buf.toString('utf8'), json: parsed });
      });
    });
    r.on('error', reject);
    if (bodyBuf) r.write(bodyBuf);
    r.end();
  });
}

after(() => {
  clearProjectCache();
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
});

// ─── /api/users/reset ───────────────────────────────────────────────────────

test('POST /api/users/reset sem token -> 401', async () => {
  const srv = await startApp();
  try {
    const r = await reqJSON(srv, 'POST', '/api/users/reset', { body: {} });
    assert.equal(r.status, 401);
  } finally {
    await new Promise((x) => srv.close(x));
  }
});

test('POST /api/users/reset admin sem x-confirmed-reset -> 403', async () => {
  const srv = await startApp();
  try {
    const r = await reqJSON(srv, 'POST', '/api/users/reset', { token: adminToken(), body: {} });
    assert.equal(r.status, 403);
  } finally {
    await new Promise((x) => srv.close(x));
  }
});

test('POST /api/users/reset admin confirmado -> 200 e apaga dados', async () => {
  const srv = await startApp();
  try {
    fs.writeFileSync(path.join(TMP, 'marker.txt'), 'x', 'utf8');
    const bodyBuf = Buffer.from(JSON.stringify({}));
    const res = await new Promise((resolve, reject) => {
      const r = http.request({
        method: 'POST',
        host: '127.0.0.1',
        port: srv.address().port,
        path: '/api/users/reset',
        headers: {
          'Authorization': 'Bearer ' + adminToken(),
          'Content-Type': 'application/json',
          'Content-Length': String(bodyBuf.length),
          'x-confirmed-reset': 'true',
        },
      }, resolve);
      r.on('error', reject);
      r.write(bodyBuf);
      r.end();
    });
    const chunks = [];
    for await (const c of res) chunks.push(c);
    assert.equal(res.statusCode, 200);
    assert.equal(fs.existsSync(path.join(TMP, 'marker.txt')), false);
  } finally {
    await new Promise((x) => srv.close(x));
  }
});

// ─── /api/notifications ─────────────────────────────────────────────────────

test('GET /api/notifications sem token -> 401', async () => {
  const srv = await startApp();
  try {
    const r = await reqJSON(srv, 'GET', '/api/notifications');
    assert.equal(r.status, 401);
  } finally {
    await new Promise((x) => srv.close(x));
  }
});

test('POST /api/notifications sem token -> 401', async () => {
  const srv = await startApp();
  try {
    const r = await reqJSON(srv, 'POST', '/api/notifications', { body: { type: 'info', message: 'x' } });
    assert.equal(r.status, 401);
  } finally {
    await new Promise((x) => srv.close(x));
  }
});

test('POST /api/notifications/:id/read sem token -> 401', async () => {
  const srv = await startApp();
  try {
    const r = await reqJSON(srv, 'POST', '/api/notifications/123/read', { body: {} });
    assert.equal(r.status, 401);
  } finally {
    await new Promise((x) => srv.close(x));
  }
});

test('DELETE /api/notifications sem token -> 401', async () => {
  const srv = await startApp();
  try {
    const r = await reqJSON(srv, 'DELETE', '/api/notifications');
    assert.equal(r.status, 401);
  } finally {
    await new Promise((x) => srv.close(x));
  }
});

test('POST /api/notifications viewer -> 403', async () => {
  const srv = await startApp();
  try {
    const r = await reqJSON(srv, 'POST', '/api/notifications', { token: viewerToken(), body: { type: 'info', message: 'x' } });
    assert.equal(r.status, 403);
  } finally {
    await new Promise((x) => srv.close(x));
  }
});

test('GET/POST/DELETE /api/notifications admin -> 200', async () => {
  const srv = await startApp();
  try {
    const token = adminToken();
    const add = await reqJSON(srv, 'POST', '/api/notifications', { token, body: { type: 'info', message: 'hello' } });
    assert.equal(add.status, 200);
    const list = await reqJSON(srv, 'GET', '/api/notifications', { token });
    assert.equal(list.status, 200);
    const note = list.json && list.json.data && list.json.data[0];
    assert.ok(note);
    const mark = await reqJSON(srv, 'POST', '/api/notifications/' + note.id + '/read', { token });
    assert.equal(mark.status, 200);
    const clear = await reqJSON(srv, 'DELETE', '/api/notifications', { token });
    assert.equal(clear.status, 200);
  } finally {
    await new Promise((x) => srv.close(x));
  }
});

// ─── /api/update/backups ────────────────────────────────────────────────────

test('GET /api/update/backups sem token -> 401', async () => {
  const srv = await startApp();
  try {
    const r = await reqJSON(srv, 'GET', '/api/update/backups');
    assert.equal(r.status, 401);
  } finally {
    await new Promise((x) => srv.close(x));
  }
});

test('GET /api/update/backups admin -> 200', async () => {
  const srv = await startApp();
  try {
    const r = await reqJSON(srv, 'GET', '/api/update/backups', { token: adminToken() });
    assert.equal(r.status, 200);
    assert.equal(r.json && r.json.success, true);
  } finally {
    await new Promise((x) => srv.close(x));
  }
});

// ─── /api/stats e /api/metrics/history ─────────────────────────────────────

test('GET /api/stats sem token -> 401', async () => {
  const srv = await startApp();
  try {
    const r = await reqJSON(srv, 'GET', '/api/stats');
    assert.equal(r.status, 401);
  } finally {
    await new Promise((x) => srv.close(x));
  }
});

test('GET /api/metrics/history sem token -> 401', async () => {
  const srv = await startApp();
  try {
    const r = await reqJSON(srv, 'GET', '/api/metrics/history');
    assert.equal(r.status, 401);
  } finally {
    await new Promise((x) => srv.close(x));
  }
});

test('GET /api/stats com admin -> 200', async () => {
  const srv = await startApp();
  try {
    const r = await reqJSON(srv, 'GET', '/api/stats', { token: adminToken() });
    assert.equal(r.status, 200);
    assert.equal(r.json && r.json.success, true);
  } finally {
    await new Promise((x) => srv.close(x));
  }
});

test('GET /api/metrics/history com admin -> 200', async () => {
  const srv = await startApp();
  try {
    const r = await reqJSON(srv, 'GET', '/api/metrics/history', { token: adminToken() });
    assert.equal(r.status, 200);
    assert.equal(r.json && r.json.success, true);
  } finally {
    await new Promise((x) => srv.close(x));
  }
});

// ─── Path traversal: /api/files ─────────────────────────────────────────────

test('GET /api/files/list com path traversal -> 400', async () => {
  const srv = await startApp();
  try {
    const token = adminToken();
    const r = await reqJSON(srv, 'GET', '/api/files/list?path=' + encodeURIComponent('../marker.txt'), { token });
    assert.equal(r.status, 400);
  } finally {
    await new Promise((x) => srv.close(x));
  }
});

test('POST /api/files/create-file com path traversal -> 400', async () => {
  const srv = await startApp();
  try {
    const token = adminToken();
    const r = await reqJSON(srv, 'POST', '/api/files/create-file', { token, body: { path: '../evil.txt' } });
    assert.equal(r.status, 400);
  } finally {
    await new Promise((x) => srv.close(x));
  }
});

test('prefixo parcial não escapa do ROOT (ex.: ../home2)', async () => {
  const srv = await startApp();
  try {
    const token = adminToken();
    const sibling = path.join(TMP, 'home2', 'secret.txt');
    fs.mkdirSync(path.dirname(sibling), { recursive: true });
    fs.writeFileSync(sibling, 'secret', 'utf8');
    const r = await reqJSON(srv, 'GET', '/api/files/list?path=' + encodeURIComponent('../home2'), { token });
    assert.equal(r.status, 400);
  } finally {
    await new Promise((x) => srv.close(x));
  }
});

// ─── Path traversal: /api/files/trash ───────────────────────────────────────

test('POST /api/files/trash com path traversal -> recusado', async () => {
  const srv = await startApp();
  try {
    const token = adminToken();
    const r = await reqJSON(srv, 'POST', '/api/files/trash', { token, body: { path: '../marker.txt' } });
    assert.ok(r.status === 400 || r.status === 500);
  } finally {
    await new Promise((x) => srv.close(x));
  }
});

test('DELETE /api/files/trash/:trashPath com path traversal -> recusado', async () => {
  const srv = await startApp();
  try {
    const token = adminToken();
    const r = await reqJSON(srv, 'DELETE', '/api/files/trash/' + encodeURIComponent('../marker.txt'), { token });
    assert.ok(r.status === 400 || r.status === 500);
  } finally {
    await new Promise((x) => srv.close(x));
  }
});

// ─── Path traversal: /api/plugins ───────────────────────────────────────────

test('GET /api/plugins sem token -> 401', async () => {
  const srv = await startApp();
  try {
    const r = await reqJSON(srv, 'GET', '/api/plugins');
    assert.equal(r.status, 401);
  } finally {
    await new Promise((x) => srv.close(x));
  }
});

test('DELETE /api/plugins/../server.js sem token -> 401', async () => {
  const srv = await startApp();
  try {
    const r = await reqJSON(srv, 'DELETE', '/api/plugins/' + encodeURIComponent('../server.js'));
    assert.equal(r.status, 401);
  } finally {
    await new Promise((x) => srv.close(x));
  }
});

test('DELETE /api/plugins/../server.js com admin -> 400 (invalid id)', async () => {
  const srv = await startApp();
  try {
    const r = await reqJSON(srv, 'DELETE', '/api/plugins/' + encodeURIComponent('../server.js'), { token: adminToken() });
    assert.equal(r.status, 400);
  } finally {
    await new Promise((x) => srv.close(x));
  }
});

// ─── Path traversal: /api/store ─────────────────────────────────────────────

test('POST /api/store sem token -> 401', async () => {
  const srv = await startApp();
  try {
    const r = await reqJSON(srv, 'POST', '/api/store', { body: { id: 'a', name: 'A', url: 'https://example.com/repo.git' } });
    assert.equal(r.status, 401);
  } finally {
    await new Promise((x) => srv.close(x));
  }
});

test('POST /api/store com id path traversal -> 400', async () => {
  const srv = await startApp();
  try {
    const r = await reqJSON(srv, 'POST', '/api/store', {
      token: adminToken(),
      body: { id: '../evil', name: 'A', url: 'https://example.com/repo.git' },
    });
    assert.equal(r.status, 400);
  } finally {
    await new Promise((x) => srv.close(x));
  }
});

test('GET /api/store/../x/catalog com admin -> 400', async () => {
  const srv = await startApp();
  try {
    const r = await reqJSON(srv, 'GET', '/api/store/' + encodeURIComponent('../x') + '/catalog', { token: adminToken() });
    assert.equal(r.status, 400);
  } finally {
    await new Promise((x) => srv.close(x));
  }
});

// ─── Helpers de validação de backupId ───────────────────────────────────────

test('validateBackupId rejeita ids perigosos', () => {
  const { validateBackupId } = require('../routes/update')._internals;
  assert.equal(validateBackupId('bak-2024-01-01'), true);
  assert.equal(validateBackupId('../etc'), false);
  assert.equal(validateBackupId('/etc/passwd'), false);
  assert.equal(validateBackupId('a\0b'), false);
});
