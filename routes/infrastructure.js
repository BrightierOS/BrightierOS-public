// routes/infrastructure.js
// BrightierOS v0.8.2.3 — Endpoints de infraestrutura (nós/servidores)
// CRUD de nós + verificação de conectividade (healthcheck via /api/health).
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

// POST /api/infrastructure/nodes — adiciona um nó remoto (admin). v0.8.2: testa
// a conectividade imediatamente após adicionar e retorna o status real.
router.post('/nodes', requireManage, express.json(), async (req, res) => {
  try {
    const node = infra.addNode(req.body || {});
    let checked = node;
    try { checked = await infra.checkNode(node.id); } catch (_) {}
    users.appendAdminLog({ actor: req.session.username, action: 'infra.node.add', target: node.id, detail: node.name + ' @ ' + node.host + ' → ' + checked.status });
    notifications.add(checked.status === 'online' ? 'ok' : 'warn', `Nó "${node.name}" adicionado (${checked.status}).`, { category: 'infrastructure' });
    res.json({ success: true, data: checked });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/infrastructure/nodes/check — testa a conectividade de todos os nós (admin)
router.post('/nodes/check', requireManage, async (req, res) => {
  try {
    const nodes = await infra.checkAllNodes();
    users.appendAdminLog({ actor: req.session.username, action: 'infra.node.checkAll', detail: nodes.length + ' nós verificados' });
    res.json({ success: true, data: nodes });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Falha ao verificar nós.' });
  }
});

// POST /api/infrastructure/nodes/:id/check — testa a conectividade de um nó (admin)
router.post('/nodes/:id/check', requireManage, async (req, res) => {
  try {
    const node = await infra.checkNode(req.params.id);
    users.appendAdminLog({ actor: req.session.username, action: 'infra.node.check', target: req.params.id, detail: node.status });
    // v0.8.2.3: trata os 3 estados (local/online/offline). Antes a notificação
    // usava `=== 'online' ? 'online' : 'offline'`, o que rotulava o nó LOCAL
    // (status 'local') como "offline" — contradizendo o toast que dizia
    // "local (ativo)". Agora a notificação bate com o toast.
    const label = node.status === 'local' ? 'local (ativo)' : (node.status === 'online' ? 'online' : 'offline');
    const type = node.status === 'offline' ? 'warn' : 'ok';
    notifications.add(type, `Nó "${node.name || req.params.id}" ${label}.`, { category: 'infrastructure' });
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
