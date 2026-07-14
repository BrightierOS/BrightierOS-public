/* ============================================================
   BrightierOS — Community Store
   ============================================================ */
(function () {
  'use strict';

  const storesEl = document.getElementById('stores');
  const appsSection = document.getElementById('appsSection');
  const appsEl = document.getElementById('apps');
  const currentStoreName = document.getElementById('currentStoreName');
  const storeMsg = document.getElementById('storeMsg');
  const form = document.getElementById('storeForm');

  let activeStore = null;

  async function renderStores() {
    try {
      const stores = await api.store.list();
      if (!stores.length) { storesEl.innerHTML = '<p class="muted">Nenhuma loja registrada ainda.</p>'; return; }
      storesEl.innerHTML = stores.map(s => `
        <div class="card" style="padding:16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
            <div><div style="font-weight:600;">${ui.escapeHtml(s.name)}</div>
            <div class="muted" style="font-size:12px;">${ui.escapeHtml(s.id)}</div></div>
            <div class="row-actions">
              <button class="btn sm" data-view="${ui.escapeHtml(s.id)}">Ver plugins</button>
              <a class="btn ghost sm" href="${ui.escapeHtml(s.url)}" target="_blank" rel="noopener">Abrir repositório</a>
            </div>
          </div>
        </div>`).join('');
      storesEl.querySelectorAll('[data-view]').forEach(b => b.onclick = () => viewCatalog(b.getAttribute('data-view')));
    } catch (e) { storesEl.innerHTML = `<p class="muted">Erro: ${ui.escapeHtml(e.message)}</p>`; }
  }

  async function viewCatalog(storeId) {
    try {
      const stores = await api.store.list();
      activeStore = stores.find(s => s.id === storeId);
      currentStoreName.textContent = activeStore ? activeStore.name : storeId;
      appsSection.classList.remove('hidden');
      appsEl.innerHTML = '<p class="muted">Carregando catálogo...</p>';
      appsSection.scrollIntoView({ behavior: 'smooth' });
      const apps = await api.store.catalog(storeId);
      if (!apps || !apps.length) { appsEl.innerHTML = '<p class="muted">Catálogo vazio.</p>'; return; }
      appsEl.innerHTML = apps.map(a => `
        <div class="card" style="padding:16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
            <div><div style="font-weight:600;">${ui.escapeHtml(a.name || a.id)}</div>
            <div class="muted" style="font-size:12px;">v${ui.escapeHtml(a.version || '?')}${a.author ? ` · ${ui.escapeHtml(a.author)}` : ''}</div></div>
            <div class="row-actions"><button class="btn sm" data-install="${ui.escapeHtml(a.id)}">Instalar</button></div>
          </div>
          ${a.description ? `<p class="muted" style="margin-top:8px;">${ui.escapeHtml(a.description)}</p>` : ''}
        </div>`).join('');
      appsEl.querySelectorAll('[data-install]').forEach(b => b.onclick = () => confirmInstall(b.getAttribute('data-install')));
    } catch (e) {
      appsSection.classList.remove('hidden');
      appsEl.innerHTML = `<p class="muted" style="color:var(--danger)">Erro: ${ui.escapeHtml(e.message)}</p>`;
    }
  }

  async function confirmInstall(pluginId) {
    const msg = activeStore
      ? `Isto instalará "${pluginId}" da loja "${activeStore.name}".\nO plugin poderá executar código no seu servidor.\nOrigem: ${activeStore.url}`
      : `Confirma a instalação de "${pluginId}"?`;
    const ok = await ui.confirm(msg, { title: 'Instalar plugin', okText: 'Instalar' });
    if (!ok || !activeStore) return;
    try {
      const r = await api.store.install(activeStore.id, pluginId);
      ui.toast(r.message || 'Plugin instalado.', 'ok');
    } catch (e) { ui.toast('Erro ao instalar: ' + e.message, 'err'); }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    storeMsg.textContent = ''; storeMsg.className = 'msg';
    const id = form.id.value.trim();
    const name = form.name.value.trim();
    const url = form.url.value.trim();
    if (!id || !name || !url) { storeMsg.textContent = 'Preencha todos os campos.'; storeMsg.className = 'msg err'; return; }
    try {
      const r = await api.store.add(id, name, url);
      storeMsg.textContent = r.message || 'Loja adicionada.';
      storeMsg.className = 'msg ok';
      form.reset();
      renderStores();
    } catch (err) { storeMsg.textContent = err.message || 'Erro ao adicionar.'; storeMsg.className = 'msg err'; }
  });

  document.getElementById('backToStores').onclick = () => { appsSection.classList.add('hidden'); activeStore = null; };

  renderStores();
})();
