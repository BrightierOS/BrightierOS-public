// test/trash-name.test.js
// BrightierOS v0.8.0 — Regressão: recuperação de nome na lixeira
// Bug corrigido: "report__1234567890.txt" era restaurado como "1234567890.txt".
const { test } = require('node:test');
const assert = require('node:assert');
const trash = require('../routes/trash');
const recover = trash.recoverOriginalName;

test('recupera nome com extensão', () => {
  assert.equal(recover('report__1234567890.txt'), 'report.txt');
});

test('lida com nomes sem extensão', () => {
  assert.equal(recover('data__1234567890'), 'data');
});

test('lida com "__" dentro do nome original', () => {
  assert.equal(recover('my__file__1234567890.txt'), 'my__file.txt');
});

test('retorna o próprio nome se não houver "__"', () => {
  assert.equal(recover('arquivo.txt'), 'arquivo.txt');
  assert.equal(recover('arquivo'), 'arquivo');
});
