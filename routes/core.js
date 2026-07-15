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
    const [cpuLoad, cpuInfo, mem, graphics, disks] = await Promise.all([
      si.currentLoad(),
      si.cpu(),
      si.mem(),
      si.graphics(),
      si.fsSize(),
    ]);

    res.json({
      time: new Date().toLocaleTimeString('pt-BR'),
      cpu: {
        name: cpuInfo.brand,
        usage: Number(cpuLoad.currentLoad.toFixed(1)),
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
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Failed to retrieve system information.' });
  }
});

module.exports = { router, staticMiddleware };