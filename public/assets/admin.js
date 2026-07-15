/* ============================================================
   BrightierOS v0.5.0 — Administração (users, roles, sessions,
   settings, logs)
   ============================================================ */
(function () {
  'use strict';

  const usersEl = () => document.getElementById('users-list');
  const rolesEl = () => document.getElementById('roles-list');
  const sessionsEl = () => document.getElementById('sessions-list');
  const settingsEl = () => document.getElementById('settings-form');
  const logsEl = () => document.getElementById('logs-list');

  function currentUser() {
    try { return JSON.parse(localStorage.getItem('brightieros-user')) || {}; }
    catch (_) { return {}; }
  }

  function fmtDate(iso) {
    return iso ? new Date(iso).toLocaleString('pt-BR') : '—';
  }

  // ─── Usuários ─────────────────────────────────────────────────────
  async function loadUsers() {
    try {
      const list = await api.user.list();
      const canManage = window.bosCan && window.bosCan('users:manage');
      const reg = (await api.user.setup().catch(() => ({}))).allowRegistration;
      const info = canManage ? `<p class="muted" style="margin-bottom:12px;font-size:13px">
        Papéis: <b>admin</b> gerencia tudo (usuários, configurações, logs); <b>editor</b> usa o sistema e vê logs;
        <b>viewer</b> é somente-leitura (não edita arquivos). O cadastro público (<i>Signup</i>) cria usuários
        <b>viewer</b> e só funciona quando <b>"Permitir auto-registro"</b> está ligado em Configurações
        (${reg ? 'atualmente <span style="color:var(--ok)">ligado</span>' : 'atualmente <span style="color:var(--warn)">desligado</span>'}).
      </p>` : '';
      if (!Array.isArray(list) || !list.length) {
        usersEl().innerHTML = info + '<p class="muted">Nenhum usuário.</p>';
        return;
      }
      usersEl().innerHTML = info + `<div class="table-wrap"><table>
        <thead><tr><th>Usuário</th><th>Nome</th><th>Papel</th><th>Status</th><th>Último acesso</th><th></th></tr></thead>
        <tbody>${list.map(u => `
          <tr>
            <td>${ui.escapeHtml(u.username)}</td>
            <td>${ui.escapeHtml(u.displayName || '')}</td>
            <td>${ui.escapeHtml(u.role)}</td>
            <td>${u.active === false ? '<span style="color:var(--danger)">inativo</span>' : '<span style="color:var(--ok)">ativo</span>'}</td>
            <td class="muted" style="font-size:12px">${fmtDate(u.lastLogin)}</td>
            <td class="row-actions">
              <button class="btn ghost sm" data-edit="${u.id}">Editar</button>
              <button class="btn ghost sm" data-pass="${u.id}">Senha</button>
              <button class="btn danger sm" data-del="${u.id}">Remover</button>
            </td>
          </tr>`).join('')}</tbody></table></div>`;

      usersEl().querySelectorAll('[data-edit]').forEach(b =>
        b.addEventListener('click', () => editUser(list.find(u => u.id === b.getAttribute('data-edit')))));
      usersEl().querySelectorAll('[data-pass]').forEach(b =>
        b.addEventListener('click', () => changePassword(b.getAttribute('data-pass'))));
      usersEl().querySelectorAll('[data-del]').forEach(b =>
        b.addEventListener('click', () => removeUser(list.find(u => u.id === b.getAttribute('data-del')))));
    } catch (e) {
      usersEl().innerHTML = `<p class="muted" style="color:var(--danger)">${ui.escapeHtml(e.message)}</p>`;
    }
  }

  function userModal({ title, user }) {
    const isNew = !user;
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
      <h3>${ui.escapeHtml(title)}</h3>
      <label>Usuário</label>
      <input data-f="username" value="${ui.escapeHtml((user && user.username) || '')}" ${isNew ? '' : 'disabled'} />
      <label style="margin-top:10px">Nome de exibição</label>
      <input data-f="displayName" value="${ui.escapeHtml((user && user.displayName) || '')}" />
      ${isNew ? '<label style="margin-top:10px">Senha</label><input data-f="password" type="password" />' : ''}
      <label style="margin-top:10px">Papel</label>
      <select data-f="role">
        ${['admin','editor','viewer'].map(r => `<option value="${r}" ${user && user.role === r ? 'selected' : ''}>${r}</option>`).join('')}
      </select>
      ${!isNew ? `<label style="margin-top:10px"><input data-f="active" type="checkbox" style="width:auto" ${user && user.active !== false ? 'checked' : ''}/> Ativo</label>` : ''}
      <div class="row"><button class="btn ghost" data-cancel>Cancelar</button><button class="btn" data-save>Salvar</button></div>
    </div>`;
    document.body.appendChild(backdrop);
    const val = (f) => backdrop.querySelector(`[data-f="${f}"]`);
    backdrop.querySelector('[data-cancel]').onclick = () => backdrop.remove();
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
    return { backdrop, val, isNew };
  }

  function editUser(user) {
    const { backdrop, val, isNew } = userModal({ title: user ? 'Editar usuário' : 'Novo usuário', user });
    backdrop.querySelector('[data-save]').onclick = async () => {
      try {
        if (isNew) {
          await api.user.create(val('username').value.trim(), val('password').value, val('role').value, val('displayName').value.trim());
          ui.toast('Usuário criado.', 'ok');
        } else {
          await api.user.update(user.id, {
            displayName: val('displayName').value.trim(),
            role: val('role').value,
            active: val('active').checked,
          });
          ui.toast('Usuário atualizado.', 'ok');
        }
        backdrop.remove();
        loadUsers(); loadLogs();
      } catch (e) { ui.toast(e.message, 'err'); }
    };
  }

  async function removeUser(user) {
    if (!user) return;
    const ok = await ui.confirm(`Remover o usuário "${user.username}"?`, { title: 'Remover usuário', danger: true });
    if (!ok) return;
    try { await api.user.remove(user.id); ui.toast('Usuário removido.', 'ok'); loadUsers(); loadLogs(); }
    catch (e) { ui.toast(e.message, 'err'); }
  }

  async function changePassword(id) {
    const pass = await ui.prompt('Nova senha:', { title: 'Alterar senha', placeholder: 'nova senha' });
    if (!pass) return;
    try { await api.user.changePassword(id, pass); ui.toast('Senha alterada.', 'ok'); loadLogs(); }
    catch (e) { ui.toast(e.message, 'err'); }
  }

  // ─── Papéis ───────────────────────────────────────────────────────
  const ROLE_DESCRIPTIONS = {
    admin: 'Acesso total: gerencia usuários, papéis, configurações do sistema e logs. Único papel que pode alterar o sistema.',
    editor: 'Usa o sistema como um usuário avançado (arquivos, plugins, loja) e visualiza logs. Não gerencia usuários nem configurações.',
    viewer: 'Somente leitura: navega e baixa arquivos, mas não cria, edita, renomeia ou exclui. Não acessa a Administração.',
  };

  async function loadRoles() {
    try {
      const d = await api.user.roles();
      const perms = d.permissions || {};
      rolesEl().innerHTML = (d.roles || []).map(r => `
        <div style="padding:10px 0;border-bottom:1px solid var(--line-soft)">
          <div style="color:#fff;font-weight:600;text-transform:capitalize">${ui.escapeHtml(r)}</div>
          <div class="muted" style="font-size:12px;margin-top:4px">${ui.escapeHtml(ROLE_DESCRIPTIONS[r] || '')}</div>
          <div class="muted" style="font-size:11px;margin-top:4px;opacity:.8">${ROLE_DESCRIPTIONS[r] ? (perms[r] || []).map(p => ui.escapeHtml(p)).join(' · ') : ''}</div>
        </div>`).join('');
    } catch (e) {
      rolesEl().innerHTML = `<p class="muted" style="color:var(--danger)">${ui.escapeHtml(e.message)}</p>`;
    }
  }

  // ─── Sessões ──────────────────────────────────────────────────────
  async function loadSessions() {
    try {
      const d = await api.user.sessions();
      const list = d.sessions || [];
      if (!list.length) { sessionsEl().innerHTML = '<p class="muted">Nenhuma sessão ativa.</p>'; return; }
      sessionsEl().innerHTML = `<div class="table-wrap"><table>
        <thead><tr><th>Usuário</th><th>Papel</th><th>IP</th><th>Início</th><th>Última atividade</th><th></th></tr></thead>
        <tbody>${list.map(s => `
          <tr>
            <td>${ui.escapeHtml(s.username)}</td>
            <td>${ui.escapeHtml(s.role)}</td>
            <td class="muted" style="font-size:12px">${ui.escapeHtml(s.ip || '—')}</td>
            <td class="muted" style="font-size:12px">${fmtDate(s.createdAt)}</td>
            <td class="muted" style="font-size:12px">${fmtDate(s.lastSeen)}</td>
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
              headers: { Authorization: 'Bearer ' + localStorage.getItem('brightieros-token') },
            });
            ui.toast('Sessão encerrada.', 'ok'); loadSessions(); loadLogs();
          } catch (e) { ui.toast(e.message, 'err'); }
        }));
    } catch (e) {
      sessionsEl().innerHTML = `<p class="muted" style="color:var(--danger)">${ui.escapeHtml(e.message)}</p>`;
    }
  }

  // ─── Configurações ────────────────────────────────────────────────
  async function loadSettings() {
    try {
      const d = await api.admin.settings();
      const s = d.settings || {};
      settingsEl().innerHTML = `
        <label>Nome do sistema</label>
        <input data-s="systemName" value="${ui.escapeHtml(s.systemName || '')}" />
        <label style="margin-top:10px">Tempo de sessão (minutos)</label>
        <input data-s="sessionTimeoutMinutes" type="number" value="${ui.escapeHtml(String(s.sessionTimeoutMinutes || 1440))}" />
        <label style="margin-top:10px"><input data-s="allowRegistration" type="checkbox" style="width:auto" ${s.allowRegistration ? 'checked' : ''}/> Permitir auto-registro</label>
        <label style="margin-top:6px"><input data-s="maintenanceMode" type="checkbox" style="width:auto" ${s.maintenanceMode ? 'checked' : ''}/> Modo manutenção</label>
        <div class="row"><button class="btn" id="saveSettings">Salvar configurações</button></div>`;
      settingsEl().querySelector('#saveSettings').onclick = async () => {
        try {
          await api.admin.saveSettings({
            systemName: settingsEl().querySelector('[data-s="systemName"]').value.trim(),
            sessionTimeoutMinutes: Number(settingsEl().querySelector('[data-s="sessionTimeoutMinutes"]').value) || 1440,
            allowRegistration: settingsEl().querySelector('[data-s="allowRegistration"]').checked,
            maintenanceMode: settingsEl().querySelector('[data-s="maintenanceMode"]').checked,
          });
          ui.toast('Configurações salvas.', 'ok'); loadLogs();
        } catch (e) { ui.toast(e.message, 'err'); }
      };
    } catch (e) {
      settingsEl().innerHTML = `<p class="muted" style="color:var(--danger)">${ui.escapeHtml(e.message)}</p>`;
    }
  }

  // ─── Logs ─────────────────────────────────────────────────────────
  async function loadLogs() {
    try {
      const d = await api.admin.logs();
      const list = d.logs || [];
      if (!list.length) { logsEl().innerHTML = '<p class="muted">Nenhum log.</p>'; return; }
      logsEl().innerHTML = list.map(l => `
        <div style="padding:8px 0;border-bottom:1px solid var(--line-soft)">
          <div style="color:#fff;font-weight:600">${ui.escapeHtml(l.action)}${l.target ? ' → ' + ui.escapeHtml(l.target) : ''}</div>
          <div class="muted" style="font-size:12px">${fmtDate(l.timestamp)}${l.actor ? ' · por ' + ui.escapeHtml(l.actor) : ''}${l.detail ? ' · ' + ui.escapeHtml(l.detail) : ''}</div>
        </div>`).join('');
    } catch (e) {
      logsEl().innerHTML = `<p class="muted" style="color:var(--danger)">${ui.escapeHtml(e.message)}</p>`;
    }
  }

  // ─── Convites por link ─────────────────────────────────────────────
  const invitesEl = () => document.getElementById('invites-list');

  async function loadInvites() {
    try {
      const d = await api.user.invites.list();
      const list = d.invites || [];
      if (!list.length) { invitesEl().innerHTML = '<p class="muted">Nenhum convite. Crie um para convidar alguém.</p>'; return; }
      invitesEl().innerHTML = `<div class="table-wrap"><table>
        <thead><tr><th>Papel</th><th>Status</th><th>Expira em</th><th>Link</th><th></th></tr></thead>
        <tbody>${list.map(i => `
          <tr>
            <td>${ui.escapeHtml(i.role)}</td>
            <td>${inviteStatusLabel(i.status)}</td>
            <td class="muted" style="font-size:12px">${fmtDate(i.expiresAt)}</td>
            <td><button class="btn ghost sm" data-copy="${ui.escapeHtml(i.token)}">Copiar link</button></td>
            <td><button class="btn danger sm" data-rev="${ui.escapeHtml(i.token)}" ${i.status !== 'valid' ? 'disabled' : ''}>Revogar</button></td>
          </tr>`).join('')}</tbody></table></div>`;
      invitesEl().querySelectorAll('[data-copy]').forEach(b =>
        b.addEventListener('click', async () => {
          const url = `${window.location.origin}/signup.html?invite=${b.getAttribute('data-copy')}`;
          const ok = await ui.copy(url);
          if (ok) ui.toast('Link copiado!', 'ok');
          else ui.prompt('Copie o link manualmente:', { value: url, title: 'Link de convite' });
        }));
      invitesEl().querySelectorAll('[data-rev]').forEach(b =>
        b.addEventListener('click', async () => {
          const ok = await ui.confirm('Revogar este convite?', { title: 'Revogar convite', danger: true });
          if (!ok) return;
          try { await api.user.invites.revoke(b.getAttribute('data-rev')); ui.toast('Convite revogado.', 'ok'); loadInvites(); loadLogs(); }
          catch (e) { ui.toast(e.message, 'err'); }
        }));
    } catch (e) {
      invitesEl().innerHTML = `<p class="muted" style="color:var(--danger)">${ui.escapeHtml(e.message)}</p>`;
    }
  }

  function inviteStatusLabel(status) {
    return {
      valid: '<span style="color:var(--ok)">válido</span>',
      used: '<span style="color:var(--muted)">usado</span>',
      expired: '<span style="color:var(--warn)">expirado</span>',
      revoked: '<span style="color:var(--danger)">revogado</span>',
      invalid: '<span style="color:var(--danger)">inválido</span>',
    }[status] || status;
  }

  async function createInvite(role) {
    try {
      const d = await api.user.invites.create(role);
      const url = `${window.location.origin}/signup.html?invite=${d.invite.token}`;
      const copied = await ui.copy(url);
      ui.toast(copied ? `Convite (${role}) criado e copiado!` : `Convite (${role}) criado — copie o link abaixo.`, copied ? 'ok' : 'info');
      if (!copied) ui.prompt('Link do convite:', { value: url, title: 'Convite criado' });
      loadInvites(); loadLogs();
    } catch (e) { ui.toast(e.message, 'err'); }
  }

  // ─── Atualizações / Rollback / Backups ──────────────────────────────
  async function loadUpdate() {
    const el = document.getElementById('update-area');
    if (!el) return;
    try {
      const d = await api.update.check();
      const installed = d.installedVersion;
      const available = d.availableVersion;
      const tags = (d.incrementalTags || []).filter(t => t !== installed);
      const opts = tags.map(t => `<option value="${ui.escapeHtml(t)}" ${t === available ? 'selected' : ''}>v${ui.escapeHtml(t)}</option>`).join('');
      el.innerHTML = `
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
          <span>Instalado: <b>v${ui.escapeHtml(installed)}</b></span>
          <span>Disponível: <b>v${ui.escapeHtml(available)}</b></span>
          ${d.hasUpdate ? '<span style="color:var(--ok)">Nova versão disponível</span>' : '<span class="muted">Em dia</span>'}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <button id="updLatestBtn" class="btn sm" ${d.hasUpdate ? '' : 'disabled'}>⇧ Atualizar p/ v${ui.escapeHtml(available)} (GitHub)</button>
          <span class="muted">ou ir para:</span>
          <select id="updTag">${opts}</select>
          <button id="updTagBtn" class="btn sm">Ir para versão</button>
          <button id="updForce" class="btn ghost sm" title="Atualiza mesmo com alterações locais">⚠ Forçar</button>
        </div>
        ${d.hasLocalChanges ? `<p style="color:var(--warn);font-size:12px;margin-top:8px">⚠ Alterações locais detectadas (${d.localChanges.length}). Use "Forçar".</p>` : ''}
        <div id="updMsg" style="margin-top:8px"></div>`;

      const busy = (msg) => { const m = document.getElementById('updMsg'); if (m) m.innerHTML = `<span class="muted">${ui.escapeHtml(msg)}</span>`; };
      document.getElementById('updLatestBtn').addEventListener('click', async () => {
        busy('Atualizando...');
        try { const r = await api.update.apply({ force: document.getElementById('updForce').classList.contains('active') }); handleUpdateResult(r); }
        catch (e) { ui.toast(e.message, 'err'); busy(''); }
      });
      document.getElementById('updTagBtn').addEventListener('click', async () => {
        const v = document.getElementById('updTag').value;
        busy(`Indo para v${v}...`);
        try { const r = await api.update.apply({ targetVersion: v, force: document.getElementById('updForce').classList.contains('active') }); handleUpdateResult(r); }
        catch (e) { ui.toast(e.message, 'err'); busy(''); }
      });
      const forceBtn = document.getElementById('updForce');
      forceBtn.addEventListener('click', () => forceBtn.classList.toggle('active'));
    } catch (e) {
      el.innerHTML = `<p class="muted" style="color:var(--danger)">${ui.escapeHtml(e.message)}</p>`;
    }
  }

  function handleUpdateResult(r) {
    if (!r || !r.success) { ui.toast((r && r.error) || 'Falha', 'err'); return; }
    if (r.code === 'LOCAL_CHANGES') {
      ui.confirm('Alterações locais detectadas. Atualizar mesmo assim? (um backup será criado)', { title: 'Atualizar mesmo assim', okText: 'Atualizar', danger: true })
        .then(ok => { if (ok) api.update.apply({ force: true }).then(handleUpdateResult); });
      return;
    }
    ui.toast(r.message || 'Atualizado! Reiniciando...', 'ok');
  }

  async function loadBackups() {
    const el = document.getElementById('backups-area');
    if (!el) return;
    try {
      const d = await api.update.backups();
      const list = d.backups || [];
      if (!list.length) { el.innerHTML = '<p class="muted">Nenhum backup.</p>'; return; }
      el.innerHTML = `<div class="table-wrap"><table>
        <thead><tr><th>Versão</th><th>Quando</th><th>Motivo</th><th></th></tr></thead>
        <tbody>${list.map(b => `<tr>
          <td>${ui.escapeHtml(b.version || '—')}</td>
          <td class="muted" style="font-size:12px">${fmtDate(b.timestamp)}</td>
          <td>${ui.escapeHtml(b.reason || '—')}</td>
          <td class="row-actions"><button class="btn ghost sm" data-restore="${ui.escapeHtml(b.id)}">Restaurar</button></td>
        </tr>`).join('')}</tbody></table></div>`;
      el.querySelectorAll('[data-restore]').forEach(b =>
        b.addEventListener('click', async () => {
          const id = b.getAttribute('data-restore');
          const ok = await ui.confirm(`Restaurar o backup ${id}? Um backup de segurança será criado.`, { title: 'Restaurar backup', danger: true });
          if (!ok) return;
          try { const r = await api.update.restore(id); ui.toast(r.message || 'Restaurado!', 'ok'); } catch (e) { ui.toast(e.message, 'err'); }
        }));
    } catch (e) {
      el.innerHTML = `<p class="muted" style="color:var(--danger)">${ui.escapeHtml(e.message)}</p>`;
    }
  }

  async function loadUpdateHistory() {
    const el = document.getElementById('update-history');
    if (!el) return;
    try {
      const d = await api.update.history();
      const list = d.history || [];
      if (!list.length) { el.innerHTML = '<p class="muted">Nenhum registro.</p>'; return; }
      el.innerHTML = `<div class="table-wrap"><table>
        <thead><tr><th>Quando</th><th>Tipo</th><th>De → Para</th><th>Detalhe</th></tr></thead>
        <tbody>${list.map(h => `<tr>
          <td class="muted" style="font-size:12px">${fmtDate(h.timestamp)}</td>
          <td>${ui.escapeHtml(h.type)}</td>
          <td>${ui.escapeHtml(h.from || '?')} → ${ui.escapeHtml(h.to || '?')}</td>
          <td class="muted" style="font-size:12px">${ui.escapeHtml(h.message || '')}</td>
        </tr>`).join('')}</tbody></table></div>`;
    } catch (e) {
      el.innerHTML = `<p class="muted" style="color:var(--danger)">${ui.escapeHtml(e.message)}</p>`;
    }
  }

  function init() {
    const role = currentUser().role;
    if (role !== 'admin' && role !== 'editor') {
      document.querySelector('main.page').innerHTML = '<section class="card"><p class="muted">Você não tem permissão para acessar a Administração.</p></section>';
      return;
    }
    const nb = document.getElementById('newUserBtn');
    if (nb) nb.addEventListener('click', () => editUser(null));
    const iv = document.getElementById('inviteViewerBtn');
    if (iv) iv.addEventListener('click', () => createInvite('viewer'));
    const ia = document.getElementById('inviteAdminBtn');
    if (ia) ia.addEventListener('click', () => createInvite('admin'));
    const rb = document.getElementById('restartBosBtn');
    if (rb) rb.addEventListener('click', async () => {
      const ok = await ui.confirm('Reiniciar o BrightierOS? (apenas o servidor, não o sistema operacional)', { title: 'Reiniciar BrightierOS', okText: 'Reiniciar' });
      if (!ok) return;
      try { const r = await api.admin.restart(); ui.toast((r && r.message) || 'Reiniciando...', 'ok'); } catch (e) { ui.toast(e.message, 'err'); }
    });
    loadUsers(); loadRoles(); loadSessions(); loadSettings(); loadLogs(); loadInvites();
    loadUpdate(); loadBackups(); loadUpdateHistory();
  }

  document.addEventListener('brightier:ready', init);
})();
