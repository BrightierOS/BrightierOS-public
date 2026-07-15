const express = require('express');
const fs = require('fs');
const users = require('../lib/users');

const router = express.Router();

// GET /api/users/setup — informa se já existe usuário configurado
router.get('/setup', (req, res) => {
  try {
    const all = users.readUsers();
    res.json({
      success: true,
      configured: all.length > 0,
      user: all.length ? users.sanitizeUser(all[0]) : null,
      allowRegistration: users.readSettings().allowRegistration,
    });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Falha ao verificar configuração.' });
  }
});

// GET /api/users/list — lista usuários (users:manage)
router.get('/list', users.requirePermission('users:manage'), (req, res) => {
  try {
    res.json(users.readUsers().map(users.sanitizeUser));
  } catch (e) {
    res.status(500).json({ success: false, error: 'Falha ao listar usuários.' });
  }
});

// GET /api/users/me — usuário da sessão atual
router.get('/me', users.requirePermission(), (req, res) => {
  try {
    const u = users.findUserById(req.session.userId);
    res.json({ success: true, user: users.sanitizeUser(u) });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Falha ao obter usuário.' });
  }
});

// PUT /api/users/me — atualiza apenas o próprio perfil (displayName)
router.put('/me', users.requirePermission(), (req, res) => {
  try {
    const patch = req.body || {};
    const allowed = {};
    if (patch.displayName != null) allowed.displayName = String(patch.displayName).trim();
    // Não permitimos ao próprio usuário alterar role/active/username por aqui.
    const updated = users.updateUser(req.session.userId, allowed);
    users.appendAdminLog({
      actor: req.session.username,
      action: 'profile.update',
      target: req.session.username,
      detail: 'perfil próprio',
    });
    res.json({ success: true, user: users.sanitizeUser(updated) });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// GET /api/users/roles — papéis e permissões (roles:view)
router.get('/roles', users.requirePermission('roles:view'), (req, res) => {
  res.json({ success: true, roles: users.ROLES, permissions: users.ROLE_PERMISSIONS });
});

// GET /api/users/sessions — sessões ativas (users:manage)
router.get('/sessions', users.requirePermission('users:manage'), (req, res) => {
  res.json({ success: true, sessions: users.listSessions() });
});

// POST /api/users/login
router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Usuário e senha são obrigatórios.' });
    }
    const user = users.findUserByUsername(username);
    if (!user || !user.active || !users.verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ success: false, error: 'Credenciais inválidas.' });
    }
    users.updateUser(user.id, { lastLogin: new Date().toISOString() });
    const token = users.createSession(user, req);
    res.json({ success: true, user: users.sanitizeUser(user), token });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Falha ao entrar.' });
  }
});

// POST /api/users/logout — encerra a sessão atual
router.post('/logout', users.requirePermission(), (req, res) => {
  try {
    users.terminateSession(req.session.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Falha ao sair.' });
  }
});

// POST /api/users/create — cria usuário (setup inicial sem auth; depois requer permissão)
router.post('/create', (req, res) => {
  try {
    const existing = users.readUsers();
    const body = req.body || {};

    // Primeira execução: cria o administrador inicial (Setup).
    if (existing.length === 0) {
      const user = users.createUser({ username: body.username, password: body.password, role: 'admin', displayName: body.displayName });
      users.appendAdminLog({ actor: null, action: 'user.create', target: user.username, detail: 'setup inicial (admin)' });
      return res.json({ success: true, user: users.sanitizeUser(user) });
    }

    const session = users.authenticate(req);
    const settings = users.readSettings();

    // Cadastro público (Signup) quando permitido e sem autenticação: papel 'viewer'.
    if (!session && settings.allowRegistration) {
      const user = users.createUser({ username: body.username, password: body.password, role: 'viewer', displayName: body.displayName });
      users.appendAdminLog({ actor: null, action: 'user.create', target: user.username, detail: 'signup público (viewer)' });
      return res.json({ success: true, user: users.sanitizeUser(user) });
    }

    // Admin cria usuário manualmente.
    if (!session) return res.status(401).json({ success: false, error: 'Não autenticado.' });
    if (!users.hasPermission(session.role, 'users:manage')) {
      return res.status(403).json({ success: false, error: 'Sem permissão.' });
    }
    const user = users.createUser({ username: body.username, password: body.password, role: body.role || 'viewer', displayName: body.displayName });
    users.appendAdminLog({ actor: session.username, action: 'user.create', target: user.username, detail: `papel=${user.role}` });
    return res.json({ success: true, user: users.sanitizeUser(user) });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});



// DELETE /api/users/sessions/:id — encerra sessão (própria ou users:manage)
router.delete('/sessions/:id', users.requirePermission(), (req, res) => {
  try {
    const id = req.params.id;
    const isOwn = req.session && req.session.id === id;
    if (!isOwn && !users.hasPermission(req.session.role, 'users:manage')) {
      return res.status(403).json({ success: false, error: 'Sem permissão.' });
    }
    const ok = users.terminateSession(id);
    users.appendAdminLog({
      actor: req.session.username,
      action: 'session.terminate',
      target: id,
      detail: isOwn ? 'própria' : 'de terceiro',
    });
    res.json({ success: ok });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Falha ao encerrar sessão.' });
  }
});

// GET /api/users/:id — detalhe (users:manage)
router.get('/:id', users.requirePermission('users:manage'), (req, res) => {
  try {
    const u = users.findUserById(req.params.id);
    if (!u) return res.status(404).json({ success: false, error: 'Usuário não encontrado.' });
    res.json({ success: true, user: users.sanitizeUser(u) });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Falha ao obter usuário.' });
  }
});

// PUT /api/users/:id — edita usuário (users:manage)
router.put('/:id', users.requirePermission('users:manage'), (req, res) => {
  try {
    const updated = users.updateUser(req.params.id, req.body || {});
    users.appendAdminLog({
      actor: req.session.username,
      action: 'user.update',
      target: updated.username,
      detail: JSON.stringify(req.body || {}),
    });
    res.json({ success: true, user: users.sanitizeUser(updated) });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// DELETE /api/users/:id — remove usuário (users:manage)
router.delete('/:id', users.requirePermission('users:manage'), (req, res) => {
  try {
    const u = users.deleteUser(req.params.id);
    users.appendAdminLog({ actor: req.session.username, action: 'user.delete', target: u.username });
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// POST /api/users/:id/password — altera senha (própria ou users:manage)
router.post('/:id/password', users.requirePermission(), (req, res) => {
  try {
    const { password } = req.body || {};
    const isOwn = req.session.userId === req.params.id;
    if (!isOwn && !users.hasPermission(req.session.role, 'users:manage')) {
      return res.status(403).json({ success: false, error: 'Sem permissão.' });
    }
    users.changePassword(req.params.id, password);
    users.appendAdminLog({ actor: req.session.username, action: 'user.password', target: req.params.id });
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// Reset de sistema (mantido): apaga todo o diretório de dados.
router.post('/reset', (req, res) => {
  if (req.headers['x-confirmed-reset'] !== 'true') {
    return res.status(403).json({ success: false, error: 'Reset não confirmado.' });
  }
  try {
    const dataDir = users.DATA_DIR;
    if (fs.existsSync(dataDir)) fs.rmSync(dataDir, { recursive: true, force: true });
    fs.mkdirSync(dataDir, { recursive: true });
    res.json({ success: true, message: 'Sistema resetado.' });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Falha ao resetar.' });
  }
});

module.exports = router;
