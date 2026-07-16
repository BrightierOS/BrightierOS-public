// test/services.test.js
// BrightierOS v0.8.0 — Testes do gerenciador de serviços
const { test } = require('node:test');
const assert = require('node:assert');
const services = require('../lib/services');

test('listServices inclui o BrightierOS como serviço virtual', async () => {
  const list = await services.listServices();
  const bos = list.find((s) => s.id === services.BRIGHTIEROS_ID);
  assert.ok(bos, 'BrightierOS deve aparecer na lista');
  assert.equal(bos.status, 'running');
  assert.equal(bos.managed, 'builtin');
});

test('serviceStatus do BrightierOS retorna running', async () => {
  const s = await services.serviceStatus(services.BRIGHTIEROS_ID);
  assert.equal(s.status, 'running');
});

test('control: não permite parar o BrightierOS', async () => {
  const r = await services.stopService(services.BRIGHTIEROS_ID);
  assert.equal(r.ok, false);
});

test('control: não permite iniciar o BrightierOS', async () => {
  const r = await services.startService(services.BRIGHTIEROS_ID);
  assert.equal(r.ok, false);
});

test('control: restart do BrightierOS delega (delegate=true, sem exit)', async () => {
  const r = await services.restartService(services.BRIGHTIEROS_ID);
  assert.equal(r.ok, true);
  assert.equal(r.delegate, true);
});

test('serviceLogs retorna uma string', async () => {
  const logs = await services.serviceLogs(services.BRIGHTIEROS_ID, 10);
  assert.equal(typeof logs, 'string');
});

test('_internals.run executa comando e captura stdout', async () => {
  const r = await services._internals.run('echo brightier');
  assert.match(r.stdout.trim(), /brightier/);
});

// v0.8.5 — categorias: base + plugins são 'brightieros'; serviços do SO 'system'.
test('listServices: a base tem category "brightieros"', async () => {
  const list = await services.listServices();
  const bos = list.find((s) => s.id === services.BRIGHTIEROS_ID);
  assert.equal(bos.category, 'brightieros');
});

test('listServices: todo serviço retorna com um campo category', async () => {
  const list = await services.listServices();
  assert.ok(list.length > 0);
  for (const s of list) {
    assert.ok(typeof s.category === 'string' && s.category.length, `serviço ${s.id} sem category`);
  }
});

test('pluginServices() retorna array (vazio quando não há plugins instalados)', () => {
  const plugins = services.pluginServices();
  assert.ok(Array.isArray(plugins));
});

test('control: plugin não pode ser iniciado/parado (roda in-process)', async () => {
  const r = await services.stopService('plugin:demo');
  assert.equal(r.ok, false);
});

test('serviceStatus de um plugin retorna managed "plugin" e category "brightieros"', async () => {
  const s = await services.serviceStatus('plugin:inexistente');
  assert.equal(s.managed, 'plugin');
  assert.equal(s.category, 'brightieros');
});
