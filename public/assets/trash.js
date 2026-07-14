/* ============================================================
   BrightierOS — Trash manager
   ============================================================ */
(function () {
  'use strict';

  const list = document.getElementById('trashList');
  const stats = document.getElementById('trashStats');
  const emptyBtn = document.getElementById('emptyTrash');

  async function load() {
    try {
      const [items, st] = await Promise.all([api.files.trashList(), api.files.trashStats()]);
      stats.textContent = `Itens: ${st.count || 0} · Espaço: ${st.sizeFormatted || ui.formatBytes(st.size)}`;
      emptyBtn.style.display = items.length ? 'inline-flex' : 'none';
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
            <button class="btn ghost sm" data-restore="${ui.escapeHtml(it.trashPath)}">Restaurar</button>
            <button class="btn danger sm" data-delete="${ui.escapeHtml(it.trashPath)}">Excluir</button>
          </div></td>
        </tr>`).join('');
      list.querySelectorAll('[data-restore]').forEach(b => b.onclick = async () => {
        try { await api.files.restore(b.getAttribute('data-restore')); ui.toast('Restaurado.', 'ok'); load(); }
        catch (e) { ui.toast('Erro: ' + e.message, 'err'); }
      });
      list.querySelectorAll('[data-delete]').forEach(b => b.onclick = async () => {
        const ok = await ui.confirm('Excluir permanentemente?', { title: 'Excluir', danger: true, okText: 'Excluir' });
        if (!ok) return;
        try { await api.files.trashDelete(b.getAttribute('data-delete')); ui.toast('Excluído.', 'ok'); load(); }
        catch (e) { ui.toast('Erro: ' + e.message, 'err'); }
      });
    } catch (e) {
      list.innerHTML = `<tr><td colspan="5" class="empty">Erro: ${ui.escapeHtml(e.message)}</td></tr>`;
    }
  }

  emptyBtn.onclick = async () => {
    const ok = await ui.confirm('Esvaziar a lixeira permanentemente?', { title: 'Esvaziar', danger: true, okText: 'Esvaziar' });
    if (!ok) return;
    try { await api.files.emptyTrash(); ui.toast('Lixeira esvaziada.', 'ok'); load(); }
    catch (e) { ui.toast('Erro: ' + e.message, 'err'); }
  };

  load();
})();
