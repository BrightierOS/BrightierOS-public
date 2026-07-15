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
  };

  const api = {
    fetchJSON,

    user: {
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
      list: (path = '') => fetchJSON(`/api/files/list?path=${encodeURIComponent(path)}`),
      createFolder: (path) => postJSON('/api/files/create-folder', { path }),
      createFile: (path) => postJSON('/api/files/create-file', { path }),
      rename: (oldPath, newPath) => postJSON('/api/files/rename', { oldPath, newPath }),
      remove: (path) => postJSON('/api/files/delete', { path }),
      save: (path, content) => postJSON('/api/files/save', { path, content }),
      upload: (file, path = '') => {
        const fd = new FormData();
        fd.append('file', file);
        if (path) fd.append('path', path);
        return fetchJSON('/api/files/upload', { method: 'POST', body: fd });
      },
      uploadFolder: (path, files) => postJSON('/api/files/upload-folder', { path, files }),
      readUrl: (path) => `/api/files/read?path=${encodeURIComponent(path)}`,
      downloadUrl: (path) => `/api/files/download?path=${encodeURIComponent(path)}`,
      trash: (path) => postJSON('/api/files/trash', { path }),
      trashList: () => fetchJSON('/api/files/trash'),
      trashStats: () => fetchJSON('/api/files/trash/stats'),
      restore: (trashPath) => postJSON('/api/files/trash/restore', { trashPath }),
      emptyTrash: () => fetchJSON('/api/files/trash', { method: 'DELETE' }),
      trashDelete: (trashPath) =>
        fetchJSON(`/api/files/trash/${encodeURIComponent(trashPath)}`, { method: 'DELETE' }),
    },
  };

  window.api = api;
  window.ui = ui;
})();

