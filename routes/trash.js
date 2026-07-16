const express = require("express");
const fs = require("fs");
const path = require("path");
const users = require("../lib/users");

const DATA_DIR = process.env.BOS_DATA_DIR
    ? path.resolve(process.env.BOS_DATA_DIR)
    : path.join(__dirname, "..", "data");

const router = express.Router();
const ROOT = path.join(DATA_DIR, "home");
const TRASH = path.join(DATA_DIR, "trash");

// Autenticação da lixeira (v0.8.4): alinha com routes/files.js. Antes as rotas
// de lixeira não exigiam login — um furo do sistema de arquivos (qualquer um na
// rede podia listar/restaurar/excluir a lixeira local sem autenticar). Agora:
// leitura (listar/stats) exige files:read; escrita (mover p/ lixeira, restaurar,
// excluir, esvaziar) exige files:all. O proxy de nós remotos envia o Bearer do
// nó remoto, então dois BrightierOS continuam interoperando.
const authRead = users.requirePermission("files:read");
const authWrite = users.requirePermission("files:all");

if (!fs.existsSync(TRASH)) {
  fs.mkdirSync(TRASH, { recursive: true });
}

function moveToTrash(relativePath) {
  const source = path.join(ROOT, relativePath);
  if (!fs.existsSync(source)) return null;

  const baseName = path.basename(relativePath);
  const ext = path.extname(baseName);
  const name = path.basename(baseName, ext);
  const timestamp = Date.now();
  const safeName = `${name}__${timestamp}${ext}`;
  const dest = path.join(TRASH, safeName);

  fs.renameSync(source, dest);
  return {
    originalPath: relativePath,
    trashPath: safeName,
    name: baseName,
    size: getSize(dest),
    type: fs.statSync(dest).isDirectory() ? "folder" : "file",
    deletedAt: new Date().toISOString(),
  };
}

function getSize(target) {
  if (fs.statSync(target).isDirectory()) {
    return fs.readdirSync(target, { recursive: true }).length;
  }
  return fs.statSync(target).size;
}

function formatSize(size) {
  if (!size && size !== 0) return "—";
  if (typeof size === "number" && size > 1024 * 1024)
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (typeof size === "number" && size > 1024)
    return `${(size / 1024).toFixed(1)} KB`;
  return `${size}`;
}

// Recupera o nome original a partir do nome seguro "{name}__{timestamp}{ext}".
// Corrige o bug onde "report__1234567890.txt" era restaurado como "1234567890.txt".
function recoverOriginalName(safeName) {
  const idx = String(safeName).lastIndexOf("__");
  if (idx < 0) return safeName;
  const name = safeName.slice(0, idx);
  const rest = safeName.slice(idx + 2); // timestamp + extensão
  const ext = rest.replace(/^\d+/, "");
  return name + ext;
}

router.post("/trash", authWrite, express.json(), (req, res) => {
  try {
    const targetPath = req.body.path;
    if (!targetPath) return res.status(400).json({ success: false });
    const info = moveToTrash(targetPath);
    if (!info) return res.status(404).json({ success: false, error: "Item not found." });
    res.json({ success: true, info });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get("/trash", authRead, (req, res) => {
  try {
    const entries = fs.readdirSync(TRASH, { withFileTypes: true });
    const items = entries
      .filter((entry) => entry.name.endsWith(".json") || entry.name.includes("__"))
      .map((entry) => {
        const p = path.join(TRASH, entry.name);
        const stat = fs.statSync(p);
        const size = stat.isDirectory()
          ? fs.readdirSync(p, { recursive: true }).length
          : stat.size;
        return {
          trashPath: entry.name,
          name: recoverOriginalName(entry.name),
          type: stat.isDirectory() ? "folder" : "file",
          size,
          sizeFormatted: formatSize(size),
          deletedAt: stat.birthtime ? stat.birthtime.toISOString() : new Date().toISOString(),
        };
      });
    res.json(items);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post("/trash/restore", authWrite, express.json(), (req, res) => {
  try {
    const trashPath = req.body.trashPath;
    const item = fs.readdirSync(TRASH, { withFileTypes: true }).find(
      (e) => e.name === trashPath
    );
    if (!item) return res.status(404).json({ success: false, error: "Item not found in trash." });
    const source = path.join(TRASH, trashPath);
    const baseName = recoverOriginalName(item.name);
    const dest = path.join(ROOT, baseName);
    fs.renameSync(source, dest);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.delete("/trash/:trashPath", authWrite, (req, res) => {
  try {
    const trashPath = req.params.trashPath;
    const item = fs.readdirSync(TRASH, { withFileTypes: true }).find(
      (e) => e.name === trashPath
    );
    if (!item) return res.status(404).json({ success: false, error: "Item not found." });
    const target = path.join(TRASH, trashPath);
    fs.rmSync(target, { recursive: true, force: true });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.delete("/trash", authWrite, (req, res) => {
  try {
    const items = fs.readdirSync(TRASH, { withFileTypes: true });
    for (const item of items) {
      fs.rmSync(path.join(TRASH, item.name), { recursive: true, force: true });
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get("/trash/stats", authRead, (req, res) => {
  try {
    let count = 0;
    let totalBytes = 0;
    const walk = (dir) => {
      for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, item.name);
        if (item.isDirectory()) walk(p);
        else {
          count++;
          try {
            totalBytes += fs.statSync(p).size;
          } catch {}
        }
      }
    };
    walk(TRASH);
    res.json({
      count,
      size: totalBytes,
      sizeFormatted: formatSize(totalBytes),
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.recoverOriginalName = recoverOriginalName;
module.exports = router;
