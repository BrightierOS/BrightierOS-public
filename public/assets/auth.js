/* ============================================================
   BrightierOS — Auth pages (login + setup + signup)
   ============================================================ */
(function () {
  'use strict';
  const STORAGE_KEY = 'brightieros-user';

  function go(url) { window.location.replace(url); }

  async function boot() {
    const page = document.body.getAttribute('data-page');
    try {
      const setup = await api.user.setup();
      if (page === 'setup' && setup.configured) { go('/login.html'); return; }
      if (page === 'signup' && !setup.configured) { go('/setup.html'); return; }
      if ((page === 'login' || page === 'signup') && localStorage.getItem(STORAGE_KEY)) { go('/index.html'); return; }
      // Sempre mostra o link de cadastro no login (o servidor decide se está aberto).
      if (page === 'login') {
        const link = document.getElementById('signupAlt');
        if (link) link.style.display = '';
      }
    } catch (e) { /* continua na página */ }

    if (page === 'login') bindLogin();
    else if (page === 'setup') bindSetup();
    else if (page === 'signup') {
      const token = new URLSearchParams(window.location.search).get('invite');
      bindSignup(token || '');
    }
  }

  function setMsg(id, text, kind) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.className = 'msg' + (kind ? ' ' + kind : '');
  }

  function bindLogin() {
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      setMsg('message', '', '');
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;
      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        const data = await api.user.login(username, password);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data.user));
        localStorage.setItem('brightieros-token', data.token);
        go('/index.html');
      } catch (err) {
        setMsg('message', err.message || 'Falha ao entrar.', 'err');
        btn.disabled = false;
      }
    });
  }

  function bindSetup() {
    document.getElementById('setupForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      setMsg('message', '', '');
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;
      const displayName = document.getElementById('displayName');
      if (!username || !password) { setMsg('message', 'Informe usuário e senha.', 'err'); return; }
      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        const data = await api.user.create(username, password, 'admin', displayName ? displayName.value.trim() : '');
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data.user));
        setMsg('message', 'Administrador criado! Redirecionando...', 'ok');
        setTimeout(() => go('/index.html'), 600);
      } catch (err) {
        setMsg('message', err.message || 'Não foi possível criar o usuário.', 'err');
        btn.disabled = false;
      }
    });
  }

  function bindSignup(inviteToken) {
    const inviteBox = document.getElementById('inviteInfo');
    const roleLabel = document.getElementById('inviteRole');
    const form = document.getElementById('signupForm');
    const btn = form.querySelector('button[type="submit"]');

    async function submitSignup(e) {
      e.preventDefault();
      setMsg('message', '', '');
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;
      const displayName = document.getElementById('displayName');
      if (!username || !password) { setMsg('message', 'Informe usuário e senha.', 'err'); return; }
      btn.disabled = true;
      try {
        const data = await api.user.create(username, password, 'viewer', displayName ? displayName.value.trim() : '', inviteToken);
        setMsg('message', 'Conta criada! Vá para o login.', 'ok');
        setTimeout(() => go('/login.html'), 700);
      } catch (err) {
        setMsg('message', err.message || 'Não foi possível criar a conta.', 'err');
        btn.disabled = false;
      }
    }

    if (inviteToken) {
      const normalInfo = document.getElementById('normalInfo');
      if (normalInfo) normalInfo.style.display = 'none';
      (async () => {
        try {
          const info = await api.user.invites.get(inviteToken);
          if (info && info.valid) {
            if (roleLabel) roleLabel.textContent = info.role === 'admin' ? 'administrador' : 'visualizador';
            if (inviteBox) inviteBox.style.display = '';
          } else {
            if (inviteBox) { inviteBox.style.display = ''; inviteBox.className = 'muted'; }
            if (roleLabel) roleLabel.textContent = 'inválido/expirado';
            form.style.display = 'none';
            setMsg('message', 'Este convite é inválido, expirou ou já foi usado.', 'err');
          }
        } catch (_) {
          form.style.display = 'none';
          setMsg('message', 'Não foi possível validar o convite.', 'err');
        }
      })();
    }

    form.addEventListener('submit', submitSignup);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentDLoaded', boot);
  } else { boot(); }
})();
