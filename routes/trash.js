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

const authRead = users.requirePermission("files:read");
const authWrite = users.requirePermission("files:all");

if (!fs.existsSync(TRASH)) {
  fs.mkdirSync(TRASH, { recursive: true });
}

function successResponse(res, data) {
    if (data !== undefined) {
        return res.json({ success: true, data });
    }
    return res.json({ success: true });
}

function errorResponse(res, status, message) {
    return res.status(status).json({ success: false, error: message });
}
function isValidSourcePath(relativePath) {
    if (!relativePath || typeof relativePath !== "string") return false;
    const resolved = path.normalize(path.join(ROOT, relativePath));
    return resolved.startsWith(ROOT + path.sep);
}

function isValidTrashName(name) {
    if (!name || typeof name !== "string") return false;
    if (name.includes("..") || name.includes("/") || name.includes("\\")) return false;
    return path.basename(name) === name;
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

function recoverOriginalName(safeName) {
  const idx = String(safeName).lastIndexOf("__");
  if (idx < 0) return safeName;
  const name = safeName.slice(0, idx);
  const rest = safeName.slice(idx + 2);
  // O separador só é válido se o restante começar com dígitos (timestamp).
  if (!/^\d+/.test(rest)) return safeName;
  const ext = rest.replace(/^\d+/, "");
  return name + ext;
}

router.post("/trash", authWrite, express.json(), (req, res) => {
  try {
    const targetPath = req.body.path;
    if (!targetPath) return errorResponse(res, 400, "Path is required.");
    if (!isValidSourcePath(targetPath)) return errorResponse(res, 400, "Invalid path.");
    const info = moveToTrash(targetPath);
    if (!info) return errorResponse(res, 404, "Item not found.");
    return successResponse(res, info);
  } catch (err) {
    console.error("[Trash] move error:", err);
    return errorResponse(res, 500, "Unable to process the request.");
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
    return successResponse(res, items);
  } catch (err) {
    console.error("[Trash] list error:", err);
    return errorResponse(res, 500, "Unable to process the request.");
  }
});
router.post("/trash/restore", authWrite, express.json(), (req, res) => {
  try {
    const trashPath = req.body.trashPath;
    if (!trashPath) return errorResponse(res, 400, "trashPath is required.");
    if (!isValidTrashName(trashPath)) return errorResponse(res, 400, "Invalid trashPath.");
    const item = fs.readdirSync(TRASH, { withFileTypes: true }).find(
      (e) => e.name === trashPath
    );
    if (!item) return errorResponse(res, 404, "Item not found in trash.");
    const source = path.join(TRASH, trashPath);
    const baseName = recoverOriginalName(item.name);
    const dest = path.join(ROOT, baseName);
    fs.renameSync(source, dest);
    return successResponse(res);
  } catch (err) {
    console.error("[Trash] restore error:", err);
    return errorResponse(res, 500, "Unable to process the request.");
  }
});

router.delete("/trash/:trashPath", authWrite, (req, res) => {
  try {
    const trashPath = req.params.trashPath;
    if (!isValidTrashName(trashPath)) return errorResponse(res, 400, "Invalid trashPath.");
    const item = fs.readdirSync(TRASH, { withFileTypes: true }).find(
      (e) => e.name === trashPath
    );
    if (!item) return errorResponse(res, 404, "Item not found.");
    const target = path.join(TRASH, trashPath);
    fs.rmSync(target, { recursive: true, force: true });
    return successResponse(res);
  } catch (err) {
    console.error("[Trash] delete error:", err);
    return errorResponse(res, 500, "Unable to process the request.");
  }
});

router.delete("/trash", authWrite, (req, res) => {
  try {
    const items = fs.readdirSync(TRASH, { withFileTypes: true });
    for (const item of items) {
      fs.rmSync(path.join(TRASH, item.name), { recursive: true, force: true });
    }
    return successResponse(res);
  } catch (err) {
    console.error("[Trash] empty error:", err);
    return errorResponse(res, 500, "Unable to process the request.");
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
    return successResponse(res, {
      count,
      size: totalBytes,
      sizeFormatted: formatSize(totalBytes),
    });
  } catch (err) {
    console.error("[Trash] stats error:", err);
    return errorResponse(res, 500, "Unable to process the request.");
  }
});

router.recoverOriginalName = recoverOriginalName;
module.exports = router;
