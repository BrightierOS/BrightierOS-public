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

// v0.8.5 — diretório de plugins (respeita BOS_DATA_DIR como o restante do
// core). Plugins são processos internos do BrightierOS (carregados in-process
// pelo loader em routes/plugin.js) e aparecem como serviços da categoria
// 'brightieros', ao lado da base.
const DATA_DIR = process.env.BOS_DATA_DIR
  ? path.resolve(process.env.BOS_DATA_DIR)
  : path.join(__dirname, '..', 'data');
const PLUGINS_DIR = path.join(DATA_DIR, 'plugins');

// Promisifica exec com timeout (evita travar requisição).
function run(cmd, opts = {}) {
  return new Promise((resolve) => {
    const child = exec(cmd, {
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
      timeout: opts.timeout || (process.platform === 'linux' ? 10000 : 30000),
      ...opts,
    }, (err, stdout, stderr) => {
      resolve({ err: err || null, stdout: stdout || '', stderr: stderr || '' });
    });
    // Força encerramento se o timeout nativo não agir.
    const t = setTimeout(() => {
      try { child.kill(); } catch (_) {}
    }, (opts.timeout || (process.platform === 'linux' ? 10000 : 30000)) + 1000);
    child.on('exit', () => clearTimeout(t));
    child.on('error', () => clearTimeout(t));
  });
}

const BRIGHTIEROS_ID = 'brightieros';

// Estado do próprio BrightierOS (sempre "running" enquanto o processo está ativo).
// v0.8.5: category 'brightieros' — processo interno (a base).
function brightierosService() {
  return {
    id: BRIGHTIEROS_ID,
    name: 'BrightierOS',
    type: 'application',
    managed: 'builtin',
    category: 'brightieros',
    status: 'running',
    description: 'Servidor web BrightierOS (este processo).',
    startedAt: new Date(Date.now() - (process.uptime() * 1000)).toISOString(),
    canControl: true,
  };
}

// v0.8.5 — Plugins como processos internos. Cada plugin instalado em
// data/plugins/<id>/manifest.json vira um serviço da categoria 'brightieros'.
// Eles rodam DENTRO do processo do BrightierOS (require() no loader), então:
// status sempre 'running' (carregado) e canControl false (não dá pra
// iniciar/parar um módulo in-process independentemente). O id é prefixado com
// 'plugin:' pra não colidir com units do systemd/sc/launchctl nem com a base.
function pluginServices() {
  const out = [];
  let dirs = [];
  try { dirs = fs.readdirSync(PLUGINS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()); }
  catch (_) { return out; /* sem plugins instalados */ }
  for (const d of dirs) {
    const manifestPath = path.join(PLUGINS_DIR, d.name, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;
    let manifest = {};
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); }
    catch (_) { continue; }
    const pid = manifest.id || d.name;
    out.push({
      id: 'plugin:' + pid,
      name: manifest.name || pid,
      type: 'plugin',
      managed: 'plugin',
      category: 'brightieros',
      status: 'running',
      description: manifest.description || ('Plugin ' + pid),
      version: manifest.version || null,
      canControl: false,
    });
  }
  return out;
}

