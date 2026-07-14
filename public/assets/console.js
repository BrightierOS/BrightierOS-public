/* public/assets/console.js */
document.addEventListener('DOMContentLoaded', () => {
  const terminal = document.getElementById('terminal');
  const input = document.getElementById('cmd');
  if (!terminal || !input) return;
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
  function appendOutput(text) {
    const out = document.createElement('div');
    out.className = 'output';
    out.textContent = text;
    terminal.insertBefore(out, terminal.lastElementChild);
    terminal.scrollTop = terminal.scrollHeight;
  }
  ws.onmessage = (event) => appendOutput(event.data);
  ws.onclose = () => appendOutput('Connection lost.');
  input.addEventListener('keydown', (event) => {
    if (event.ctrlKey && (event.key === 'c' || event.key === 'C')) {
      ws.send('__INTERRUPT__');
      input.value = '';
      event.preventDefault();
      return;
    }
    if (event.key !== 'Enter') return;
    const command = input.value.trim();
    if (!command) return;
    const history = document.createElement('div');
    history.className = 'output';
    history.innerHTML = `<span style="color:#00d4ff;">brightier&gt;</span> ${command.replace(/</g,'&lt;')}`;
    terminal.insertBefore(history, terminal.lastElementChild);
    ws.send(command);
    input.value = '';
    terminal.scrollTop = terminal.scrollHeight;
  });
});
