// routes/metrics.js
// BrightierOS v0.8.0 — Endpoints de métricas e histórico
// Mantém compatibilidade: /api/stats e /api/metrics/history (em core.js) continuam.
const express = require('express');
const os = require('os');
const si = require('systeminformation');
const metrics = require('../lib/metrics');
const users = require('../lib/users');
const notifications = require('../lib/notifications');

const router = express.Router();
const requireAdmin = users.requirePermission('services:control');

// GET /api/metrics/current — snapshot ao vivo (CPU/RAM/Disk/Net/Temp/Processes/Uptime)
router.get('/current', users.requirePermission(), async (req, res) => {
  try {
    const point = await metrics.snapshot();

    let processes = null;
    try {
      const p = await si.processes();
      processes = { all: p.all, running: p.running, sleeping: p.sleeping, list: (p.list || []).slice(0, 10).map((x) => ({ name: x.name, pid: x.pid, cpu: Number((x.cpu || 0).toFixed(1)), mem: Number((x.mem || 0).toFixed(1)) })) };
    } catch { processes = null; }

    let netIfaces = [];
    try { netIfaces = (await si.networkInterfaces()).map((i) => ({ iface: i.iface, ip4: i.ip4, type: i.type })); } catch {}

    res.json({
      success: true,
      data: {
        ...point,
        uptime: Math.floor(os.uptime()),
        uptimeFormatted: Math.floor(os.uptime() / 3600) + 'h ' + Math.floor((os.uptime() % 3600) / 60) + 'm',
        loadAverage: os.loadavg(),
        processes,
        networkInterfaces: netIfaces,
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
      },
    });
  } catch (err) {
    users.appendAdminLog({ action: 'error.internal', detail: 'metrics.current: ' + (err && err.message) });
    res.status(500).json({ success: false, error: 'Falha ao coletar métricas.' });
  }
});

// GET /api/metrics/history?limit=100 — histórico registrado periodicamente
router.get('/history', users.requirePermission(), (req, res) => {
  try {
    const limit = Math.max(1, Math.min(1000, Number(req.query.limit) || 100));
    const history = metrics.readHistory().slice(-limit);
    res.json({ success: true, data: history });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Falha ao ler histórico.' });
  }
});

// GET /api/metrics/summary?limit=100 — agregados (média/máx/mín) p/ futuras estatísticas
router.get('/summary', users.requirePermission(), (req, res) => {
  try {
    const limit = Math.max(1, Math.min(1000, Number(req.query.limit) || 100));
    res.json({ success: true, data: metrics.summary(limit) });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Falha ao calcular resumo.' });
  }
});

// DELETE /api/metrics/history — limpa o histórico (admin)
router.delete('/history', requireAdmin, (req, res) => {
  try {
    metrics.clearHistory();
    users.appendAdminLog({ actor: req.session.username, action: 'metrics.clear', detail: 'histórico de métricas limpo' });
    notifications.add('info', 'Histórico de métricas foi limpo.', { category: 'system' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Falha ao limpar histórico.' });
  }
});

module.exports = router;
