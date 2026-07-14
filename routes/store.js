// routes/store.js
// Public Community App Store registry (no private repo support)
const express = require('express');
const fs = require('fs');
const path = require('path');
const simpleGit = require('simple-git');

module.exports = (app) => {
  const storesFile = path.join(__dirname, '..', 'data', 'stores.json');
  const cachesRoot = path.join(__dirname, '..', 'data', 'community-stores');

  // Ensure persistence files exist
  if (!fs.existsSync(storesFile)) {
    fs.writeFileSync(storesFile, JSON.stringify([], null, 2));
  }
  if (!fs.existsSync(cachesRoot)) {
    fs.mkdirSync(cachesRoot, { recursive: true });
  }

  const getCachePath = (storeId) => path.join(cachesRoot, storeId);

  // ---- Register a new store -------------------------------------------------
  app.post('/api/store', express.json(), (req, res) => {
    const { id, name, url } = req.body;
    if (!id || !name || !url) {
      return res.status(400).json({ error: 'Missing id, name or url.' });
    }
    if (!url.startsWith('https://')) {
      return res.status(400).json({ error: 'Only public HTTPS URLs are allowed.' });
    }
    const stores = JSON.parse(fs.readFileSync(storesFile));
    if (stores.find((s) => s.id === id)) {
      return res.status(409).json({ error: 'Store id already exists.' });
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
  app.get('/api/store', (req, res) => {
    const stores = JSON.parse(fs.readFileSync(storesFile));
    res.json(stores);
  });

  // ---- Get catalog (apps.json) for a store ---------------------------------
  app.get('/api/store/:id/catalog', async (req, res) => {
    const { id } = req.params;
    const stores = JSON.parse(fs.readFileSync(storesFile));
    const store = stores.find((s) => s.id === id);
    if (!store) return res.status(404).json({ error: 'Store not found.' });
    const cachePath = getCachePath(id);
    // Clone on‑demand if not cached yet
    if (!fs.existsSync(cachePath)) {
      try {
        await simpleGit().clone(store.url, cachePath);
      } catch (e) {
        console.error('[Store] Clone error', e);
        return res.status(500).json({ error: 'Failed to clone store.' });
      }
    }
    const appsPath = path.join(cachePath, 'apps.json');
    if (!fs.existsSync(appsPath)) {
      return res.status(404).json({ error: 'apps.json not found in store.' });
    }
    const apps = JSON.parse(fs.readFileSync(appsPath));
    res.json(apps);
  });

  // ---- Install a plugin from a store ---------------------------------------
  app.post('/api/store/:id/install/:pluginId', async (req, res) => {
    const { id, pluginId } = req.params;
    const stores = JSON.parse(fs.readFileSync(storesFile));
    const store = stores.find((s) => s.id === id);
    if (!store) return res.status(404).json({ error: 'Store not found.' });
    const cachePath = getCachePath(id);
    if (!fs.existsSync(cachePath)) {
      try {
        await simpleGit().clone(store.url, cachePath);
      } catch (e) {
        console.error('[Store] Clone error', e);
        return res.status(500).json({ error: 'Failed to clone store.' });
      }
    }
    const pluginSrc = path.join(cachePath, 'apps', pluginId);
    if (!fs.existsSync(pluginSrc)) {
      return res.status(404).json({ error: 'Plugin not found in store.' });
    }
    const manifestPath = path.join(pluginSrc, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      return res.status(400).json({ error: 'manifest.json missing in plugin.' });
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath));
    // Very small validation – required fields
    if (!manifest.id || !manifest.backend) {
      return res.status(400).json({ error: 'Invalid manifest (missing id or backend).' });
    }
    const dest = path.join(__dirname, '..', 'data', 'plugins', manifest.id);
    if (fs.existsSync(dest)) {
      return res.status(409).json({ error: 'Plugin already installed.' });
    }
    try {
      // Node >=16 provides recursive copy
      fs.cpSync(pluginSrc, dest, { recursive: true });
    } catch (e) {
      console.error('[Store] Copy error', e);
      return res.status(500).json({ error: 'Failed to copy plugin files.' });
    }
    console.log(`[Store] Plugin ${manifest.id} installed from store ${id}`);
    return res.json({ message: 'Plugin installed successfully.' });
  });
};
