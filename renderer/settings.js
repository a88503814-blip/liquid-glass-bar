/* ═══════════════════════════════════════════════════════════
   LIQUID GLASS BAR — settings.js
   Full settings panel logic: tabs, live-preview, save/load.
   ═══════════════════════════════════════════════════════════ */
'use strict';

// ── Load SVG sprite (same sprite as main bar) ────────────────────────────────
(function loadSprite() {
  const xhr = new XMLHttpRequest();
  xhr.open('GET', '../assets/icons.svg', true);
  xhr.onload = () => {
    if (xhr.status === 0 || xhr.status === 200)
      document.getElementById('svg-sprite').innerHTML = xhr.responseText;
  };
  xhr.send();
})();

// ── Helpers ───────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ── Tab switching ─────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.querySelector(`.tab-pane[data-pane="${target}"]`)?.classList.add('active');
  });
});

// ── Load config into form ─────────────────────────────────────────────────────
let currentCfg = {};

window.electronAPI.getConfig().then(cfg => {
  if (!cfg) return;
  currentCfg = cfg;
  applyConfigToForm(cfg);
});

function applyConfigToForm(cfg) {
  // Appearance
  const accent  = cfg?.bar?.accentColor ?? '#60c8ff';
  const opacity = Math.round((cfg?.bar?.opacity ?? 0.95) * 100);
  const height  = cfg?.bar?.height ?? 44;

  $('accent-color').value     = accent;
  $('accent-hex').textContent = accent;
  $('bar-opacity').value      = opacity;
  $('opacity-val').textContent = `${opacity}%`;
  $('bar-height').value       = height;
  $('height-val').textContent = `${height}px`;

  // Widgets
  const w = cfg?.widgets ?? {};
  setToggle('w-workspaces', w.workspaces !== false);
  setToggle('w-media',      w.media      !== false);
  setToggle('w-weather',    w.weather    !== false);
  setToggle('w-pomodoro',   w.pomodoro   !== false);
  setToggle('w-network',    w.network    !== false);
  setToggle('w-system',     w.system     !== false);
  setToggle('w-uptime',     w.uptime     !== false);
  setToggle('w-battery',    w.battery    !== false);

  // Weather
  const loc  = cfg?.weather?.location ?? '';
  const unit = cfg?.weather?.unit     ?? 'C';
  $('weather-location').value = loc === 'auto' ? '' : loc;
  document.querySelector(`input[name="unit"][value="${unit}"]`).checked = true;

  // Pomodoro
  const focus = cfg?.pomodoro?.focusMinutes ?? 25;
  const brk   = cfg?.pomodoro?.breakMinutes ?? 5;
  $('pomo-focus').value      = focus;
  $('focus-val').textContent = `${focus} min`;
  $('pomo-break').value      = brk;
  $('break-val').textContent = `${brk} min`;

  // Apply accent colour preview immediately
  applyAccentPreview(accent);
}

function setToggle(id, checked) {
  const el = $(id);
  if (el) el.checked = checked;
}

// ── Live previews ─────────────────────────────────────────────────────────────

// Accent colour → update CSS variable live
function applyAccentPreview(hex) {
  document.documentElement.style.setProperty('--accent', hex);
  // Derived alpha versions
  document.documentElement.style.setProperty('--accent-dim',  hexToRgba(hex, .18));
  document.documentElement.style.setProperty('--accent-glow', hexToRgba(hex, .40));
  document.documentElement.style.setProperty('--accent-ring', hexToRgba(hex, .25));
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

$('accent-color').addEventListener('input', () => {
  const v = $('accent-color').value;
  $('accent-hex').textContent = v;
  applyAccentPreview(v);
});

$('bar-opacity').addEventListener('input', () => {
  $('opacity-val').textContent = `${$('bar-opacity').value}%`;
});

$('bar-height').addEventListener('input', () => {
  $('height-val').textContent = `${$('bar-height').value}px`;
});

$('pomo-focus').addEventListener('input', () => {
  $('focus-val').textContent = `${$('pomo-focus').value} min`;
});

$('pomo-break').addEventListener('input', () => {
  $('break-val').textContent = `${$('pomo-break').value} min`;
});

// Range inputs — update fill gradient
document.querySelectorAll('.range-input').forEach(r => {
  function updateFill() {
    const pct = ((r.value - r.min) / (r.max - r.min)) * 100;
    r.style.background =
      `linear-gradient(to right, var(--accent) ${pct}%, rgba(255,255,255,.12) ${pct}%)`;
  }
  r.addEventListener('input', updateFill);
  updateFill();
});

// ── Collect form values into patch object ─────────────────────────────────────
function collectPatch() {
  const accent  = $('accent-color').value;
  const opacity = parseInt($('bar-opacity').value) / 100;
  const height  = parseInt($('bar-height').value);
  const loc     = $('weather-location').value.trim() || 'auto';
  const unit    = document.querySelector('input[name="unit"]:checked')?.value ?? 'C';
  const focus   = parseInt($('pomo-focus').value);
  const brk     = parseInt($('pomo-break').value);

  return {
    bar: { accentColor: accent, opacity, height },
    weather:  { location: loc, unit },
    pomodoro: { focusMinutes: focus, breakMinutes: brk },
    widgets: {
      workspaces: $('w-workspaces').checked,
      media:      $('w-media').checked,
      weather:    $('w-weather').checked,
      pomodoro:   $('w-pomodoro').checked,
      network:    $('w-network').checked,
      system:     $('w-system').checked,
      uptime:     $('w-uptime').checked,
      battery:    $('w-battery').checked,
    },
  };
}

// ── Save button ───────────────────────────────────────────────────────────────
$('save-btn').addEventListener('click', async () => {
  const patch  = collectPatch();
  const result = await window.electronAPI.saveConfig(patch);

  if (result?.ok) {
    showToast('Changes saved. Height changes need a restart.', 'success');
  } else {
    showToast(`Save failed: ${result?.error ?? 'unknown error'}`, 'error');
  }
});

// ── Reload bar ────────────────────────────────────────────────────────────────
$('reload-btn').addEventListener('click', async () => {
  await window.electronAPI.reloadBar();
  showToast('Bar reloaded.', 'success');
});

// ── Open raw config ───────────────────────────────────────────────────────────
$('open-config-btn').addEventListener('click', () => {
  window.electronAPI.openConfigFile();
});

// ── Close button ──────────────────────────────────────────────────────────────
$('close-btn').addEventListener('click', () => {
  window.electronAPI.closeSettings();
});

// Escape key closes panel
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') window.electronAPI.closeSettings();
});

// ── Toast helper ──────────────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const toast = $('save-toast');
  toast.textContent = msg;
  toast.classList.remove('hidden', 'error');
  if (type === 'error') toast.classList.add('error');

  // Auto-hide after 3 s
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.add('hidden'), 3000);
}

// ── Receive config-updated pushes from main (when config.json changes on disk) ─
window.electronAPI.onConfigUpdated(cfg => {
  if (!cfg) return;
  currentCfg = cfg;
  applyConfigToForm(cfg);
});
