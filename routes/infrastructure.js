// routes/infrastructure.js
// BrightierOS v0.8.0 — Endpoints de infraestrutura (nós/servidores)
// Base preparada para múltiplos nós e futuras conexões remotas.
const express = require('express');
const infra = require('../lib/infrastructure');
const users = require('../lib/users');
const notifications = require('../lib/notifications');

const router = express.Router();
const requireManage = users.requirePermission('infrastructure:control');

// GET /api/infrastructure/overview — visão geral da infraestrutura
router.get('/overview', users.requirePermission(), (req, res) => {
  try {
    res.json({ success: true, data: infra.overview() });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Falha ao obter visão geral.' });
  }
});

// GET /api/infrastructure/nodes — lista nós/servidores
router.get('/nodes', users.requirePermission(), (req, res) => {
  try {
    res.json({ success: true, data: infra.listNodes() });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Falha ao listar nós.' });
  }
});

// POST /api/infrastructure/nodes — adiciona um nó remoto (admin)
router.post('/nodes', requireManage, express.json(), (req, res) => {
  try {
    const node = infra.addNode(req.body || {});
    users.appendAdminLog({ actor: req.session.username, action: 'infra.node.add', target: node.id, detail: node.name + ' @ ' + node.host });
    notifications.add('info', `Nó "${node.name}" adicionado à infraestrutura.`, { category: 'infrastructure' });
    res.json({ success: true, data: node });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// PUT /api/infrastructure/nodes/:id — atualiza um nó (admin)
router.put('/nodes/:id', requireManage, express.json(), (req, res) => {
  try {
    const node = infra.updateNode(req.params.id, req.body || {});
    users.appendAdminLog({ actor: req.session.username, action: 'infra.node.update', target: req.params.id, detail: JSON.stringify(req.body || {}) });
    res.json({ success: true, data: node });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// DELETE /api/infrastructure/nodes/:id — remove um nó remoto (admin)
router.delete('/nodes/:id', requireManage, (req, res) => {
  try {
    infra.removeNode(req.params.id);
    users.appendAdminLog({ actor: req.session.username, action: 'infra.node.remove', target: req.params.id });
    notifications.add('info', `Nó "${req.params.id}" removido da infraestrutura.`, { category: 'infrastructure' });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
