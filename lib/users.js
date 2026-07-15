// lib/users.js
// BrightierOS v0.5.0 — Administração
// Modelo de dados compartilhado: usuários (multi-usuário), senhas com hash,
// sessões, papéis/permissões, configurações e logs administrativos.
// Usado por routes/user.js e routes/admin.js.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.BOS_DATA_DIR
  ? path.resolve(process.env.BOS_DATA_DIR)
  : path.join(__dirname, '..', 'data');

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const LEGACY_USER_FILE = path.join(DATA_DIR, 'user.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const ADMIN_LOGS_FILE = path.join(DATA_DIR, 'admin-logs.json');
const INVITES_FILE = path.join(DATA_DIR, 'invites.json');

// ─── Papéis e permissões ────────────────────────────────────────────
const ROLES = ['admin', 'editor', 'viewer'];

const ROLE_PERMISSIONS = {
  admin: ['users:manage', 'roles:view', 'settings:manage', 'logs:view', 'files:all', 'plugins:all', 'store:all'],
  editor: ['roles:view', 'logs:view', 'files:all', 'plugins:all', 'store:all'],
  viewer: ['roles:view', 'logs:view', 'files:read'],
};

const DEFAULT_SETTINGS = {
  systemName: 'BrightierOS',
  theme: 'dark',
  sessionTimeoutMinutes: 1440, // 24h
  allowRegistration: false,
  maintenanceMode: false,
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ─── Senhas (hash com scrypt + salt, usando crypto nativo) ──────────

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false; // não aceita plaintext legado
  const [salt, hash] = stored.split(':');
  const check = crypto.scryptSync(String(password), salt, 64).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
  } catch {
    return false;
  }
}

// ─── Usuários ──────────────────────────────────────────────────────

function migrateLegacyUser() {
  if (fs.existsSync(USERS_FILE)) return;
  if (!fs.existsSync(LEGACY_USER_FILE)) return;
  try {
    const legacy = JSON.parse(fs.readFileSync(LEGACY_USER_FILE, 'utf8'));
    if (legacy && legacy.username) {
      const user = {
        id: legacy.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        username: legacy.username,
        passwordHash: hashPassword(legacy.password || ''),
        role: legacy.role || 'admin',
        displayName: legacy.displayName || legacy.username,
        active: true,
        createdAt: legacy.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastLogin: null,
      };
      fs.writeFileSync(USERS_FILE, JSON.stringify([user], null, 2), 'utf8');
    }
  } catch { /* ignora falha de migração */ }
}

function ensureUsersStore() {
  ensureDataDir();
  migrateLegacyUser();
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]', 'utf8');
}

function readUsers() {
  ensureUsersStore();
  try {
    const c = fs.readFileSync(USERS_FILE, 'utf8').trim();
    return c ? JSON.parse(c) : [];
  } catch {
    return [];
  }
}

function writeUsers(users) {
  ensureDataDir();
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

function sanitizeUser(user) {
  if (!user) return user;
  const { password, passwordHash, ...rest } = user;
  return rest;
}

function findUserById(id) {
  return readUsers().find((u) => u.id === id) || null;
}

function findUserByUsername(username) {
  const lower = String(username).toLowerCase();
  return readUsers().find((u) => u.username.toLowerCase() === lower) || null;
}

function countAdmins() {
  return readUsers().filter((u) => u.role === 'admin').length;
}

function createUser({ username, password, role = 'viewer', displayName }) {
  const users = readUsers();
  if (!username || !password) throw new Error('Usuário e senha são obrigatórios.');
  if (users.some((u) => u.username.toLowerCase() === String(username).toLowerCase())) {
    throw new Error('Usuário já existe.');
  }
  if (!ROLES.includes(role)) throw new Error('Papel inválido.');
  const user = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    username,
    passwordHash: hashPassword(password),
    role,
    displayName: displayName || username,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastLogin: null,
  };
  users.push(user);
  writeUsers(users);
  return user;
}

function updateUser(id, patch = {}) {
  const users = readUsers();
  const idx = users.findIndex((u) => u.id === id);
  if (idx < 0) throw new Error('Usuário não encontrado.');
  const current = users[idx];
  const next = { ...current };
  if (patch.username != null) next.username = String(patch.username).trim();
  if (patch.displayName != null) next.displayName = String(patch.displayName).trim();
  if (patch.role != null) {
    if (!ROLES.includes(patch.role)) throw new Error('Papel inválido.');
    if (current.role === 'admin' && patch.role !== 'admin' && countAdmins() <= 1) {
      throw new Error('Não é possível remover o papel do último administrador.');
    }
    next.role = patch.role;
  }
  if (patch.active != null) {
    next.active = !!patch.active;
    if (!next.active && current.role === 'admin' && countAdmins() <= 1) {
      throw new Error('Não é possível desativar o último administrador.');
    }
  }
  next.updatedAt = new Date().toISOString();
  users[idx] = next;
  writeUsers(users);
  return next;
}

