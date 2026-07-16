const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const users = require("../lib/users");

// Autenticação: qualquer usuário logado pode ler; só quem tem 'files:all'
// (admin/editor) pode modificar. Visualizador (viewer) é somente-leitura.
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

function resolvePath(relativePath = "") {

    const target = path.normalize(
        path.join(ROOT, relativePath)
    );

    if (!target.startsWith(ROOT)) {
        throw new Error("Access denied.");
    }

    return target;

}

router.get("/list", authRead, (req, res) => {

    try {

        const folder = resolvePath(req.query.path || "");

        const files = fs.readdirSync(folder, {
            withFileTypes: true
        });

        const result = files.map(file => ({

            name: file.name,

            type: file.isDirectory()
                ? "folder"
                : "file",

            size: file.isDirectory()
                ? null
                : fs.statSync(path.join(folder, file.name)).size

        }));

        res.json(result);

    }

    catch {

        res.status(400).json({
            error: "Unable to read folder."
        });

    }

});

router.get("/read", authRead, (req, res) => {

    try {

        const file = resolvePath(req.query.path);

        res.sendFile(file);

    }

    catch {

        res.status(404).json({
            error: "File not found."
        });

    }

});

router.post("/create-folder", authWrite, express.json(), (req, res) => {

    try {

        const folder = resolvePath(req.body.path);

        fs.mkdirSync(folder, {
            recursive: true
        });

        res.json({
            success: true
        });

    }

    catch {

        res.status(400).json({
            success: false
        });

    }

});

router.post("/create-file", authWrite, express.json(), (req, res) => {

    try {

        const file = resolvePath(req.body.path);

        fs.writeFileSync(file, "");

        res.json({
            success: true
        });

    }

    catch {

        res.status(400).json({
            success: false
        });

    }

});

router.post("/rename", authWrite, express.json(), (req, res) => {

    try {

        const oldFile = resolvePath(req.body.oldPath);

        const newFile = resolvePath(req.body.newPath);

        fs.renameSync(oldFile, newFile);

        res.json({
            success: true
        });

    }

    catch {

        res.status(400).json({
            success: false
        });

    }

});

router.post("/delete", authWrite, express.json(), (req, res) => {

    try {

        const target = resolvePath(req.body.path);

        fs.rmSync(target, {
            recursive: true,
            force: true
        });

        res.json({
            success: true
        });

    }

    catch {

        res.status(400).json({
            success: false
        });

    }

});

router.post("/upload", authWrite, upload.single("file"), (req, res) => {

    res.json({
        success: true
    });

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

        res.json({ success: true });

    }

    catch {

        res.status(400).json({ success: false });

    }

});

router.post("/save", authWrite, express.json(), (req, res) => {

    try {

        const filePath = resolvePath(req.body.path);

        if (!isTextFile(filePath)) {
            return res.status(400).json({ success: false, error: "Only text files can be edited." });
        }

        fs.writeFileSync(filePath, req.body.content || "");

        res.json({ success: true });

    }

    catch {

        res.status(400).json({ success: false });

    }

});

router.get("/download", authRead, (req, res) => {

    try {

        const file = resolvePath(req.query.path);

        res.download(file);

    }

    catch {

        res.status(404).json({
            error: "File not found."
        });

    }

});

module.exports = router;