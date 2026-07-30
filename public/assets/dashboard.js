/* ============================================================
   BrightierOS v1.1.0 — Dashboard
   Registers all dashboard widgets and initializes the
   customizable widget grid. Preserves legacy update functions.
   ============================================================ */
(function () {
  'use strict';

  var refreshTimer = null;

  function initDashboard() {
    var container = document.getElementById('dashboard-content');
    if (!container || !window.bosWidgets) return;

    registerStatusCards();
    registerPerformanceChart();
    registerSystemInfo();
    registerQuickShortcuts();
    registerProcesses();
    registerPlugins();
    registerSmartUpdates();

    window.bosWidgets.renderDashboard(container);
  }

  function esc(s) { return window.ui ? window.ui.escapeHtml(s) : String(s == null ? '' : s); }

  /* ── Widget: Status Cards (CPU, RAM, Storage, Network) ─ */
  function registerStatusCards() {
    window.bosWidgets.register({
      id: 'status-cards',
      title: 'Status do Sistema',
      icon: '\u{1F4CA}',
      description: 'CPU, memoria, armazenamento e rede em tempo real.',
      defaultWidth: 4,
      defaultHeight: 'auto',
      category: 'monitoring',
      defaultConfig: { refreshInterval: 5 },
      configFields: [
        { key: 'refreshInterval', label: 'Intervalo de atualizacao (s)', type: 'select', options: [
          { value: 3, label: '3 segundos' }, { value: 5, label: '5 segundos' },
          { value: 10, label: '10 segundos' }, { value: 30, label: '30 segundos' }
        ] }
      ],
      render: function () {
        return '<div class="status-cards-grid">' +
          '<div class="stat-card" id="stat-cpu"><div class="stat-icon">\u{1F5A5}\uFE0F</div><div class="stat-label">CPU</div><div class="stat-value">--</div><div class="stat-bar"><div class="stat-bar-fill"></div></div></div>' +
          '<div class="stat-card" id="stat-ram"><div class="stat-icon">\u{1F9E0}</div><div class="stat-label">Memoria</div><div class="stat-value">--</div><div class="stat-bar"><div class="stat-bar-fill"></div></div></div>' +
          '<div class="stat-card" id="stat-disk"><div class="stat-icon">\u{1F4BE}</div><div class="stat-label">Armazenamento</div><div class="stat-value">--</div><div class="stat-bar"><div class="stat-bar-fill"></div></div></div>' +
          '<div class="stat-card" id="stat-net"><div class="stat-icon">\u{1F310}</div><div class="stat-label">Rede</div><div class="stat-value">--</div><div class="stat-sub">\u2193 -- / \u2191 --</div></div>' +
        '</div>';
      },
      init: function (el, cfg) {
        var interval = Number(cfg.refreshInterval) || 5;
        var load = async function () {
          try {
            var r = await api.stats();
            var d = (r && r.data) || r || {};
            var cpuEl = el.querySelector('#stat-cpu');
            if (cpuEl && d.cpu) {
              cpuEl.querySelector('.stat-value').textContent = (d.cpu.usage || 0) + '%';
              cpuEl.querySelector('.stat-bar-fill').style.width = (d.cpu.usage || 0) + '%';
            }
            var ramEl = el.querySelector('#stat-ram');
            if (ramEl && d.ram) {
              ramEl.querySelector('.stat-value').textContent = (d.ram.usage || 0) + '%';
              ramEl.querySelector('.stat-bar-fill').style.width = (d.ram.usage || 0) + '%';
            }
            var diskEl = el.querySelector('#stat-disk');
            if (diskEl && d.storage && d.storage.length) {
              var s = d.storage[0];
              diskEl.querySelector('.stat-value').textContent = (s.usage || 0) + '%';
              diskEl.querySelector('.stat-bar-fill').style.width = (s.usage || 0) + '%';
            }
            var netEl = el.querySelector('#stat-net');
            if (netEl && d.network) {
              netEl.querySelector('.stat-value').textContent = esc(d.network.iface || '--');
              netEl.querySelector('.stat-sub').textContent = '\u2193 ' + (d.network.rx || 0) + ' / \u2191 ' + (d.network.tx || 0) + ' KB/s';
            }
          } catch (e) { /* silencioso: mantem ultimo valor */ }
        };
        load();
        if (refreshTimer) clearInterval(refreshTimer);
        refreshTimer = setInterval(load, interval * 1000);
      },
    });
  }
  /* ── Widget: Performance Chart ───────────────────────── */
  function registerPerformanceChart() {
    window.bosWidgets.register({
      id: 'performance-chart',
      title: 'Performance',
      icon: '\u{1F4C8}',
      description: 'Grafico de historico de CPU e memoria.',
      defaultWidth: 2,
      defaultHeight: 'auto',
      category: 'monitoring',
      render: function () {
        return '<div class="chart-container" id="perf-chart"><div class="widget-loading"><div class="skeleton skeleton-card"></div></div></div>';
      },
      init: function (el) {
        var chartEl = el.querySelector('#perf-chart');
        if (!chartEl) return;
        api.metrics.history(30).then(function (r) {
          var data = (r && r.data) || (r && r.history) || [];
          if (!Array.isArray(data) || data.length === 0) {
            chartEl.innerHTML = '<div class="widget-empty"><span>\u{1F4ED}</span><p>Sem dados de historico</p></div>';
            return;
          }
          var recent = data.slice(-20);
          var maxVal = 1;
          for (var i = 0; i < recent.length; i++) {
            maxVal = Math.max(maxVal, recent[i].cpu || 0, recent[i].ram || 0);
          }
          maxVal = Math.max(maxVal, 100);
          var bars = recent.map(function (p) {
            var cpuH = Math.max(2, ((p.cpu || 0) / maxVal) * 100);
            var ramH = Math.max(2, ((p.ram || 0) / maxVal) * 100);
            return '<div class="chart-bar-group" title="CPU: ' + (p.cpu || 0) + '% / RAM: ' + (p.ram || 0) + '%">' +
              '<div class="chart-bar chart-cpu" style="height:' + cpuH + '%"></div>' +
              '<div class="chart-bar chart-ram" style="height:' + ramH + '%"></div></div>';
          }).join('');
          chartEl.innerHTML = '<div class="chart-bars">' + bars + '</div>' +
            '<div class="chart-legend"><span class="legend-cpu">CPU</span><span class="legend-ram">Memoria</span></div>';
        }).catch(function () {
          chartEl.innerHTML = '<div class="widget-empty"><span>\u{1F4ED}</span><p>Nao foi possível carregar</p></div>';
        });
      },
    });
  }

  /* ── Widget: System Info ─────────────────────────────── */
  function registerSystemInfo() {
    window.bosWidgets.register({
      id: 'system-info',
      title: 'Informacoes do Sistema',
      icon: '\u{2139}\uFE0F',
      description: 'Sistema operacional, hostname, uptime e CPU.',
      defaultWidth: 2,
      defaultHeight: 'auto',
      category: 'system',
      render: function () {
        return '<div class="info-list" id="sys-info"><div class="widget-loading"><div class="skeleton skeleton-text" style="width:80%"></div><div class="skeleton skeleton-text" style="width:60%"></div><div class="skeleton skeleton-text" style="width:70%"></div></div></div>';
      },
      init: function (el) {
        var infoEl = el.querySelector('#sys-info');
        if (!infoEl) return;
        api.stats().then(function (r) {
          var d = (r && r.data) || r || {};
          var os = d.os || {};
          var cpu = d.cpu || {};
          infoEl.innerHTML =
            '<div class="info-row"><span class="info-label">Sistema</span><span class="info-value">' + esc(os.distro || os.platform || '--') + '</span></div>' +
            '<div class="info-row"><span class="info-label">Hostname</span><span class="info-value">' + esc(os.hostname || '--') + '</span></div>' +
            '<div class="info-row"><span class="info-label">Kernel</span><span class="info-value">' + esc(os.release || '--') + '</span></div>' +
            '<div class="info-row"><span class="info-label">Arquitetura</span><span class="info-value">' + esc(os.arch || '--') + '</span></div>' +
            '<div class="info-row"><span class="info-label">Uptime</span><span class="info-value">' + esc(d.uptime || '--') + '</span></div>' +
            '<div class="info-row"><span class="info-label">CPU</span><span class="info-value">' + esc(cpu.name || '--') + ' (' + (cpu.cores || '--') + ' cores)</span></div>';
        }).catch(function () {
          infoEl.innerHTML = '<div class="widget-empty"><span>\u{1F4ED}</span><p>Nao foi possível carregar</p></div>';
        });
      },
    });
  }

  /* ── Widget: Quick Shortcuts ─────────────────────────── */
  function registerQuickShortcuts() {
    window.bosWidgets.register({
      id: 'quick-shortcuts',
      title: 'Atalhos Rapidos',
      icon: '\u{26A1}',
      description: 'Acesso rapido as principais paginas.',
      defaultWidth: 2,
      defaultHeight: 'auto',
      category: 'general',
      render: function () {
        var links = [
          { href: '/files.html', icon: '\u{1F4C1}', label: 'Arquivos' },
          { href: '/services.html', icon: '\u{1F527}', label: 'Servicos' },
          { href: '/infrastructure.html', icon: '\u{1F5A5}\uFE0F', label: 'Infraestrutura' },
          { href: '/store.html', icon: '\u{1F6D2}', label: 'Loja' },
          { href: '/trash.html', icon: '\u{1F5D1}\uFE0F', label: 'Lixeira' },
          { href: '/profile.html', icon: '\u{1F464}', label: 'Perfil' },
        ];
        return '<div class="shortcut-grid">' + links.map(function (l) {
          return '<a href="' + l.href + '" class="shortcut-item"><span class="shortcut-icon">' + l.icon + '</span><span class="shortcut-label">' + esc(l.label) + '</span></a>';
        }).join('') + '</div>';
      },
    });
  }
  /* ── Widget: Processes ───────────────────────────────── */
  function registerProcesses() {
    window.bosWidgets.register({
      id: 'processes',
      title: 'Processos',
      icon: '\u{1F9EE}',
      description: 'Principais processos em execucao por uso de CPU.',
      defaultWidth: 2,
      defaultHeight: 'auto',
      category: 'monitoring',
      render: function () {
        return '<div id="proc-list"><div class="widget-loading"><div class="skeleton skeleton-text" style="width:90%"></div><div class="skeleton skeleton-text" style="width:70%"></div><div class="skeleton skeleton-text" style="width:80%"></div></div></div>';
      },
      init: function (el) {
        var listEl = el.querySelector('#proc-list');
        if (!listEl) return;
        api.stats().then(function (r) {
          var d = (r && r.data) || r || {};
          var procs = (d.processes && d.processes.top) || [];
          if (!procs.length) {
            listEl.innerHTML = '<div class="widget-empty"><span>\u{1F4ED}</span><p>Nenhum processo disponivel</p></div>';
            return;
          }
          listEl.innerHTML = '<table class="proc-table"><thead><tr><th>Nome</th><th>CPU</th><th>Mem</th></tr></thead><tbody>' +
            procs.map(function (p) {
              return '<tr><td>' + esc(p.name) + '</td><td>' + (p.cpu || 0) + '%</td><td>' + (p.mem || 0) + '%</td></tr>';
            }).join('') + '</tbody></table>';
        }).catch(function () {
          listEl.innerHTML = '<div class="widget-empty"><span>\u{1F4ED}</span><p>Nao foi possivel carregar</p></div>';
        });
      },
    });
  }

  /* ── Widget: Installed Plugins ───────────────────────── */
  function registerPlugins() {
    window.bosWidgets.register({
      id: 'installed-plugins',
      title: 'Plugins Instalados',
      icon: '\u{1F9E9}',
      description: 'Plugins atualmente instalados no sistema.',
      defaultWidth: 2,
      defaultHeight: 'auto',
      category: 'system',
      render: function () {
        return '<div id="plugin-list"><div class="widget-loading"><div class="skeleton skeleton-card"></div></div></div>';
      },
      init: function (el) {
        var listEl = el.querySelector('#plugin-list');
        if (!listEl) return;
        api.plugins.list().then(function (plugins) {
          if (!Array.isArray(plugins) || plugins.length === 0) {
            listEl.innerHTML = '<div class="widget-empty"><span>\u{1F4ED}</span><p>Nenhum plugin instalado</p></div>';
            return;
          }
          listEl.innerHTML = '<div class="plugin-grid">' + plugins.map(function (p) {
            return '<div class="plugin-card"><div class="plugin-card-header"><span class="plugin-icon">\u{1F9E9}</span>' +
              '<strong>' + esc(p.name || p.id) + '</strong></div>' +
              '<p class="muted sm">' + esc(p.description || 'Sem descricao') + '</p>' +
              (p.version ? '<span class="badge">v' + esc(p.version) + '</span>' : '') + '</div>';
          }).join('') + '</div>';
        }).catch(function () {
          listEl.innerHTML = '<div class="widget-empty"><span>\u{1F4ED}</span><p>Nao foi possivel carregar</p></div>';
        });
      },
    });
  }
  /* ── Widget: Smart Updates ───────────────────────────── */
  function registerSmartUpdates() {
    window.bosWidgets.register({
      id: 'smart-updates',
      title: 'Atualizacoes',
      icon: '\u{1F501}',
      description: 'Verificacao e gestao de atualizacoes do sistema.',
      defaultWidth: 2,
      defaultHeight: 'auto',
      category: 'system',
      permissions: ['users:manage'],
      roles: ['admin'],
      render: function () {
        return '<div id="update-panel"><div class="update-status"><div class="widget-loading"><div class="skeleton skeleton-text" style="width:60%"></div></div></div>' +
          '<div class="update-actions" style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">' +
          '<button class="btn sm" id="btn-check-updates">Verificar</button>' +
          '<button class="btn sm" id="btn-apply-update" disabled>Aplicar</button>' +
          '<button class="btn ghost sm" id="btn-backup">Backup</button>' +
          '<button class="btn ghost sm" id="btn-changelog">Changelog</button>' +
          '<button class="btn ghost sm" id="btn-restore">Restaurar</button></div></div>';
      },
      init: function (el) {
        var statusEl = el.querySelector('.update-status');
        var checkBtn = el.querySelector('#btn-check-updates');
        var applyBtn = el.querySelector('#btn-apply-update');
        var backupBtn = el.querySelector('#btn-backup');
        var changelogBtn = el.querySelector('#btn-changelog');
        var restoreBtn = el.querySelector('#btn-restore');

        function showStatus(info) {
          if (!info) { statusEl.innerHTML = '<p class="muted">Clique em Verificar para checar atualizacoes.</p>'; return; }
          if (info.error) { statusEl.innerHTML = '<p class="err-text">' + esc(info.error) + '</p>'; return; }
          var html = '<div class="update-info">';
          html += '<div class="info-row"><span class="info-label">Instalada</span><span class="info-value">v' + esc(info.installedVersion) + '</span></div>';
          html += '<div class="info-row"><span class="info-label">Disponivel</span><span class="info-value">v' + esc(info.availableVersion) + '</span></div>';
          if (info.hasUpdate) { html += '<div class="update-badge ok">Atualizacao disponivel!</div>'; if (applyBtn) applyBtn.disabled = false; }
          else { html += '<div class="update-badge">Sistema atualizado</div>'; if (applyBtn) applyBtn.disabled = true; }
          if (info.hasLocalChanges) html += '<div class="update-badge warn">Alteracoes locais detectadas</div>';
          html += '</div>';
          statusEl.innerHTML = html;
        }

        if (checkBtn) checkBtn.addEventListener('click', function () {
          checkBtn.disabled = true; checkBtn.textContent = 'Verificando...';
          api.update.check().then(function (r) {
            checkBtn.disabled = false; checkBtn.textContent = 'Verificar'; showStatus(r);
            if (window.ui && r.hasUpdate) window.ui.toast('Atualizacao disponivel: v' + r.availableVersion, 'info');
          }).catch(function (e) { checkBtn.disabled = false; checkBtn.textContent = 'Verificar'; showStatus({ error: e.message }); });
        });

        if (applyBtn) applyBtn.addEventListener('click', function () {
          var doApply = function () {
            applyBtn.disabled = true; applyBtn.textContent = 'Aplicando...';
            api.update.apply({}).then(function (r) { if (window.ui) window.ui.toast(r.message || 'Atualizacao aplicada! Reiniciando...', 'ok'); })
              .catch(function (e) { applyBtn.disabled = false; applyBtn.textContent = 'Aplicar'; if (window.ui) window.ui.toast('Erro: ' + e.message, 'err'); });
          };
          if (window.ui && window.ui.confirm) {
            window.ui.confirm('Aplicar atualizacao? O sistema sera reiniciado.', { title: 'Atualizar', danger: true }).then(function (ok) { if (ok) doApply(); });
          } else { doApply(); }
        });
        if (backupBtn) backupBtn.addEventListener('click', function () {
          backupBtn.disabled = true; backupBtn.textContent = 'Fazendo backup...';
          api.update.backup().then(function (r) {
            backupBtn.disabled = false; backupBtn.textContent = 'Backup';
            if (window.ui) window.ui.toast(r.message || 'Backup concluido!', 'ok');
          }).catch(function (e) { backupBtn.disabled = false; backupBtn.textContent = 'Backup'; if (window.ui) window.ui.toast('Erro: ' + e.message, 'err'); });
        });

        if (changelogBtn) changelogBtn.addEventListener('click', function () {
          api.update.changelog().then(function (r) {
            var text = (r && r.data) ? r.data : (typeof r === 'string' ? r : JSON.stringify(r, null, 2));
            var backdrop = document.createElement('div');
            backdrop.className = 'modal-backdrop';
            backdrop.innerHTML = '<div class="modal" role="dialog" aria-modal="true"><h3>Changelog</h3><pre class="changelog-pre">' + esc(String(text).substring(0, 5000)) + '</pre><div class="row"><button class="btn" data-act="close">Fechar</button></div></div>';
            document.body.appendChild(backdrop);
            backdrop.querySelector('[data-act="close"]').onclick = function () { backdrop.remove(); };
            backdrop.addEventListener('click', function (e) { if (e.target === backdrop) backdrop.remove(); });
          }).catch(function (e) { if (window.ui) window.ui.toast('Erro: ' + e.message, 'err'); });
        });

        if (restoreBtn) restoreBtn.addEventListener('click', function () {
          api.update.backups().then(function (r) {
            var backups = (r && r.data) || r || [];
            if (!Array.isArray(backups) || backups.length === 0) { if (window.ui) window.ui.toast('Nenhum backup disponivel.', 'info'); return; }
            var backdrop = document.createElement('div');
            backdrop.className = 'modal-backdrop';
            backdrop.innerHTML = '<div class="modal" role="dialog" aria-modal="true"><h3>Restaurar Backup</h3><div class="backup-list">' +
              backups.map(function (b) { return '<div class="backup-item"><span>' + esc(b.id || b.timestamp || 'backup') + '</span><button class="btn sm" data-backup="' + esc(b.id || b.timestamp || '') + '">Restaurar</button></div>'; }).join('') +
              '</div><div class="row"><button class="btn ghost" data-act="close">Cancelar</button></div></div>';
            document.body.appendChild(backdrop);
            backdrop.querySelector('[data-act="close"]').onclick = function () { backdrop.remove(); };
            backdrop.addEventListener('click', function (e) { if (e.target === backdrop) backdrop.remove(); });
            var btns = backdrop.querySelectorAll('[data-backup]');
            for (var i = 0; i < btns.length; i++) {
              btns[i].addEventListener('click', function () {
                var bid = this.getAttribute('data-backup');
                api.update.restore(bid).then(function () { backdrop.remove(); if (window.ui) window.ui.toast('Restauracao iniciada! Reiniciando...', 'ok'); })
                  .catch(function (e) { if (window.ui) window.ui.toast('Erro: ' + e.message, 'err'); });
              });
            }
          }).catch(function (e) { if (window.ui) window.ui.toast('Erro: ' + e.message, 'err'); });
        });

        api.update.check().then(function (r) { showStatus(r); }).catch(function () { showStatus(null); });
      },
    });
  }
  /* ── Legacy global functions (backward compatibility) ── */
  window.checkUpdates = function () {
    if (window.ui) window.ui.toast('Verificando atualizacoes...', 'info');
    return api.update.check().then(function (r) {
      if (window.ui) {
        if (r.hasUpdate) window.ui.toast('Atualizacao disponivel: v' + r.availableVersion, 'info');
        else window.ui.toast('Sistema atualizado (v' + r.installedVersion + ')', 'ok');
      }
      return r;
    }).catch(function (e) { if (window.ui) window.ui.toast('Erro: ' + e.message, 'err'); });
  };
  window.applyUpdate = function () { return api.update.apply({}); };
  window.doBackup = function () {
    return api.update.backup().then(function (r) {
      if (window.ui) window.ui.toast(r.message || 'Backup concluido!', 'ok'); return r;
    }).catch(function (e) { if (window.ui) window.ui.toast('Erro: ' + e.message, 'err'); });
  };
  window.showChangelog = function () { return api.update.changelog(); };
  window.showRestore = function () { return api.update.backups(); };
  window.loadHistory = function () { return api.update.history(); };

  /* ── Initialize ──────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboard);
  } else {
    initDashboard();
  }
})();