function deleteUser(id) {
  const users = readUsers();
  const user = users.find((u) => u.id === id);
  if (!user) throw new Error('Usuário não encontrado.');
  if (user.role === 'admin' && countAdmins() <= 1) {
    throw new Error('Não é possível remover o último administrador.');
  }
  writeUsers(users.filter((u) => u.id !== id));
  return user;
}

function changePassword(id, newPassword) {
  if (!newPassword || String(newPassword).length < 1) throw new Error('Senha inválida.');
  const users = readUsers();
  const idx = users.findIndex((u) => u.id === id);
  if (idx < 0) throw new Error('Usuário não encontrado.');
  users[idx] = { ...users[idx], passwordHash: hashPassword(newPassword), updatedAt: new Date().toISOString() };
  writeUsers(users);
  return users[idx];
}

function hasPermission(role, perm) {
  const perms = ROLE_PERMISSIONS[role] || [];
  return perms.includes('*') || perms.includes(perm);
}

// ─── Sessões ───────────────────────────────────────────────────────

function ensureSessionsStore() {
  ensureDataDir();
  if (!fs.existsSync(SESSIONS_FILE)) fs.writeFileSync(SESSIONS_FILE, '[]', 'utf8');
}

function readSessions() {
  ensureSessionsStore();
  try {
    const c = fs.readFileSync(SESSIONS_FILE, 'utf8').trim();
    return c ? JSON.parse(c) : [];
  } catch {
    return [];
  }
}

function writeSessions(sessions) {
  ensureDataDir();
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf8');
}

function createSession(user, req) {
  const token = crypto.randomBytes(24).toString('hex');
  const sessions = readSessions();
  sessions.push({
    id: token,
    userId: user.id,
    username: user.username,
    role: user.role,
    createdAt: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    ip: (req && req.ip) || '',
    userAgent: (req && req.headers && req.headers['user-agent']) || '',
  });
  writeSessions(sessions);
  return token;
}

function getSession(token) {
  return readSessions().find((s) => s.id === token) || null;
}

function touchSession(token) {
  const sessions = readSessions();
  const s = sessions.find((z) => z.id === token);
  if (s) {
    s.lastSeen = new Date().toISOString();
    writeSessions(sessions);
  }
}

function terminateSession(idOrToken) {
  const sessions = readSessions();
  const i = sessions.findIndex((z) => z.id === idOrToken);
  if (i >= 0) {
    sessions.splice(i, 1);
    writeSessions(sessions);
    return true;
  }
  return false;
}

function listSessions() {
  return readSessions().sort((a, b) => String(b.lastSeen).localeCompare(String(a.lastSeen)));
}

// ─── Autenticação (token Bearer) ───────────────────────────────────

function authenticate(req) {
  const header = (req && req.headers && req.headers['authorization']) || '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const session = getSession(m[1]);
  if (!session) return null;
  touchSession(m[1]);
  return session;
}

// Valida um token (string) e retorna a sessão, ou null. Usado por canais que não
// passam por middleware HTTP (ex.: WebSocket do terminal).
function sessionFromToken(token) {
  if (!token) return null;
  const session = getSession(String(token));
  if (!session) return null;
  touchSession(String(token));
  return session;
}

function requirePermission(perm) {
  return (req, res, next) => {
    const session = authenticate(req);
    if (!session) {
      return res.status(401).json({ success: false, error: 'Não autenticado.' });
    }
    if (perm && !hasPermission(session.role, perm)) {
      return res.status(403).json({ success: false, error: 'Sem permissão para esta ação.' });
    }
    req.session = session;
    next();
  };
}

// ─── Configurações do sistema ──────────────────────────────────────

