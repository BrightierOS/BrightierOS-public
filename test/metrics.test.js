// test/metrics.test.js
// BrightierOS v0.8.0 — Testes do coletor de histórico de métricas
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bos-metrics-'));
process.env.BOS_DATA_DIR = TMP;

const metrics = require('../lib/metrics');

test('record + readHistory mantém ordem', () => {
  metrics.clearHistory();
  metrics._internals.record({ time: 1, cpu: 10, ram: 20 });
  metrics._internals.record({ time: 2, cpu: 30, ram: 40 });
  const h = metrics.readHistory();
  assert.equal(h.length, 2);
  assert.equal(h[0].cpu, 10);
  assert.equal(h[1].ram, 40);
});

test('clearHistory zera o histórico', () => {
  metrics._internals.record({ time: 1, cpu: 1, ram: 1 });
  metrics.clearHistory();
  assert.equal(metrics.readHistory().length, 0);
});

test('summary calcula avg/min/max', () => {
  metrics.clearHistory();
  metrics._internals.record({ time: 1, cpu: 10, ram: 50 });
  metrics._internals.record({ time: 2, cpu: 30, ram: 70 });
  const s = metrics.summary(10);
  assert.equal(s.cpu.avg, 20);
  assert.equal(s.cpu.min, 10);
  assert.equal(s.cpu.max, 30);
  assert.equal(s.ram.avg, 60);
});

test('snapshot retorna ponto com campos esperados', async () => {
  const p = await metrics.snapshot();
  assert.ok(typeof p.time === 'number');
  assert.ok('cpu' in p && 'ram' in p && 'netRx' in p && 'temp' in p);
});

test('onTick é chamado em novos pontos e off cancela', () => {
  metrics.clearHistory();
  let got = null;
  const off = metrics.onTick((p) => { got = p; });
  metrics._internals.record({ time: 1, cpu: 5, ram: 5 });
  assert.ok(got && got.cpu === 5);
  off();
  got = null;
  metrics._internals.record({ time: 2, cpu: 9, ram: 9 });
  assert.equal(got, null);
});
