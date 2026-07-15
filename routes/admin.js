const express = require('express');
const users = require('../lib/users');

const router = express.Router();

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

module.exports = router;
