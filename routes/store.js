// routes/store.js
// Public Community App Store registry (no private repo support)
const express = require('express');
const fs = require('fs');
const path = require('path');
const simpleGit = require('simple-git');
const users = require('../lib/users');

// v0.8.5.7 — gerenciamento de stores exige permissão 'store:all'.
const authStore = users.requirePermission('store:all');
// Identificadores devem ser simples (sem path traversal).
function isValidId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9._-]+$/.test(id) && id !== '.' && id !== '..';
}

// Leitura segura de JSON: nunca lança — retorna [] / null em caso de arquivo
// ausente, corrompido ou vazio. Corrige travamentos por JSON.parse sem try/catch.
function readJsonArray(file) {
  try {
    if (!fs.existsSync(file)) return [];
    const c = fs.readFileSync(file, 'utf8').trim();
    return c ? JSON.parse(c) : [];
  } catch {
    return [];
  }
}

function readJson(file) {
  try {
    if (!fs.existsSync(file)) return null;
    const c = fs.readFileSync(file, 'utf8').trim();
    return c ? JSON.parse(c) : null;
  } catch {
    return null;
  }
}


const DATA_DIR = process.env.BOS_DATA_DIR
  ? path.resolve(process.env.BOS_DATA_DIR)
  : path.join(__dirname, '..', 'data');

module.exports = (app) => {
  const storesFile = path.join(DATA_DIR, 'stores.json');
  const cachesRoot = path.join(DATA_DIR, 'community-stores');

  // Ensure persistence files exist
  if (!fs.existsSync(storesFile)) {
    fs.writeFileSync(storesFile, JSON.stringify([], null, 2));
  }
  if (!fs.existsSync(cachesRoot)) {
    fs.mkdirSync(cachesRoot, { recursive: true });
  }

  const getCachePath = (storeId) => {
    if (!isValidId(storeId)) throw new Error('Invalid store id.');
    return path.join(cachesRoot, storeId);
  };

  // ---- Register a new store -------------------------------------------------
  app.post('/api/store', authStore, express.json(), (req, res) => {
    const { id, name, url } = req.body;
    if (!id || !name || !url) {
      return res.status(400).json({ success: false, error: 'Missing id, name or url.' });
    }
    if (!isValidId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid store id.' });
    }
    if (!url.startsWith('https://')) {
      return res.status(400).json({ success: false, error: 'Only public HTTPS URLs are allowed.' });
    }
    const stores = readJsonArray(storesFile);
    if (stores.find((s) => s.id === id)) {
      return res.status(409).json({ success: false, error: 'Store id already exists.' });
    }
    stores.push({ id, name, url });
    fs.writeFileSync(storesFile, JSON.stringify(stores, null, 2));
    // Clone repository asynchronously (fire‑and‑forget)
    const dest = getCachePath(id);
    simpleGit().clone(url, dest).catch((err) => {
      console.error('[Store] Failed to clone ', url, err);
    });
    return res.json({ message: 'Store registered.' });
  });

  // ---- List all registered stores ------------------------------------------
  app.get('/api/store', authStore, (req, res) => {
    const stores = readJsonArray(storesFile);
    res.json(stores);
  });

  // ---- Get catalog (apps.json) for a store ---------------------------------
  app.get('/api/store/:id/catalog', authStore, async (req, res) => {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid store id.' });
    }
    const stores = readJsonArray(storesFile);
    const store = stores.find((s) => s.id === id);
    if (!store) return res.status(404).json({ success: false, error: 'Store not found.' });
    const cachePath = getCachePath(id);
    // Clone on‑demand if not cached yet
    if (!fs.existsSync(cachePath)) {
      try {
        await simpleGit().clone(store.url, cachePath);
      } catch (e) {
        console.error('[Store] Clone error', e);
        return res.status(500).json({ success: false, error: 'Failed to clone store.' });
      }
    }
    const appsPath = path.join(cachePath, 'apps.json');
    if (!fs.existsSync(appsPath)) {
      return res.status(404).json({ success: false, error: 'apps.json not found in store.' });
    }
    const apps = readJson(appsPath);
    if (!apps) return res.status(404).json({ success: false, error: 'apps.json not found or invalid in store.' });
    res.json(apps);
  });

  // ---- Install a plugin from a store ---------------------------------------
  app.post('/api/store/:id/install/:pluginId', authStore, async (req, res) => {
    const { id, pluginId } = req.params;
    if (!isValidId(id) || !isValidId(pluginId)) {
      return res.status(400).json({ success: false, error: 'Invalid store or plugin id.' });
    }
    const stores = readJsonArray(storesFile);
    const store = stores.find((s) => s.id === id);
    if (!store) return res.status(404).json({ success: false, error: 'Store not found.' });
    const cachePath = getCachePath(id);
    if (!fs.existsSync(cachePath)) {
      try {
        await simpleGit().clone(store.url, cachePath);
      } catch (e) {
        console.error('[Store] Clone error', e);
        return res.status(500).json({ success: false, error: 'Failed to clone store.' });
      }
    }
    const appsPath = path.join(cachePath, 'apps.json');
    if (!fs.existsSync(appsPath)) {
      return res.status(404).json({ success: false, error: 'apps.json not found in store.' });
    }
    const apps = readJson(appsPath);
    if (!apps) return res.status(404).json({ success: false, error: 'apps.json not found or invalid in store.' });
    const appEntry = (Array.isArray(apps) ? apps : []).find(a => a.id === pluginId);
    if (!appEntry || !appEntry.repository) {
      return res.status(404).json({ success: false, error: 'Plugin repository not found in store catalog.' });
    }

    const dest = path.join(DATA_DIR, 'plugins', pluginId);
    if (fs.existsSync(dest)) {
      return res.status(409).json({ success: false, error: 'Plugin already installed.' });
    }

    try {
      // Clone the specific plugin from its repository
      await simpleGit().clone(appEntry.repository, dest);
    } catch (e) {
      console.error('[Store] Plugin clone error', e);
      return res.status(500).json({ success: false, error: 'Failed to clone plugin repository.' });
    }

    const manifestPath = path.join(dest, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      fs.rmSync(dest, { recursive: true, force: true });
      return res.status(400).json({ error: 'manifest.json missing in plugin repository.' });
    }

    const manifest = readJson(manifestPath);
    if (!manifest) {
      fs.rmSync(dest, { recursive: true, force: true });
      return res.status(400).json({ success: false, error: 'manifest.json missing or invalid in plugin repository.' });
    }
    if (!manifest.id || (!manifest.backend && !manifest.entry)) {
      fs.rmSync(dest, { recursive: true, force: true });
      return res.status(400).json({ error: 'Invalid manifest (missing id or backend).' });
    }

    console.log(`[Store] Plugin ${manifest.id} installed from store ${id}`);
    return res.json({ message: 'Plugin installed successfully.' });
  });
};

