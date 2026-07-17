// routes/update.js
// BrightierOS v0.4.5 — Atualizações Inteligentes
// Verifica versões no GitHub, aplica updates (inclusive incrementais),
// atualiza plugins junto, faz backup automático antes de mexer no sistema,
// protege instalações com alterações locais e mantém um changelog integrado.

const express = require("express");
const fs = require("fs");
const path = require("path");
const simpleGit = require("simple-git");
const usersLib = require("../lib/users");

const router = express.Router();

// Operações de atualização/rollback/restore afetam o sistema inteiro: só admin.
const requireManage = usersLib.requirePermission('users:manage');

// DATA_DIR é sobrescritível por teste (BOS_DATA_DIR) sem afetar produção.
const DATA_DIR = process.env.BOS_DATA_DIR
  ? path.resolve(process.env.BOS_DATA_DIR)
  : path.join(__dirname, "..", "data");
const HISTORY_FILE = path.join(DATA_DIR, "update-history.json");
const PKG_PATH = path.join(__dirname, "..", "package.json");
const BACKUPS_DIR = path.join(DATA_DIR, "backups");
const PLUGINS_DIR = path.join(DATA_DIR, "plugins");
const CHANGELOG_FILE = path.join(__dirname, "..", "CHANGELOG.md");

const REMOTE = "origin";
const BRANCH = "main";
const REPO_URL = "https://github.com/BrightierOS/BrightierOS-public.git";

// Código de saída usado para pedir ao launcher (bOS.bat / bOS.sh) que
// reinicie o servidor após uma atualização/rollback bem-sucedida.
const RESTART_EXIT_CODE = 65;

// ─── Helpers ────────────────────────────────────────────────────────

function getInstalledVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(PKG_PATH, "utf8"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function ensureHistoryFile() {
  ensureDataDir();
  if (!fs.existsSync(HISTORY_FILE)) {
    fs.writeFileSync(HISTORY_FILE, "[]", "utf8");
  }
}

function readHistory() {
  ensureHistoryFile();
  try {
    const content = fs.readFileSync(HISTORY_FILE, "utf8").trim();
    return content ? JSON.parse(content) : [];
  } catch {
    return [];
  }
}

function addHistoryEntry(entry) {
  const history = readHistory();
  history.unshift({
    ...entry,
    timestamp: new Date().toISOString(),
  });
  // Mantém só os últimos 20 registros
  if (history.length > 20) history.length = 20;
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), "utf8");
}

// ─── Comunicação com o launcher (bOS.bat / bOS.sh) ──────────────────
// O launcher inicia server.js como processo filho. Quando uma
// atualização (apply), rollback, restore ou backup-restore é aplicada,
// gravamos um flag de diagnóstico e encerramos o processo com
// RESTART_EXIT_CODE. O launcher detecta esse código, roda `npm install`
// (caso as deps tenham mudado) e reinicia o servidor.
function requestRestart(res, opts = {}) {
  const payload = {
    at: new Date().toISOString(),
    reason: opts.reason || "update",
    from: opts.from,
    to: opts.to,
    message: opts.message,
    backupId: opts.backupId,
    plugins: opts.plugins,
  };
  try {
    ensureHistoryFile();
    fs.writeFileSync(
      path.join(DATA_DIR, ".bos-restart"),
      JSON.stringify(payload, null, 2),
      "utf8"
    );
  } catch (e) {
    /* o flag é apenas diagnóstico; falhas aqui são ignoradas */
  }

  res.json({
    success: true,
    restarted: true,
    reason: payload.reason,
    installedVersion: payload.from,
    newVersion: payload.to,
    backupId: opts.backupId,
    plugins: opts.plugins,
    message: opts.message || "Reiniciando para aplicar a atualização...",
    details: opts.details,
  });

  // Garante que a resposta foi totalmente enviada antes de encerrar.
  res.on("finish", () => process.exit(RESTART_EXIT_CODE));
}

// ─── Backups ────────────────────────────────────────────────────────

// Copia o conteúdo de DATA_DIR (exceto a própria pasta de backups) para dest.
// Copiamos entrada por entrada para evitar o erro de copiar uma pasta para
// um subdiretório de si mesma (os backups ficam dentro de DATA_DIR).
function copyDataInto(dest) {
  ensureDataDir();
  for (const entry of fs.readdirSync(DATA_DIR, { withFileTypes: true })) {
    if (entry.name === "backups") continue;
    fs.cpSync(path.join(DATA_DIR, entry.name), path.join(dest, entry.name), { recursive: true });
  }
}

