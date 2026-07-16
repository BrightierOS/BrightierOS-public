#!/usr/bin/env node
// BrightierOS — helper de console (operacoes que conversam com o backend via HTTP)
// Subcomandos: status | plugins | config | diagnose | uninstall <id>
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = process.env.BOS_DATA_DIR
  ? path.resolve(process.env.BOS_DATA_DIR)
  : path.join(ROOT, 'data');
const LOGS_DIR = process.env.BOS_LOGS_DIR
  ? path.resolve(process.env.BOS_LOGS_DIR)
  : path.join(ROOT, 'logs');

function getJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, body: null }); }
      });
    }).on('error', reject);
  });
}

async function status() {
  console.log('=== Status dos componentes ===');
  try {
    const r = await getJSON(`http://localhost:${PORT}/api/stats`);
    const d = r.body || {};
    console.log('  Servidor: RODANDO (HTTP', r.status + ')');
    console.log('  CPU:', (d.cpu && d.cpu.usage) || 0, '%', (d.cpu && d.cpu.name) || '');
    console.log('  RAM:', (d.ram && d.ram.usage) || 0, '%', '(', (d.ram && d.ram.used) || 0, '/', (d.ram && d.ram.total) || 0, 'GB)');
    (d.storage || []).forEach((s) => console.log('  Disco', s.drive + ':', (s.usage || 0) + '% (' + (s.used || 0) + '/' + (s.total || 0) + ' GB)'));
  } catch (e) {
    console.log('  Servidor: PARADO / offline:', e.message);
  }
}

async function plugins() {
  console.log('=== Modulos / Plugins ===');
  try {
    const r = await getJSON(`http://localhost:${PORT}/api/plugins`);
    const list = r.body || [];
    if (!Array.isArray(list) || !list.length) { console.log('  Nenhum plugin instalado.'); return; }
    list.forEach((p) => console.log('  -', p.id, '|', p.name || '?', 'v' + (p.version || '?'), p.author ? ('por ' + p.author) : ''));
  } catch (e) { console.log('  Erro ao listar plugins:', e.message); }
}

async function config() {
  console.log('=== Configuracoes ===');
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  console.log('  Nome:', pkg.name, 'v' + pkg.version);
  console.log('  Porta (PORT):', PORT);
  const cfgPath = path.join(DATA_DIR, 'config.json');
  if (fs.existsSync(cfgPath)) {
    try { console.log('  data/config.json:', JSON.stringify(JSON.parse(fs.readFileSync(cfgPath, 'utf8')))); }
    catch (e) { console.log('  data/config.json: (invalido)'); }
  } else { console.log('  data/config.json: (ausente)'); }
  console.log('  Node env:', process.env.NODE_ENV || '(nenhum)');
}

async function diagnose() {
  console.log('=== Modo diagnostico ===');
  try { console.log('  Node:', execSync('node -v').toString().trim(), '| NPM:', execSync('npm -v').toString().trim()); } catch (e) {}
  try { console.log('  Git branch:', execSync('git rev-parse --abbrev-ref HEAD').toString().trim()); } catch (e) { console.log('  Git branch: ?'); }
  console.log('  Espaco em disco:');
  try {
    const out = execSync('wmic logicaldisk get caption,freespace,size', { windowsHide: true }).toString();
    out.split('\n').slice(1).forEach((l) => {
      const p = l.trim().split(/\s+/);
      if (p.length >= 3 && p[1]) console.log('    ' + p[0] + ': ' + (p[1] / 1e9).toFixed(1) + ' GB livres / ' + (p[2] / 1e9).toFixed(1) + ' GB');
    });
  } catch (e) { console.log('    (indisponivel)'); }
  try { execSync('npm ls --omit=dev --depth=0', { stdio: 'inherit' }); }
  catch (e) { console.log('  [!] Dependencias inconsistentes.'); }
  try { const r = await getJSON(`http://localhost:${PORT}/api/stats`); console.log('  Healthcheck /api/stats: HTTP', r.status); }
  catch (e) { console.log('  Healthcheck: offline'); }
  const logPath = path.join(LOGS_DIR, 'bos.log');
  if (fs.existsSync(logPath)) {
    console.log('  Ultimas 20 linhas de log:');
    fs.readFileSync(logPath, 'utf8').split('\n').slice(-20).forEach((l) => console.log('    ' + l));
  }
}

function uninstall(id) {
  return new Promise((resolve) => {
    if (!id) { console.log('  Informe o id do plugin.'); return resolve(); }
    const req = http.request(
      { hostname: 'localhost', port: PORT, path: '/api/plugins/' + encodeURIComponent(id), method: 'DELETE' },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          try { const j = JSON.parse(d); console.log('  ', j.success ? ('Removido: ' + id) : ('Falha: ' + (j.error || ''))); }
          catch (e) { console.log('  Resposta:', d); }
          resolve();
        });
      }
    );
    req.on('error', (e) => { console.log('  Erro:', e.message); resolve(); });
    req.end();
  });
}

const cmd = process.argv[2];
const arg = process.argv[3];
(async () => {
  if (cmd === 'status') await status();
  else if (cmd === 'plugins') await plugins();
  else if (cmd === 'config') await config();
  else if (cmd === 'diagnose') await diagnose();
  else if (cmd === 'uninstall') await uninstall(arg);
  else { console.log('Uso: node bOS-console.js [status|plugins|config|diagnose|uninstall <id>]'); process.exit(1); }
})();
