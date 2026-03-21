'use strict';
const fs   = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

const DEFAULTS = {
  bar:           { height: 44, opacity: 0.92, accentColor: '#60c8ff', cornerRadius: 0 },
  weather:       { location: 'auto', unit: 'C' },
  pomodoro:      { focusMinutes: 25, breakMinutes: 5 },
  network:       { pingTarget: '8.8.8.8' },
  notifications: { enabled: true, dismissAfterMs: 5000 },
  widgets: {
    workspaces: true, media: true, weather: true, pomodoro: true,
    network: true, system: true, uptime: true, battery: true,
  },
};

function deepMerge(base, override) {
  const out = { ...base };
  for (const key of Object.keys(override || {})) {
    if (
      typeof override[key] === 'object' &&
      override[key] !== null &&
      !Array.isArray(override[key]) &&
      typeof base[key] === 'object'
    ) {
      out[key] = deepMerge(base[key], override[key]);
    } else {
      out[key] = override[key];
    }
  }
  return out;
}

class ConfigLoader {
  constructor() {
    this.config   = this._load();
    this.watchers = [];
    this._watcher = null;
  }

  _load() {
    try {
      const raw  = fs.readFileSync(CONFIG_PATH, 'utf8');
      const user = JSON.parse(raw);
      return deepMerge(DEFAULTS, user);
    } catch (e) {
      console.warn('[ConfigLoader] Could not read config.json, using defaults.', e.message);
      return deepMerge(DEFAULTS, {});
    }
  }

  get() {
    return this.config;
  }

  // Call cb whenever config changes on disk
  onChange(cb) {
    this.watchers.push(cb);
    return () => { this.watchers = this.watchers.filter(w => w !== cb); };
  }

  watch() {
    if (this._watcher) return;
    try {
      let debounce = null;
      this._watcher = fs.watch(CONFIG_PATH, () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          const next = this._load();
          this.config = next;
          this.watchers.forEach(cb => cb(next));
        }, 200);
      });
    } catch (e) {
      console.warn('[ConfigLoader] Cannot watch config.json:', e.message);
    }
  }

  stop() {
    try { this._watcher?.close(); } catch (_) {}
  }

  openInEditor() {
    const { exec } = require('child_process');
    // Try Notepad++ → VS Code → system default
    const cmds = [
      `start "" "${CONFIG_PATH}"`,
    ];
    exec(cmds[0], { windowsHide: true });
  }
}

module.exports = new ConfigLoader(); // singleton
