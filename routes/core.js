// routes/core.js
// Rotas estáticas e endpoints principais do BrightierOS.
const fs = require('fs');
const path = require('path');
const si = require('systeminformation');
const os = require('os');
const express = require('express');
const metrics = require('../lib/metrics');
const users = require('../lib/users');

// O static é retornado por express.static(), não use router
const staticMiddleware = express.static(path.join(__dirname, '..', 'public'));

const router = express.Router();

// Console e páginas de erro são servidos sem auth no request HTTP.
// A segurança do console fica no WebSocket (token no querystring).
router.get('/console.html', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'console.html'));
});
router.get('/403.html', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', '403.html'));
});
router.get('/404.html', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', '404.html'));
});
router.get('/500.html', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', '500.html'));
});

// Endpoint stats: fornece informações do sistema (CPU, RAM, GPU, storage).
router.get('/api/stats', async (req, res) => {
  try {
    const [cpuLoad, cpuInfo, mem, graphics, osInfo] = await Promise.all([
      si.currentLoad(),
      si.cpu(),
      si.mem(),
      si.graphics(),
      si.osInfo(),
    ]);
    // fsSize isolado com timeout: a consulta (WMI no Windows) pode pendurar e
    // não pode travar o endpoint de stats (v0.8.0 — correção de robustez).
    let disks = [];
    try {
      disks = await Promise.race([
        si.fsSize(),
        new Promise((r) => setTimeout(() => r([]), 4000)),
      ]);
    } catch { disks = []; }

    // Métricas adicionais (v0.8.0) — isoladas por try/catch para não quebrar o stats.
    let network = null, processes = null, temperature = null;
    try { const n = (await si.networkStats())[0] || {}; network = { rx: Number(((n.rx_sec || 0) / 1024).toFixed(2)), tx: Number(((n.tx_sec || 0) / 1024).toFixed(2)), iface: n.iface || '' }; } catch {}
    try { const p = await si.processes(); processes = { all: p.all, running: p.running, top: (p.list || []).slice(0, 5).map((x) => ({ name: x.name, cpu: Number((x.cpu || 0).toFixed(1)), mem: Number((x.mem || 0).toFixed(1)) })) }; } catch {}
    try { if (typeof si.temperature === 'function') { const t = await Promise.race([si.temperature(), new Promise((r) => setTimeout(() => r(null), 4000))]); const tv = t && (t.main != null ? t.main : t.cpu); temperature = tv != null ? Number(tv.toFixed(1)) : null; } } catch {}

    const stats = {
      time: new Date().toLocaleTimeString('pt-BR'),
      uptime: Math.floor(os.uptime() / 3600) + 'h ' + Math.floor((os.uptime() % 3600) / 60) + 'm',
      os: {
        platform: osInfo.platform,
        distro: osInfo.distro,
        release: osInfo.release,
        arch: osInfo.arch,
        hostname: osInfo.hostname,
      },
      cpu: {
        name: cpuInfo.brand,
        cores: cpuInfo.cores,
        usage: Number(cpuLoad.currentLoad.toFixed(1)),
        load: (Array.isArray(cpuLoad.avgLoad) ? cpuLoad.avgLoad : cpuLoad.cpus?.map(c => c.load) || []).map(Number).map(l => l.toFixed(2)),
      },
      ram: {
        usage: Number(((mem.used / mem.total) * 100).toFixed(1)),
        used: (mem.used / 1024 / 1024 / 1024).toFixed(1),
        total: (mem.total / 1024 / 1024 / 1024).toFixed(1),
      },
      gpu: (graphics.controllers || [])
        .filter((g) => g && g.model && !g.model.toLowerCase().includes('virtual'))
        .map((g) => ({ name: g.model, usage: Number(g.utilizationGpu || 0) })),
      storage: (disks || []).map((d) => ({
        drive: d.fs,
        usage: Number(((d.used / d.size) * 100).toFixed(1)),
        used: (d.used / 1024 / 1024 / 1024).toFixed(1),
        total: (d.size / 1024 / 1024 / 1024).toFixed(1),
      })),
      network,
      processes,
      temperature,
    };

    // Histórico centralizado em lib/metrics.js (compartilhado com o coletor
    // periódico em background). Evita duplicação e race conditions de escrita.
    metrics._internals.record({ time: Date.now(), cpu: stats.cpu.usage, ram: stats.ram.usage });
    const history = metrics.readHistory().slice(-100);

    res.json({ success: true, data: stats, history });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Failed to retrieve system information.' });
  }
});

// Endpoint para histórico de métricas
router.get('/api/metrics/history', (req, res) => {
  try {
    const histFile = path.join(__dirname, '..', 'data', 'metrics-history.json');
    let history = [];
    if (fs.existsSync(histFile)) {
      const content = fs.readFileSync(histFile, 'utf8').trim();
      history = content ? JSON.parse(content) : [];
    }
    res.json({ success: true, data: history });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to read metrics history.' });
  }
});

// Rotas de notificações
const notifications = require('../lib/notifications');

router.get('/api/notifications', (req, res) => {
  res.json({ success: true, data: notifications.list() });
});

router.post('/api/notifications', express.json(), (req, res) => {
  const { type, message, category } = req.body || {};
  if (!type || !message) {
    return res.status(400).json({ success: false, error: 'Type and message required.' });
  }
  const note = notifications.add(type, message, { category });
  res.json({ success: true, data: note });
});

router.post('/api/notifications/:id/read', (req, res) => {
  notifications.markRead(req.params.id);
  res.json({ success: true });
});

// Marca todas as notificações como lidas (v0.8.0)
router.post('/api/notifications/read-all', users.requirePermission(), (req, res) => {
  notifications.markAllRead();
  res.json({ success: true });
});

// Contagem de notificações não lidas (v0.8.0)
router.get('/api/notifications/unread', users.requirePermission(), (req, res) => {
  res.json({ success: true, count: notifications.unreadCount() });
});

// Stream em tempo real via SSE (v0.8.0). EventSource não permite headers
// customizados, então o token vem por querystring (?token=...).
router.get('/api/notifications/stream', (req, res) => {
  const token = (req.query && req.query.token) || '';
  const session = users.sessionFromToken(token);
  if (!session) {
    return res.status(401).json({ success: false, error: 'Não autenticado.' });
  }
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 4000\n\n');
  // Envia as atuais não-lidas ao conectar.
  try {
    notifications.list().filter((n) => !n.read).slice(0, 20).forEach((n) => {
      res.write(`data: ${JSON.stringify(n)}\n\n`);
    });
  } catch (_) {}
  const onAdd = (note) => { try { res.write(`data: ${JSON.stringify(note)}\n\n`); } catch (_) {} };
  const onClear = () => { try { res.write(`event: clear\ndata: {}\n\n`); } catch (_) {} };
  notifications.on('add', onAdd);
  notifications.on('clear', onClear);
  const cleanup = () => { notifications.off('add', onAdd); notifications.off('clear', onClear); };
  req.on('close', cleanup);
  req.on('error', cleanup);
});

router.delete('/api/notifications', (req, res) => {
  notifications.clear();
  res.json({ success: true });
});

// Healthcheck simples (útil para infraestrutura/uptime monitoring)
router.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'ok', uptime: Math.floor(os.uptime()), timestamp: new Date().toISOString() });
});

module.exports = { router, staticMiddleware };