// test/services-categories.test.js
// BrightierOS v0.8.5 — Testes das categorias de serviços + plugins como
// processos internos. Usa um BOS_DATA_DIR temporário com um plugin fake, por
// isso é um arquivo separado (PLUGINS_DIR é resolvido no require do módulo).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bos-svc-cat-'));
process.env.BOS_DATA_DIR = TMP;

const services = require('../lib/services');

// Cria um plugin fake em <TMP>/plugins/demo/manifest.json
const PLUGINS = path.join(TMP, 'plugins', 'demo');
fs.mkdirSync(PLUGINS, { recursive: true });
fs.writeFileSync(path.join(PLUGINS, 'manifest.json'), JSON.stringify({
  id: 'demo',
  name: 'Plugin Demo',
  version: '1.2.3',
  description: 'Um plugin de teste.',
  entry: 'backend.js',
}), 'utf8');
// backend.js mínimo (não é carregado pelo services, só precisa existir p/ o loader)
fs.writeFileSync(path.join(PLUGINS, 'backend.js'), 'module.exports = function(){};', 'utf8');

test('pluginServices() lista o plugin fake com id prefixado "plugin:"', () => {
  const plugins = services.pluginServices();
  assert.equal(plugins.length, 1);
  const p = plugins[0];
  assert.equal(p.id, 'plugin:demo');
  assert.equal(p.name, 'Plugin Demo');
  assert.equal(p.managed, 'plugin');
  assert.equal(p.category, 'brightieros');
  assert.equal(p.status, 'running');
  assert.equal(p.canControl, false);
  assert.equal(p.version, '1.2.3');
});

test('listServices() inclui base + plugin na categoria "brightieros"', async () => {
  const list = await services.listServices();
  const bos = list.find((s) => s.id === services.BRIGHTIEROS_ID);
  const demo = list.find((s) => s.id === 'plugin:demo');
  assert.ok(bos, 'base presente');
  assert.ok(demo, 'plugin presente');
  assert.equal(bos.category, 'brightieros');
  assert.equal(demo.category, 'brightieros');
  // base vem antes dos plugins
  assert.ok(list.indexOf(bos) < list.indexOf(demo));
});

test('listServices() separa internos (brightieros) do sistema (system)', async () => {
  const list = await services.listServices();
  const internal = list.filter((s) => s.category === 'brightieros');
  const system = list.filter((s) => s.category === 'system');
  // base + 1 plugin = 2 internos; serviços do SO dependem do ambiente.
  assert.equal(internal.length, 2);
  assert.ok(system.every((s) => s.managed !== 'builtin' && s.managed !== 'plugin'));
});

test('serviceStatus("plugin:demo") retorna o plugin com status running', async () => {
  const s = await services.serviceStatus('plugin:demo');
  assert.equal(s.id, 'plugin:demo');
  assert.equal(s.status, 'running');
  assert.equal(s.category, 'brightieros');
});

test('control de plugin é recusado (roda in-process)', async () => {
  const start = await services.startService('plugin:demo');
  const stop = await services.stopService('plugin:demo');
  const restart = await services.restartService('plugin:demo');
  assert.equal(start.ok, false);
  assert.equal(stop.ok, false);
  assert.equal(restart.ok, false);
});

test('serviceLogs de plugin indica que compartilha o log do BrightierOS', async () => {
  const logs = await services.serviceLogs('plugin:demo', 10);
  assert.equal(typeof logs, 'string');
  assert.match(logs, /brightieros/i);
});

test('pluginServices() ignora diretório sem manifest.json', () => {
  const bad = path.join(TMP, 'plugins', 'sem-manifest');
  fs.mkdirSync(bad, { recursive: true });
  const plugins = services.pluginServices();
  // só o 'demo' deve aparecer; 'sem-manifest' é ignorado
  assert.equal(plugins.length, 1);
  assert.equal(plugins[0].id, 'plugin:demo');
});

// ─── Teste HTTP ponta-a-ponta do endpoint /api/services (v0.8.5) ───────
// Confirma que o campo category chega ao cliente pela rota real, com auth.
const http = require('http');
const express = require('express');
const users = require('../lib/users');

function adminToken() {
  let admin = users.findUserByUsername('svcadmin');
  if (!admin) admin = users.createUser({ username: 'svcadmin', password: 'pw', role: 'admin' });
  return users.createSession(admin, { ip: '127.0.0.1', headers: { 'user-agent': 'test' } });
}

function startApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/services', require('../routes/services'));
  app.use((req, res) => res.status(404).json({ error: 'Not found' }));
  return new Promise((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

function getJSON(srv, urlPath, token) {
  return new Promise((resolve, reject) => {
    const r = http.request({
      method: 'GET', host: '127.0.0.1', port: srv.address().port, path: urlPath,
      headers: { 'Authorization': 'Bearer ' + token },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks).toString('utf8');
        let json = null; try { json = JSON.parse(buf); } catch {}
        resolve({ status: res.statusCode, json });
      });
    });
    r.on('error', reject); r.end();
  });
}

test('HTTP /api/services retorna lista com category (base + plugin)', async () => {
  const srv = await startApp();
  try {
    const token = adminToken();
    const r = await getJSON(srv, '/api/services', token);
    assert.equal(r.status, 200);
    assert.equal(r.json && r.json.success, true);
    const list = (r.json && r.json.data) || [];
    const bos = list.find((s) => s.id === services.BRIGHTIEROS_ID);
    const demo = list.find((s) => s.id === 'plugin:demo');
    assert.ok(bos, 'base via HTTP');
    assert.ok(demo, 'plugin via HTTP');
    assert.equal(bos.category, 'brightieros');
    assert.equal(demo.category, 'brightieros');
  } finally {
    await new Promise((x) => srv.close(x));
  }
});

test('HTTP /api/services sem token -> 401', async () => {
  const srv = await startApp();
  try {
    const r = await getJSON(srv, '/api/services', 'invalido');
    assert.equal(r.status, 401);
  } finally {
    await new Promise((x) => srv.close(x));
  }
});

