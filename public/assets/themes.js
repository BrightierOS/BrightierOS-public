/* ============================================================
   BrightierOS v1.1.0 — Theme System
   Suporte a tema claro, escuro, seguir SO e persistência
   ============================================================ */
(function () {
  'use strict';

  const THEME_KEY = 'brightieros-theme';
  const THEME_ATTR = 'data-theme';

  // Detecta a preferência do sistema operacional
  function systemPrefers() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  // Retorna o tema efetivo (resolvido)
  function resolveTheme(saved) {
    if (!saved || saved === 'system') return systemPrefers();
    return saved;
  }

  // Aplica o tema no HTML e persiste
  function applyTheme(theme) {
    const resolved = resolveTheme(theme);
    document.documentElement.setAttribute(THEME_ATTR, resolved);
    // Meta tag para barra de endereço em mobile
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', resolved === 'dark' ? '#07080c' : '#f2f4f8');
    }
  }

  // Retorna o tema salvo
  function getSavedTheme() {
    return localStorage.getItem(THEME_KEY) || 'system';
  }

  // Define e persiste o tema
  function setTheme(theme) {
    localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
    // Notifica outros componentes
    document.dispatchEvent(new CustomEvent('brightier:themechange', { detail: { theme, resolved: resolveTheme(theme) } }));
  }

  // Alterna entre claro / escuro / sistema
  function cycleTheme() {
    const current = getSavedTheme();
    const next = current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system';
    setTheme(next);
    return next;
  }

  // Inicializa: aplica tema salvo e escuta mudanças do SO
  function init() {
    const saved = getSavedTheme();
    applyTheme(saved);

    // Escuta mudanças na preferência do SO (quando em modo "system")
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', () => {
      if (getSavedTheme() === 'system') {
        applyTheme('system');
        document.dispatchEvent(new CustomEvent('brightier:themechange', {
          detail: { theme: 'system', resolved: systemPrefers() }
        }));
      }
    });
  }

  // Expõe API global
  window.bosTheme = {
    init,
    getSaved: getSavedTheme,
    set: setTheme,
    cycle: cycleTheme,
    current: () => resolveTheme(getSavedTheme()),
    system: systemPrefers,
  };

  // Inicia automaticamente
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();