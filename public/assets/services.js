/* ============================================================
   BrightierOS v0.8.5 — Serviços (listar, controlar, logs)
   Categorias: 'BrightierOS' (base + plugins) e 'Todos' (+ sistema).
   ============================================================ */
(function () {
  'use strict';

  const listEl = () => document.getElementById('services-list');
  const searchEl = () => document.getElementById('svcSearch');
  let allServices = [];
  // v0.8.5 — categoria ativa: 'brightieros' (base + plugins) ou 'all' (tudo).
  let currentCategory = 'brightieros';

  function statusBadge(status) {
    const s = String(status || 'unknown').toLowerCase();
    const map = {
      running: '<span class="status-pill ok">em execução</span>',
      stopped: '<span class="status-pill stopped">parado</span>',
      dead: '<span class="status-pill stopped">parado</span>',
      local: '<span class="status-pill ok">local</span>',
      unknown: '<span class="status-pill unknown">desconhecido</span>',
    };
    return map[s] || `<span class="status-pill unknown">${ui.escapeHtml(status)}</span>`;
  }

  function canControl() {
    return !!(window.bosCan && window.bosCan('services:control'));
  }

  async function load() {
    const el = listEl();
    if (!el) return;
    el.innerHTML = '<p class="muted"><span class="spin"></span>Carregando serviços...</p>';
    try {
      const d = await api.services.list();
      allServices = (d && d.data) || [];
      render();
    } catch (e) {
      el.innerHTML = `<p class="muted" style="color:var(--danger)">${ui.escapeHtml(e.message)}</p>`;
    }
  }

  function render() {
    const el = listEl();
    const q = (searchEl() && searchEl().value || '').toLowerCase().trim();
    // v0.8.5: filtra por categoria antes do texto. 'all' mostra tudo; senão só
    // os serviços cuja category bate com a aba ativa.
    const list = allServices
      .filter(s => currentCategory === 'all' || s.category === currentCategory)
      .filter(s => !q || (s.name || s.id || '').toLowerCase().includes(q));
    if (!list.length) { el.innerHTML = '<p class="muted">Nenhum serviço encontrado nesta categoria.</p>'; return; }
    const ctrl = canControl();
    el.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Serviço</th><th>ID</th><th>Gestor</th><th>Status</th><th></th></tr></thead>
      <tbody>${list.map(s => `
        <tr>
          <td style="font-weight:600">${ui.escapeHtml(s.name || s.id)}</td>
          <td class="muted" style="font-size:12px">${ui.escapeHtml(s.id)}</td>
          <td class="muted" style="font-size:12px">${ui.escapeHtml(s.managed || '—')}</td>
          <td>${statusBadge(s.status)}</td>
          <td class="row-actions">
            <button class="btn ghost sm" data-logs="${ui.escapeHtml(s.id)}">Logs</button>
            ${ctrl ? `
              <button class="btn sm" data-start="${ui.escapeHtml(s.id)}" ${s.status === 'running' ? 'disabled' : ''}>Iniciar</button>
              <button class="btn ghost sm" data-stop="${ui.escapeHtml(s.id)}" ${s.status !== 'running' ? 'disabled' : ''}>Parar</button>
              <button class="btn ghost sm" data-restart="${ui.escapeHtml(s.id)}">Reiniciar</button>`
            : '<span class="muted" style="font-size:12px">somente leitura</span>'}
          </td>
        </tr>`).join('')}</tbody></table></div>`;

    el.querySelectorAll('[data-logs]').forEach(b => b.addEventListener('click', () => showLogs(b.getAttribute('data-logs'))));
    if (ctrl) {
      el.querySelectorAll('[data-start]').forEach(b => b.addEventListener('click', () => act(b, 'start')));
      el.querySelectorAll('[data-stop]').forEach(b => b.addEventListener('click', () => act(b, 'stop')));
      el.querySelectorAll('[data-restart]').forEach(b => b.addEventListener('click', () => act(b, 'restart')));
    }
  }

  async function act(btn, action) {
    const id = btn.getAttribute('data-' + action);
    const ok = await ui.confirm(`${actionLabel(action)} o serviço "${id}"?`, { title: actionLabel(action), okText: actionLabel(action) });
    if (!ok) return;
    btn.disabled = true; const orig = btn.textContent; btn.textContent = '...';
    try {
      const r = await api.services[action](id);
      if (r && r.success) { ui.toast(r.message || ('Serviço ' + action + ' OK.'), 'ok'); }
      else { ui.toast((r && r.message) || 'Falha na ação.', 'err'); }
      // Reinício do BrightierOS encerra o processo — aguarda e recarrega.
      if (id === 'brightieros' && action === 'restart' && r && r.restarted) {
        ui.toast('Reiniciando o BrightierOS...', 'ok');
        setTimeout(() => window.location.reload(), 4000);
        return;
      }
      load();
    } catch (e) { ui.toast(e.message, 'err'); }
    btn.disabled = false; btn.textContent = orig;
  }

  function actionLabel(a) { return { start: 'Iniciar', stop: 'Parar', restart: 'Reiniciar' }[a] || a; }

  async function showLogs(id) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `<div class="modal" style="width:min(820px,100%)">
      <h3>Logs — ${ui.escapeHtml(id)}</h3>
      <pre class="svc-logs" id="svcLogsBody">Carregando...</pre>
      <div class="row"><button class="btn ghost" data-close>Fechar</button></div>
    </div>`;
    document.body.appendChild(backdrop);
    backdrop.querySelector('[data-close]').onclick = () => backdrop.remove();
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
    try {
      const d = await api.services.logs(id, 150);
      const body = backdrop.querySelector('#svcLogsBody');
      body.textContent = (d && d.data) || 'Sem logs disponíveis.';
    } catch (e) {
      backdrop.querySelector('#svcLogsBody').textContent = 'Erro: ' + e.message;
    }
  }

  function selectCategory(cat) {
    currentCategory = cat;
    document.querySelectorAll('#svcCategories [data-cat]').forEach(b => {
      const on = b.getAttribute('data-cat') === cat;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    render();
  }

  function init() {
    const r = searchEl(); if (r) r.addEventListener('input', render);
    const rb = document.getElementById('svcRefresh'); if (rb) rb.addEventListener('click', load);
    document.querySelectorAll('#svcCategories [data-cat]').forEach(b => {
      b.addEventListener('click', () => selectCategory(b.getAttribute('data-cat')));
    });
    load();
  }

  document.addEventListener('brightier:ready', init);
})();
