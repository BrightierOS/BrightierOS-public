/* ============================================================
   BrightierOS — Console (WebSocket terminal)
   ============================================================ */
(function () {
  'use strict';

  const terminal = document.getElementById('terminal');
  const input = document.getElementById('cmd');
  if (!terminal || !input) return;

  const token = (typeof localStorage !== 'undefined') ? localStorage.getItem('brightieros-token') : null;
  const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/?token=${encodeURIComponent(token || '')}`;
  const ws = new WebSocket(wsUrl);

  function scroll() { terminal.scrollTop = terminal.scrollHeight; }

  function append(text, cls) {
    const div = document.createElement('div');
    div.className = 'line' + (cls ? ' ' + cls : '');
    div.textContent = text;
    terminal.insertBefore(div, terminal.lastElementChild);
    scroll();
  }

  function echoPrompt(cmd) {
    const div = document.createElement('div');
    div.className = 'line';
    div.innerHTML = `<span class="prompt">brightier&gt;</span> ${ui.escapeHtml(cmd)}`;
    terminal.insertBefore(div, terminal.lastElementChild);
    scroll();
  }

  ws.onmessage = (e) => {
    if (e.data === '__CLEAR__') {
      terminal.querySelectorAll('.line').forEach(l => l.remove());
      return;
    }
    append(e.data);
  };
  ws.onclose = () => append('Conexão perdida.', 'muted');
  ws.onerror = () => append('Erro de conexão.', 'muted');

  input.addEventListener('keydown', (e) => {
    if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
      ws.send('__INTERRUPT__');
      input.value = '';
      e.preventDefault();
      return;
    }
    if (e.key !== 'Enter') return;
    const cmd = input.value.trim();
    if (!cmd) return;
    echoPrompt(cmd);
    ws.send(cmd);
    input.value = '';
    scroll();
  });
})();
