/* ============================================================
   BrightierOS — Trash manager
   v0.8.4 — Lixeira de outros servidores da infraestrutura (proxy)
   ============================================================ */
(function () {
  'use strict';

  const list = document.getElementById('trashList');
  const stats = document.getElementById('trashStats');
  const emptyBtn = document.getElementById('emptyTrash');

  // v0.8.3.2 — seletor de nó: a lixeira segue o mesmo padrão da página Arquivos.
  // O nó local usa /api/files/trash; nós remotos passam pelo proxy do servidor.
  let currentNode = 'local';
  const nodeSelect = document.getElementById('nodeSelect');
  const canWrite = !!(window.bosCan && window.bosCan('files:all'));

  async function loadNodeSelector() {
    if (!nodeSelect) return;
    try {
      const d = await api.infrastructure.nodes();
      const nodes = (d && d.data) || [];
      nodeSelect.innerHTML = nodes.map(n =>
        `<option value="${ui.escapeHtml(n.id)}"${n.id === currentNode ? ' selected' : ''}>${ui.escapeHtml(n.name)}${n.id === 'local' ? ' (este)' : (n.credentialsConfigured ? '' : ' — sem credenciais')}</option>`
      ).join('');
    } catch (e) { nodeSelect.innerHTML = '<option value="local">Local (este)</option>'; }
  }

  function updateSub() {
    const sub = document.getElementById('pageSub');
    if (!sub || !nodeSelect) return;
    const name = nodeSelect.options[nodeSelect.selectedIndex] ? nodeSelect.options[nodeSelect.selectedIndex].text : '';
    sub.textContent = currentNode === 'local' ? 'Recupere o que foi perdido.' : `Lixeira de: ${name}`;
  }

  async function selectNode(id) {
    currentNode = id;
    if (id !== 'local') {
      try {
        const d = await api.infrastructure.nodes();
        const node = ((d && d.data) || []).find(n => n.id === id);
        if (node && !node.credentialsConfigured) {
          ui.toast('Configure as credenciais deste nó para acessar a lixeira.', 'info');
          const saved = await ui.nodeCredentialsModal(node);
          if (saved) { await loadNodeSelector(); updateSub(); }
        }
      } catch (_) {}
    }
    updateSub();
    load();
  }
  if (nodeSelect) nodeSelect.addEventListener('change', () => selectNode(nodeSelect.value));

  async function load() {
    try {
      const [items, st] = await Promise.all([api.files.trashList(currentNode), api.files.trashStats(currentNode)]);
      stats.textContent = `Itens: ${st.count || 0} · Espaço: ${st.sizeFormatted || ui.formatBytes(st.size)}`;
      // "Esvaziar" é uma escrita (files:all) e só faz sentido para quem pode escrever.
      emptyBtn.style.display = (canWrite && items.length) ? 'inline-flex' : 'none';
      if (!items.length) {
        list.innerHTML = '<tr><td colspan="5" class="empty">A lixeira está vazia.</td></tr>';
        return;
      }
      list.innerHTML = items.map(it => `
        <tr>
          <td style="font-weight:600;">${ui.escapeHtml(it.name || '')}</td>
          <td>${it.type === 'folder' ? 'Pasta' : 'Arquivo'}</td>
          <td class="muted">${ui.escapeHtml(it.sizeFormatted || '—')}</td>
          <td class="muted">${it.deletedAt ? new Date(it.deletedAt).toLocaleString('pt-BR') : '—'}</td>
          <td><div class="row-actions" style="justify-content:flex-end;">
            ${canWrite
              ? `<button class="btn ghost sm" data-restore="${ui.escapeHtml(it.trashPath)}">Restaurar</button><button class="btn danger sm" data-delete="${ui.escapeHtml(it.trashPath)}">Excluir</button>`
              : '<span class="muted" style="font-size:12px">somente leitura</span>'}
          </div></td>
        </tr>`).join('');
      if (canWrite) {
        list.querySelectorAll('[data-restore]').forEach(b => b.onclick = async () => {
          try { await api.files.restore(b.getAttribute('data-restore'), currentNode); ui.toast('Restaurado.', 'ok'); load(); }
          catch (e) { ui.toast('Erro: ' + e.message, 'err'); }
        });
        list.querySelectorAll('[data-delete]').forEach(b => b.onclick = async () => {
          const ok = await ui.confirm('Excluir permanentemente?', { title: 'Excluir', danger: true, okText: 'Excluir' });
          if (!ok) return;
          try { await api.files.trashDelete(b.getAttribute('data-delete'), currentNode); ui.toast('Excluído.', 'ok'); load(); }
          catch (e) { ui.toast('Erro: ' + e.message, 'err'); }
        });
      }
    } catch (e) {
      list.innerHTML = `<tr><td colspan="5" class="empty">Erro: ${ui.escapeHtml(e.message)}</td></tr>`;
    }
  }

  emptyBtn.onclick = async () => {
    const ok = await ui.confirm('Esvaziar a lixeira permanentemente?', { title: 'Esvaziar', danger: true, okText: 'Esvaziar' });
    if (!ok) return;
    try { await api.files.emptyTrash(currentNode); ui.toast('Lixeira esvaziada.', 'ok'); load(); }
    catch (e) { ui.toast('Erro: ' + e.message, 'err'); }
  };

  loadNodeSelector();
  load();
})();
