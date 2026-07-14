// routes/plugin.js
const fs = require('fs');
const path = require('path');
const express = require('express');

/**
 * Load all user‑generated plugins located in `data/plugins`.
 *
 * Each plugin must contain a `manifest.json` describing the entry point
 * (`backend.js`) and an optional `frontend` folder for static assets.
 *
 * The loader:
 *   • Scans the plugins directory.
 *   • Validates required manifest fields.
 *   • Requires the backend module and invokes it, passing the main Express
 *     `app` instance and an extensible `api` object.
 *   • Serves the plugin's frontend assets under `/plugins/<plugin-id>`.
 *   • Logs clear messages and isolates errors so one failing plugin does not
 *     affect the others.
 */
module.exports = (app) => {
  const pluginsRoot = path.join(__dirname, '..', 'data', 'plugins');
  // Always register the plugins API. Create the directory if it does not
  // exist yet so listing/installing/uninstalling works out of the box.
  if (!fs.existsSync(pluginsRoot)) {
    fs.mkdirSync(pluginsRoot, { recursive: true });
  }

  const pluginDirs = fs.readdirSync(pluginsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  pluginDirs.forEach((pluginId) => {
    const pluginPath = path.join(pluginsRoot, pluginId);
    const manifestPath = path.join(pluginPath, 'manifest.json');
    try {
      if (!fs.existsSync(manifestPath)) {
        console.error(`[PluginLoader] Manifest missing for plugin "${pluginId}". Skipping.`);
        return;
      }
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

      // Basic validation of required fields
      const required = ['id', 'name', 'version'];
      const missing = required.filter((f) => !(f in manifest));
      if (missing.length) {
        console.error(`[PluginLoader] Plugin "${pluginId}" manifest missing fields: ${missing.join(', ')}. Skipping.`);
        return;
      }

      // Load backend
      const entryPoint = manifest.entry || manifest.backend;
      if (entryPoint) {
        const backendPath = path.join(pluginPath, entryPoint);
        if (!fs.existsSync(backendPath)) {
          console.error(`[PluginLoader] Backend entry "${entryPoint}" not found for plugin "${pluginId}". Skipping.`);
          return;
        }

        const pluginApi = {}; // future‑proof placeholder for shared API
        const backend = require(backendPath);
        if (typeof backend === 'function') {
          backend(app, pluginApi);
          console.log(`[PluginLoader] Routes loaded for plugin "${manifest.name}" (id: ${manifest.id}).`);
        } else {
          console.warn(`[PluginLoader] Backend of plugin "${pluginId}" does not export a function. Routes not registered.`);
        }
      }

      // Serve frontend if present
      if (manifest.frontend) {
        const frontendPath = path.join(pluginPath, manifest.frontend);
        if (fs.existsSync(frontendPath) && fs.lstatSync(frontendPath).isDirectory()) {
          app.use(`/plugins/${manifest.id}`, express.static(frontendPath));
          console.log(`[PluginLoader] Static assets served for plugin "${manifest.name}" at /plugins/${manifest.id}`);
        }
      }
    } catch (err) {
      console.error(`[PluginLoader] Failed to load plugin "${pluginId}":`, err);
    }
  });

  // API to list installed plugins
  app.get('/api/plugins', (req, res) => {
    const installed = [];
    if (fs.existsSync(pluginsRoot)) {
      const dirs = fs.readdirSync(pluginsRoot, { withFileTypes: true }).filter(d => d.isDirectory());
      dirs.forEach(d => {
        const manifestPath = path.join(pluginsRoot, d.name, 'manifest.json');
        if (fs.existsSync(manifestPath)) {
          try {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
            installed.push(manifest);
          } catch (e) {}
        }
      });
    }
    res.json(installed);
  });

  // DELETE endpoint to uninstall a plugin
  app.delete('/api/plugins/:id', (req, res) => {
    try {
      const pluginId = req.params.id;
      const pluginPath = path.join(pluginsRoot, pluginId);
      if (!fs.existsSync(pluginPath)) {
        return res.status(404).json({ success: false, error: 'Plugin not found.' });
      }
      fs.rmSync(pluginPath, { recursive: true, force: true });
      return res.json({ success: true, message: 'Plugin removed.' });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ success: false, error: 'Failed to delete plugin.' });
    }
  });
};
