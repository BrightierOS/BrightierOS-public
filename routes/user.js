const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();
const DATA_DIR = path.join(__dirname, "..", "data");
const USER_FILE = path.join(DATA_DIR, "user.json");

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(USER_FILE)) {
    fs.writeFileSync(USER_FILE, "{}", "utf8");
  }
}

function readUser() {
  ensureStore();
  const content = fs.readFileSync(USER_FILE, "utf8").trim();
  if (!content) return null;

  const parsed = JSON.parse(content);
  return parsed && parsed.username ? parsed : null;
}

function writeUser(user) {
  ensureStore();
  fs.writeFileSync(USER_FILE, JSON.stringify(user, null, 2), "utf8");
}

function sanitizeUser(user) {
  const { password, ...rest } = user;
  return rest;
}

router.get("/setup", (req, res) => {
  try {
    const user = readUser();
    if (!user) {
      return res.json({ success: false, user: null });
    }

    res.json({ success: true, user: sanitizeUser(user) });
  } catch {
    res.status(500).json({ success: false, error: "Unable to load setup user." });
  }
});

router.get("/list", (req, res) => {
  try {
    const user = readUser();
    res.json(user ? [sanitizeUser(user)] : []);
  } catch {
    res.status(500).json({ success: false, error: "Unable to read users." });
  }
});

router.get("/:id", (req, res) => {
  try {
    const user = readUser();

    if (!user || user.id !== req.params.id) {
      return res.status(404).json({ success: false, error: "User not found." });
    }

    res.json({ success: true, user: sanitizeUser(user) });
  } catch {
    res.status(500).json({ success: false, error: "Unable to read user." });
  }
});

router.post("/create", express.json(), (req, res) => {
  try {
    const { username, password, role = "user" } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ success: false, error: "Username and password are required." });
    }

    if (readUser()) {
      return res.status(409).json({ success: false, error: "User already exists." });
    }

    const newUser = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      username,
      password,
      role,
      createdAt: new Date().toISOString(),
    };

    writeUser(newUser);
    res.json({ success: true, user: sanitizeUser(newUser) });
  } catch {
    res.status(500).json({ success: false, error: "Unable to create user." });
  }
});

router.post("/login", express.json(), (req, res) => {
  try {
    const { username, password } = req.body || {};
    const user = readUser();

    if (!username || !password) {
      return res.status(400).json({ success: false, error: "Username and password are required." });
    }

    if (!user || user.username.toLowerCase() !== String(username).toLowerCase() || user.password !== String(password)) {
      return res.status(401).json({ success: false, error: "Invalid credentials." });
    }

    res.json({ success: true, user: sanitizeUser(user) });
  } catch {
    res.status(500).json({ success: false, error: "Unable to login." });
  }
});

router.put("/:id", express.json(), (req, res) => {
  try {
    const current = readUser();

    if (!current || current.id !== req.params.id) {
      return res.status(404).json({ success: false, error: "User not found." });
    }

    const updated = { ...current, ...req.body, id: current.id };
    writeUser(updated);

    res.json({ success: true, user: sanitizeUser(updated) });
  } catch {
    res.status(500).json({ success: false, error: "Unable to update user." });
  }
});

router.delete("/:id", (req, res) => {
  try {
    const current = readUser();

    if (!current || current.id !== req.params.id) {
      return res.status(404).json({ success: false, error: "User not found." });
    }

    writeUser({});
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, error: "Unable to delete user." });
  }
});

module.exports = router;
