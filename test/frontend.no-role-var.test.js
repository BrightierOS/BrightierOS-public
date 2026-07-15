const { test } = require('node:test');
const fs = require('fs');
const path = require('path');
const assert = require('node:assert');
const vm = require('vm');

// Guarda automática: o app.js NUNCA deve referenciar uma variável solta `role`.
// Toda leitura de papel deve vir de currentRole()/localStorage ou de propriedades
// (.role em objetos). Isso impede o bug recorrente "ReferenceError: role is not defined".
test('app.js não usa a variável solta "role" (só propriedades/.role)', () => {
  const code = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'app.js'), 'utf8');
  const lines = code.split('\n');
  const offenders = [];
  lines.forEach((line, i) => {
    const clean = line.replace(/\/\/.*$/, '');
    const suspicious = clean
      .replace(/currentRole/g, '')
      .replace(/userRole/g, '')
      .replace(/\.role\b/g, '')
      .replace(/role:/g, '')
      .replace(/role-\$\{/g, '')
      .replace(/role-/g, '')
      .replace(/item\.role/g, '');
    if (/\brole\b/.test(suspicious)) offenders.push(`${i + 1}: ${line.trim()}`);
  });
  assert.deepStrictEqual(offenders, [], 'Uso indevido de "role" encontrado:\n' + offenders.join('\n'));
});

// Guarda: app.js e auth.js devem disparar boot/guard direto, sem o typo de evento.
test('app.js e auth.js não usam o evento digitado errado "DOMContentDLoaded"', () => {
  ['public/assets/app.js', 'public/assets/auth.js'].forEach((rel) => {
    const code = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
    assert.ok(!code.includes('DOMContentDLoaded'), rel + ' ainda tem o typo DOMContentDLoaded');
  });
});

// Guarda funcional: carrega api.js + app.js num DOM mockado e garante que
// guard()/mountLayout rodam sem ReferenceError (especialmente "role is not defined").
test('app.js executa guard()/mountLayout sem ReferenceError', () => {
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
  const store = { 'brightieros-user': JSON.stringify({ username: 'admin1', role: 'admin' }) };
  const sandbox = {
    console,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem() {} },
    requestAnimationFrame: (fn) => fn(),
    setInterval: () => 0, clearInterval: () => {}, setTimeout: () => 0,
    Date, fetch: () => Promise.reject(new Error('no fetch')),
    navigator: { clipboard: null },
    location: { replace() {} },
    api: { user: { setup: () => Promise.resolve({ user: {} }), me: () => Promise.resolve({ user: {}, permissions: ['*'] }) } },
    document: {
      readyState: 'complete',
      body: Object.assign(makeEl(), { attributes: { 'data-page': 'dashboard' } }),
      addEventListener() {}, createElement: () => makeEl(),
      getElementById: () => makeEl(), querySelector: () => makeEl(),
    },
  };
  // No navegador, `window` É o objeto global. Espelhamos isso: window === sandbox.
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public/assets/api.js'), 'utf8'), sandbox, { filename: 'api.js' });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public/assets/app.js'), 'utf8'), sandbox, { filename: 'app.js' });
});
