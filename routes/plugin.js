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
  if (!fs.existsSync(pluginsRoot)) {
    console.warn('[PluginLoader] Plugins directory not found:', pluginsRoot);
    return;
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
      const required = ['id', 'name', 'version', 'author', 'description', 'entry', 'frontend'];
      const missing = required.filter((f) => !(f in manifest));
      if (missing.length) {
        console.error(`[PluginLoader] Plugin "${pluginId}" manifest missing fields: ${missing.join(', ')}. Skipping.`);
        return;
      }

      // Load backend
      const backendPath = path.join(pluginPath, manifest.entry);
      if (!fs.existsSync(backendPath)) {
        console.error(`[PluginLoader] Backend entry "${manifest.entry}" not found for plugin "${pluginId}". Skipping.`);
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

      // Serve frontend if present
      const frontendPath = path.join(pluginPath, manifest.frontend);
      if (fs.existsSync(frontendPath) && fs.lstatSync(frontendPath).isDirectory()) {
        app.use(`/plugins/${manifest.id}`, express.static(frontendPath));
        console.log(`[PluginLoader] Static assets served for plugin "${manifest.name}" at /plugins/${manifest.id}`);
      }
    } catch (err) {
      console.error(`[PluginLoader] Failed to load plugin "${pluginId}":`, err);
    }
  });
};
