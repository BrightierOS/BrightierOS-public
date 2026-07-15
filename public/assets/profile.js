/* ============================================================
   BrightierOS v0.5.1 — Meu Perfil (tela do próprio usuário)
   ============================================================ */
(function () {
  'use strict';

  const profileEl = () => document.getElementById('profile-form');
  const passEl = () => document.getElementById('password-form');
  const sessionsEl = () => document.getElementById('my-sessions');

  function fmtDate(iso) {
    return iso ? new Date(iso).toLocaleString('pt-BR') : '—';
  }

  function myToken() {
    return localStorage.getItem('brightieros-token');
  }

  function updateStoredUser(user) {
    const raw = localStorage.getItem('brightieros-user');
    let obj = {};
    try { obj = JSON.parse(raw) || {}; } catch (_) {}
    obj = { ...obj, ...user };
    localStorage.setItem('brightieros-user', JSON.stringify(obj));
  }

  // ─── Dados do perfil ──────────────────────────────────────────────
  async function loadProfile() {
    try {
      const d = await api.user.me();
      const u = d.user || {};
      profileEl().innerHTML = `
        <label>Usuário</label>
        <input data-p="username" value="${ui.escapeHtml(u.username || '')}" disabled />
        <label style="margin-top:10px">Papel</label>
        <input data-p="role" value="${ui.escapeHtml(u.role || '')}" disabled />
        <label style="margin-top:10px">Nome de exibição</label>
        <input data-p="displayName" value="${ui.escapeHtml(u.displayName || '')}" />
        <label style="margin-top:10px">Status</label>
        <input data-p="status" value="${u.active === false ? 'inativo' : 'ativo'}" disabled />
        <div class="row"><button class="btn" id="saveProfile">Salvar alterações</button></div>`;
      profileEl().querySelector('#saveProfile').onclick = async () => {
        try {
          const dn = profileEl().querySelector('[data-p="displayName"]').value.trim();
          const r = await api.user.updateMe({ displayName: dn });
          updateStoredUser(r.user);
          ui.toast('Perfil atualizado.', 'ok');
        } catch (e) { ui.toast(e.message, 'err'); }
      };
    } catch (e) {
      profileEl().innerHTML = `<p class="muted" style="color:var(--danger)">${ui.escapeHtml(e.message)}</p>`;
    }
  }

  // ─── Alteração de senha ───────────────────────────────────────────
  async function loadPasswordForm() {
    const u = (() => { try { return JSON.parse(localStorage.getItem('brightieros-user')) || {}; } catch (_) { return {}; } })();
    passEl().innerHTML = `
      <label>Senha atual</label>
      <input data-k="current" type="password" />
      <label style="margin-top:10px">Nova senha</label>
      <input data-k="next" type="password" />
      <label style="margin-top:10px">Confirmar nova senha</label>
      <input data-k="confirm" type="password" />
      <div class="row"><button class="btn" id="savePass">Alterar senha</button></div>`;
    passEl().querySelector('#savePass').onclick = async () => {
      const current = passEl().querySelector('[data-k="current"]').value;
      const next = passEl().querySelector('[data-k="next"]').value;
      const confirm = passEl().querySelector('[data-k="confirm"]').value;
      if (!current || !next) { ui.toast('Preencha todos os campos.', 'err'); return; }
      if (next !== confirm) { ui.toast('A nova senha não confere.', 'err'); return; }
      try {
        const login = await api.user.login(u.username, current);
        await api.user.changePassword((login.user && login.user.id) || u.id, next);
        ui.toast('Senha alterada com sucesso.', 'ok');
        passEl().querySelectorAll('input').forEach(i => (i.value = ''));
      } catch (e) {
        ui.toast(e.message || 'Falha ao alterar senha.', 'err');
      }
    };
  }

  // ─── Minhas sessões ───────────────────────────────────────────────
  async function loadMySessions() {
    try {
      const d = await api.user.sessions();
      const me = (() => { try { return (JSON.parse(localStorage.getItem('brightieros-user') || '{}')).username; } catch (_) { return null; } })();
      const list = (d.sessions || []).filter(s => s.username === me);
      if (!list.length) { sessionsEl().innerHTML = '<p class="muted">Nenhuma sessão ativa.</p>'; return; }
      sessionsEl().innerHTML = `<div class="table-wrap"><table>
        <thead><tr><th>IP</th><th>Início</th><th>Última atividade</th><th>Atual?</th><th></th></tr></thead>
        <tbody>${list.map(s => `
          <tr>
            <td class="muted" style="font-size:12px">${ui.escapeHtml(s.ip || '—')}</td>
            <td class="muted" style="font-size:12px">${fmtDate(s.createdAt)}</td>
            <td class="muted" style="font-size:12px">${fmtDate(s.lastSeen)}</td>
            <td>${s.id === myToken() ? '<span style="color:var(--ok)">esta</span>' : '—'}</td>
            <td><button class="btn danger sm" data-kill="${ui.escapeHtml(s.id)}">Encerrar</button></td>
          </tr>`).join('')}</tbody></table></div>`;
      sessionsEl().querySelectorAll('[data-kill]').forEach(b =>
        b.addEventListener('click', async () => {
          const id = b.getAttribute('data-kill');
          const ok = await ui.confirm('Encerrar esta sessão?', { title: 'Encerrar sessão', danger: true });
          if (!ok) return;
          try {
            await fetch(`/api/users/sessions/${id}`, {
              method: 'DELETE',
              headers: { Authorization: 'Bearer ' + myToken() },
            });
            if (id === myToken()) {
              localStorage.removeItem('brightieros-token');
              localStorage.removeItem('brightieros-user');
              window.location.replace('/login.html');
              return;
            }
            ui.toast('Sessão encerrada.', 'ok'); loadMySessions();
          } catch (e) { ui.toast(e.message, 'err'); }
        }));
    } catch (e) {
      sessionsEl().innerHTML = `<p class="muted" style="color:var(--danger)">${ui.escapeHtml(e.message)}</p>`;
    }
  }

  function init() {
    loadProfile(); loadPasswordForm(); loadMySessions();
  }

  document.addEventListener('brightier:ready', init);
})();