async function listServices() {
  // v0.8.5: base + plugins são processos internos (categoria 'brightieros');
  // os serviços do SO vêm depois (categoria 'system').
  const services = [brightierosService(), ...pluginServices()];
  try {
    if (platform === 'linux') {
      // systemctl: colunas LOAD / ACTIVE / SUB / DESCRIPTION
      // Formato: unit.service LOAD ACTIVE SUB DESCRIPTION
      // Usamos a terceira coluna (ACTIVE) para status principal.
      const { stdout, err } = await run('systemctl list-units --type=service --all --no-legend --no-pager');
      if (!err && stdout) {
        stdout.split('\n').forEach((line) => {
          if (!line.trim()) return;
          // Regex flexível: aceita espaços variáveis e captura qualquer
          // linha que termine com .service, extraindo active/inactive/dead.
          let unit, act;
          const simple = line.match(/^(\S+)\.service\s+(\S+)\s+(\S+)\s+(.*)$/);
          if (simple) { unit = simple[1]; act = simple[3]; }
          else {
            // Fallback: tenta extrair nome + estado de forma mais livre
            const fallback = line.match(/^(\S+)\.service\s+\S+\s+(\S+)/);
            if (fallback) { unit = fallback[1]; act = fallback[2]; }
            else return;
          }
          if (/^(user@|session-|systemd-)/.test(unit)) return;
          services.push({
            id: unit, name: unit, type: 'service', managed: 'systemd', category: 'system',
            status: act === 'active' ? 'running' : 'stopped',
            description: simple && simple[4] ? simple[4].trim() : '', canControl: true,
          });
        });
      } else {
        console.warn('[Services] systemctl não disponível, tentando service --status-all...');
        // Fallback para SysV init ou containers sem systemd.
        const r2 = await run('service --status-all 2>/dev/null || true');
        const svc = r2.stdout;
        if (svc) {
          svc.split('\n').forEach((line) => {
            const m = line.match(/^\s*\[\s*([+-])\s*\]\s*(.+)/);
            if (!m) return;
            services.push({
              id: m[2].trim(), name: m[2].trim(), type: 'service', managed: 'sysv', category: 'system',
              status: m[1] === '+' ? 'running' : 'stopped', canControl: true,
            });
          });
        }
      }
    } else if (platform === 'win32') {
      // v0.8.5.1: usa PowerShell Get-Service em vez de sc query, porque o sc
      // retorna cabeçalhos no idioma do sistema (ex.: português -> NOME_DO_SERVIÇO,
      // ESTADO) e os regex quebravam. Get-Service sempre retorna propriedades em
      // inglês (Name, DisplayName, Status) e já podemos parsear como JSON.
      const { stdout, err } = await run(
        'powershell -NoProfile -Command "Get-Service | Select-Object Name,DisplayName,Status | ConvertTo-Json -Compress"'
      );
      if (err) throw err;
      let list = [];
      try { list = JSON.parse(stdout); } catch (_) { list = []; }
      if (!Array.isArray(list)) list = [list];
      for (const svc of list) {
        if (!svc || !svc.Name) continue;
        // Status: 1 = Stopped, 4 = Running (enum ServiceControllerStatus)
        const status = svc.Status === 4 ? 'running' : 'stopped';
        services.push({
          id: svc.Name,
          name: svc.DisplayName || svc.Name,
          type: 'service',
          managed: 'sc',
          category: 'system',
          status,
          canControl: true,
        });
      }
    } else if (platform === 'darwin') {
      const { stdout } = await run('launchctl list');
      stdout.split('\n').forEach((line) => {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3 && parts[0] !== 'PID') {
          services.push({
            id: parts[2], name: parts[2], type: 'service', managed: 'launchctl', category: 'system',
            status: parts[0] === '-' ? 'stopped' : 'running', canControl: true,
          });
        }
      });
    }
  } catch (_) { console.warn('[Services] Falha ao listar serviços do sistema:', _.message); }
  return services;
}
async function serviceStatus(id) {
  if (id === BRIGHTIEROS_ID) return brightierosService();
  // v0.8.5: plugins são internos — devolve o serviço do plugin (ou unknown).
  if (typeof id === 'string' && id.startsWith('plugin:')) {
    const found = pluginServices().find((p) => p.id === id);
    return found || { id, name: id, type: 'plugin', managed: 'plugin', category: 'brightieros', canControl: false, status: 'unknown' };
  }
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
      // v0.8.5.1: usa PowerShell (imune a idioma) em vez de sc query.
      const { stdout, err } = await run(
        `powershell -NoProfile -Command "Get-Service -Name ${JSON.stringify(id)} | Select-Object Name,DisplayName,Status | ConvertTo-Json -Compress"`
      );
      if (err) throw err;
      let svc = null;
      try { svc = JSON.parse(stdout); } catch (_) {}
      // Status: 1 = Stopped, 4 = Running (enum ServiceControllerStatus)
      const s = svc && svc.Status === 4 ? 'running' : (svc && svc.Status ? 'stopped' : 'unknown');
      return { id, name: (svc && svc.DisplayName) || id, type: 'service', managed: 'sc', canControl: true, status: s };
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
  // v0.8.5: plugins rodam in-process — não podem ser controlados individualmente.
  if (typeof id === 'string' && id.startsWith('plugin:')) {
    return { ok: false, message: 'Plugins rodam dentro do processo do BrightierOS e não podem ser iniciados/parados individualmente. Para remover um plugin, use a página de Plugins.' };
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
  // v0.8.5: plugins compartilham o log do BrightierOS (rodam no mesmo processo).
  if (typeof id === 'string' && id.startsWith('plugin:')) {
    return 'Plugins rodam dentro do processo do BrightierOS e compartilham o log dele. Veja os logs do serviço "brightieros".';
  }
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
  PLUGINS_DIR,
  listServices,
  pluginServices,
  serviceStatus,
  startService,
  stopService,
  restartService,
  serviceLogs,
  _internals: { run, controlCmd, readTail },
};

