/* ============================================================
   BrightierOS — File manager
   ============================================================ */
(function () {
  'use strict';

  const TEXT_EXT = ['txt', 'md', 'json', 'js', 'css', 'html', 'xml', 'csv'];
  let currentPath = '';

  const grid = document.getElementById('fileGrid');
  const breadcrumb = document.getElementById('breadcrumb');

  function joinPath(...parts) { return parts.filter(p => p && p.length).join('/'); }
  function dirName(p) { const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); }
  function baseName(p) { const i = p.lastIndexOf('/'); return i < 0 ? p : p.slice(i + 1); }
  function extOf(name) { const i = name.lastIndexOf('.'); return i < 0 ? '' : name.slice(i + 1).toLowerCase(); }

  // v0.8.3 — seletor de nó: acessa arquivos de outros servidores da infraestrutura
  // via proxy. O nó local usa /api/files; nós remotos passam pelo proxy do servidor.
  let currentNode = 'local';
  const nodeSelect = document.getElementById('nodeSelect');

  // fetch autenticado (Bearer) — necessário para ler/baixar via proxy remoto,
  // já que read/download não passam pelo fetchJSON que injeta o token.
  function authFetch(url, opts = {}) {
    const token = (typeof localStorage !== 'undefined') ? localStorage.getItem('brightieros-token') : null;
    const headers = { ...(opts.headers || {}) };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return fetch(url, { ...opts, headers });
  }

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
    sub.textContent = currentNode === 'local' ? 'Seus dados, organizados.' : `Arquivos de: ${name}`;
  }

  async function selectNode(id) {
    currentNode = id;
    currentPath = '';
    renderBreadcrumb();
    if (id !== 'local') {
      try {
        const d = await api.infrastructure.nodes();
        const node = ((d && d.data) || []).find(n => n.id === id);
        if (node && !node.credentialsConfigured) {
          ui.toast('Configure as credenciais deste nó para acessar os arquivos.', 'info');
          const saved = await ui.nodeCredentialsModal(node);
          if (saved) { await loadNodeSelector(); updateSub(); }
        }
      } catch (_) {}
    }
    updateSub();
    load();
  }
  if (nodeSelect) nodeSelect.addEventListener('change', () => selectNode(nodeSelect.value));

  function renderBreadcrumb() {
    const parts = currentPath ? currentPath.split('/') : [];
    let html = `<span class="crumb ${parts.length ? '' : 'current'}" data-idx="-1">Home</span>`;
    let acc = '';
    parts.forEach((seg, i) => {
      acc = joinPath(acc, seg);
      const last = i === parts.length - 1;
      html += `<span class="sep">/</span><span class="crumb ${last ? 'current' : ''}" data-path="${ui.escapeHtml(acc)}">${ui.escapeHtml(seg)}</span>`;
    });
    breadcrumb.innerHTML = html;
    breadcrumb.querySelectorAll('.crumb').forEach(c => {
      c.addEventListener('click', () => {
        if (c.classList.contains('current')) return;
        if (c.getAttribute('data-idx') === '-1') currentPath = '';
        else currentPath = c.getAttribute('data-path');
        renderBreadcrumb(); load();
      });
    });
  }

  async function load() {
    try {
      const items = await api.files.list(currentPath, currentNode);
      items.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      if (!items.length) { grid.innerHTML = '<p class="empty">Pasta vazia.</p>'; return; }
      grid.innerHTML = items.map(it => {
        const isFolder = it.type === 'folder';
        const full = joinPath(currentPath, it.name);
        const canWrite = window.bosCan && window.bosCan('files:all');
        const acts = `<button class="btn ghost sm" data-act="open" data-path="${ui.escapeHtml(full)}">Abrir</button>` +
          (isFolder ? '' : `<button class="btn ghost sm" data-act="download" data-path="${ui.escapeHtml(full)}">Baixar</button>`);
        const writeActs = canWrite
          ? `<button class="btn ghost sm" data-act="rename" data-path="${ui.escapeHtml(full)}" data-name="${ui.escapeHtml(it.name)}">Renomear</button>
            <button class="btn ghost sm" data-act="trash" data-path="${ui.escapeHtml(full)}">Lixeira</button>
            <button class="btn danger sm" data-act="delete" data-path="${ui.escapeHtml(full)}">Excluir</button>`
          : `<span class="muted" style="font-size:12px">somente leitura</span>`;
        return `<div class="file-item" data-type="${it.type}" data-path="${ui.escapeHtml(full)}">
          <div class="ic">${isFolder ? '📁' : ui.fileIcon(it.name)}</div>
          <div class="nm">${ui.escapeHtml(it.name)}</div>
          <div class="sz">${it.type === 'folder' ? 'pasta' : ui.formatBytes(it.size)}</div>
          <div class="acts">
            ${acts}
            ${writeActs}
          </div>
        </div>`;
      }).join('');
      bindItemActions();
    } catch (e) {
      grid.innerHTML = `<p class="empty">Erro ao carregar a pasta: ${ui.escapeHtml(e.message)}</p>`;
    }
  }

  function bindItemActions() {
    grid.querySelectorAll('.file-item').forEach(item => {
      item.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-act]');
        const path = item.getAttribute('data-path');
        const type = item.getAttribute('data-type');
        if (btn) {
          const act = btn.getAttribute('data-act');
          if (act === 'open') { type === 'folder' ? navigateInto(path) : openFile(path); }
          else if (act === 'download') { downloadFile(path); }
          else if (act === 'rename') { doRename(path, btn.getAttribute('data-name')); }
          else if (act === 'trash') { doTrash(path); }
          else if (act === 'delete') { doDelete(path); }
          return;
        }
        if (type === 'folder') navigateInto(path);
      });
    });
  }

  function navigateInto(path) { currentPath = path; renderBreadcrumb(); load(); }

  document.getElementById('backBtn').onclick = () => { currentPath = dirName(currentPath); renderBreadcrumb(); load(); };

  // Visualizador (viewer) é somente-leitura: esconde ações de escrita.
  if (!(window.bosCan && window.bosCan('files:all'))) {
    ['newFolderBtn', 'newFileBtn', 'uploadBtn', 'uploadFolderBtn'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  }

  document.getElementById('newFolderBtn').onclick = async () => {
    const name = await ui.prompt('Nome da nova pasta:', { title: 'Nova pasta' });
    if (!name) return;
    try { await api.files.createFolder(joinPath(currentPath, name), currentNode); ui.toast('Pasta criada.', 'ok'); load(); }
    catch (e) { ui.toast('Erro: ' + e.message, 'err'); }
  };

  document.getElementById('newFileBtn').onclick = async () => {
    const name = await ui.prompt('Nome do novo arquivo:', { title: 'Novo arquivo' });
    if (!name) return;
    try { await api.files.createFile(joinPath(currentPath, name), currentNode); ui.toast('Arquivo criado.', 'ok'); load(); }
    catch (e) { ui.toast('Erro: ' + e.message, 'err'); }
  };

  const uploadInput = document.getElementById('uploadInput');
  document.getElementById('uploadBtn').onclick = () => uploadInput.click();
  uploadInput.onchange = async () => {
    const files = Array.from(uploadInput.files || []);
    if (!files.length) return;
    for (const f of files) {
      try { await api.files.upload(f, currentPath, currentNode); }
      catch (e) { ui.toast('Falha em ' + f.name + ': ' + e.message, 'err'); }
    }
    uploadInput.value = '';
    ui.toast('Upload concluído.', 'ok'); load();
  };

  const uploadFolderInput = document.getElementById('uploadFolderInput');
  document.getElementById('uploadFolderBtn').onclick = () => uploadFolderInput.click();
  uploadFolderInput.onchange = async () => {
    const files = Array.from(uploadFolderInput.files || []);
    if (!files.length) return;
    for (const f of files) {
      const rel = f.webkitRelativePath || f.name;
      const segs = rel.split('/');
      const dir = segs.slice(0, -1).join('/');
      try { await api.files.upload(f, joinPath(currentPath, dir), currentNode); }
      catch (e) { ui.toast('Falha em ' + rel + ': ' + e.message, 'err'); }
    }
    uploadFolderInput.value = '';
    ui.toast('Pasta enviada.', 'ok'); load();
  };

  async function doRename(path, oldName) {
    const name = await ui.prompt('Novo nome:', { title: 'Renomear', value: oldName });
    if (!name || name === oldName) return;
    try { await api.files.rename(path, joinPath(dirName(path), name), currentNode); ui.toast('Renomeado.', 'ok'); load(); }
    catch (e) { ui.toast('Erro: ' + e.message, 'err'); }
  }

  async function doTrash(path) {
    const ok = await ui.confirm(`Mover "${baseName(path)}" para a lixeira?`, { title: 'Lixeira' });
    if (!ok) return;
    try { await api.files.trash(path, currentNode); ui.toast('Movido para a lixeira.', 'ok'); load(); }
    catch (e) { ui.toast('Erro: ' + e.message, 'err'); }
  }

  async function doDelete(path) {
    const ok = await ui.confirm(`Excluir "${baseName(path)}" permanentemente?`, { title: 'Excluir', danger: true, okText: 'Excluir' });
    if (!ok) return;
    try { await api.files.remove(path, currentNode); ui.toast('Excluído.', 'ok'); load(); }
    catch (e) { ui.toast('Erro: ' + e.message, 'err'); }
  }

  async function downloadFile(path) {
    try {
      const res = await authFetch(api.files.downloadUrl(path, currentNode));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = baseName(path);
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (e) { ui.toast('Erro ao baixar: ' + e.message, 'err'); }
  }

  async function openFile(path) {
    const ext = extOf(baseName(path));
    if (!TEXT_EXT.includes(ext)) { downloadFile(path); return; }
    try {
      const res = await authFetch(api.files.readUrl(path, currentNode));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      openEditor(path, text);
    } catch (e) { ui.toast('Erro ao abrir: ' + e.message, 'err'); }
  }

  function openEditor(path, content) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal" style="width:min(720px,100%)">
        <h3>${ui.escapeHtml(baseName(path))}</h3>
        <p>${ui.escapeHtml(path)}</p>
        <textarea class="editor-area" data-field>${ui.escapeHtml(content)}</textarea>
        <div class="row">
          <button class="btn ghost" data-act="cancel">Fechar</button>
          <button class="btn" data-act="save">Salvar</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    const ta = backdrop.querySelector('[data-field]');
    const close = () => backdrop.remove();
    backdrop.querySelector('[data-act="cancel"]').onclick = close;
    backdrop.querySelector('[data-act="save"]').onclick = async () => {
      const saveBtn = backdrop.querySelector('[data-act="save"]');
      saveBtn.disabled = true; saveBtn.textContent = 'Salvando...';
      try { await api.files.save(path, ta.value, currentNode); ui.toast('Salvo.', 'ok'); close(); }
      catch (e) { ui.toast('Erro ao salvar: ' + e.message, 'err'); saveBtn.disabled = false; saveBtn.textContent = 'Salvar'; }
    };
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  }

  renderBreadcrumb();
  loadNodeSelector();
  load();
})();

