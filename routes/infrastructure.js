// routes/infrastructure.js
// BrightierOS v0.8.2.3 — Endpoints de infraestrutura (nós/servidores)
// CRUD de nós + verificação de conectividade (healthcheck via /api/health).
const express = require('express');
const infra = require('../lib/infrastructure');
const users = require('../lib/users');
const notifications = require('../lib/notifications');

const router = express.Router();
const requireManage = users.requirePermission('infrastructure:control');

// v0.8.3 — proxy de arquivos para nós remotos
const { Readable } = require('stream');
const PROXY_MAX_BYTES = 200 * 1024 * 1024; // 200 MB por upload via proxy

// Lê o corpo bruto (multipart/outros) em buffer para reenviar ao nó remoto.
function readRawBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let done = false;
    req.on('data', (c) => {
      if (done) return;
      size += c.length;
      if (size > maxBytes) { done = true; req.destroy(); reject(new Error('Corpo da requisição excede o limite (' + Math.round(maxBytes / 1024 / 1024) + 'MB).')); return; }
      chunks.push(c);
    });
    req.on('end', () => { if (!done) { done = true; resolve(Buffer.concat(chunks)); } });
    req.on('error', (e) => { if (!done) { done = true; reject(e); } });
  });
}

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

// ─── Credenciais para acesso a arquivos remotos (v0.8.3) ────────────
// GET /api/infrastructure/nodes/:id/credentials — indica se há credenciais (admin)
router.get('/nodes/:id/credentials', requireManage, (req, res) => {
  res.json({ success: true, configured: infra.hasNodeCredentials(req.params.id) });
});

// POST /api/infrastructure/nodes/:id/credentials — define credenciais (admin).
// v0.8.3.1: após salvar, testa se o nó é compatível (GET files/list raiz) e
// retorna `compatible` para a UI avisar o usuário imediatamente.
router.post('/nodes/:id/credentials', requireManage, express.json(), async (req, res) => {
  try {
    infra.setNodeCredentials(req.params.id, req.body || {});
    users.appendAdminLog({ actor: req.session.username, action: 'infra.node.credentials', target: req.params.id, detail: 'credenciais definidas' });
    let compatible = null, compatError = null;
    try {
      const node = infra.findNode(req.params.id);
      const r = await infra.remoteProxy(node, 'files/list', { method: 'GET', query: { path: '' } });
      compatible = r.ok; // 200 = compatível; 404/outros = incompatível
      if (!compatible && r.status === 404) compatError = 'O nó não expõe /api/files/* (não é um BrightierOS compatível).';
    } catch (e) { compatError = e.message; }
    res.json({ success: true, compatible, compatError });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// DELETE /api/infrastructure/nodes/:id/credentials — remove credenciais (admin)
router.delete('/nodes/:id/credentials', requireManage, (req, res) => {
  try {
    infra.clearNodeCredentials(req.params.id);
    users.appendAdminLog({ actor: req.session.username, action: 'infra.node.credentials.clear', target: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ─── Proxy de arquivos para nós remotos (v0.8.3) ────────────────────
// Encaminha /api/files/* do nó remoto para o cliente, autenticando no remoto com
// as credenciais configuradas. Permissão local por método: GET/HEAD = files:read,
// demais = files:all. Restrito a files/* por segurança (não expõe outras APIs).
router.use('/nodes/:id/proxy', (req, res, next) => {
  const perm = (req.method === 'GET' || req.method === 'HEAD') ? 'files:read' : 'files:all';
  users.requirePermission(perm)(req, res, next);
}, async (req, res) => {
  const id = req.params.id;
  try {
    if (id === infra.LOCAL_NODE_ID) return res.status(400).json({ success: false, error: 'Use os endpoints locais para o nó local.' });
    const node = infra.findNode(id);
    if (!node) return res.status(404).json({ success: false, error: 'Nó não encontrado.' });
    if (node.kind !== 'remote') return res.status(400).json({ success: false, error: 'Proxy disponível apenas para nós remotos.' });
    // req.path aqui é o resto após /proxy (ex.: /files/list)
    const remPath = String(req.path || '').replace(/^\/+/, '');
    if (!remPath.startsWith('files/')) return res.status(403).json({ success: false, error: 'Proxy restrito a /files/*.' });
    if (!infra.hasNodeCredentials(id)) return res.status(400).json({ success: false, error: 'Credenciais não configuradas para este nó. Configure-as na página de Infraestrutura.' });

    // Corpo: JSON já parseado -> reenvia como JSON; multipart/outros -> buffer bruto.
    const ct = (req.headers['content-type'] || '').toLowerCase();
    let body, headers = {};
    if (req.method === 'GET' || req.method === 'HEAD') {
      body = undefined;
    } else if (ct.includes('application/json')) {
      body = Buffer.from(JSON.stringify(req.body ?? {}));
      headers['content-type'] = 'application/json';
      headers['content-length'] = String(body.length);
    } else {
      body = await readRawBody(req, PROXY_MAX_BYTES);
      headers['content-type'] = req.headers['content-type'] || 'application/octet-stream';
      headers['content-length'] = String(body.length);
    }

    const remoteRes = await infra.remoteProxy(node, remPath, { method: req.method, query: req.query, headers, body });

    // v0.8.3.1: traduz um 404 do remoto numa mensagem útil. O proxy só funciona
    // entre BrightierOS ↔ BrightierOS; se o remoto não expõe /api/files/* (não é
    // um BrightierOS ou é uma versão muito antiga), devolve 404 "Not found" cru —
    // o que confunde o usuário. Avisamos o motivo real.
    if (remoteRes.status === 404) {
      return res.status(502).json({
        success: false,
        error: 'O nó remoto não expõe /api/files/* — verifique se ele é um BrightierOS compatível (v0.8.0+) e se está online na porta correta.',
      });
    }

    // Encaminha status + headers relevantes + corpo (stream).
    res.status(remoteRes.status);
    for (const h of ['content-type', 'content-disposition', 'content-length', 'cache-control']) {
      const v = remoteRes.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    if (remoteRes.body) {
      Readable.fromWeb(remoteRes.body).on('error', () => { try { res.end(); } catch (_) {} }).pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    res.status(502).json({ success: false, error: 'Falha no proxy: ' + (err && err.message || 'erro') });
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
