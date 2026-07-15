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

// ─── Comunicação com o launcher (bOS.bat / bOS.sh) ──────────────────
// O launcher inicia server.js como processo filho. Quando uma
// atualização (apply) ou rollback é aplicada, gravamos um flag de
// diagnóstico e encerramos o processo com RESTART_EXIT_CODE. O launcher
// detecta esse código, roda `npm install` (caso as deps tenham mudado)
// e reinicia o servidor. Esse é o "canal" de conversa backend↔launcher.
function requestRestart(res, opts = {}) {
  const payload = {
    at: new Date().toISOString(),
    reason: opts.reason || "update",
    from: opts.from,
    to: opts.to,
    message: opts.message,
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
    message: opts.message || "Reiniciando para aplicar a atualização...",
    details: opts.details,
  });

  // Garante que a resposta foi totalmente enviada antes de encerrar.
  res.on("finish", () => process.exit(RESTART_EXIT_CODE));
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

    const changed =
      newVersion !== installed ||
      (pullResult && pullResult.summary && pullResult.summary.changes > 0);

    // Se houve mudança real, pede ao launcher para reiniciar o servidor.
    if (changed) {
      return requestRestart(res, {
        reason: "update",
        from: installed,
        to: newVersion,
        message:
          pullResult && pullResult.summary && pullResult.summary.changes
            ? `Atualizado! ${pullResult.summary.changes} arquivos alterados. Reiniciando...`
            : "Atualização concluída. Reiniciando...",
        details: pullResult,
      });
    }

    res.json({
      success: true,
      restarted: false,
      installedVersion: installed,
      newVersion,
      message: "Já está na versão mais recente.",
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

    // Pede ao launcher para reiniciar o servidor para aplicar o checkout.
    return requestRestart(res, {
      reason: "rollback",
      from: installed,
      to: newVersion,
      message: `Revertido para ${tag}. Reiniciando para aplicar...`,
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
