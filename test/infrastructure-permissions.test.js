// test/infrastructure-permissions.test.js
// BrightierOS v0.8.2 — Testes do bosCan (frontend) com permissão hierárquica.
// Garante que "<grupo>:all" concede "<grupo>:ação" no cliente (espelhando o
// backend em lib/users.js), para que administradores vejam os botões de
// adicionar/remover nós (infrastructure:control) e controlar serviços.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadAppWith(user) {
  const store = { 'brightieros-user': JSON.stringify(user) };
  function makeEl() {
    return {
      className: '', innerHTML: '', textContent: '', style: {},
      setAttribute() {}, getAttribute() { return null; },
      appendChild(c) { return c; }, querySelector() { return makeEl(); },
      querySelectorAll() { return []; }, addEventListener() {},
      classList: { add() {}, toggle() {}, contains() { return false; } },
      remove() {}, removeChild() {}, insertBefore() {}, firstChild: null,
    };
  }
  const sandbox = {
    console,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem() {} },
    requestAnimationFrame: (fn) => fn(),
    setInterval: () => 0, clearInterval: () => {}, setTimeout: () => 0,
    Date, fetch: () => Promise.reject(new Error('no fetch')),
    navigator: { clipboard: null },
    location: { replace() {} },
    api: { user: { setup: () => Promise.resolve({ user: {} }), me: () => Promise.resolve({ user: {}, permissions: [] }) } },
    document: {
      readyState: 'complete',
      body: Object.assign(makeEl(), { attributes: { 'data-page': 'infra' } }),
      addEventListener() {}, createElement: () => makeEl(),
      getElementById: () => makeEl(), querySelector: () => makeEl(),
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'api.js'), 'utf8'), sandbox, { filename: 'api.js' });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'app.js'), 'utf8'), sandbox, { filename: 'app.js' });
  return sandbox;
}

test('bosCan: infrastructure:all concede infrastructure:control (hierárquico)', () => {
  const s = loadAppWith({ username: 'admin', role: 'admin', permissions: ['infrastructure:all'] });
  assert.equal(s.window.bosCan('infrastructure:control'), true, 'admin com infrastructure:all deve poder controlar nós');
  assert.equal(s.window.bosCan('infrastructure:view'), true);
});

test('bosCan: infrastructure:view NÃO concede infrastructure:control', () => {
  const s = loadAppWith({ username: 'editor', role: 'editor', permissions: ['infrastructure:view'] });
  assert.equal(s.window.bosCan('infrastructure:control'), false);
  assert.equal(s.window.bosCan('infrastructure:view'), true);
});

test('bosCan: services:all concede services:control', () => {
  const s = loadAppWith({ username: 'admin', role: 'admin', permissions: ['services:all'] });
  assert.equal(s.window.bosCan('services:control'), true);
});
