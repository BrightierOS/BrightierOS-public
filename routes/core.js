// routes/core.js
// Rotas estáticas e endpoints principais do BrightierOS.
const fs = require('fs');
const path = require('path');
const si = require('systeminformation');
const os = require('os');
const express = require('express');

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
router.get('/stats', async (req, res) => {
  try {
    const [cpuLoad, cpuInfo, mem, graphics, disks, osInfo] = await Promise.all([
      si.currentLoad(),
      si.cpu(),
      si.mem(),
      si.graphics(),
      si.fsSize(),
      si.osInfo(),
    ]);

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
        load: cpuLoad.avgLoad.map(Number).map(l => l.toFixed(2)),
      },
      ram: {
        usage: Number(((mem.used / mem.total) * 100).toFixed(1)),
        used: (mem.used / 1024 / 1024 / 1024).toFixed(1),
        total: (mem.total / 1024 / 1024 / 1024).toFixed(1),
      },
      gpu: graphics.controllers
        .filter((g) => !g.model.toLowerCase().includes('virtual'))
        .map((g) => ({ name: g.model, usage: Number(g.utilizationGpu || 0) })),
      storage: disks.map((d) => ({
        drive: d.fs,
        usage: Number(((d.used / d.size) * 100).toFixed(1)),
        used: (d.used / 1024 / 1024 / 1024).toFixed(1),
        total: (d.size / 1024 / 1024 / 1024).toFixed(1),
      })),
    };

    // Armazenar histórico (últimos 100 pontos)
    const histFile = path.join(__dirname, '..', 'data', 'metrics-history.json');
    let history = [];
    try {
      if (fs.existsSync(histFile)) {
        history = JSON.parse(fs.readFileSync(histFile, 'utf8'));
      }
    } catch (_) { history = []; }
    history.push({ time: Date.now(), cpu: stats.cpu.usage, ram: stats.ram.usage });
    if (history.length > 100) history = history.slice(-100);
    fs.writeFileSync(histFile, JSON.stringify(history, null, 2));

    res.json({ success: true, data: stats, history });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Failed to retrieve system information.' });
  }
});

// Endpoint para histórico de métricas
router.get('/metrics/history', (req, res) => {
  try {
    const histFile = path.join(__dirname, '..', 'data', 'metrics-history.json');
    const history = fs.existsSync(histFile) 
      ? JSON.parse(fs.readFileSync(histFile, 'utf8')) 
      : [];
    res.json({ success: true, data: history });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to read metrics history.' });
  }
});

// Rotas de notificações
const notifications = require('../lib/notifications');

router.get('/notifications', (req, res) => {
  res.json({ success: true, data: notifications.list() });
});

router.post('/notifications', express.json(), (req, res) => {
  const { type, message } = req.body || {};
  if (!type || !message) {
    return res.status(400).json({ success: false, error: 'Type and message required.' });
  }
  const note = notifications.add(type, message);
  res.json({ success: true, data: note });
});

router.post('/notifications/:id/read', (req, res) => {
  notifications.markRead(req.params.id);
  res.json({ success: true });
});

router.delete('/notifications', (req, res) => {
  notifications.clear();
  res.json({ success: true });
});

module.exports = { router, staticMiddleware };