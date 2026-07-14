/* ============================================================
   BrightierOS — Auth pages (login + setup)
   ============================================================ */
(function () {
  'use strict';
  const STORAGE_KEY = 'brightieros-user';

  function go(url) { window.location.replace(url); }

  async function boot() {
    const page = document.body.getAttribute('data-page');
    try {
      const setup = await api.user.setup();
      if (page === 'setup' && setup && setup.user) { go('/login.html'); return; }
      if (page === 'login' && localStorage.getItem(STORAGE_KEY)) { go('/index.html'); return; }
    } catch (e) { /* continua na página */ }

    if (page === 'login') bindLogin();
    else if (page === 'setup') bindSetup();
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
      if (!username || !password) { setMsg('message', 'Informe usuário e senha.', 'err'); return; }
      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        const data = await api.user.create(username, password, 'admin');
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data.user));
        setMsg('message', 'Usuário criado! Redirecionando...', 'ok');
        setTimeout(() => go('/index.html'), 600);
      } catch (err) {
        setMsg('message', err.message || 'Não foi possível criar o usuário.', 'err');
        btn.disabled = false;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }
})();
