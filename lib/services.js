// lib/services.js
// BrightierOS v0.8.0 — Gerenciamento de Serviços
// Abstração multiplataforma para listar, inspecionar e controlar serviços.
// O próprio BrightierOS é exposto como um serviço virtual (status/logs/restart),
// abrindo caminho para gerenciar outros serviços do sistema operacional.
const os = require('os');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const platform = os.platform();
const LOGS_DIR = path.join(__dirname, '..', 'logs');
const BOS_LOG = path.join(LOGS_DIR, 'bos.log');

// Promisifica exec com timeout.
function run(cmd, opts = {}) {
  return new Promise((resolve) => {
    exec(cmd, { windowsHide: true, maxBuffer: 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      resolve({ err, stdout: stdout || '', stderr: stderr || '' });
    });
  });
}

const BRIGHTIEROS_ID = 'brightieros';

// Estado do próprio BrightierOS (sempre "running" enquanto o processo está ativo).
function brightierosService() {
  return {
    id: BRIGHTIEROS_ID,
    name: 'BrightierOS',
    type: 'application',
    managed: 'builtin',
    status: 'running',
    description: 'Servidor web BrightierOS (este processo).',
    startedAt: new Date(Date.now() - (process.uptime() * 1000)).toISOString(),
    canControl: true,
  };
}

async function listServices() {
  const services = [brightierosService()];
  try {
    if (platform === 'linux') {
      const { stdout } = await run('systemctl list-units --type=service --no-legend --no-pager');
      stdout.split('\n').forEach((line) => {
        const m = line.match(/^(\S+)\.service\s+(\S+)\s+(\S+)\s+(.*)$/);
        if (!m) return;
        const unit = m[1];
        if (/^(user@|session-|systemd-)/.test(unit)) return;
        services.push({
          id: unit, name: unit, type: 'service', managed: 'systemd',
          status: m[2] === 'active' ? 'running' : (m[3] === 'dead' ? 'stopped' : m[3]),
          description: m[4] ? m[4].trim() : '', canControl: true,
        });
      });
    } else if (platform === 'win32') {
      const { stdout } = await run('sc query state= all');
      let current = null;
      stdout.split('\n').forEach((line) => {
        const nm = line.match(/SERVICE_NAME:\s*(.+)/i);
        if (nm) { current = { id: nm[1].trim(), name: nm[1].trim(), type: 'service', managed: 'sc', canControl: true }; return; }
        const dn = line.match(/DISPLAY_NAME:\s*(.+)/i);
        if (dn && current) { current.name = dn[1].trim(); return; }
        const st = line.match(/STATE\s*:\s*\d+\s*(\S+)/i);
        if (st && current) {
          const s = st[1].toLowerCase();
          current.status = s.startsWith('running') ? 'running' : 'stopped';
          services.push(current); current = null;
        }
      });
    } else if (platform === 'darwin') {
      const { stdout } = await run('launchctl list');
      stdout.split('\n').forEach((line) => {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3 && parts[0] !== 'PID') {
          services.push({
            id: parts[2], name: parts[2], type: 'service', managed: 'launchctl',
            status: parts[0] === '-' ? 'stopped' : 'running', canControl: true,
          });
        }
      });
    }
  } catch (_) { /* ambiente sem gerenciador de serviços — só BrightierOS */ }
  return services;
}
async function serviceStatus(id) {
  if (id === BRIGHTIEROS_ID) return brightierosService();
  try {
    if (platform === 'linux') {
      const { stdout } = await run(`systemctl show ${JSON.stringify(id)}.service --property=ActiveState,SubState,Description --no-pager`);
      const get = (k) => { const m = stdout.match(new RegExp(k + '=(.*)')); return m ? m[1].trim() : ''; };
      const active = get('ActiveState');
      return {
        id, name: id, type: 'service', managed: 'systemd', canControl: true,
        status: active === 'active' ? 'running' : 'stopped', description: get('Description'),
      };
    } else if (platform === 'win32') {
      const { stdout } = await run(`sc query ${JSON.stringify(id)}`);
      const m = stdout.match(/STATE\s*:\s*\d+\s*(\S+)/i);
      const s = m ? m[1].toLowerCase() : 'unknown';
      return { id, name: id, type: 'service', managed: 'sc', canControl: true, status: s.startsWith('running') ? 'running' : 'stopped' };
    } else if (platform === 'darwin') {
      const { stdout } = await run(`launchctl list ${JSON.stringify(id)}`);
      return { id, name: id, type: 'service', managed: 'launchctl', canControl: true, status: /pid\s*=\s*-/i.test(stdout) ? 'stopped' : 'running' };
    }
  } catch (_) {}
  return { id, name: id, type: 'service', managed: platform, canControl: false, status: 'unknown' };
}

function controlCmd(id, action) {
  if (platform === 'linux') return `systemctl ${action} ${JSON.stringify(id)}.service`;
  if (platform === 'win32') {
    const map = { start: 'start', stop: 'stop', restart: 'restart' };
    return `sc ${map[action] || action} ${JSON.stringify(id)}`;
  }
  if (platform === 'darwin') {
    const map = { start: 'start', stop: 'stop', restart: 'stop && launchctl start' };
    return `launchctl ${map[action] || action} ${JSON.stringify(id)}`;
  }
  return null;
}

// Executa uma ação de controle. Retorna { ok, message }.
async function control(id, action) {
  if (id === BRIGHTIEROS_ID) {
    if (action === 'restart') {
      return { ok: true, message: 'Reinício do BrightierOS delegado ao administrador.', delegate: true };
    }
    return { ok: false, message: 'O BrightierOS não pode ser parado/iniciado por este endpoint.' };
  }
  const cmd = controlCmd(id, action);
  if (!cmd) return { ok: false, message: `Gerenciamento de serviços não suportado em ${platform}.` };
  const { err, stdout, stderr } = await run(cmd);
  if (err) return { ok: false, message: (stderr || err.message || 'Falha ao executar ação.').trim() };
  return { ok: true, message: (stdout || 'OK').trim().slice(0, 200) };
}

async function startService(id) { return control(id, 'start'); }
async function stopService(id) { return control(id, 'stop'); }
async function restartService(id) { return control(id, 'restart'); }

// Lê as últimas N linhas de um log.
async function serviceLogs(id, lines = 100) {
  const n = Math.max(1, Math.min(500, Number(lines) || 100));
  if (id === BRIGHTIEROS_ID) return readTail(BOS_LOG, n);
  try {
    if (platform === 'linux') {
      const { stdout } = await run(`journalctl -u ${JSON.stringify(id)}.service -n ${n} --no-pager`);
      return stdout || 'Sem logs disponíveis.';
    }
  } catch (_) {}
  return 'Logs não disponíveis para este serviço nesta plataforma.';
}

function readTail(file, lines) {
  try {
    if (!fs.existsSync(file)) return 'Sem logs registrados ainda.';
    const content = fs.readFileSync(file, 'utf8');
    return content.split('\n').filter(Boolean).slice(-lines).join('\n') || 'Sem logs registrados.';
  } catch {
    return 'Falha ao ler log.';
  }
}

module.exports = {
  BRIGHTIEROS_ID,
  listServices,
  serviceStatus,
  startService,
  stopService,
  restartService,
  serviceLogs,
  _internals: { run, controlCmd, readTail },
};

