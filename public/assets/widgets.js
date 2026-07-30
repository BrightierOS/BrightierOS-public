/* ============================================================
   BrightierOS v1.1.0 — Widget System
   Drag-and-drop dashboard widgets with persistence, config,
   loading/empty/error states, and plugin-ready architecture.
   Exposes: window.bosWidgets
   ============================================================ */
(function () {
  'use strict';

  var LAYOUT_KEY = 'brightieros-dashboard-layout';
  var WIDGET_CONFIG_KEY = 'brightieros-widget-configs';
  var registry = new Map();

  /* ── Helpers ─────────────────────────────────────────── */
  function escapeText(str) {
    if (window.ui && window.ui.escapeHtml) return window.ui.escapeHtml(str);
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeStorage(action, key, val) {
    try { return localStorage[action](key, val); } catch (_) { return null; }
  }

  /* ── Widget class ────────────────────────────────────── */
  function Widget(def) {
    this.id = def.id;
    this.title = def.title || def.id;
    this.icon = def.icon || '\u{1F4E6}';
    this.description = def.description || '';
    this.defaultConfig = def.defaultConfig || {};
    this.renderFn = def.render || function () { return '<p class="muted">Widget vazio</p>'; };
    this.initFn = def.init || null;
    this.refreshFn = def.refresh || null;
    this.configurable = def.configurable !== false;
    this.configFields = def.configFields || [];
    this.minWidth = def.minWidth || 1;
    this.defaultWidth = def.defaultWidth || 1;
    this.defaultHeight = def.defaultHeight || 'auto';
    this.roles = def.roles || null;
    this.permissions = def.permissions || null;
    this.category = def.category || 'general';
  }

  Widget.prototype.isAvailable = function () {
    if (this.roles) {
      var stored = safeStorage('getItem', 'brightieros-user');
      var role = null;
      try { role = stored ? JSON.parse(stored).role : null; } catch (_) {}
      if (!role || this.roles.indexOf(role) === -1) return false;
    }
    if (this.permissions && typeof window.bosCan === 'function') {
      for (var i = 0; i < this.permissions.length; i++) {
        if (!window.bosCan(this.permissions[i])) return false;
      }
    }
    return true;
  };

  Widget.prototype.render = function (cfg) {
    return this.renderFn(Object.assign({}, this.defaultConfig, cfg || {}));
  };
  Widget.prototype.init = function (el, cfg) {
    if (this.initFn) this.initFn(el, Object.assign({}, this.defaultConfig, cfg || {}));
  };
  Widget.prototype.refresh = function (el, cfg) {
    if (this.refreshFn) this.refreshFn(el, Object.assign({}, this.defaultConfig, cfg || {}));
  };

  /* ── Registry ────────────────────────────────────────── */
  function register(def) {
    if (registry.has(def.id)) console.warn('[Widgets] Widget "' + def.id + '" ja registrado.');
    var w = new Widget(def);
    registry.set(def.id, w);
    return w;
  }
  function get(id) { return registry.get(id) || null; }
  function listAvailable() {
    var r = [];
    registry.forEach(function (w) { if (w.isAvailable()) r.push(w); });
    return r;
  }

  /* ── Layout persistence ──────────────────────────────── */
  function loadLayout() {
    try { var s = safeStorage('getItem', LAYOUT_KEY); if (s) return JSON.parse(s); } catch (_) {}
    return null;
  }
  function saveLayout(l) { safeStorage('setItem', LAYOUT_KEY, JSON.stringify(l)); }
  function resetLayout() {
    safeStorage('removeItem', LAYOUT_KEY);
    safeStorage('removeItem', WIDGET_CONFIG_KEY);
  }
  function defaultLayout() {
    var available = listAvailable();
    var l = [];
    var col = 0;
    var COLS = 4;
    for (var i = 0; i < available.length; i++) {
      var w = available[i];
      var wd = w.defaultWidth;
      if (col + wd > COLS) col = 0;
      l.push({ id: w.id, width: wd, height: w.defaultHeight, col: col, row: Math.floor(i / COLS) * 2, visible: true });
      col += wd;
    }
    return l;
  }

  /* ── Widget config persistence ───────────────────────── */
  function loadWidgetConfigs() {
    try { var s = safeStorage('getItem', WIDGET_CONFIG_KEY); if (s) return JSON.parse(s); } catch (_) {}
    return {};
  }
  function saveWidgetConfig(id, cfg) {
    var all = loadWidgetConfigs();
    all[id] = cfg;
    safeStorage('setItem', WIDGET_CONFIG_KEY, JSON.stringify(all));
  }
  function getWidgetConfig(id) { return loadWidgetConfigs()[id] || {}; }
  /* ── Dashboard renderer ──────────────────────────────── */
  function renderDashboard(container) {
    if (!container) return;
    container.innerHTML = '';

    var layout = loadLayout();
    if (!layout || !Array.isArray(layout) || layout.length === 0) {
      layout = defaultLayout();
      saveLayout(layout);
    }

    var available = listAvailable();
    var availMap = {};
    for (var a = 0; a < available.length; a++) availMap[available[a].id] = available[a];
    layout = layout.filter(function (item) { return !!availMap[item.id]; });
    for (var id in availMap) {
      if (!availMap.hasOwnProperty(id)) continue;
      var exists = false;
      for (var x = 0; x < layout.length; x++) { if (layout[x].id === id) { exists = true; break; } }
      if (!exists) layout.push({ id: id, width: availMap[id].defaultWidth, height: availMap[id].defaultHeight, col: 0, row: 0, visible: true });
    }
    saveLayout(layout);

    var visibleItems = [];
    for (var j = 0; j < layout.length; j++) {
      if (layout[j].visible) visibleItems.push(layout[j]);
    }

    if (visibleItems.length === 0) {
      container.innerHTML = '<div class="empty-state"><span>\u{1F4CB}</span><p>Nenhum widget visivel</p><button class="btn sm" data-reset-layout>Restaurar padrao</button></div>';
      var rb = container.querySelector('[data-reset-layout]');
      if (rb) rb.addEventListener('click', function () { resetLayout(); renderDashboard(container); });
      return;
    }

    var grid = document.createElement('div');
    grid.className = 'widget-grid';
    grid.setAttribute('role', 'region');
    grid.setAttribute('aria-label', 'Widgets do dashboard');

    for (var k = 0; k < visibleItems.length; k++) {
      var item = visibleItems[k];
      var widget = get(item.id);
      if (!widget) continue;
      var config = getWidgetConfig(item.id);
      var widgetEl = createWidgetCard(item, widget);
      grid.appendChild(widgetEl);
      bindWidgetEvents(widgetEl, widget, item, layout, config, container);
      var body = widgetEl.querySelector('.widget-body');
      if (body) doRender(widget, body, config);
    }

    container.appendChild(grid);
    setupGridDrop(grid, layout, container);
    renderDashboardFooter(container, layout);
  }

  /* ── Create widget card element ──────────────────────── */
  function createWidgetCard(item, widget) {
    var el = document.createElement('div');
    el.className = 'widget-card';
    el.setAttribute('data-widget-id', item.id);
    el.setAttribute('draggable', 'true');
    if (item.width && item.width > 1) el.style.gridColumn = 'span ' + Math.min(item.width, 4);

    var header = document.createElement('div');
    header.className = 'widget-header';
    header.innerHTML =
      '<span class="widget-icon">' + widget.icon + '</span>' +
      '<span class="widget-title">' + escapeText(widget.title) + '</span>' +
      '<div class="widget-actions">' +
        (widget.configurable ? '<button class="widget-btn widget-config" title="Configurar" aria-label="Configurar widget">\u2699</button>' : '') +
        '<button class="widget-btn widget-resize" title="Redimensionar" aria-label="Redimensionar widget">\u2922</button>' +
        '<button class="widget-btn widget-refresh" title="Atualizar" aria-label="Atualizar widget">\u21BB</button>' +
        '<button class="widget-btn widget-close" title="Ocultar" aria-label="Ocultar widget">\u2715</button>' +
      '</div>';
    el.appendChild(header);

    var body = document.createElement('div');
    body.className = 'widget-body';
    if (item.height && item.height !== 'auto') body.style.minHeight = (Number(item.height) * 120) + 'px';
    body.innerHTML = '<div class="widget-loading"><div class="skeleton skeleton-card"></div></div>';
    el.appendChild(body);
    return el;
  }
  /* ── Bind widget events ──────────────────────────────── */
  function bindWidgetEvents(widgetEl, widget, item, layout, config, container) {
    var body = widgetEl.querySelector('.widget-body');

    var cb = widgetEl.querySelector('.widget-close');
    if (cb) cb.addEventListener('click', function (e) {
      e.stopPropagation();
      item.visible = false;
      saveLayout(layout);
      widgetEl.style.transition = 'opacity .2s, transform .2s';
      widgetEl.style.opacity = '0';
      widgetEl.style.transform = 'scale(.95)';
      setTimeout(function () { renderDashboard(container); }, 250);
    });

    var rb = widgetEl.querySelector('.widget-refresh');
    if (rb) rb.addEventListener('click', function (e) {
      e.stopPropagation();
      rb.style.transform = 'rotate(360deg)';
      rb.style.transition = 'transform .4s';
      doRefresh(widget, body, config);
      setTimeout(function () { rb.style.transform = ''; rb.style.transition = ''; }, 450);
    });

    var cgb = widgetEl.querySelector('.widget-config');
    if (cgb) cgb.addEventListener('click', function (e) {
      e.stopPropagation();
      showWidgetConfig(widget, config, function (nc) {
        saveWidgetConfig(item.id, nc);
        doRender(widget, body, nc);
      });
    });

    var rszb = widgetEl.querySelector('.widget-resize');
    if (rszb) rszb.addEventListener('click', function (e) {
      e.stopPropagation();
      var w = item.width || 1;
      item.width = w >= 4 ? 1 : w + 1;
      saveLayout(layout);
      renderDashboard(container);
    });

    setupDrag(widgetEl, item);
  }

  /* ── Render / refresh widget content ─────────────────── */
  function doRender(widget, body, config) {
    if (!body) return;
    body.innerHTML = '<div class="widget-loading"><div class="skeleton skeleton-card"></div></div>';
    requestAnimationFrame(function () {
      try {
        var html = widget.render(config);
        if (!html || String(html).trim() === '') {
          body.innerHTML = '<div class="widget-empty"><span>\u{1F4ED}</span><p>Sem dados para exibir</p></div>';
        } else {
          body.innerHTML = html;
          widget.init(body, config);
        }
      } catch (e) {
        body.innerHTML = '<div class="widget-error"><span>\u26A0\uFE0F</span><p>Erro: ' + escapeText(e.message) + '</p></div>';
      }
    });
  }

  function doRefresh(widget, body, config) {
    if (!body) return;
    try {
      var html = widget.render(config);
      if (!html || String(html).trim() === '') {
        body.innerHTML = '<div class="widget-empty"><span>\u{1F4ED}</span><p>Sem dados para exibir</p></div>';
      } else {
        body.innerHTML = html;
        widget.init(body, config);
      }
    } catch (e) {
      body.innerHTML = '<div class="widget-error"><span>\u26A0\uFE0F</span><p>Erro: ' + escapeText(e.message) + '</p></div>';
    }
  }

  /* ── Dashboard footer ────────────────────────────────── */
  function renderDashboardFooter(container, layout) {
    var footer = document.createElement('div');
    footer.className = 'widget-dashboard-footer';
    footer.innerHTML =
      '<button class="btn ghost sm" data-manage-widgets title="Gerenciar widgets">\u{1F4CB} Gerenciar widgets</button>' +
      '<button class="btn ghost sm" data-reset-layout title="Restaurar padrao">\u21BA Restaurar padrao</button>';
    container.appendChild(footer);

    var mgBtn = footer.querySelector('[data-manage-widgets]');
    if (mgBtn) mgBtn.addEventListener('click', function () { showWidgetManager(layout, container); });

    var rsBtn = footer.querySelector('[data-reset-layout]');
    if (rsBtn) rsBtn.addEventListener('click', function () {
      var doReset = function () { resetLayout(); renderDashboard(container); };
      if (window.ui && window.ui.confirm) {
        window.ui.confirm('Restaurar layout padrao?', { title: 'Restaurar' }).then(function (ok) { if (ok) doReset(); });
      } else { doReset(); }
    });
  }
  /* ── Drag-and-drop ───────────────────────────────────── */
  function setupDrag(widgetEl, item) {
    widgetEl.addEventListener('dragstart', function (e) {
      widgetEl.classList.add('dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', item.id); } catch (_) {}
      }
    });
    widgetEl.addEventListener('dragend', function () {
      widgetEl.classList.remove('dragging');
    });
  }

  function setupGridDrop(grid, layout, container) {
    grid.addEventListener('dragover', function (e) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    });
    grid.addEventListener('drop', function (e) {
      e.preventDefault();
      var draggedId = '';
      try { draggedId = e.dataTransfer.getData('text/plain'); } catch (_) {}
      if (!draggedId) return;
      var cards = grid.querySelectorAll('.widget-card');
      var targetCard = null;
      for (var i = 0; i < cards.length; i++) {
        var rect = cards[i].getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
          targetCard = cards[i]; break;
        }
      }
      if (!targetCard || targetCard.getAttribute('data-widget-id') === draggedId) return;
      var targetId = targetCard.getAttribute('data-widget-id');
      var dragIdx = -1, targetIdx = -1;
      for (var j = 0; j < layout.length; j++) {
        if (layout[j].id === draggedId) dragIdx = j;
        if (layout[j].id === targetId) targetIdx = j;
      }
      if (dragIdx === -1 || targetIdx === -1) return;
      var tmp = layout[dragIdx];
      layout[dragIdx] = layout[targetIdx];
      layout[targetIdx] = tmp;
      saveLayout(layout);
      renderDashboard(container);
    });
  }

  /* ── Widget config modal ─────────────────────────────── */
  function showWidgetConfig(widget, currentConfig, onSave) {
    if (!widget.configFields || widget.configFields.length === 0) {
      if (window.ui) window.ui.toast('Este widget nao tem configuracoes.', 'info');
      return;
    }
    var backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    var fieldsHtml = widget.configFields.map(function (f) {
      var val = currentConfig[f.key] !== undefined ? currentConfig[f.key] : (widget.defaultConfig[f.key] || '');
      if (f.type === 'select') {
        var opts = (f.options || []).map(function (o) {
          return '<option value="' + escapeText(o.value) + '"' + (o.value == val ? ' selected' : '') + '>' + escapeText(o.label) + '</option>';
        }).join('');
        return '<label>' + escapeText(f.label) + '<select data-cfg="' + f.key + '">' + opts + '</select></label>';
      }
      if (f.type === 'checkbox') {
        return '<label class="checkbox-label"><input type="checkbox" data-cfg="' + f.key + '"' + (val ? ' checked' : '') + '> ' + escapeText(f.label) + '</label>';
      }
      return '<label>' + escapeText(f.label) + '<input type="' + (f.type || 'text') + '" data-cfg="' + f.key + '" value="' + escapeText(val) + '"></label>';
    }).join('');

    backdrop.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true">' +
      '<h3>\u2699 Configurar: ' + escapeText(widget.title) + '</h3>' +
      '<div class="widget-config-form">' + fieldsHtml + '</div>' +
      '<div class="row"><button class="btn ghost" data-act="cancel">Cancelar</button>' +
      '<button class="btn" data-act="save">Salvar</button></div></div>';
    document.body.appendChild(backdrop);

    backdrop.querySelector('[data-act="cancel"]').onclick = function () { backdrop.remove(); };
    backdrop.querySelector('[data-act="save"]').onclick = function () {
      var nc = {};
      var inputs = backdrop.querySelectorAll('[data-cfg]');
      for (var i = 0; i < inputs.length; i++) {
        var inp = inputs[i];
        var key = inp.getAttribute('data-cfg');
        if (inp.type === 'checkbox') nc[key] = inp.checked;
        else if (inp.type === 'number') nc[key] = Number(inp.value);
        else nc[key] = inp.value;
      }
      backdrop.remove();
      if (onSave) onSave(nc);
      if (window.ui) window.ui.toast('Configuracao salva.', 'ok');
    };
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) backdrop.remove(); });
  }
  /* ── Widget manager modal ────────────────────────────── */
  function showWidgetManager(layout, container) {
    var backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    var available = listAvailable();
    var layoutMap = {};
    for (var i = 0; i < layout.length; i++) layoutMap[layout[i].id] = layout[i];

    var itemsHtml = available.map(function (w) {
      var item = layoutMap[w.id];
      var visible = item ? item.visible : false;
      return '<div class="widget-manager-item">' +
        '<span class="widget-icon">' + w.icon + '</span>' +
        '<div class="widget-manager-info"><strong>' + escapeText(w.title) + '</strong>' +
        '<p class="muted">' + escapeText(w.description || '') + '</p></div>' +
        '<label class="toggle"><input type="checkbox" data-widget-id="' + w.id + '"' + (visible ? ' checked' : '') + '><span class="toggle-slider"></span></label></div>';
    }).join('');

    backdrop.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true">' +
      '<h3>\u{1F4CB} Gerenciar Widgets</h3>' +
      '<div class="widget-manager-list">' + itemsHtml + '</div>' +
      '<div class="row"><button class="btn" data-act="done">Concluir</button></div></div>';
    document.body.appendChild(backdrop);

    var close = function () { backdrop.remove(); renderDashboard(container); };
    backdrop.querySelector('[data-act="done"]').onclick = close;
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) close(); });

    var checkboxes = backdrop.querySelectorAll('[data-widget-id]');
    for (var j = 0; j < checkboxes.length; j++) {
      checkboxes[j].addEventListener('change', function () {
        var wid = this.getAttribute('data-widget-id');
        var checked = this.checked;
        var found = false;
        for (var k = 0; k < layout.length; k++) {
          if (layout[k].id === wid) { layout[k].visible = checked; found = true; break; }
        }
        if (!found && checked) {
          var w = get(wid);
          if (w) layout.push({ id: wid, width: w.defaultWidth, height: w.defaultHeight, col: 0, row: 0, visible: true });
        }
        saveLayout(layout);
      });
    }
  }

  /* ── Expose public API ───────────────────────────────── */
  window.bosWidgets = {
    register: register,
    get: get,
    listAvailable: listAvailable,
    renderDashboard: renderDashboard,
    loadLayout: loadLayout,
    saveLayout: saveLayout,
    resetLayout: resetLayout,
    defaultLayout: defaultLayout,
    getWidgetConfig: getWidgetConfig,
    saveWidgetConfig: saveWidgetConfig,
  };
})();
