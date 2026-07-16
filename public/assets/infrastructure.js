/* ============================================================
   BrightierOS v0.8.0 — Infraestrutura (nós/servidores)
   ============================================================ */
(function () {
  'use strict';

  const overviewEl = () => document.getElementById('infra-overview');
  const nodesEl = () => document.getElementById('nodes-list');

  function canManage() { return !!(window.bosCan && window.bosCan('infrastructure:control')); }

  function statusPill(status) {
    const s = String(status || 'unknown').toLowerCase();
    const map = {
      local: '<span class="status-pill ok">local</span>',
      remote: '<span class="status-pill info">remoto</span>',
      online: '<span class="status-pill ok">online</span>',
      offline: '<span class="status-pill stopped">offline</span>',
    };
    return map[s] || `<span class="status-pill unknown">${ui.escapeHtml(status)}</span>`;
  }

  async function loadOverview() {
    const el = overviewEl(); if (!el) return;
    try {
      const d = await api.infrastructure.overview();
      const o = (d && d.data) || {};
      el.innerHTML = `<div class="grid cols-4" style="gap:12px">
        <div class="stat-box"><div class="stat-num">${o.total || 0}</div><div class="stat-lbl">Nós totais</div></div>
        <div class="stat-box"><div class="stat-num">${o.local || 0}</div><div class="stat-lbl">Local</div></div>
        <div class="stat-box"><div class="stat-num">${o.remote || 0}</div><div class="stat-lbl">Remotos</div></div>
        <div class="stat-box"><div class="stat-num">${(o.platforms || []).length}</div><div class="stat-lbl">Plataformas</div></div>
      </div>`;
    } catch (e) { el.innerHTML = `<p class="muted" style="color:var(--danger)">${ui.escapeHtml(e.message)}</p>`; }
  }
  async function loadNodes() {
    const el = nodesEl(); if (!el) return;
    try {
      const d = await api.infrastructure.nodes();
      const list = (d && d.data) || [];
      if (!list.length) { el.innerHTML = '<p class="muted">Nenhum nó registrado.</p>'; return; }
      const manage = canManage();
      el.innerHTML = `<div class="table-wrap"><table>
        <thead><tr><th>Nome</th><th>Host</th><th>Plataforma</th><th>Tipo</th><th>Status</th><th>Tags</th><th></th></tr></thead>
        <tbody>${list.map(n => `
          <tr>
            <td style="font-weight:600">${ui.escapeHtml(n.name)}${n.id === 'local' ? ' <span class="muted" style="font-size:11px">(este)</span>' : ''}</td>
            <td class="muted" style="font-size:12px">${ui.escapeHtml(n.host || '—')}${n.port ? ':' + ui.escapeHtml(n.port) : ''}</td>
            <td class="muted" style="font-size:12px">${ui.escapeHtml(n.platform || '—')} · ${ui.escapeHtml(n.arch || '')}</td>
            <td>${ui.escapeHtml(n.kind || '—')}</td>
            <td>${statusPill(n.status)}</td>
            <td class="muted" style="font-size:12px">${(n.tags || []).map(ui.escapeHtml).join(', ') || '—'}</td>
            <td class="row-actions">${manage ? `
              <button class="btn ghost sm" data-edit="${ui.escapeHtml(n.id)}">Editar</button>
              ${n.id !== 'local' ? `<button class="btn danger sm" data-del="${ui.escapeHtml(n.id)}">Remover</button>` : ''}`
              : '<span class="muted" style="font-size:12px">somente leitura</span>'}</td>
          </tr>`).join('')}</tbody></table></div>`;
      if (manage) {
        el.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => editNode(list.find(n => n.id === b.getAttribute('data-edit')))));
        el.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => removeNode(b.getAttribute('data-del'))));
      }
    } catch (e) { el.innerHTML = `<p class="muted" style="color:var(--danger)">${ui.escapeHtml(e.message)}</p>`; }
  }

  function nodeModal(node) {
    const isNew = !node;
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    const isLocal = node && node.id === 'local';
    backdrop.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
      <h3>${isNew ? 'Adicionar nó' : 'Editar nó'}</h3>
      <label>Nome</label>
      <input data-f="name" value="${ui.escapeHtml((node && node.name) || '')}" />
      <label style="margin-top:10px">Host</label>
      <input data-f="host" value="${ui.escapeHtml((node && node.host) || '')}" ${isLocal ? 'disabled' : ''} />
      <label style="margin-top:10px">Porta</label>
      <input data-f="port" type="number" value="${ui.escapeHtml(String((node && node.port) || ''))}" ${isLocal ? 'disabled' : ''} />
      <label style="margin-top:10px">Tags (vírgula)</label>
      <input data-f="tags" value="${ui.escapeHtml(((node && node.tags) || []).join(', '))}" />
      <label style="margin-top:10px">Nota</label>
      <input data-f="note" value="${ui.escapeHtml((node && node.note) || '')}" />
      <div class="row"><button class="btn ghost" data-cancel>Cancelar</button><button class="btn" data-save>Salvar</button></div>
    </div>`;
    document.body.appendChild(backdrop);
    const val = (f) => backdrop.querySelector(`[data-f="${f}"]`);
    backdrop.querySelector('[data-cancel]').onclick = () => backdrop.remove();
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
    return { backdrop, val, isNew, node };
  }

  function saveNode(backdrop, val, node) {
    const tags = val('tags').value.split(',').map(s => s.trim()).filter(Boolean);
    const data = { name: val('name').value.trim(), host: val('host').value.trim(), port: val('port').value, tags, note: val('note').value.trim() };
    return node ? api.infrastructure.updateNode(node.id, data) : api.infrastructure.addNode(data);
  }

  function addNode() {
    const { backdrop, val } = nodeModal(null);
    backdrop.querySelector('[data-save]').onclick = async () => {
      try { await saveNode(backdrop, val, null); ui.toast('Nó adicionado.', 'ok'); backdrop.remove(); loadOverview(); loadNodes(); }
      catch (e) { ui.toast(e.message, 'err'); }
    };
  }

  function editNode(node) {
    const { backdrop, val } = nodeModal(node);
    backdrop.querySelector('[data-save]').onclick = async () => {
      try { await saveNode(backdrop, val, node); ui.toast('Nó atualizado.', 'ok'); backdrop.remove(); loadOverview(); loadNodes(); }
      catch (e) { ui.toast(e.message, 'err'); }
    };
  }

  async function removeNode(id) {
    const ok = await ui.confirm(`Remover o nó "${id}"?`, { title: 'Remover nó', danger: true });
    if (!ok) return;
    try { await api.infrastructure.removeNode(id); ui.toast('Nó removido.', 'ok'); loadOverview(); loadNodes(); }
    catch (e) { ui.toast(e.message, 'err'); }
  }

  function init() {
    const ab = document.getElementById('addNodeBtn');
    if (ab && canManage()) ab.addEventListener('click', addNode);
    else if (ab) ab.style.display = 'none';
    loadOverview(); loadNodes();
  }

  document.addEventListener('brightier:ready', init);
})();

