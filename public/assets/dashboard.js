/* ============================================================
   BrightierOS — Dashboard page
   v0.7.1 - UI traduzida + histórico de métricas
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

  function setStatCard(idSuffix, value, pct, meta, extraClass = '') {
    const valueEl = document.getElementById(idSuffix + '-value');
    const barEl = document.getElementById(idSuffix + '-bar');
    const metaEl = document.getElementById(idSuffix + '-meta');
    if (valueEl) {
      valueEl.textContent = value;
      valueEl.className = 'stat-value' + (extraClass ? ' ' + extraClass : '');
    }
    if (metaEl) metaEl.textContent = meta;
    if (barEl) {
      barEl.style.width = pct + '%';
      const wrap = barEl.closest('.stat-bar');
      if (wrap) {
        wrap.classList.remove('warn', 'crit');
        if (pct > 85) wrap.classList.add('crit');
        else if (pct > 65) wrap.classList.add('warn');
      }
    }
  }

  function fmtNetSpeed(kbps) {
    const n = Number(kbps) || 0;
    if (n >= 1024) return (n / 1024).toFixed(2) + ' MB/s';
    return n.toFixed(2) + ' KB/s';
  }

  async function loadMetrics() {
    const el = document.getElementById('stats');
    try {
      const r = await api.stats();
      const d = r.data || {};

      // Cards de status principais
      const cpu = Math.max(0, Math.min(100, Number(d.cpu?.usage) || 0));
      setStatCard('cpu', cpu.toFixed(1) + '%', cpu, d.cpu?.name || (d.cpu?.cores ? d.cpu.cores + ' cores' : 'Carregando...'));

      const ram = Math.max(0, Math.min(100, Number(d.ram?.usage) || 0));
      setStatCard('ram', ram.toFixed(1) + '%', ram, `${d.ram?.used || '—'}/${d.ram?.total || '—'} GB usados`);

      const drives = d.storage || [];
      if (drives.length) {
        const main = drives[0];
        const usage = Math.max(0, Math.min(100, Number(main.usage) || 0));
        setStatCard('storage', usage.toFixed(1) + '%', usage, `${main.used || '—'}/${main.total || '—'} GB · ${main.drive || 'C:'}`);
      } else {
        setStatCard('storage', '—', 0, '—');
      }

      const n = d.network || null;
      if (n) {
        setStatCard('net', fmtNetSpeed(n.rx), 0, `↓ ${fmtNetSpeed(n.rx)} · ↑ ${fmtNetSpeed(n.tx)}`, 'sm');
      } else {
        setStatCard('net', '—', 0, 'n/d', 'sm');
      }

      // Seção Performance legada (se ainda existir em alguma página antiga)
      if (el) {
        const parts = [];
        parts.push(bar('CPU — ' + (d.cpu?.name || ''), d.cpu?.usage, ''));
        if (d.cpu?.cores) parts.push(`<div class="metric"><div class="meta" style="font-size:12px"><span class="label">Cores</span><span class="val">${ui.escapeHtml(d.cpu.cores)}</span></div></div>`);
        parts.push(bar('RAM', d.ram?.usage, `${d.ram?.used}/${d.ram?.total} GB · `));
        (d.gpu || []).forEach((g, i) => parts.push(bar(`GPU ${i + 1} — ${g.name || ''}`, g.usage)));
        el.innerHTML = parts.join('');
      }

      // Sistema
      const sys = document.getElementById('system-info');
      if (sys) {
        const osLine = d.os ? `${ui.escapeHtml(d.os.distro || '')} ${ui.escapeHtml(d.os.release || '')}` : '—';
        sys.innerHTML = `
          <div class="kv"><span class="muted">Sistema</span><span>${osLine}</span></div>
          <div class="kv"><span class="muted">Arquitetura</span><span>${ui.escapeHtml(d.os?.arch || '—')}</span></div>
          <div class="kv"><span class="muted">Hostname</span><span>${ui.escapeHtml(d.os?.hostname || '—')}</span></div>
          <div class="kv"><span class="muted">Uptime</span><span>${ui.escapeHtml(d.uptime || '—')}</span></div>
          <div class="kv"><span class="muted">Carga</span><span>${(d.cpu?.load || []).map(ui.escapeHtml).join(' · ') || '—'}</span></div>
          <div class="kv"><span class="muted">Temperatura</span><span>${d.temperature != null ? ui.escapeHtml(d.temperature) + ' °C' : 'n/d'}</span></div>
          <div class="kv"><span class="muted">Processos</span><span>${d.processes ? ui.escapeHtml(d.processes.all) + ' (' + ui.escapeHtml(d.processes.running) + ' ativos)' : 'n/d'}</span></div>`;
      }
      // Armazenamento legado (se existir)
      const st = document.getElementById('storage');
      if (st && !document.getElementById('storage-value')) {
        st.innerHTML = drives.length ? drives.map(s => bar(`Drive ${s.drive || ''}`, s.usage, `${s.used}/${s.total} GB · `)).join('') : '<p class="muted">n/d</p>';
      }
      // Rede legada (se existir)
      const net = document.getElementById('network');
      if (net && !document.getElementById('net-value')) {
        net.innerHTML = n ? `
          <div class="kv"><span class="muted">Interface</span><span>${ui.escapeHtml(n.iface || '—')}</span></div>
          <div class="kv"><span class="muted">Download</span><span>${ui.escapeHtml(n.rx)} KB/s</span></div>
          <div class="kv"><span class="muted">Upload</span><span>${ui.escapeHtml(n.tx)} KB/s</span></div>` : '<p class="muted">n/d</p>';
      }
      // Processos
      const proc = document.getElementById('processes');
      if (proc) {
        const p = d.processes || null;
        proc.innerHTML = p && p.top ? `<div class="table-wrap"><table>
          <thead><tr><th>Processo</th><th>CPU %</th><th>MEM %</th></tr></thead>
          <tbody>${p.top.map(x => `<tr><td>${ui.escapeHtml(x.name)}</td><td class="muted">${ui.escapeHtml(x.cpu)}</td><td class="muted">${ui.escapeHtml(x.mem)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">n/d</p>';
      }
    } catch (e) {
      if (el) el.innerHTML = '<p class="muted">Erro ao carregar métricas.</p>';
    }
  }

  // Gráfico de histórico em tempo real (CPU/RAM/Rede). Corrige a divisão por zero
  // quando o sistema está ocioso e agora atualiza automaticamente (v0.8.0).
  async function loadMetricsHistory() {
    const el = document.getElementById('metrics-chart');
    if (!el) return;
    try {
      const r = await api.metrics.history(60);
      const hist = (r && r.data) || [];
      if (!hist.length) { el.innerHTML = '<p class="muted" style="font-size:12px;margin:0">Aguardando dados...</p>'; return; }
      const vals = (key) => hist.map(p => Number(p[key])).filter(v => v != null && !isNaN(v));
      const maxCpu = Math.max(1, ...vals('cpu')), maxRam = Math.max(1, ...vals('ram')), maxNet = Math.max(0.01, ...vals('netRx'));
      const W = 100, H = 40, n = hist.length;
      const x = (i) => (i / Math.max(1, n - 1)) * W;
      const line = (key, maxv, color) => {
        const pts = hist.map((p, i) => {
          const v = Number(p[key]); if (v == null || isNaN(v)) return null;
          return `${x(i).toFixed(2)},${(H - (v / maxv) * (H - 4) - 2).toFixed(2)}`;
        }).filter(Boolean).join(' ');
        return pts ? `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.2" opacity="0.9" />` : '';
      };
      el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:100%">
        ${line('cpu', maxCpu, 'var(--accent)')}${line('ram', maxRam, '#1f7cff')}${line('netRx', maxNet, '#2ee6a6')}
      </svg>
      <div class="chart-legend"><span class="ld"><i style="background:var(--accent)"></i>CPU</span>
        <span class="ld"><i style="background:#1f7cff"></i>RAM</span>
        <span class="ld"><i style="background:#2ee6a6"></i>Rede</span></div>`;
    } catch (e) { el.innerHTML = ''; }
  }

  async function loadPlugins() {
    const el = document.getElementById('installed-plugins-list');
    if (!el) return;
    try {
      const list = await api.plugins.list();
      if (!list.length) {
        el.innerHTML = '<p class="empty-state">Nenhum plugin instalado. Explore a <a href="/store.html" style="color:var(--accent)">Loja</a>.</p>';
        return;
      }
      el.innerHTML = `<div class="plugin-grid">${list.map(p => `
        <div class="plugin-card">
          <div class="plugin-name">${ui.escapeHtml(p.name || p.id)}</div>
          <div class="plugin-meta">${ui.escapeHtml(p.id)} · v${ui.escapeHtml(p.version || '—')}${p.author ? ' · por ' + ui.escapeHtml(p.author) : ''}</div>
          <div class="plugin-actions">
            <button class="btn ghost sm" data-uninstall="${ui.escapeHtml(p.id)}">Desinstalar</button>
          </div>
        </div>`).join('')}</div>`;
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
  const localChangesEl = document.getElementById('local-changes');
  const targetVersionEl = document.getElementById('targetVersion');
  const checkBtn = document.getElementById('checkUpdateBtn');
  const applyBtn = document.getElementById('applyUpdateBtn');
  const backupBtn = document.getElementById('backupBtn');
  const changelogBtn = document.getElementById('changelogBtn');
  const restoreBtn = document.getElementById('restoreBtn');
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
      renderLocalChanges(d.hasLocalChanges, d.localChanges);
    } catch (e) {
      updateStatusEl.innerHTML = '<p class="muted" style="color:var(--danger)">Erro ao verificar.</p>';
    }
  }

  // Mostra um aviso quando há alterações locais não commitadas.
  function renderLocalChanges(has, changes) {
    if (!localChangesEl) return;
    if (!has || !changes || !changes.length) {
      localChangesEl.style.display = 'none';
      localChangesEl.innerHTML = '';
      return;
    }
    localChangesEl.style.display = 'block';
    localChangesEl.innerHTML = `<div style="margin:10px 0;padding:10px 12px;border:1px solid var(--danger,#ff5470);border-radius:12px;background:rgba(255,84,112,.08)">
      <div style="font-weight:600;color:var(--danger,#ff5470)">⚠️ Foram detectadas alterações locais</div>
      <div class="muted" style="font-size:12px;margin-top:4px;white-space:pre-wrap">${ui.escapeHtml(changes.slice(0, 20).join('\n'))}</div>
    </div>`;
  }

  async function applyUpdate() {
    const target = targetVersionEl ? targetVersionEl.value.trim() : '';
    const ok = await ui.confirm(
      target
        ? `Aplicar atualização incremental para v${target}? O servidor será reiniciado.`
        : 'Aplicar a atualização? O servidor será reiniciado.',
      { title: 'Atualizar' }
    );
    if (!ok) return;
    applyBtn.disabled = true; applyBtn.textContent = 'Atualizando...';
    try {
      const d = await api.update.apply(target ? { targetVersion: target } : {});
      if (d && d.code === 'LOCAL_CHANGES') {
        // Não atualiza por cima de alterações locais sem confirmar.
        const lista = (d.localChanges || []).map((c) => `• ${c}`).join('\n');
        const force = await ui.confirm(
          `⚠️ Foram detectadas alterações locais.\nAtualizar pode sobrescrever arquivos modificados.\nUm backup automático será criado antes de continuar.\n\n${lista}`,
          { title: 'Alterações locais', okText: 'Atualizar mesmo assim', cancelText: 'Cancelar', danger: true }
        );
        if (!force) { ui.toast('Atualização cancelada.', 'info'); return; }
        const d2 = await api.update.apply(target ? { targetVersion: target, force: true } : { force: true });
        return finishApply(d2);
      }
      return finishApply(d);
    } catch (e) { ui.toast(e.message, 'err'); }
    finally {
      applyBtn.disabled = false;
      applyBtn.textContent = 'Atualizar agora';
      loadHistory();
      checkUpdates();
    }
  }

  async function finishApply(d) {
    if (!d) return;
    if (d.success && d.restarted) {
      ui.toast(d.message || 'Atualizado! Reiniciando o servidor...', 'ok');
      await waitForServerAndReload();
      return;
    }
    if (d.success) ui.toast(d.message || 'Atualizado!', 'ok');
    else ui.toast(d.error || 'Falha ao atualizar.', 'err');
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
        const typeLabel = e.type === 'rollback' ? 'Rollback'
          : e.type === 'backup' ? 'Backup'
          : e.type === 'restore' ? 'Restauração'
          : 'Atualização';
        const actionBtn = (e.type === 'rollback' && !isCurrent)
          ? `<button class="btn ghost sm" data-rollback="${ui.escapeHtml(target || '')}">Voltar</button>`
          : '';
        return `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--line-soft)">
          <div style="flex:1"><div style="color:#fff;font-weight:600">${typeLabel}: ${ui.escapeHtml(target || '')}</div>
          <div class="muted" style="font-size:12px">${ui.escapeHtml(date)}${e.message ? ' — ' + ui.escapeHtml(e.message) : ''}</div></div>
          ${actionBtn}
        </div>`;
      }).join('');
      historyEl.querySelectorAll('[data-rollback]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const target = btn.getAttribute('data-rollback');
          const ok = await ui.confirm(`Reverter para v${target}? O servidor será reiniciado.`, { title: 'Reverter versão', danger: true });
          if (!ok) return;
          btn.disabled = true; btn.textContent = 'Revertendo...';
          try {
            let d = await api.update.rollback({ targetVersion: target });
            if (d && d.code === 'LOCAL_CHANGES') {
              const lista = (d.localChanges || []).map((c) => `• ${c}`).join('\n');
              const force = await ui.confirm(
                `⚠️ Foram detectadas alterações locais.\nReverter pode sobrescrever arquivos modificados.\n\n${lista}`,
                { title: 'Alterações locais', okText: 'Continuar', cancelText: 'Cancelar', danger: true }
              );
              if (!force) { ui.toast('Revertão cancelada.', 'info'); loadHistory(); return; }
              d = await api.update.rollback({ targetVersion: target, force: true });
            }

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

  // ─── Backup / Changelog / Restore ─────────────────────────────────

  function openModal({ title, bodyHtml, footerHtml }) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
      <h3>${ui.escapeHtml(title)}</h3>
      <div class="modal-body">${bodyHtml}</div>
      <div class="row">${footerHtml || ''}</div>
    </div>`;
    document.body.appendChild(backdrop);
    return backdrop;
  }

  async function doBackup() {
    try {
      backupBtn.disabled = true; backupBtn.textContent = 'Salvando...';
      const d = await api.update.backup();
      if (d && d.success) ui.toast(`Backup criado: ${d.backup.id}`, 'ok');
      else ui.toast((d && d.error) || 'Falha ao criar backup.', 'err');
    } catch (e) { ui.toast(e.message, 'err'); }
    finally {
      backupBtn.disabled = false;
      backupBtn.textContent = '🗄 Fazer backup';
      loadHistory();
    }
  }

  async function showChangelog() {
    try {
      const d = await api.update.changelog();
      const text = d.success && d.changelog ? d.changelog : 'Changelog não disponível.';
      const backdrop = openModal({
        title: 'Changelog',
        bodyHtml: `<pre style="white-space:pre-wrap;max-height:60vh;overflow:auto;font-size:13px;line-height:1.5;margin:0">${ui.escapeHtml(text)}</pre>`,
        footerHtml: `<button class="btn" data-close>Fechar</button>`,
      });
      backdrop.querySelector('[data-close]').onclick = () => backdrop.remove();
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
    } catch (e) { ui.toast(e.message, 'err'); }
  }

  async function showRestore() {
    try {
      const d = await api.update.backups();
      const backups = (d.success && d.backups) || [];
      if (!backups.length) { ui.toast('Nenhum backup disponível.', 'info'); return; }
      const rows = backups.map((b) => {
        const when = b.timestamp ? new Date(b.timestamp).toLocaleString('pt-BR') : '';
        const size = ui.formatBytes(b.size);
        return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line-soft)">
          <div style="flex:1"><div style="color:#fff;font-weight:600">${ui.escapeHtml(b.label || 'backup')}</div>
          <div class="muted" style="font-size:12px">v${ui.escapeHtml(b.version || '?')} · ${ui.escapeHtml(when)} · ${size}</div></div>
          <button class="btn ghost sm" data-restore="${ui.escapeHtml(b.id)}">Restaurar</button>
        </div>`;
      }).join('');
      const backdrop = openModal({
        title: 'Restaurar backup',
        bodyHtml: `<p class="muted" style="margin:0 0 8px">Escolha um backup para restaurar. Um backup de segurança do estado atual será criado automaticamente.</p>${rows}`,
        footerHtml: `<button class="btn ghost" data-close>Cancelar</button>`,
      });
      backdrop.querySelector('[data-close]').onclick = () => backdrop.remove();
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
      backdrop.querySelectorAll('[data-restore]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-restore');
          const ok = await ui.confirm(`Restaurar o backup "${id}"? O servidor será reiniciado.`, { title: 'Restaurar backup', danger: true });
          if (!ok) return;
          btn.disabled = true; btn.textContent = 'Restaurando...';
          try {
            const r = await api.update.restore(id);
            if (r && r.success && r.restarted) {
              ui.toast(r.message || 'Restaurando...', 'ok');
              backdrop.remove();
              await waitForServerAndReload();
              return;
            }
            if (r && r.success) ui.toast(r.message || 'Backup restaurado.', 'ok');
            else ui.toast((r && r.error) || 'Falha ao restaurar.', 'err');
          } catch (e) { ui.toast(e.message, 'err'); }
        });
      });
    } catch (e) { ui.toast(e.message, 'err'); }
  }

  // ─── Listeners ────────────────────────────────────────────────────

  checkBtn && checkBtn.addEventListener('click', checkUpdates);
  applyBtn && applyBtn.addEventListener('click', applyUpdate);
  backupBtn && backupBtn.addEventListener('click', doBackup);
  changelogBtn && changelogBtn.addEventListener('click', showChangelog);
  restoreBtn && restoreBtn.addEventListener('click', showRestore);
  loadMetrics();
  setInterval(loadMetrics, 5000);
  loadMetricsHistory();
  setInterval(loadMetricsHistory, 5000);
  loadPlugins();
  loadHistory();
})();

