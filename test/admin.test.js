// test/admin.test.js
// BrightierOS v0.5.0 — Administração: testes do lib/users.js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bos-admin-'));
process.env.BOS_DATA_DIR = TMP;

const U = require('../lib/users');

test('hash e verificação de senha', () => {
  const h = U.hashPassword('segredo123');
  assert.ok(h.includes(':'));
  assert.equal(U.verifyPassword('segredo123', h), true);
  assert.equal(U.verifyPassword('errada', h), false);
  assert.equal(U.verifyPassword('x', 'plaintext'), false);
});

test('permissões por papel', () => {
  assert.equal(U.hasPermission('admin', 'users:manage'), true);
  assert.equal(U.hasPermission('editor', 'users:manage'), false);
  assert.equal(U.hasPermission('viewer', 'settings:manage'), false);
  assert.equal(U.hasPermission('viewer', 'logs:view'), true);
});

test('CRUD de usuários', () => {
  const admin = U.createUser({ username: 'root', password: 'pw', role: 'admin' });
  assert.equal(admin.role, 'admin');
  assert.ok(!admin.password && admin.passwordHash);

  const viewer = U.createUser({ username: 'bob', password: 'pw', role: 'viewer' });
  assert.equal(U.readUsers().length, 2);

  // Duplicado deve falhar
  assert.throws(() => U.createUser({ username: 'ROOT', password: 'x', role: 'viewer' }));

  const upd = U.updateUser(viewer.id, { role: 'editor', displayName: 'Bob' });
  assert.equal(upd.role, 'editor');
  assert.equal(upd.displayName, 'Bob');

  U.changePassword(viewer.id, 'novaSenha');
  const reload = U.findUserById(viewer.id);
  assert.equal(U.verifyPassword('novaSenha', reload.passwordHash), true);

  U.deleteUser(viewer.id);
  assert.equal(U.readUsers().length, 1);
});

test('não remove/desativa o último administrador', () => {
  const admin = U.findUserByUsername('root');
  assert.throws(() => U.deleteUser(admin.id), /último administrador/);
  assert.throws(() => U.updateUser(admin.id, { role: 'viewer' }), /último administrador/);
  assert.throws(() => U.updateUser(admin.id, { active: false }), /último administrador/);
});

test('sessões: criar, listar, autenticar e encerrar', () => {
  const admin = U.findUserByUsername('root');
  const req = { ip: '127.0.0.1', headers: { 'user-agent': 'test' } };
  const token = U.createSession(admin, req);
  assert.ok(token);
  assert.equal(U.listSessions().length, 1);

  const session = U.authenticate({ headers: { authorization: 'Bearer ' + token } });
  assert.equal(session.username, 'root');
  assert.equal(U.authenticate({ headers: { authorization: 'Bearer nope' } }), null);

  assert.equal(U.terminateSession(token), true);
  assert.equal(U.listSessions().length, 0);
});

test('configurações do sistema com defaults', () => {
  const s = U.readSettings();
  assert.equal(s.systemName, 'BrightierOS');
  assert.equal(s.allowRegistration, false); // default desligado
  const updated = U.writeSettings({ maintenanceMode: true, allowRegistration: true });
  assert.equal(updated.maintenanceMode, true);
  assert.equal(updated.allowRegistration, true);
  assert.equal(U.readSettings().allowRegistration, true);
});

test('convites por link: criar, validar, consumir e revogar', () => {
  const inv = U.createInvite({ role: 'admin', createdBy: 'root' });
  assert.ok(inv.token && inv.role === 'admin');
  assert.equal(U.inviteStatus(inv), 'valid');
  // Valida e consome ao criar usuário pelo convite.
  assert.ok(U.validateInvite(inv.token));
  const invited = U.createUser({ username: 'convidado', password: 'pw', role: inv.role });
  U.consumeInvite(inv.token);
  assert.equal(U.inviteStatus(U.getInvite(inv.token)), 'used');
  // Limpa o usuário criado para não afetar o teste de lockout de admin.
  U.deleteUser(invited.id);
  // Revogar.
  assert.equal(U.revokeInvite(inv.token), true);
  assert.equal(U.inviteStatus(U.getInvite(inv.token)), 'revoked');
  // Papel inválido rejeitado.
  assert.throws(() => U.createInvite({ role: 'super' }));
  // Convite inexistente é inválido.
  assert.equal(U.inviteStatus(U.getInvite('naoexiste')), 'invalid');
});

test('logs administrativos', () => {
  U.appendAdminLog({ actor: 'root', action: 'update.force', target: '0.5.0', detail: 'forçado' });
  const logs = U.readAdminLogs();
  assert.ok(logs.length >= 1);
  assert.equal(logs[0].action, 'update.force');
  assert.equal(logs[0].actor, 'root');
});

test('PUT /me atualiza apenas nome de exibição (não papel/ativo)', () => {
  const admin = U.findUserByUsername('root');
  // Simula o patch permitido (displayName); papel/ativo/username não podem ser
  // alterados por esta rota (a proteção anti-lockout do updateUser rejeita).
  const upd = U.updateUser(admin.id, { displayName: 'Administrador' });
  assert.equal(upd.displayName, 'Administrador');
  assert.equal(upd.role, 'admin'); // papel inalterado
  assert.equal(upd.active, true);   // status inalterado
  // Tentar rebaixar o próprio admin via updateUser é bloqueado.
  assert.throws(() => U.updateUser(admin.id, { role: 'viewer' }));
});
