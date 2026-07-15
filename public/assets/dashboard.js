/* ============================================================
   BrightierOS — Dashboard page
   ============================================================ */
(function () {
  'use strict';

  function bar(label, pct, extra) {
    pct = Math.max(0, Math.min(100, Number(pct) || 0));
    const cls = pct > 85 ? 'crit' : (pct > 65 ? 'warn' : '');
    return `<div class="metric">
      <div class="meta"><span class="label">${ui.escapeHtml(label)}</span><span class="val">${ui.escapeHtml(extra || '')}${pct.toFixed(1)}%</span></div>
      <div class="bar ${cls}"><span style="width:${pct}%"></span></div>
    </div>`;
  }

  async function loadMetrics() {
    const el = document.getElementById('stats');
    if (!el) return;
    try {
      const d = await api.stats();
      const parts = [];
      parts.push(bar('CPU — ' + (d.cpu?.name || ''), d.cpu?.usage, ''));
      parts.push(bar('RAM', d.ram?.usage, `${d.ram?.used}/${d.ram?.total} GB · `));
      (d.gpu || []).forEach((g, i) => parts.push(bar(`GPU ${i + 1} — ${g.name || ''}`, g.usage)));
      (d.storage || []).forEach(s => parts.push(bar(`Drive ${s.drive || ''} — ${s.used}/${s.total} GB`, s.usage)));
      el.innerHTML = parts.join('');
    } catch (e) {
      el.innerHTML = '<p class="muted">Erro ao carregar métricas.</p>';
    }
  }

  async function loadPlugins() {
    const el = document.getElementById('installed-plugins-list');
    if (!el) return;
    try {
      const list = await api.plugins.list();
      if (!list.length) {
        el.innerHTML = '<p class="muted">Nenhum plugin instalado. Explore a <a href="/store.html" style="color:var(--accent)">Loja</a>.</p>';
        return;
      }
      el.innerHTML = `<div class="table-wrap"><table>
        <thead><tr><th>Nome</th><th>ID</th><th>Versão</th><th></th></tr></thead>
        <tbody>${list.map(p => `
          <tr>
            <td style="font-weight:600">${ui.escapeHtml(p.name || p.id)}</td>
            <td class="muted">${ui.escapeHtml(p.id)}</td>
            <td class="muted">${ui.escapeHtml(p.version || '—')}</td>
            <td><div class="row-actions" style="justify-content:flex-end">
              <button class="btn ghost sm" data-uninstall="${ui.escapeHtml(p.id)}">Desinstalar</button>
            </div></td>
          </tr>`).join('')}</tbody></table></div>`;
      el.querySelectorAll('[data-uninstall]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-uninstall');
          const ok = await ui.confirm(`Desinstalar o plugin "${id}"?`, { title: 'Remover plugin', danger: true });
          if (!ok) return;
          try {
            const r = await api.plugins.uninstall(id);
            if (r.success) { ui.toast('Plugin removido.', 'ok'); loadPlugins(); }
            else ui.toast(r.error || 'Erro ao remover.', 'err');
          } catch (err) { ui.toast(err.message, 'err'); }
        });
      });
    } catch (e) {
      el.innerHTML = '<p class="muted">Erro ao carregar plugins.</p>';
    }
  }

  // Aguarda o servidor voltar após um restart automático e recarrega a página.
  async function waitForServerAndReload() {
    if (updateStatusEl) updateStatusEl.innerHTML = '<p class="muted"><span class="spin"></span>Reiniciando o servidor, aguarde...</p>';
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      try {
        const d = await api.update.check();
        if (d && d.success) { window.location.reload(); return; }
      } catch (_) { /* servidor ainda está subindo */ }
    }
    window.location.reload();
  }

  const updateStatusEl = document.getElementById('update-status');
  const checkBtn = document.getElementById('checkUpdateBtn');
  const applyBtn = document.getElementById('applyUpdateBtn');
  const historyEl = document.getElementById('update-history');

  async function checkUpdates() {
    if (!updateStatusEl) return;
    updateStatusEl.innerHTML = '<p class="muted"><span class="spin"></span>Verificando atualizações...</p>';
    if (applyBtn) applyBtn.style.display = 'none';
    try {
      const d = await api.update.check();
      if (d.success && d.hasUpdate) {
        updateStatusEl.innerHTML = `<p style="color:var(--ok);font-weight:600">Atualização disponível: v${ui.escapeHtml(d.availableVersion)}</p><p class="muted">${ui.escapeHtml(d.changelog || '')}</p>`;
        if (applyBtn) applyBtn.style.display = 'inline-flex';
      } else if (d.success) {
        updateStatusEl.innerHTML = `<p class="muted">Você está na versão mais recente (v${ui.escapeHtml(d.installedVersion || '')}).</p>`;
      } else {
        updateStatusEl.innerHTML = `<p class="muted" style="color:var(--danger)">Erro: ${ui.escapeHtml(d.error || 'Não foi possível verificar.')}</p>`;
      }
    } catch (e) {
      updateStatusEl.innerHTML = '<p class="muted" style="color:var(--danger)">Erro ao verificar.</p>';
    }
  }

  async function applyUpdate() {
    const ok = await ui.confirm('Aplicar a atualização? O servidor será reiniciado.', { title: 'Atualizar' });
    if (!ok) return;
    applyBtn.disabled = true; applyBtn.textContent = 'Atualizando...';
    try {
      const d = await api.update.apply();
      if (d && d.success && d.restarted) {
        ui.toast(d.message || 'Atualizado! Reiniciando o servidor...', 'ok');
        await waitForServerAndReload();
        return;
      }
      if (d && d.success) ui.toast(d.message || 'Atualizado!', 'ok');
      else ui.toast((d && d.error) || 'Falha ao atualizar.', 'err');
    } catch (e) { ui.toast(e.message, 'err'); }
    finally {
      applyBtn.disabled = false;
      applyBtn.textContent = 'Atualizar agora';
      loadHistory();
      checkUpdates();
    }
  }

  async function loadHistory() {
    if (!historyEl) return;
    try {
      const d = await api.update.history();
      const h = d.history || [];
      if (!h.length) { historyEl.innerHTML = '<p class="muted" style="margin-top:10px">Nenhuma atualização registrada.</p>'; return; }
      historyEl.innerHTML = h.map((e, i) => {
        const date = e.timestamp ? new Date(e.timestamp).toLocaleString('pt-BR') : '';
        const target = e.to || e.rolledBackTo || e.target || e.installedVersion;
        const isCurrent = i === 0;
        return `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--line-soft)">
          <div style="flex:1"><div style="color:#fff;font-weight:600">${e.type === 'rollback' ? 'Rollback' : 'Atualização'}: ${ui.escapeHtml(target || '')}</div>
          <div class="muted" style="font-size:12px">${ui.escapeHtml(date)}${e.message ? ' — ' + ui.escapeHtml(e.message) : ''}</div></div>
          ${!isCurrent ? `<button class="btn ghost sm" data-rollback="${ui.escapeHtml(target || '')}">Voltar</button>` : ''}
        </div>`;
      }).join('');
      historyEl.querySelectorAll('[data-rollback]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const target = btn.getAttribute('data-rollback');
          const ok = await ui.confirm(`Reverter para v${target}? O servidor será reiniciado.`, { title: 'Reverter versão', danger: true });
          if (!ok) return;
          btn.disabled = true; btn.textContent = 'Revertendo...';
          try {
            const d = await api.update.rollback(target);

            if (d && d.success && d.restarted) {
              ui.toast(d.message || `Revertido para v${target}`, 'ok');
              await waitForServerAndReload();
              return;
            }
            if (d && d.success) ui.toast(d.message || `Revertido para v${target}`, 'ok');
            else ui.toast((d && d.error) || 'Erro.', 'err');
          } catch (err) { ui.toast(err.message, 'err'); }
          finally { loadHistory(); }
        });
      });
    } catch (e) {
      historyEl.innerHTML = '<p class="muted" style="color:var(--danger)">Erro ao carregar histórico.</p>';
    }
  }

  checkBtn && checkBtn.addEventListener('click', checkUpdates);
  applyBtn && applyBtn.addEventListener('click', applyUpdate);
  loadMetrics();
  setInterval(loadMetrics, 5000);
  loadPlugins();
  loadHistory();
})();

