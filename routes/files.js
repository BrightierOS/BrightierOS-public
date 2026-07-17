const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const users = require("../lib/users");

const authRead = users.requirePermission('files:read');
const authWrite = users.requirePermission("files:all");

function isTextFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return [".txt", ".md", ".json", ".js", ".css", ".html", ".xml", ".csv"].includes(ext);
}

const router = express.Router();

const DATA_DIR = process.env.BOS_DATA_DIR
    ? path.resolve(process.env.BOS_DATA_DIR)
    : path.join(__dirname, "..", "data");

const ROOT = path.join(DATA_DIR, "home");
const TRASH = path.join(DATA_DIR, "trash");

if (!fs.existsSync(ROOT)) {
    fs.mkdirSync(ROOT, { recursive: true });
}

const fileStorage = multer.diskStorage({
    destination(req, file, cb) {
        const folder = req.body.path || "";
        const destination = resolvePath(folder);
        fs.mkdirSync(destination, { recursive: true });
        cb(null, destination);
    },
    filename(req, file, cb) {
        cb(null, file.originalname);
    }
});

const upload = multer({
    storage: fileStorage
});

function successResponse(res, data) {
    if (data !== undefined) {
        return res.json({ success: true, data });
    }
    return res.json({ success: true });
}

function errorResponse(res, status, message) {
    return res.status(status).json({ success: false, error: message });
}

function classifyFsError(err) {
    if (err && err.message === "Access denied.") {
        return { status: 400, message: "Invalid path." };
    }
    if (err && err.code === "ENOENT") {
        return { status: 404, message: "File or folder not found." };
    }
    return { status: 400, message: "Unable to process the request." };
}

function resolvePath(relativePath = "") {
    const target = path.normalize(
        path.join(ROOT, relativePath)
    );

    if (target !== ROOT && !target.startsWith(ROOT + path.sep)) {
        throw new Error("Access denied.");
    }

    return target;
}

router.get("/list", authRead, (req, res) => {
    try {
        const folder = resolvePath(req.query.path || "");
        const files = fs.readdirSync(folder, { withFileTypes: true });
        const result = files.map(file => ({
            name: file.name,
            type: file.isDirectory() ? "folder" : "file",
            size: file.isDirectory() ? null : fs.statSync(path.join(folder, file.name)).size
        }));
        return successResponse(res, result);
    } catch (err) {
        const { status, message } = classifyFsError(err);
        return errorResponse(res, status, message);
    }
});

router.get("/read", authRead, (req, res) => {
    try {
        const file = resolvePath(req.query.path);
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
            return errorResponse(res, 404, "File or folder not found.");
        }
        return res.sendFile(file);
    } catch (err) {
        const { status, message } = classifyFsError(err);
        return errorResponse(res, status, message);
    }
});

router.post("/create-folder", authWrite, express.json(), (req, res) => {
    try {
        const folder = resolvePath(req.body.path);
        fs.mkdirSync(folder, { recursive: true });
        return successResponse(res);
    } catch (err) {
        const { status, message } = classifyFsError(err);
        return errorResponse(res, status, message);
    }
});

router.post("/create-file", authWrite, express.json(), (req, res) => {
    try {
        const file = resolvePath(req.body.path);
        fs.writeFileSync(file, "");
        return successResponse(res);
    } catch (err) {
        const { status, message } = classifyFsError(err);
        return errorResponse(res, status, message);
    }
});

router.post("/rename", authWrite, express.json(), (req, res) => {
    try {
        const oldFile = resolvePath(req.body.oldPath);
        const newFile = resolvePath(req.body.newPath);
        fs.renameSync(oldFile, newFile);
        return successResponse(res);
    } catch (err) {
        const { status, message } = classifyFsError(err);
        return errorResponse(res, status, message);
    }
});

router.post("/delete", authWrite, express.json(), (req, res) => {
    try {
        const target = resolvePath(req.body.path);
        fs.rmSync(target, { recursive: true, force: true });
        return successResponse(res);
    } catch (err) {
        const { status, message } = classifyFsError(err);
        return errorResponse(res, status, message);
    }
});

router.post("/upload", authWrite, upload.single("file"), (req, res) => {
    if (!req.file) {
        return errorResponse(res, 400, "No file uploaded.");
    }
    return successResponse(res);
});

router.post("/upload-folder", authWrite, express.json(), (req, res) => {
    try {
        const folder = resolvePath(req.body.path || "");
        fs.mkdirSync(folder, { recursive: true });
        if (Array.isArray(req.body.files)) {
            req.body.files.forEach((entry) => {
                const entryPath = resolvePath(path.join(req.body.path || "", entry.path));
                if (entry.type === "directory") {
                    fs.mkdirSync(entryPath, { recursive: true });
                } else {
                    fs.mkdirSync(path.dirname(entryPath), { recursive: true });
                    fs.writeFileSync(entryPath, entry.content || "");
                }
            });
        }
        return successResponse(res);
    } catch (err) {
        const { status, message } = classifyFsError(err);
        return errorResponse(res, status, message);
    }
});
router.post("/save", authWrite, express.json(), (req, res) => {
    try {
        const filePath = resolvePath(req.body.path);
        if (!isTextFile(filePath)) {
            return errorResponse(res, 400, "Only text files can be edited.");
        }
        fs.writeFileSync(filePath, req.body.content || "");
        return successResponse(res);
    } catch (err) {
        const { status, message } = classifyFsError(err);
        return errorResponse(res, status, message);
    }
});

router.get("/download", authRead, (req, res) => {
    try {
        const file = resolvePath(req.query.path);
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
            return errorResponse(res, 404, "File or folder not found.");
        }
        return res.download(file);
    } catch (err) {
        const { status, message } = classifyFsError(err);
        return errorResponse(res, status, message);
    }
});

module.exports = router;
