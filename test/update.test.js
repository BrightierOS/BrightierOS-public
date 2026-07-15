// test/update.test.js
// Testes das "Atualizações Inteligentes" (v0.4.5) — helpers de routes/update.js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// DATA_DIR é direcionado para um diretório temporário (via env BOS_DATA_DIR)
// antes de carregar o módulo, sem afetar os dados reais do projeto.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bos-upd-'));
process.env.BOS_DATA_DIR = TMP;

const update = require('../routes/update');

test('compareVersions ordena semanticamente', () => {
  const { compareVersions } = update._internals;
  assert.equal(compareVersions('0.4.5', '0.4.4'), 1);
  assert.equal(compareVersions('0.4.4', '0.4.5'), -1);
  assert.equal(compareVersions('0.4.5', '0.4.5'), 0);
  assert.equal(compareVersions('1.0.0', '0.9.9'), 1);
});

test('tagOf normaliza a versão', () => {
  assert.equal(update._internals.tagOf('0.4.5'), 'v0.4.5');
  assert.equal(update._internals.tagOf('v0.4.5'), 'v0.4.5');
});

test('summarizeLocalChanges mapeia o status do git', () => {
  const s = update._internals.summarizeLocalChanges({
    modified: ['a.js'],
    not_added: ['b.js'],
    created: ['c.js'],
    deleted: ['d.js'],
    renamed: ['e.js'],
    conflicted: ['f.js'],
  });
  assert.ok(s.includes('M  a.js'));
  assert.ok(s.includes('?  b.js'));
  assert.ok(s.includes('A  c.js'));
  assert.ok(s.includes('D  d.js'));
  assert.ok(s.includes('R  e.js'));
  assert.ok(s.includes('C  f.js'));
});

test('backup + restore faz round-trip dos dados', async () => {
  const { createBackup, listBackups, restoreBackup, DATA_DIR } = update._internals;
  const file = path.join(DATA_DIR, 'config.txt');
  fs.writeFileSync(file, 'importante');

  const meta = await createBackup('manual');
  assert.ok(meta.id);
  assert.ok(fs.existsSync(path.join(DATA_DIR, 'backups', meta.id, 'config.txt')));

  assert.equal(listBackups().length, 1);

  // Remove o arquivo para simular perda de dados.
  fs.unlinkSync(file);
  assert.ok(!fs.existsSync(file));

  const r = await restoreBackup(meta.id);
  assert.ok(r.safetyId);
  assert.equal(fs.readFileSync(file, 'utf8'), 'importante');

  // O restore cria um backup de segurança do estado anterior.
  assert.equal(listBackups().length, 2);
});

test('getChangelog retorna o conteúdo do CHANGELOG.md', () => {
  const text = update._internals.getChangelog();
  assert.ok(typeof text === 'string');
  assert.ok(text.length > 0);
  assert.ok(text.includes('v0.4.5'));
});
