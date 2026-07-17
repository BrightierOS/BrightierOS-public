// lib/data-utils.js
// BrightierOS — shared helpers for DATA_DIR resolution, safe path joining,
// JSON file persistence, small HTTP/validation utilities, and launcher restart
// flag writing. Used by routes and lib modules to avoid duplication.

const fs = require('fs');
const path = require('path');

// DATA_DIR can be overridden via BOS_DATA_DIR (useful for tests).
const DATA_DIR = process.env.BOS_DATA_DIR
  ? path.resolve(process.env.BOS_DATA_DIR)
  : path.join(__dirname, '..', 'data');

function getDataDir() {
  return DATA_DIR;
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Resolve a path strictly inside DATA_DIR.
 * Throws "Access denied." if any component tries to escape DATA_DIR.
 */
function resolveDataPath(...parts) {
  for (const p of parts) {
    if (typeof p !== 'string') {
      throw new Error('Invalid path component: expected string.');
    }
    if (p.includes('\0')) {
      throw new Error('Invalid path component: null byte.');
    }
  }
  const resolved = path.resolve(DATA_DIR, ...parts);
  const prefix = DATA_DIR.endsWith(path.sep) ? DATA_DIR : DATA_DIR + path.sep;
  if (resolved !== DATA_DIR && !resolved.startsWith(prefix)) {
    throw new Error('Access denied.');
  }
  return resolved;
}

function ensureJsonFile(filePath, defaultContent = '[]') {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, defaultContent, 'utf8');
  }
}

function readJsonFile(filePath, defaultValue = null) {
  if (!fs.existsSync(filePath)) {
    return defaultValue;
  }
  try {
    const c = fs.readFileSync(filePath, 'utf8').trim();
    return c ? JSON.parse(c) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function writeJsonFile(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function isValidSimpleId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9._-]+$/.test(id) && id !== '.' && id !== '..';
}

// ─── Small HTTP response helpers ────────────────────────────────────────────

function successResponse(res, data) {
  if (data !== undefined) {
    return res.json({ success: true, data });
  }
  return res.json({ success: true });
}

function errorResponse(res, status, message) {
  return res.status(status).json({ success: false, error: message });
}

// ─── Launcher restart flag ──────────────────────────────────────────────────
// Exit code understood by bOS.bat / bOS.sh as "restart the BrightierOS server".

const RESTART_EXIT_CODE = 65;

function writeRestartFlag(opts = {}) {
  const payload = {
    at: new Date().toISOString(),
    reason: opts.reason || 'manual',
    from: opts.from || 'admin',
    actor: opts.actor || null,
    to: opts.to || null,
    backupId: opts.backupId || null,
    plugins: opts.plugins || null,
    message: opts.message || null,
  };
  try {
    ensureDataDir();
    fs.writeFileSync(
      path.join(DATA_DIR, '.bos-restart'),
      JSON.stringify(payload, null, 2),
      'utf8'
    );
  } catch (_) {
    // flag is diagnostic; failures are ignored
  }
}

module.exports = {
  DATA_DIR,
  getDataDir,
  ensureDataDir,
  resolveDataPath,
  ensureJsonFile,
  readJsonFile,
  writeJsonFile,
  isValidSimpleId,
  successResponse,
  errorResponse,
  writeRestartFlag,
  RESTART_EXIT_CODE,
};
