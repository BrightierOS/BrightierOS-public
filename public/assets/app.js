/* ============================================================
   BrightierOS — App shell: layout mount + auth guard
   ============================================================ */
(function () {
  'use strict';

  const ICONS = {
    dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
    files: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
    console: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M13 15h4"/></svg>',
    store: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h16l-1.5 9h-13z"/><path d="M4 5L3 3H1"/><circle cx="8" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13h10l1-13"/></svg>',
    logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3M10 12h10M17 9l3 3-3 3"/></svg>',
    reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 12a8 8 0 1 1 2.3 5.6M4 12V7M4 12h5"/></svg>',
    admin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l7 3v5c0 4-3 7-7 8-4-1-7-4-7-8V6z"/><path d="M9 12l2 2 4-4"/></svg>',
    profile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
    services: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/></svg>',
    infra: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/><circle cx="7" cy="7" r="1"/><circle cx="7" cy="17" r="1"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
  };

  const NAV = [
    { key: 'dashboard', href: '/', label: 'Dashboard', icon: ICONS.dashboard },
    { key: 'files', href: '/files.html', label: 'Arquivos', icon: ICONS.files },
    { key: 'store', href: '/store.html', label: 'Loja', icon: ICONS.store },
    { key: 'trash', href: '/trash.html', label: 'Lixeira', icon: ICONS.trash },
    { key: 'services', href: '/services.html', label: 'Serviços', icon: ICONS.services },
    { key: 'infra', href: '/infrastructure.html', label: 'Infra', icon: ICONS.infra },
    { key: 'admin', href: '/admin.html', label: 'Administração', icon: ICONS.admin, role: 'admin' },
    { key: 'console', href: '/console.html', label: 'Console', icon: ICONS.console, role: 'admin' },
    { key: 'profile', href: '/profile.html', label: 'Perfil', icon: ICONS.profile },
  ];

  // Console e Administração aparecem apenas para administradores.
  function currentRole() {
    try { return (JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}).role || null; } catch (_) { return null; }
  }

  function navVisible(item) {
    if (item.role === 'admin') return currentRole() === 'admin';
    return true;
  }

  const STORAGE_KEY = 'brightieros-user';

  /* ---------- Boot loader (tela de carregamento de 2s) ---------- */
  const BOOT_MIN_MS = 2000;
  const bootStart = Date.now();

  function hideBootLoader() {
    const loader = document.getElementById('boot-loader');
    if (!loader) return;
    loader.classList.add('hidden');
    let removed = false;
    const remove = () => { if (!removed) { removed = true; loader.remove(); } };
    loader.addEventListener('transitionend', remove, { once: true });
    setTimeout(remove, 600); // fallback caso o transitionend não dispare
  }

  function finishBoot() {
    const elapsed = Date.now() - bootStart;
    const wait = Math.max(0, BOOT_MIN_MS - elapsed);
    setTimeout(hideBootLoader, wait);
  }


  function startClock(el) {
    const tick = () => { el.textContent = new Date().toLocaleTimeString('pt-BR'); };
    tick();
    setInterval(tick, 1000);
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('brightieros-token');
    window.location.replace('/login.html');
  }

  async function resetSystem() {
    const ok = await ui.confirm(
      'Isto vai apagar TODOS os dados (usuários, arquivos, lixeira, plugins e lojas) e reiniciar o sistema. Esta ação não pode ser desfeita.',
      { title: 'Resetar sistema', danger: true, okText: 'Resetar mesmo assim' }
    );
    if (!ok) return;
    try {
      await api.user.reset();
      ui.toast('Sistema resetado. Redirecionando...', 'ok');
      setTimeout(logout, 900);
    } catch (e) {
      ui.toast('Falha ao resetar: ' + e.message, 'err');
    }
  }

  function startNotifications(shell) {
    const btn = shell.querySelector('#notifBtn');
    const badge = shell.querySelector('#notifBadge');
    if (!btn || !badge) return;
    let panel = null;

    function updateBadge(count) {
      if (count > 0) { badge.textContent = count > 99 ? '99+' : count; badge.style.display = ''; }
      else { badge.style.display = 'none'; }
    }

    function renderList(list) {
      if (!panel) return;
      const items = (list || []).slice(0, 25);
      if (!items.length) { panel.innerHTML = '<div class="notif-empty">Nenhuma notificação.</div>'; return; }
      panel.innerHTML = items.map(n => `<div class="notif-item ${n.read ? 'read' : ''}">
          <span class="notif-dot type-${ui.escapeHtml(n.type || 'info')}"></span>
          <div><div class="notif-msg">${ui.escapeHtml(n.message || '')}</div>
          <div class="notif-meta">${ui.escapeHtml(n.category || 'general')} · ${new Date(n.timestamp).toLocaleTimeString('pt-BR')}</div></div>
        </div>`).join('');
    }

    function positionPanel() {
      if (!panel) return;
      const r = btn.getBoundingClientRect();
      panel.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
      panel.style.top = (r.bottom + 8) + 'px';
    }

    async function open() {
      if (panel) { panel.remove(); panel = null; return; }
      panel = document.createElement('div');
      panel.className = 'notif-panel';
      panel.innerHTML = '<div class="notif-loading">Carregando...</div>';
      document.body.appendChild(panel);
      positionPanel();
      try {
        const d = await api.notifications.list();
        renderList(d && d.data ? d.data : d);
      } catch (e) { panel.innerHTML = '<div class="notif-empty">Erro ao carregar.</div>'; }
      try { await api.notifications.readAll(); updateBadge(0); } catch (_) {}
    }

    btn.addEventListener('click', (e) => { e.stopPropagation(); open(); });
    document.addEventListener('click', (e) => {
      if (panel && !panel.contains(e.target) && !btn.contains(e.target)) { panel.remove(); panel = null; }
    });
    window.addEventListener('resize', positionPanel);

    api.notifications.unread().then(d => updateBadge((d && d.count) || 0)).catch(() => {});

    // SSE em tempo real: atualiza sem recarregar a página (v0.8.0).
    try {
      const es = new EventSource(api.notifications.streamUrl());
      es.onmessage = (ev) => {
        try {
          const note = JSON.parse(ev.data);
          api.notifications.unread().then(d => updateBadge((d && d.count) || 0)).catch(() => {});
          if (panel) api.notifications.list().then(d => renderList(d && d.data ? d.data : d)).catch(() => {});
          const t = note.type === 'success' ? 'ok' : note.type === 'error' ? 'err' : note.type === 'warning' ? 'warn' : 'info';
          ui.toast(note.message || 'Nova notificação', t);
        } catch (_) {}
      };
      es.addEventListener('clear', () => { updateBadge(0); if (panel) renderList([]); });
      es.onerror = () => { /* EventSource reconecta automaticamente */ };
    } catch (_) { /* SSE indisponível — fallback silencioso */ }
  }

  function mountLayout(pageKey) {
    const pageMain = document.querySelector('main.page');
    const shell = document.createElement('div');
    shell.className = 'layout';

    const userRaw = localStorage.getItem(STORAGE_KEY);
    const navHtml = NAV.filter(navVisible).map(item => `
      <a href="${item.href}" class="${item.key === pageKey ? 'active' : ''}" title="${item.label}">
        ${item.icon}<span class="txt">${item.label}</span>
      </a>`).join('');

    let username = 'Usuário';
    let userRole = '';
    try { const u = JSON.parse(userRaw) || {}; username = u.username || username; userRole = u.role || userRole; } catch (_) {}

    shell.innerHTML = `
      <div class="main">
        <header class="topbar">
          <div style="display:flex; align-items:center; gap:12px;">
            <div class="brand">
              <img src="assets/BrightierOS.png" alt="BrightierOS" onerror="this.style.display='none'">
              <span class="name">Brightier<b>OS</b></span>
            </div>
            <div>
              <h1 id="pageTitle">BrightierOS</h1>
              <div class="sub" id="pageSub"></div>
            </div>
          </div>
          <div class="topbar-actions">
            <button class="btn ghost sm notif-btn" id="notifBtn" title="Notificações">${ICONS.bell}<span class="badge" id="notifBadge" style="display:none">0</span></button>
            <span class="clock" id="clock">--:--:--</span>
            <span class="user-chip"><span class="avatar">${ui.escapeHtml(username.charAt(0).toUpperCase())}</span><span>${ui.escapeHtml(username)}</span>${userRole ? `<span class="role-badge role-${ui.escapeHtml(userRole)}">${ui.escapeHtml(userRole)}</span>` : ''}</span>
            <button class="btn ghost sm" id="resetBtn" title="Resetar sistema">${ICONS.reset}<span class="txt">Reset</span></button>
            <button class="btn ghost sm" id="logoutBtn" title="Sair">${ICONS.logout}<span class="txt">Sair</span></button>
          </div>
        </header>
        <section class="content"></section>
      </div>
      <nav class="dock">${navHtml}</nav>`;

    shell.querySelector('.content').appendChild(pageMain);
    document.body.insertBefore(shell, document.body.firstChild);

    const title = document.body.getAttribute('data-title');
    const sub = document.body.getAttribute('data-sub');
    if (title) shell.querySelector('#pageTitle').textContent = title;
    if (sub) shell.querySelector('#pageSub').textContent = sub;

    startClock(shell.querySelector('#clock'));
    shell.querySelector('#logoutBtn').addEventListener('click', logout);
    shell.querySelector('#resetBtn').addEventListener('click', resetSystem);
    startNotifications(shell);
  }

  /* Helper global: verifica se o usuário logado tem a permissão. */
  window.bosCan = function (perm) {
    try {
      const u = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
      const perms = u.permissions || [];
      return perms.includes('*') || perms.includes(perm);
    } catch (_) { return false; }
  };

  /* Auth guard for protected pages (login & setup are public) */
  async function guard() {
    const page = document.body.getAttribute('data-page');
    if (page === 'login' || page === 'setup' || page === 'signup') return;

    try {
      const res = await api.user.setup();
      if (!res || !res.user) { window.location.replace('/setup.html'); return; }
      if (!localStorage.getItem(STORAGE_KEY)) { window.location.replace('/login.html'); return; }
    } catch (e) {
      window.location.replace('/login.html');
      return;
    }

    // Páginas que exigem papel de administrador: não-admins são redirecionados.
    const ADMIN_PAGES = ['console', 'admin'];
    if (ADMIN_PAGES.includes(page) && currentRole() !== 'admin') {
      window.location.replace('/');
      return;
    }

    mountLayout(page);
    // Atualiza os dados/permissões do usuário logado a partir do /me.
    try {
      const me = await api.user.me();
      if (me && me.user) {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...stored, ...me.user, permissions: me.permissions }));
      }
    } catch (_) { /* mantém o que já tem */ }
    document.dispatchEvent(new CustomEvent('brightier:ready'));
    finishBoot();
  }

  // O script roda ao final do <body>, então o DOM já está disponível na maioria
  // dos casos. Chamamos guard() direto; se ainda estiver carregando, aguardamos
  // o próximo frame. Evita depender do nome exato do evento de DOM pronto.
  if (document.readyState === 'loading') {
    requestAnimationFrame(guard);
  } else {
    guard();
  }
})();

