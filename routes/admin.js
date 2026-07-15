const express = require('express');
const fs = require('fs');
const path = require('path');
const users = require('../lib/users');

const router = express.Router();

// DATA_DIR sobrescritível por teste (BOS_DATA_DIR) sem afetar produção.
const DATA_DIR = process.env.BOS_DATA_DIR
  ? path.resolve(process.env.BOS_DATA_DIR)
  : path.join(__dirname, '..', 'data');

// Código de saída que o launcher (bOS.bat / bOS.sh) entende como "reinicie o
// servidor BrightierOS" (não o sistema operacional).
const RESTART_EXIT_CODE = 65;

// Solicita ao launcher que reinicie o servidor BrightierOS.
function requestBosRestart(res, reason) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(DATA_DIR, '.bos-restart'),
      JSON.stringify({ at: new Date().toISOString(), reason: reason || 'manual', from: 'admin' }, null, 2),
      'utf8'
    );
  } catch (_) { /* flag é diagnóstico; falha é ignorada */ }
  res.json({ success: true, restarted: true, message: 'Reiniciando o BrightierOS...' });
  res.on('finish', () => process.exit(RESTART_EXIT_CODE));
}

// GET /api/admin/settings — configurações do sistema (settings:manage)
router.get('/settings', users.requirePermission('settings:manage'), (req, res) => {
  try {
    res.json({ success: true, settings: users.readSettings() });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Falha ao ler configurações.' });
  }
});

// PUT /api/admin/settings — atualiza configurações (settings:manage)
router.put('/settings', users.requirePermission('settings:manage'), (req, res) => {
  try {
    const settings = users.writeSettings(req.body || {});
    users.appendAdminLog({
      actor: req.session.username,
      action: 'settings.update',
      target: null,
      detail: JSON.stringify(req.body || {}),
    });
    res.json({ success: true, settings });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Falha ao salvar configurações.' });
  }
});

// GET /api/admin/logs — logs administrativos (logs:view)
router.get('/logs', users.requirePermission('logs:view'), (req, res) => {
  try {
    res.json({ success: true, logs: users.readAdminLogs() });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Falha ao ler logs.' });
  }
});

// POST /api/admin/restart — reinicia APENAS o servidor BrightierOS (não o SO).
// Só admin. O launcher detecta o código de saída e reinicia o processo.
router.post('/restart', users.requirePermission('users:manage'), (req, res) => {
  try {
    users.appendAdminLog({
      actor: req.session.username,
      action: 'system.restart',
      target: null,
      detail: 'reinício manual do BrightierOS solicitado',
    });
  } catch (_) { /* log não é crítico */ }
  requestBosRestart(res, 'manual');
});

module.exports = router;
