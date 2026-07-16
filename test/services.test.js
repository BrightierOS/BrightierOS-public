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
