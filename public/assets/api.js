/* ============================================================
   BrightierOS — Shared API client + UI utilities
   Exposes: window.api, window.ui
   ============================================================ */
(function () {
  'use strict';

  async function fetchJSON(url, options = {}) {
    const token = (typeof localStorage !== 'undefined') ? localStorage.getItem('brightieros-token') : null;
    const headers = { ...(options.headers || {}) };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch(url, { ...options, headers });
    let data = null;
    try { data = await res.json(); } catch (_) { /* no body */ }
    if (!res.ok) {
      const err = new Error((data && (data.error || data.message)) || `HTTP ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function postJSON(url, body, extra = {}) {
    return fetchJSON(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(extra.headers || {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      ...extra,
    });
  }

  // v0.8.3 — base de URLs de arquivos. Nó local usa /api/files; nós remotos
  // passam pelo proxy /api/infrastructure/nodes/:id/proxy/files (o servidor
  // local autentica no remoto e encaminha).
  function fileBase(nodeId) {
    if (!nodeId || nodeId === 'local') return '/api/files';
    return '/api/infrastructure/nodes/' + encodeURIComponent(nodeId) + '/proxy/files';
  }

  const ui = {
    escapeHtml(str) {
      return String(str == null ? '' : str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },

    formatBytes(bytes) {
      if (bytes === null || bytes === undefined || isNaN(bytes)) return '—';
      const n = Number(bytes);
      if (n < 1) return '0 B';
      const units = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
      return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
    },

    fileIcon(name) {
      const ext = (name.split('.').pop() || '').toLowerCase();
      const map = {
        txt: '📄', md: '📝', json: '🔧', js: '📜', css: '🎨', html: '🌐',
        xml: '📰', csv: '📊', png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️',
        svg: '🖼️', pdf: '📕', zip: '🗜️', mp3: '🎵', mp4: '🎬',
      };
      return map[ext] || '📄';
    },

    toast(message, type = 'info') {
      let box = document.getElementById('toasts');
      if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
      const el = document.createElement('div');
      el.className = `toast ${type}`;
      el.innerHTML = `<span class="dot"></span><span>${ui.escapeHtml(message)}</span>`;
      box.appendChild(el);
      setTimeout(() => {
        el.style.transition = 'opacity .3s ease, transform .3s ease';
        el.style.opacity = '0';
        el.style.transform = 'translateY(8px)';
        setTimeout(() => el.remove(), 320);
      }, 3200);
    },

    confirm(message, opts = {}) {
      return new Promise((resolve) => {
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';
        const danger = !!opts.danger;
        backdrop.innerHTML = `
          <div class="modal" role="dialog" aria-modal="true">
            <h3>${ui.escapeHtml(opts.title || 'Confirmar')}</h3>
            <p>${ui.escapeHtml(message)}</p>
            <div class="row">
              <button class="btn ghost" data-act="cancel">${ui.escapeHtml(opts.cancelText || 'Cancelar')}</button>
              <button class="btn ${danger ? 'danger' : ''}" data-act="ok">${ui.escapeHtml(opts.okText || 'Confirmar')}</button>
            </div>
          </div>`;
        document.body.appendChild(backdrop);
        const close = (val) => { backdrop.remove(); resolve(val); };
        backdrop.querySelector('[data-act="cancel"]').onclick = () => close(false);
        backdrop.querySelector('[data-act="ok"]').onclick = () => close(true);
        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(false); });
      });
    },

    prompt(message, opts = {}) {
      return new Promise((resolve) => {
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';
        backdrop.innerHTML = `
          <div class="modal" role="dialog" aria-modal="true">
            <h3>${ui.escapeHtml(opts.title || 'Informe')}</h3>
            <p>${ui.escapeHtml(message)}</p>
            <input type="text" data-field value="${ui.escapeHtml(opts.value || '')}" placeholder="${ui.escapeHtml(opts.placeholder || '')}" />
            <div class="row">
              <button class="btn ghost" data-act="cancel">${ui.escapeHtml(opts.cancelText || 'Cancelar')}</button>
              <button class="btn" data-act="ok">${ui.escapeHtml(opts.okText || 'OK')}</button>
            </div>
          </div>`;
        document.body.appendChild(backdrop);
        const input = backdrop.querySelector('[data-field]');
        input.focus();
        input.select();
        const close = (val) => { backdrop.remove(); resolve(val); };
        backdrop.querySelector('[data-act="cancel"]').onclick = () => close(null);
        backdrop.querySelector('[data-act="ok"]').onclick = () => close(input.value.trim());
        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(null); });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') close(input.value.trim());
          if (e.key === 'Escape') close(null);
        });
      });
    },

    // Copia texto para a área de transferência. Funciona em contexto seguro
    // (HTTPS/localhost) via navigator.clipboard e, fora dele (HTTP em LAN),
    // usa um textarea + execCommand('copy') como fallback.
    async copy(text) {
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
          return true;
        }
      } catch (_) { /* cai no fallback */ }
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, ta.value.length);
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch (_) {
        return false;
      }
    },

    // v0.8.4 — Modal compartilhado de credenciais de nó remoto (usado pela
    // página de Arquivos e pela de Lixeira). Resolve true quando as credenciais
    // foram salvas com sucesso, ou false se o usuário cancelou. Em caso de erro
    // (ex.: 403 para não-admin), mantém o modal aberto para tentar de novo.
    // O chamador é responsável por recarregar a lista de nós/após salvar.
    nodeCredentialsModal(node) {
      return new Promise((resolve) => {
        if (!node || !node.id) { resolve(false); return; }
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';
        backdrop.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
        <h3>Credenciais — ${ui.escapeHtml(node.name)}</h3>
        <p class="muted" style="font-size:13px">Informe uma conta de <b>administrador</b> (ou editor) deste nó remoto. Ela é usada apenas para acessar os arquivos dele a partir daqui.</p>
        <label>Usuário</label>
        <input data-f="username" />
        <label style="margin-top:10px">Senha</label>
        <input data-f="password" type="password" />
        <div class="row"><button class="btn ghost" data-cancel>Cancelar</button><button class="btn" data-save>Salvar</button></div>
      </div>`;
        document.body.appendChild(backdrop);
        const val = (f) => backdrop.querySelector(`[data-f="${f}"]`);
        const close = () => backdrop.remove();
        backdrop.querySelector('[data-cancel]').onclick = () => { close(); resolve(false); };
        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) { close(); resolve(false); } });
        backdrop.querySelector('[data-save]').onclick = async () => {
          try {
            const d = await api.infrastructure.setCredentials(node.id, { username: val('username').value.trim(), password: val('password').value });
            if (d && d.compatible === false) {
              ui.toast('Credenciais salvas, mas ' + (d.compatError || 'o nó remoto não é compatível (não é um BrightierOS v0.8.0+).'), 'err');
            } else {
              ui.toast('Credenciais salvas e nó compatível.', 'ok');
            }
            close();
            resolve(true);
          } catch (e) { ui.toast(e.message, 'err'); }
        };
      });
    },
  };

  const api = {
    fetchJSON,

    user: {
      login: (username, password) => postJSON('/api/users/login', { username, password }),
      setup: () => fetchJSON('/api/users/setup'),
      list: () => fetchJSON('/api/users/list'),
      me: () => fetchJSON('/api/users/me'),
      updateMe: (patch) => postJSON('/api/users/me', patch, { method: 'PUT' }),
      roles: () => fetchJSON('/api/users/roles'),
      sessions: () => fetchJSON('/api/users/sessions'),
      logout: () => postJSON('/api/users/logout', {}),
      create: (username, password, role = 'viewer', displayName, invite) =>
        postJSON('/api/users/create', { username, password, role, displayName, invite }),
      invites: {
        list: () => fetchJSON('/api/users/invites'),
        get: (token) => fetchJSON(`/api/users/invites/${encodeURIComponent(token)}`),
        create: (role, expiresInHours = 168) => postJSON('/api/users/invites', { role, expiresInHours }),
        revoke: (token) => fetchJSON(`/api/users/invites/${encodeURIComponent(token)}`, { method: 'DELETE' }),
      },
      update: (id, patch) => postJSON(`/api/users/${id}`, patch, { method: 'PUT' }),
      remove: (id) => fetchJSON(`/api/users/${id}`, { method: 'DELETE' }),
      changePassword: (id, password) => postJSON(`/api/users/${id}/password`, { password }),
      login: (username, password) =>
        postJSON('/api/users/login', { username, password }),
      reset: () =>
        fetchJSON('/api/users/reset', { method: 'POST', headers: { 'x-confirmed-reset': 'true' } }),
    },

    admin: {
      settings: () => fetchJSON('/api/admin/settings'),
      saveSettings: (patch) => postJSON('/api/admin/settings', patch, { method: 'PUT' }),
      logs: () => fetchJSON('/api/admin/logs'),
      restart: () => postJSON('/api/admin/restart', {}),
    },

    stats: () => fetchJSON('/api/stats'),
    history: () => fetchJSON('/api/metrics/history'),

    plugins: {
      list: () => fetchJSON('/api/plugins'),
      uninstall: (id) => fetchJSON(`/api/plugins/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    },

    update: {
      check: () => fetchJSON('/api/update/check'),
      apply: (opts = {}) => postJSON('/api/update/apply', opts),
      history: () => fetchJSON('/api/update/history'),
      rollback: (opts = {}) => postJSON('/api/update/rollback', opts),
      backup: () => postJSON('/api/update/backup', {}),
      backups: () => fetchJSON('/api/update/backups'),
      restore: (backupId) => postJSON('/api/update/restore', { backupId }),
      changelog: () => fetchJSON('/api/update/changelog'),
    },

    store: {
      list: () => fetchJSON('/api/store'),
      add: (id, name, url) => postJSON('/api/store', { id, name, url }),
      catalog: (id) => fetchJSON(`/api/store/${encodeURIComponent(id)}/catalog`),
      install: (storeId, pluginId) =>
        postJSON(`/api/store/${encodeURIComponent(storeId)}/install/${encodeURIComponent(pluginId)}`),
    },

    files: {
      list: (path = '', nodeId) => fetchJSON(`${fileBase(nodeId)}/list?path=${encodeURIComponent(path)}`).then((d) => d && Array.isArray(d.data) ? d.data : (Array.isArray(d) ? d : [])),
      createFolder: (path, nodeId) => postJSON(`${fileBase(nodeId)}/create-folder`, { path }),
      createFile: (path, nodeId) => postJSON(`${fileBase(nodeId)}/create-file`, { path }),
      rename: (oldPath, newPath, nodeId) => postJSON(`${fileBase(nodeId)}/rename`, { oldPath, newPath }),
      remove: (path, nodeId) => postJSON(`${fileBase(nodeId)}/delete`, { path }),
      save: (path, content, nodeId) => postJSON(`${fileBase(nodeId)}/save`, { path, content }),
      upload: (file, path = '', nodeId) => {
        const fd = new FormData();
        fd.append('file', file);
        if (path) fd.append('path', path);
        return fetchJSON(`${fileBase(nodeId)}/upload`, { method: 'POST', body: fd });
      },
      uploadFolder: (path, files, nodeId) => postJSON(`${fileBase(nodeId)}/upload-folder`, { path, files }),
      readUrl: (path, nodeId) => `${fileBase(nodeId)}/read?path=${encodeURIComponent(path)}`,
      downloadUrl: (path, nodeId) => `${fileBase(nodeId)}/download?path=${encodeURIComponent(path)}`,
      trash: (path, nodeId) => postJSON(`${fileBase(nodeId)}/trash`, { path }),
      trashList: (nodeId) => fetchJSON(`${fileBase(nodeId)}/trash`).then((d) => d && Array.isArray(d.data) ? d.data : (Array.isArray(d) ? d : [])),
      trashStats: (nodeId) => fetchJSON(`${fileBase(nodeId)}/trash/stats`).then((d) => d && d.data ? d.data : d),
      restore: (trashPath, nodeId) => postJSON(`${fileBase(nodeId)}/trash/restore`, { trashPath }),
      emptyTrash: (nodeId) => fetchJSON(`${fileBase(nodeId)}/trash`, { method: 'DELETE' }),
      trashDelete: (trashPath, nodeId) =>
        fetchJSON(`${fileBase(nodeId)}/trash/${encodeURIComponent(trashPath)}`, { method: 'DELETE' }),
    },
    metrics: {
      current: () => fetchJSON('/api/metrics/current'),
      history: (limit) => fetchJSON(`/api/metrics/history?limit=${encodeURIComponent(limit || 100)}`),
      summary: (limit) => fetchJSON(`/api/metrics/summary?limit=${encodeURIComponent(limit || 100)}`),
      clearHistory: () => fetchJSON('/api/metrics/history', { method: 'DELETE' }),
    },

    services: {
      list: () => fetchJSON('/api/services'),
      status: (id) => fetchJSON(`/api/services/${encodeURIComponent(id)}`),
      logs: (id, lines) => fetchJSON(`/api/services/${encodeURIComponent(id)}/logs?lines=${encodeURIComponent(lines || 100)}`),
      start: (id) => postJSON(`/api/services/${encodeURIComponent(id)}/start`, {}),
      stop: (id) => postJSON(`/api/services/${encodeURIComponent(id)}/stop`, {}),
      restart: (id) => postJSON(`/api/services/${encodeURIComponent(id)}/restart`, {}),
    },

    infrastructure: {
      overview: () => fetchJSON('/api/infrastructure/overview'),
      nodes: () => fetchJSON('/api/infrastructure/nodes'),
      addNode: (data) => postJSON('/api/infrastructure/nodes', data),
      updateNode: (id, data) => postJSON(`/api/infrastructure/nodes/${encodeURIComponent(id)}`, data, { method: 'PUT' }),
      removeNode: (id) => fetchJSON(`/api/infrastructure/nodes/${encodeURIComponent(id)}`, { method: 'DELETE' }),
      checkNode: (id) => postJSON(`/api/infrastructure/nodes/${encodeURIComponent(id)}/check`, {}),
      checkAllNodes: () => postJSON('/api/infrastructure/nodes/check', {}),
      hasCredentials: (id) => fetchJSON(`/api/infrastructure/nodes/${encodeURIComponent(id)}/credentials`),
      setCredentials: (id, data) => postJSON(`/api/infrastructure/nodes/${encodeURIComponent(id)}/credentials`, data),
      clearCredentials: (id) => fetchJSON(`/api/infrastructure/nodes/${encodeURIComponent(id)}/credentials`, { method: 'DELETE' }),
    },

    notifications: {
      list: () => fetchJSON('/api/notifications'),
      add: (type, message, category) => postJSON('/api/notifications', { type, message, category }),
      markRead: (id) => postJSON(`/api/notifications/${encodeURIComponent(id)}/read`, {}),
      readAll: () => postJSON('/api/notifications/read-all', {}),
      unread: () => fetchJSON('/api/notifications/unread'),
      clear: () => fetchJSON('/api/notifications', { method: 'DELETE' }),
      streamUrl: () => {
        const token = (typeof localStorage !== 'undefined') ? (localStorage.getItem('brightieros-token') || '') : '';
        return `/api/notifications/stream?token=${encodeURIComponent(token)}`;
      },
    },

  };

  window.api = api;
  window.ui = ui;
})();

