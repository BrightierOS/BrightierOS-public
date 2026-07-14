/* public/assets/store.js */
// Simple UI for managing Community Stores
document.addEventListener('DOMContentLoaded', () => {
  const storeForm = document.getElementById('store-form');
  const storeMsg = document.getElementById('store-msg');
  const storesList = document.getElementById('stores');
  const appsSection = document.getElementById('apps-list');
  const appsList = document.getElementById('apps');
  const backBtn = document.getElementById('back-to-stores');
  const currentStoreName = document.getElementById('current-store-name');

  const api = {
    getStores: () => fetch('/api/store').then(r => r.json()),
    addStore: (data) => fetch('/api/store', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
    getCatalog: (id) => fetch(`/api/store/${id}/catalog`).then(r => r.json()),
    installPlugin: (storeId, pluginId) => fetch(`/api/store/${storeId}/install/${pluginId}`, { method: 'POST' }).then(r => r.json()),
  };

  function refreshStores() {
    api.getStores().then(stores => {
      storesList.innerHTML = '';
      stores.forEach(s => {
        const li = document.createElement('li');
        li.textContent = `${s.name} (${s.id})`;
        const viewBtn = document.createElement('button');
        viewBtn.textContent = 'Ver Plugins';
        viewBtn.onclick = () => loadCatalog(s);
        li.appendChild(viewBtn);
        storesList.appendChild(li);
      });
    });
  }

  function loadCatalog(store) {
    api.getCatalog(store.id).then(apps => {
      currentStoreName.textContent = store.name;
      appsList.innerHTML = '';
      apps.forEach(app => {
        const li = document.createElement('li');
        li.textContent = `${app.name} – v${app.version}`;
        const installBtn = document.createElement('button');
        installBtn.textContent = 'Instalar';
        installBtn.onclick = () => confirmInstall(store, app);
        li.appendChild(installBtn);
        appsList.appendChild(li);
      });
      appsSection.style.display = 'block';
    }).catch(err => alert('Erro ao ler catálogo: ' + err));
  }

  function confirmInstall(store, app) {
    const msg = `⚠️ Aviso do BrightierOS\n\nVocê está instalando um plugin criado pela comunidade.\n\nOrigem: ${store.url}\nAutor: ${app.author || 'Desconhecido'}\nVersão: ${app.version}\n\nEste plugin poderá executar código no seu servidor.\n\nDeseja continuar?`;
    if (confirm(msg)) {
      api.installPlugin(store.id, app.id).then(res => {
        alert(res.message || 'Plugin instalado');
        // refresh page or inform user
      }).catch(err => alert('Erro ao instalar: ' + err));
    }
  }

  backBtn.addEventListener('click', () => {
    appsSection.style.display = 'none';
  });

  storeForm.addEventListener('submit', e => {
    e.preventDefault();
    const data = {
      id: e.target.id.value.trim(),
      name: e.target.name.value.trim(),
      url: e.target.url.value.trim()
    };
    api.addStore(data).then(res => {
      storeMsg.textContent = res.message || 'Loja adicionada';
      e.target.reset();
      refreshStores();
    }).catch(err => {
      storeMsg.textContent = 'Erro: ' + err;
    });
  });

  refreshStores();
});
