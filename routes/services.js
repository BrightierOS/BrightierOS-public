// routes/services.js
// BrightierOS v0.8.0 — Gerenciamento de serviços
const express = require('express');
const fs = require('fs');
const path = require('path');
const services = require('../lib/services');
const users = require('../lib/users');
const notifications = require('../lib/notifications');

const router = express.Router();
const requireControl = users.requirePermission('services:control');
const requireView = users.requirePermission('logs:view');

const DATA_DIR = users.DATA_DIR;
const RESTART_EXIT_CODE = 65;

// Reinício do próprio BrightierOS delegado ao launcher (mesmo mecanismo do admin).
function requestBosRestart(res, reason, actor) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(DATA_DIR, '.bos-restart'),
      JSON.stringify({ at: new Date().toISOString(), reason: reason || 'service.restart', from: 'services', actor }, null, 2),
      'utf8'
    );
  } catch (_) {}
  res.json({ success: true, restarted: true, message: 'Reiniciando o BrightierOS...' });
  res.on('finish', () => process.exit(RESTART_EXIT_CODE));
}

// GET /api/services — lista serviços
router.get('/', users.requirePermission(), async (req, res) => {
  try {
    const list = await services.listServices();
    res.json({ success: true, data: list });
  } catch (err) {
    users.appendAdminLog({ action: 'error.internal', detail: 'services.list: ' + (err && err.message) });
    res.status(500).json({ success: false, error: 'Falha ao listar serviços.' });
  }
});

// GET /api/services/:id — status de um serviço
router.get('/:id', users.requirePermission(), async (req, res) => {
  try {
    const status = await services.serviceStatus(req.params.id);
    res.json({ success: true, data: status });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Falha ao obter status.' });
  }
});

// GET /api/services/:id/logs?lines= — logs do serviço
router.get('/:id/logs', requireView, async (req, res) => {
  try {
    const lines = Number(req.query.lines) || 100;
    const logs = await services.serviceLogs(req.params.id, lines);
    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Falha ao ler logs.' });
  }
});

// POST /api/services/:id/start — inicia serviço (admin)
router.post('/:id/start', requireControl, express.json(), async (req, res) => {
  try {
    const r = await services.startService(req.params.id);
    users.appendAdminLog({ actor: req.session.username, action: 'service.start', target: req.params.id, detail: r.message });
    if (r.ok) notifications.add('ok', `Serviço "${req.params.id}" iniciado.`, { category: 'service' });
    else notifications.add('warn', `Falha ao iniciar "${req.params.id}": ${r.message}`, { category: 'service' });
    res.json({ success: r.ok, message: r.message });
  } catch (err) {
    users.appendAdminLog({ actor: req.session.username, action: 'service.start.fail', target: req.params.id, detail: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/services/:id/stop — para serviço (admin)
router.post('/:id/stop', requireControl, express.json(), async (req, res) => {
  try {
    const r = await services.stopService(req.params.id);
    users.appendAdminLog({ actor: req.session.username, action: 'service.stop', target: req.params.id, detail: r.message });
    if (r.ok) notifications.add('ok', `Serviço "${req.params.id}" parado.`, { category: 'service' });
    else notifications.add('warn', `Falha ao parar "${req.params.id}": ${r.message}`, { category: 'service' });
    res.json({ success: r.ok, message: r.message });
  } catch (err) {
    users.appendAdminLog({ actor: req.session.username, action: 'service.stop.fail', target: req.params.id, detail: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/services/:id/restart — reinicia serviço (admin)
router.post('/:id/restart', requireControl, express.json(), async (req, res) => {
  try {
    const r = await services.restartService(req.params.id);
    // O BrightierOS delega o reinício ao launcher.
    if (r.delegate) {
      users.appendAdminLog({ actor: req.session.username, action: 'service.restart', target: req.params.id, detail: 'reinício do BrightierOS' });
      notifications.add('info', 'Reiniciando o BrightierOS...', { category: 'service' });
      return requestBosRestart(res, 'service.restart', req.session.username);
    }
    users.appendAdminLog({ actor: req.session.username, action: 'service.restart', target: req.params.id, detail: r.message });
    if (r.ok) notifications.add('ok', `Serviço "${req.params.id}" reiniciado.`, { category: 'service' });
    else notifications.add('warn', `Falha ao reiniciar "${req.params.id}": ${r.message}`, { category: 'service' });
    res.json({ success: r.ok, message: r.message });
  } catch (err) {
    users.appendAdminLog({ actor: req.session.username, action: 'service.restart.fail', target: req.params.id, detail: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
