// routes/update.js
// BrightierOS v0.2.0 — Sistema de Atualizações
// Verifica versões no GitHub, aplica updates e mantém histórico.

const express = require("express");
const fs = require("fs");
const path = require("path");
const simpleGit = require("simple-git");

const router = express.Router();
const DATA_DIR = path.join(__dirname, "..", "data");
const HISTORY_FILE = path.join(DATA_DIR, "update-history.json");
const PKG_PATH = path.join(__dirname, "..", "package.json");

const REMOTE = "origin";
const BRANCH = "main";
const REPO_URL = "https://github.com/BrightierOS/BrightierOS-public.git";

// ─── Helpers ────────────────────────────────────────────────────────

function getInstalledVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(PKG_PATH, "utf8"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function ensureHistoryFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
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

    // Comparação semântica simples
    const hasUpdate = compareVersions(available, installed) > 0;

    res.json({
      success: true,
      installedVersion: installed,
      availableVersion: available || installed,
      hasUpdate,
      changelog: hasUpdate ? changelog : "",
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

// POST /api/update/apply — Aplica atualização via git pull
router.post("/apply", async (req, res) => {
  try {
    const installed = getInstalledVersion();
    const git = simpleGit({ baseDir: path.join(__dirname, "..") });

    // Puxa as mudanças do repositório
    const pullResult = await git.pull(REMOTE, BRANCH);

    // Pega a nova versão depois do pull
    const newPkg = JSON.parse(fs.readFileSync(PKG_PATH, "utf8"));
    const newVersion = newPkg.version || installed;

    // Registra no histórico
    addHistoryEntry({
      type: "update",
      from: installed,
      to: newVersion,
      summary: pullResult.summary || {},
      message: pullResult?.summary?.changes
        ? `${pullResult.summary.changes} arquivos alterados`
        : "Atualização concluída",
    });

    res.json({
      success: true,
      installedVersion: installed,
      newVersion,
      message: pullResult?.summary?.changes
        ? `Atualizado! ${pullResult.summary.changes} arquivos alterados.`
        : "Já está na versão mais recente.",
      details: pullResult,
    });
  } catch (err) {
    console.error("Erro ao atualizar:", err.message);
    res.status(500).json({
      success: false,
      error: "Falha ao atualizar: " + err.message,
    });
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
router.post("/rollback", async (req, res) => {
  try {
    const { targetVersion } = req.body || {};
    if (!targetVersion) {
      return res.status(400).json({ success: false, error: 'Informe a versão alvo.' });
    }

    const installed = getInstalledVersion();
    if (targetVersion === installed) {
      return res.status(400).json({ success: false, error: 'Já está nesta versão.' });
    }

    const git = simpleGit({ baseDir: path.join(__dirname, "..") });
    const tag = `v${String(targetVersion).replace(/^v/, '')}`;

    // Confirma que a tag existe
    const tags = await git.tags();
    if (!tags.all.includes(tag)) {
      return res.status(404).json({ success: false, error: `Tag ${tag} não encontrada.` });
    }

    await git.checkout(tag);

    const newPkg = JSON.parse(fs.readFileSync(PKG_PATH, "utf8"));
    const newVersion = newPkg.version || targetVersion;

    addHistoryEntry({
      type: "rollback",
      from: installed,
      to: newVersion,
      target: targetVersion,
      message: `Rollback para ${tag}`,
    });

    res.json({
      success: true,
      installedVersion: installed,
      rolledBackTo: newVersion,
      message: `Revertido para ${tag}. Reinicie para aplicar.`,
    });
  } catch (err) {
    console.error("Erro ao reverter:", err.message);
    res.status(500).json({ success: false, error: "Falha ao reverter: " + err.message });
  }
});

// ─── Utilitário de comparação de versões ────────────────────────────

function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

module.exports = router;