function dirSize(dir) {
  let total = 0;
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) total += dirSize(full);
      else if (e.isFile()) { try { total += fs.statSync(full).size; } catch { /* ignore */ } }
    }
  } catch { /* ignore */ }
  return total;
}

function ensureBackupsDir() {
  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

// v0.8.5.7 — valida o identificador de backup para impedir path traversal
// (ex.: "../outro" ou caminhos absolutos).
function validateBackupId(id) {
  return typeof id === "string" && /^[a-zA-Z0-9._-]+$/.test(id) && id !== "." && id !== "..";
}

function listBackups() {
  ensureBackupsDir();
  try {
    return fs
      .readdirSync(BACKUPS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => {
        const mp = path.join(BACKUPS_DIR, d.name, "manifest.json");
        let meta = {};
        try { meta = JSON.parse(fs.readFileSync(mp, "utf8")); } catch { /* ignore */ }
        return {
          id: d.name,
          version: meta.version || null,
          label: meta.label || "backup",
          reason: meta.reason || null,
          timestamp: meta.timestamp || null,
          size: meta.size || null,
        };
      })
      .sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")));
  } catch { return []; }
}

async function createBackup(label, opts = {}) {
  ensureDataDir();
  ensureBackupsDir();
  const id = opts.id || `bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const dest = path.join(BACKUPS_DIR, id);
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  // Copia o estado atual (exceto a pasta de backups).
  copyDataInto(dest);
  const meta = {
    id,
    version: getInstalledVersion(),
    label: label || "backup",
    reason: opts.reason || null,
    timestamp: new Date().toISOString(),
    size: dirSize(dest),
  };
  fs.writeFileSync(path.join(dest, "manifest.json"), JSON.stringify(meta, null, 2), "utf8");
  return meta;
}

async function restoreBackup(backupId) {
  if (!validateBackupId(backupId)) throw new Error("ID de backup inválido.");
  const src = path.join(BACKUPS_DIR, backupId);
  if (!fs.existsSync(src)) throw new Error(`Backup não encontrado: ${backupId}`);
  // Segurança: preserva o estado atual antes de sobrescrever.
  const safety = await createBackup("pre-restore", { reason: "restore" });
  fs.cpSync(src, DATA_DIR, { recursive: true });
  return { safetyId: safety.id };
}

// ─── Alterações locais (proteção contra update por cima de modificações) ──

function summarizeLocalChanges(status) {
  const c = [];
  (status.modified || []).forEach((f) => c.push(`M  ${f}`));
  (status.not_added || []).forEach((f) => c.push(`?  ${f}`));
  (status.created || []).forEach((f) => c.push(`A  ${f}`));
  (status.deleted || []).forEach((f) => c.push(`D  ${f}`));
  (status.renamed || []).forEach((f) => c.push(`R  ${f}`));
  (status.conflicted || []).forEach((f) => c.push(`C  ${f}`));
  return c;
}

// ─── Changelog integrado ────────────────────────────────────────────

function getChangelog() {
  try {
    if (fs.existsSync(CHANGELOG_FILE)) return fs.readFileSync(CHANGELOG_FILE, "utf8");
  } catch { /* ignore */ }
  return "";
}

async function getIncrementalChangelog(git, fromRef, toRef) {
  try {
    const log = await git.log({ from: fromRef, to: toRef, ["--oneline"]: null });
    if (log && log.all && log.all.length > 0) {
      return log.all.map((c) => `  • ${c.message}`).join("\n");
    }
  } catch { /* ignore */ }
  return "";
}

// ─── Atualização de plugins junto ───────────────────────────────────

async function updatePluginsTogether() {
  const results = [];
  if (!fs.existsSync(PLUGINS_DIR)) return results;
  const dirs = fs
    .readdirSync(PLUGINS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  for (const id of dirs) {
    const pluginPath = path.join(PLUGINS_DIR, id);
    let manifest = {};
    try { manifest = JSON.parse(fs.readFileSync(path.join(pluginPath, "manifest.json"), "utf8")); } catch { /* ignore */ }
    if (!fs.existsSync(path.join(pluginPath, ".git"))) {
      results.push({ id, name: manifest.name || id, updated: false, reason: "não é um repositório git" });
      continue;
    }
    try {
      const g = simpleGit({ baseDir: pluginPath });
      const pull = await g.pull(REMOTE, BRANCH);
      results.push({
        id,
        name: manifest.name || id,
        updated: true,
        changes: pull && pull.summary ? pull.summary.changes : 0,
        version: manifest.version || null,
      });
    } catch (e) {
      results.push({ id, name: manifest.name || id, updated: false, error: e.message });
    }
  }
  return results;
}

// ─── Rotas ──────────────────────────────────────────────────────────

// GET /api/update/check — Versão instalada vs versão disponível no GitHub
router.get("/check", async (req, res) => {
  try {
    const installed = getInstalledVersion();
    const git = simpleGit({ baseDir: path.join(__dirname, "..") });

    // Busca as tags remotas para saber a versão mais recente
    await git.fetch([REMOTE, "--tags", "--quiet"]);

    // Pega a tag mais recente (semântica: v0.2.0, v0.1.3, etc.)
    const tags = await git.tags(["--list", "--sort=-v:refname"]);
    const latestTag = tags.latest || "v0.0.0";
    const available = latestTag.replace(/^v/, "");

    // Tags candidatas para atualização incremental (mais novas que a instalada)
    const incrementalTags = (tags.all || [])
      .filter((t) => t.startsWith("v"))
      .map((t) => t.replace(/^v/, ""))
      .filter((v) => compareVersions(v, installed) > 0)
      .sort((a, b) => compareVersions(a, b));

    // Pega o changelog da tag mais recente (se existir)
    let changelog = "";
    try {
      const logResult = await git.log({ from: "HEAD", to: latestTag, ["--oneline"]: null });
      if (logResult && logResult.all && logResult.all.length > 0) {
        changelog = logResult.all
          .map((c) => `  • ${c.message}`)
          .join("\n");
      }
    } catch {
      changelog = "Não foi possível obter o changelog.";
    }

    // Detecta alterações locais para avisar antes de atualizar
    let hasLocalChanges = false;
    let localChanges = [];
    try {
      const st = await git.status();
      localChanges = summarizeLocalChanges(st);
      hasLocalChanges = localChanges.length > 0;
    } catch { /* ignora se não for repositório git */ }

    // Comparação semântica simples
    const hasUpdate = compareVersions(available, installed) > 0;
    const hasChangelog = fs.existsSync(CHANGELOG_FILE);

    res.json({
      success: true,
      installedVersion: installed,
      availableVersion: available || installed,
      hasUpdate,
      changelog: hasUpdate ? changelog : "",
      incrementalTags,
      changelogAvailable: hasChangelog,
      hasLocalChanges,
      localChanges,
      repoUrl: REPO_URL,
    });
  } catch (err) {
    console.error("Erro ao verificar atualizações:", err.message);
    res.json({
      success: false,
      installedVersion: getInstalledVersion(),
      error: "Não foi possível verificar atualizações: " + err.message,
    });
  }
});

// POST /api/update/apply — Aplica atualização (backup + plugins + incremental)
// Corpo opcional: { targetVersion?, force? }
router.post("/apply", requireManage, async (req, res) => {
  try {
    const { targetVersion, force } = req.body || {};
    const installed = getInstalledVersion();
    const git = simpleGit({ baseDir: path.join(__dirname, "..") });

    // Proteção: não atualiza por cima de instalação modificada sem avisar.
    const st = await git.status();
    const localChanges = summarizeLocalChanges(st);
    if (localChanges.length > 0 && !force) {
      return res.status(409).json({
        success: false,
        code: "LOCAL_CHANGES",
        localChanges,
        message:
          "Foram detectadas alterações locais. Atualizar pode sobrescrever arquivos modificados.",
      });
    }

    // Atualização forçada: registra no log administrativo que ignoramos alterações locais.
    if (force && localChanges.length > 0) {
      try {
        usersLib.appendAdminLog({
          actor: (usersLib.authenticate(req) || {}).username || "system",
          action: "update.force",
          target: targetVersion || "latest",
          detail: `atualização forçada; arquivos modificados ignorados: ${localChanges.length}`,
        });
      } catch (_) { /* log não é crítico */ }
    }

    // 1) Backup automático ANTES de atualizar.
    let backup = null;
    try {
      backup = await createBackup("before-update", { reason: "update" });
    } catch (e) {
      console.warn("Falha ao criar backup antes da atualização:", e.message);
    }

    // 2) Atualização (incremental se houver targetVersion).
    let pullResult = null;
    let incremental = false;
    let changelog = "";
    let newVersion = installed;

    if (targetVersion) {
      // Atualização incremental: vai exatamente para a tag alvo via checkout.
      incremental = true;
      await git.fetch([REMOTE, "--tags", "--quiet"]);
      const targetTag = `v${String(targetVersion).replace(/^v/, "")}`;
      const allTags = await git.tags();
      if (!allTags.all.includes(targetTag)) {
        return res.status(404).json({
          success: false,
          error: `Tag ${targetTag} não encontrada.`,
          backupId: backup && backup.id,
        });
      }
      // Forçar: descarta alterações locais antes do checkout para não falhar.
      if (force) {
        await git.reset(["--hard", "HEAD"]).catch(() => {});
        await git.clean(["-fd"]).catch(() => {});
      }
      pullResult = await git.checkout(targetTag);
      changelog = await getIncrementalChangelog(git, `v${String(installed).replace(/^v/, "")}`, targetTag);
    } else {
      // Atualização normal (branch main).
      if (force) {
        // v0.8.1 — Forçar usa git checkout (em vez de pull/merge): fetch +
        // checkout da branch + reset --hard para o remote. Garante arquivos
        // idênticos ao remote, sem merge conflicts nem commits de merge.
        await git.fetch([REMOTE, BRANCH, "--quiet"]).catch(() => {});
        await git.checkout(BRANCH).catch(() => {});
        await git.reset(["--hard", `${REMOTE}/${BRANCH}`]).catch(() => {});
        pullResult = { forced: true, message: "Atualização forçada via checkout (sem merge)." };
      } else {
        // Volta para a branch caso esteja em HEAD destacado (após rollback
        // ou incremental anterior) e faz pull normal.
        await git.checkout(BRANCH).catch(() => {});
        pullResult = await git.pull(REMOTE, BRANCH);
      }
      try {
        const allTags = await git.tags(["--list", "--sort=-v:refname"]);
        const latestTag = allTags.latest || `v${String(installed).replace(/^v/, "")}`;
        changelog = await getIncrementalChangelog(git, `v${String(installed).replace(/^v/, "")}`, latestTag);
      } catch { /* ignora */ }
    }

    // Pega a nova versão depois da atualização.
    const newPkg = JSON.parse(fs.readFileSync(PKG_PATH, "utf8"));
    newVersion = newPkg.version || installed;

    // 3) Atualização de plugins junto.
    let plugins = [];
    try {
      plugins = await updatePluginsTogether();
    } catch (e) {
      console.warn("Falha ao atualizar plugins:", e.message);
    }

    // Registra no histórico.
    addHistoryEntry({
      type: "update",
      from: installed,
      to: newVersion,
      incremental,
      target: targetVersion || null,
      backupId: backup && backup.id,
      plugins,
      summary: pullResult && pullResult.summary ? pullResult.summary : {},
      changelog: changelog || null,
      message: incremental
        ? `Atualização incremental para ${targetVersion}`
        : pullResult && pullResult.summary && pullResult.summary.changes
        ? `${pullResult.summary.changes} arquivos alterados`
        : "Atualização concluída",
    });

    const pluginsChanged = plugins.some((p) => p.updated);
    const changed =
      newVersion !== installed ||
      pluginsChanged ||
      (pullResult && pullResult.summary && pullResult.summary.changes > 0);

    // Se houve mudança real, pede ao launcher para reiniciar o servidor.
    if (changed) {
      return requestRestart(res, {
        reason: "update",
        from: installed,
        to: newVersion,
        backupId: backup && backup.id,
        plugins,
        message: incremental
          ? `Atualizado (incremental) para ${targetVersion}! Reiniciando...`
          : "Atualizado! Reiniciando...",
        details: pullResult,
      });
    }

    res.json({
      success: true,
      restarted: false,
      installedVersion: installed,
      newVersion,
      backupId: backup && backup.id,
      plugins,
      message: "Já está na versão mais recente.",
      details: pullResult,
    });
  } catch (err) {
    console.error("Erro ao atualizar:", err.message);
    res.status(500).json({ success: false, error: "Falha ao atualizar: " + err.message });
  }
});

// GET /api/update/history — Histórico de atualizações
router.get("/history", (req, res) => {
  try {
    const history = readHistory();
    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/update/rollback — Reverte para uma versão anterior via tag
// Corpo: { targetVersion, force? }
router.post("/rollback", requireManage, async (req, res) => {
  try {
    const { targetVersion, force } = req.body || {};
    if (!targetVersion) {
      return res.status(400).json({ success: false, error: "Informe a versão alvo." });
    }

    const installed = getInstalledVersion();
    if (targetVersion === installed) {
      return res.status(400).json({ success: false, error: "Já está nesta versão." });
    }

    const git = simpleGit({ baseDir: path.join(__dirname, "..") });

    // Proteção: avisa sobre alterações locais antes de reverter.
    const st = await git.status();
    const localChanges = summarizeLocalChanges(st);
    if (localChanges.length > 0 && !force) {
      return res.status(409).json({
        success: false,
        code: "LOCAL_CHANGES",
        localChanges,
        message:
          "Foram detectadas alterações locais. Reverter pode sobrescrever arquivos modificados.",
      });
    }

    // Reversão forçada: registra no log administrativo que ignoramos alterações locais.
    if (force && localChanges.length > 0) {
      try {
        usersLib.appendAdminLog({
          actor: (usersLib.authenticate(req) || {}).username || "system",
          action: "rollback.force",
          target: targetVersion || "latest",
          detail: `reversão forçada; arquivos modificados ignorados: ${localChanges.length}`,
        });
      } catch (_) { /* log não é crítico */ }
    }

    // Backup antes do rollback.
    let backup = null;
    try {
      backup = await createBackup("before-rollback", { reason: "rollback" });
    } catch (e) {
      console.warn("Falha ao criar backup antes do rollback:", e.message);
    }

    const tag = `v${String(targetVersion).replace(/^v/, "")}`;

    // Confirma que a tag existe
    const tags = await git.tags();
    if (!tags.all.includes(tag)) {
      return res.status(404).json({
        success: false,
        error: `Tag ${tag} não encontrada.`,
        backupId: backup && backup.id,
      });
    }

    await git.checkout(tag);

    const newPkg = JSON.parse(fs.readFileSync(PKG_PATH, "utf8"));
    const newVersion = newPkg.version || targetVersion;

    addHistoryEntry({
      type: "rollback",
      from: installed,
      to: newVersion,
      target: targetVersion,
      backupId: backup && backup.id,
      message: `Rollback para ${tag}`,
    });

    // Pede ao launcher para reiniciar o servidor para aplicar o checkout.
    return requestRestart(res, {
      reason: "rollback",
      from: installed,
      to: newVersion,
      backupId: backup && backup.id,
      message: `Revertido para ${tag}. Reiniciando para aplicar...`,
    });
  } catch (err) {
    console.error("Erro ao reverter:", err.message);
    res.status(500).json({ success: false, error: "Falha ao reverter: " + err.message });
  }
});

// POST /api/update/backup — Cria um backup manual do estado atual
router.post("/backup", requireManage, async (req, res) => {
  try {
    const label = (req.body && req.body.label) || "manual";
    const meta = await createBackup(label, { reason: "manual" });
    addHistoryEntry({
      type: "backup",
      version: meta.version,
      label: meta.label,
      backupId: meta.id,
      message: `Backup criado: ${meta.id}`,
    });
    res.json({ success: true, backup: meta });
  } catch (err) {
    console.error("Erro ao criar backup:", err.message);
    res.status(500).json({ success: false, error: "Falha ao criar backup: " + err.message });
  }
});

// GET /api/update/backups — Lista os backups disponíveis
router.get("/backups", requireManage, (req, res) => {
  try {
    res.json({ success: true, backups: listBackups() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/update/restore — Restaura um backup (com backup de segurança)
router.post("/restore", requireManage, async (req, res) => {
  try {
    const { backupId } = req.body || {};
    if (!backupId) {
      return res.status(400).json({ success: false, error: "Informe o backup." });
    }
    const { safetyId } = await restoreBackup(backupId);
    addHistoryEntry({
      type: "restore",
      backupId,
      safetyId,
      message: `Backup restaurado: ${backupId}`,
    });
    return requestRestart(res, {
      reason: "restore",
      message: `Backup ${backupId} restaurado. Reiniciando...`,
    });
  } catch (err) {
    console.error("Erro ao restaurar:", err.message);
    res.status(500).json({ success: false, error: "Falha ao restaurar: " + err.message });
  }
});

// GET /api/update/changelog — Changelog integrado (CHANGELOG.md)
router.get("/changelog", (req, res) => {
  try {
    const text = getChangelog();
    res.json({ success: true, hasChangelog: !!text, changelog: text });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Utilitário de comparação de versões ────────────────────────────

function compareVersions(a, b) {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

function tagOf(version) {
  return `v${String(version).replace(/^v/, "")}`;
}

// Expõe helpers para testes sem afetar o uso como router.
router._internals = {
  compareVersions,
  tagOf,
  createBackup,
  restoreBackup,
  listBackups,
  getInstalledVersion,
  getChangelog,
  updatePluginsTogether,
  summarizeLocalChanges,
  ensureDataDir,
  validateBackupId,
  BACKUPS_DIR,
  DATA_DIR,
};

module.exports = router;