function readSettings() {
  ensureDataDir();
  try {
    const c = fs.readFileSync(SETTINGS_FILE, 'utf8').trim();
    return { ...DEFAULT_SETTINGS, ...(c ? JSON.parse(c) : {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function writeSettings(patch = {}) {
  const settings = { ...readSettings(), ...patch, updatedAt: new Date().toISOString() };
  ensureDataDir();
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
  return settings;
}

// ─── Logs administrativos (auditoria) ──────────────────────────────

function ensureAdminLogsStore() {
  ensureDataDir();
  if (!fs.existsSync(ADMIN_LOGS_FILE)) fs.writeFileSync(ADMIN_LOGS_FILE, '[]', 'utf8');
}

function readAdminLogs() {
  ensureAdminLogsStore();
  try {
    const c = fs.readFileSync(ADMIN_LOGS_FILE, 'utf8').trim();
    return c ? JSON.parse(c) : [];
  } catch {
    return [];
  }
}

function appendAdminLog(entry = {}) {
  ensureAdminLogsStore();
  const logs = readAdminLogs();
  logs.unshift({
    actor: entry.actor || null,
    action: entry.action || 'unknown',
    target: entry.target || null,
    detail: entry.detail || null,
    timestamp: new Date().toISOString(),
  });
  if (logs.length > 200) logs.length = 200;
  fs.writeFileSync(ADMIN_LOGS_FILE, JSON.stringify(logs, null, 2), 'utf8');
}

// ─── Convites por link (convidar como admin ou viewer) ───────────────

const INVITE_ROLES = ['admin', 'viewer'];
const INVITE_DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

function ensureInvitesStore() {
  ensureDataDir();
  if (!fs.existsSync(INVITES_FILE)) fs.writeFileSync(INVITES_FILE, '[]', 'utf8');
}

function readInvites() {
  ensureInvitesStore();
  try {
    const c = fs.readFileSync(INVITES_FILE, 'utf8').trim();
    return c ? JSON.parse(c) : [];
  } catch {
    return [];
  }
}

function writeInvites(invites) {
  ensureDataDir();
  fs.writeFileSync(INVITES_FILE, JSON.stringify(invites, null, 2), 'utf8');
}

function createInvite({ role = 'viewer', createdBy = null, maxUses = 1, expiresInMs = INVITE_DEFAULT_TTL_MS } = {}) {
  if (!INVITE_ROLES.includes(role)) throw new Error('Papel de convite inválido (use admin ou viewer).');
  const token = crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  const invite = {
    token,
    role,
    createdBy,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + (expiresInMs || INVITE_DEFAULT_TTL_MS)).toISOString(),
    maxUses: Math.max(1, Number(maxUses) || 1),
    uses: 0,
    revoked: false,
  };
  const invites = readInvites();
  invites.unshift(invite);
  writeInvites(invites);
  return invite;
}

function getInvite(token) {
  if (!token) return null;
  return readInvites().find((i) => i.token === token) || null;
}

function inviteStatus(invite) {
  if (!invite) return 'invalid';
  if (invite.revoked) return 'revoked';
  if (invite.uses >= invite.maxUses) return 'used';
  if (invite.expiresAt && Date.now() > new Date(invite.expiresAt).getTime()) return 'expired';
  return 'valid';
}

function validateInvite(token) {
  const invite = getInvite(token);
  const status = inviteStatus(invite);
  if (status === 'invalid') throw new Error('Convite inválido.');
  if (status === 'revoked') throw new Error('Convite revogado.');
  if (status === 'used') throw new Error('Convite já foi usado.');
  if (status === 'expired') throw new Error('Convite expirado.');
  return invite;
}

function consumeInvite(token) {
  const invites = readInvites();
  const invite = invites.find((i) => i.token === token);
  if (!invite) return null;
  invite.uses += 1;
  writeInvites(invites);
  return invite;
}

function revokeInvite(token) {
  const invites = readInvites();
  const invite = invites.find((i) => i.token === token);
  if (!invite) return false;
  invite.revoked = true;
  writeInvites(invites);
  return true;
}

function listInvites() {
  return readInvites().map((i) => ({ ...i, status: inviteStatus(i) }));
}

module.exports = {
  DATA_DIR,
  ROLES,
  ROLE_PERMISSIONS,
  DEFAULT_SETTINGS,
  hashPassword,
  verifyPassword,
  readUsers,
  writeUsers,
  sanitizeUser,
  findUserById,
  findUserByUsername,
  countAdmins,
  createUser,
  updateUser,
  deleteUser,
  changePassword,
  hasPermission,
  createSession,
  getSession,
  touchSession,
  terminateSession,
  listSessions,
  authenticate,
  sessionFromToken,
  requirePermission,
  readSettings,
  writeSettings,
  readAdminLogs,
  appendAdminLog,
  createInvite,
  getInvite,
  validateInvite,
  consumeInvite,
  revokeInvite,
  listInvites,
  inviteStatus,
};
