/* public/assets/index.js */
document.addEventListener('DOMContentLoaded', () => {
  const timeEl = document.getElementById('time');
  const statsEl = document.getElementById('stats');
  const updateStatusEl = document.getElementById('update-status');
  const checkBtn = document.getElementById('checkUpdateBtn');
  const applyBtn = document.getElementById('applyUpdateBtn');
  const historyEl = document.getElementById('update-history');

  function tick() {
    const now = new Date();
    timeEl.textContent = now.toLocaleTimeString('pt-BR');
  }
  tick();
  setInterval(tick, 1000);

  const metrics = {
    cpu: { bar: document.getElementById('cpuBar'), text: document.getElementById('cpuText') },
    ram: { bar: document.getElementById('ramBar'), text: document.getElementById('ramText') },
    gpu: { bar: document.getElementById('gpuBar'), text: document.getElementById('gpuText') },
    storage: { bar: document.getElementById('storageBar'), text: document.getElementById('storageText') },
  };

  async function loadMetrics() {
    try {
      const res = await fetch('/api/system/metrics');
      if (!res.ok) throw new Error('metrics fail');
      const data = await res.json();
      setBar(metrics.cpu, data.cpuPercent, '%');
      setBar(metrics.ram, data.memoryPercent, '%');
      setBar(metrics.gpu, data.gpuPercent || 0, '%');
      setBar(metrics.storage, data.storagePercent || 0, '%');
    } catch (e) {
      console.warn('metrics', e);
    }
  }

  function setBar(entry, value, suffix = '') {
    if (!entry || !entry.bar) return;
    const pct = Math.max(0, Math.min(100, Number(value) || 0));
    entry.bar.style.width = `${pct}%`;
    if (entry.text) entry.text.textContent = `${pct.toFixed(1)}${suffix}`;
    if (pct > 85) entry.bar.style.background = 'linear-gradient(135deg, #ff4d4d, #b30000)';
    else entry.bar.style.background = 'linear-gradient(135deg, #00d4ff, #1f7cff)';
  }

  async function checkUpdates() {
    if (!updateStatusEl) return;
    updateStatusEl.innerHTML = `<p class="muted">Verificando atualizações...</p>`;
    if (applyBtn) applyBtn.style.display = 'none';
    try {
      const res = await fetch('/api/update/check');
      const data = await res.json();
      if (data.update) {
        updateStatusEl.innerHTML = `<p style="color:#4caf50;">Atualização disponível: v${data.latestVersion}</p><p class="muted">${data.message || ''}</p>`;
        if (applyBtn) applyBtn.style.display = 'inline-flex';
      } else {
        updateStatusEl.innerHTML = `<p class="muted">Nenhuma atualização disponível.</p>`;
      }
    } catch (e) {
      updateStatusEl.innerHTML = `<p style="color:#f88;">Erro ao verificar atualizações.</p>`;
    }
  }

  async function applyUpdate() {
    if (!applyBtn) return;
    if (!confirm('Atualizar agora? O servidor será reiniciado.')) return;
    applyBtn.disabled = true;
    applyBtn.textContent = 'Atualizando...';
    try {
      const res = await fetch('/api/update/apply', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        updateStatusEl.innerHTML = `<p style="color:#4caf50;">Atualizado para v${data.newVersion || data.installedVersion}</p>`;
      } else {
        updateStatusEl.innerHTML = `<p style="color:#f88;">${data.error || 'Falha.'}</p>`;
        applyBtn.disabled = false;
        applyBtn.textContent = 'Tentar novamente';
      }
    } catch (e) {
      updateStatusEl.innerHTML = `<p style="color:#f88;">Erro.</p>`;
      applyBtn.disabled = false;
      applyBtn.textContent = 'Tentar novamente';
    }
  }

  checkBtn?.addEventListener('click', checkUpdates);
  applyBtn?.addEventListener('click', applyUpdate);

  loadMetrics();
  setInterval(loadMetrics, 3000);
  checkUpdates();
});
