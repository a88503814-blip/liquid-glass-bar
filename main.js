'use strict';
const { app, BrowserWindow, ipcMain, screen, shell } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');

// ── Performance: disable GPU sandbox lag, no background throttle ─────────────
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

const cfg                   = require('./modules/configLoader');
const trayManager           = require('./modules/trayManager');
const updater               = require('./modules/updater');
const volume                = require('./modules/volumeControl');
const SystemMonitor         = require('./modules/systemMonitor');
const BatteryMonitor        = require('./modules/batteryMonitor');
const NetworkMonitor        = require('./modules/networkMonitor');
const MediaMonitor          = require('./modules/mediaMonitor');
const WeatherService        = require('./modules/weatherService');
const NotificationWatcher   = require('./modules/notificationWatcher');
const VirtualDesktopMonitor = require('./modules/virtualDesktop');

let appBarNative = null;
function getAppBar() {
  if (appBarNative) return appBarNative;
  try { appBarNative = require('./modules/appBarNative'); return appBarNative; }
  catch (e) { console.warn('[AppBar]', e.message); return null; }
}

const BAR_H = 44;
const WM_DISPLAYCHANGE = 0x007E;
const WM_SETTINGCHANGE = 0x001A;

let mainWindow     = null;
let mediaWindow    = null;
let notifWindow    = null;
let settingsWindow = null;
const monitors     = {};
let volumePollTimer    = null;
let lastKnownVolume    = -1;
let lastMediaInfo      = null;

// ── Broadcast ─────────────────────────────────────────────────────────────────
function broadcast(ch, data) {
  for (const w of [mainWindow, settingsWindow, mediaWindow]) {
    if (w && !w.isDestroyed()) try { w.webContents.send(ch, data); } catch (_) {}
  }
}

// ── AppBar helpers ────────────────────────────────────────────────────────────
function getScaleFactor() {
  try { return screen.getPrimaryDisplay().scaleFactor || 1; } catch { return 1; }
}
function applyAppBar() {
  const ab = getAppBar(); if (!ab || !mainWindow || mainWindow.isDestroyed()) return;
  try { ab.register(mainWindow.getNativeWindowHandle(), getScaleFactor()); }
  catch (e) { console.warn('[AppBar]', e.message); }
}
function reapplyAppBar() {
  const ab = getAppBar(); if (!ab) return;
  try {
    ab.reapply(getScaleFactor());
    if (mainWindow && !mainWindow.isDestroyed()) {
      const { bounds } = screen.getPrimaryDisplay();
      mainWindow.setBounds({ x:bounds.x, y:bounds.y, width:bounds.width, height:BAR_H });
    }
  } catch (e) { console.warn('[AppBar reapply]', e.message); }
}

// ── Main bar window ───────────────────────────────────────────────────────────
function createMainWindow() {
  const { bounds } = screen.getPrimaryDisplay();
  const c = cfg.get();

  mainWindow = new BrowserWindow({
    x:bounds.x, y:bounds.y, width:bounds.width, height:BAR_H,
    frame:false, transparent:true, alwaysOnTop:true,
    skipTaskbar:true,          // hide from taskbar
    resizable:false, movable:false, minimizable:false, maximizable:false,
    fullscreenable:false, hasShadow:false, focusable:true,
    webPreferences:{
      preload:path.join(__dirname,'preload.js'),
      contextIsolation:true, nodeIntegration:false,
      backgroundThrottling:false, // prevent interval throttling
    },
  });

  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen:true });
  mainWindow.setOpacity(c.bar?.opacity ?? 0.96);

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.setSkipTaskbar(true); // enforce after show
    mainWindow.setPosition(bounds.x, bounds.y, false);
    applyAppBar();
  });

  mainWindow.hookWindowMessage(WM_DISPLAYCHANGE, () => setTimeout(reapplyAppBar, 100));
  mainWindow.hookWindowMessage(WM_SETTINGCHANGE, () => {
    clearTimeout(mainWindow._sct);
    mainWindow._sct = setTimeout(reapplyAppBar, 500);
  });
}

// ── Media popup ───────────────────────────────────────────────────────────────
function createMediaWindow() {
  if (mediaWindow && !mediaWindow.isDestroyed()) return;
  mediaWindow = new BrowserWindow({
    width:300, height:156, frame:false, transparent:true,
    alwaysOnTop:true, skipTaskbar:true, resizable:false, movable:false,
    show:false, focusable:true, hasShadow:false,
    webPreferences:{ preload:path.join(__dirname,'preload.js'), contextIsolation:true, nodeIntegration:false },
  });
  mediaWindow.setAlwaysOnTop(true, 'screen-saver');
  mediaWindow.setSkipTaskbar(true);
  mediaWindow.loadFile(path.join(__dirname, 'renderer', 'media-panel.html'));
  mediaWindow.on('blur', () => { if (mediaWindow && !mediaWindow.isDestroyed()) mediaWindow.hide(); });
}

// ── Notification popup ────────────────────────────────────────────────────────
function createNotifWindow() {
  if (notifWindow && !notifWindow.isDestroyed()) return;
  notifWindow = new BrowserWindow({
    width:340, height:90, frame:false, transparent:true,
    alwaysOnTop:true, skipTaskbar:true, resizable:false, movable:false,
    show:false, focusable:false, hasShadow:false,
    webPreferences:{ preload:path.join(__dirname,'preload.js'), contextIsolation:true, nodeIntegration:false },
  });
  notifWindow.setAlwaysOnTop(true, 'screen-saver');
  notifWindow.setSkipTaskbar(true);
  notifWindow.loadFile(path.join(__dirname, 'renderer', 'notification-panel.html'));
}

function showNotifPopup(notif) {
  if (!notifWindow || notifWindow.isDestroyed()) createNotifWindow();
  const { bounds } = screen.getPrimaryDisplay();
  notifWindow.setPosition(bounds.x + bounds.width - 350, bounds.y + BAR_H + 8);
  notifWindow.show();
  try { notifWindow.webContents.send('new-notification', notif); } catch (_) {}
}

// ── Settings ──────────────────────────────────────────────────────────────────
function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) { settingsWindow.focus(); return; }
  settingsWindow = new BrowserWindow({
    width:480, height:580, frame:false, transparent:true,
    alwaysOnTop:true, skipTaskbar:false, resizable:false,
    webPreferences:{ preload:path.join(__dirname,'preload.js'), contextIsolation:true, nodeIntegration:false },
  });
  settingsWindow.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

// ── Monitors ──────────────────────────────────────────────────────────────────
function startMonitors() {
  monitors.system    = new SystemMonitor();
  monitors.battery   = new BatteryMonitor();
  monitors.network   = new NetworkMonitor();
  monitors.media     = new MediaMonitor();
  monitors.weather   = new WeatherService();
  monitors.notif     = new NotificationWatcher();
  monitors.workspace = new VirtualDesktopMonitor();

  monitors.system.start(d    => broadcast('system-stats',     d));
  monitors.battery.start(d   => broadcast('battery-info',     d));
  monitors.network.start(d   => broadcast('network-info',     d));
  monitors.media.start(d     => { lastMediaInfo = d; broadcast('media-info', d); });
  monitors.weather.start(d   => broadcast('weather-info',     d));
  monitors.workspace.start(d => broadcast('workspace-info',   d));
  monitors.notif.start(n     => showNotifPopup(n));
}

function startVolumePoll() {
  volumePollTimer = setInterval(async () => {
    try {
      const v = await volume.getVolume();
      if (v !== lastKnownVolume) { lastKnownVolume = v; broadcast('volume-update', v); }
    } catch (_) {}
  }, 4000);
}

function stopMonitors() { Object.values(monitors).forEach(m => m?.stop?.()); }

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.handle('show-media-panel', (_, rightEdgeX) => {
  if (!mediaWindow || mediaWindow.isDestroyed()) createMediaWindow();
  const x = Math.max(0, Math.round(rightEdgeX) - 300);
  mediaWindow.setPosition(x, BAR_H + 4);
  mediaWindow.show(); mediaWindow.focus();
  if (lastMediaInfo) setTimeout(() => {
    if (mediaWindow && !mediaWindow.isDestroyed())
      mediaWindow.webContents.send('media-info', lastMediaInfo);
  }, 100);
});
ipcMain.handle('media-control', async (_, action) => {
  const { execFile } = require('child_process');
  const ctrlPath = require('./modules/mediaMonitor').getCtrlScript?.() ||
    require('path').join(require('os').tmpdir(), 'lgbar_media_ctrl.ps1');
  return new Promise(resolve => {
    execFile('powershell.exe',
      ['-NonInteractive','-NoProfile','-ExecutionPolicy','Bypass','-File',ctrlPath,'-Action',action],
      { windowsHide:true, timeout:5000 }, () => resolve());
  });
});
ipcMain.handle('hide-notif-panel', () => {
  if (notifWindow && !notifWindow.isDestroyed()) notifWindow.hide();
});
ipcMain.handle('get-volume',        ()     => volume.getVolume());
ipcMain.handle('set-volume',   async(_, v) => {
  lastKnownVolume = Math.round(v);
  await volume.setVolume(v);
  broadcast('volume-update', v);
});
ipcMain.handle('switch-workspace',  (_, i) => monitors.workspace?.switch?.(i) ?? Promise.resolve());
ipcMain.handle('update-download',   ()     => { try{require('electron-updater').autoUpdater.downloadUpdate();}catch(_){} });
ipcMain.handle('update-install',    ()     => { try{require('electron-updater').autoUpdater.quitAndInstall(false,true);}catch(_){} });
ipcMain.handle('update-check',      ()     => { try{require('electron-updater').autoUpdater.checkForUpdates();}catch(_){} });
ipcMain.handle('get-config',        ()     => cfg.get());
ipcMain.handle('save-config', (_, patch) => {
  try {
    const p = path.join(__dirname, 'config.json');
    const r = JSON.parse(fs.readFileSync(p,'utf8'));
    const merge = (b,o) => {
      const x={...b};
      for(const k of Object.keys(o||{})) x[k]=(typeof o[k]==='object'&&!Array.isArray(o[k]))?merge(b[k]||{},o[k]):o[k];
      return x;
    };
    fs.writeFileSync(p, JSON.stringify(merge(r,patch),null,2),'utf8');
    return { ok:true };
  } catch(e) { return { ok:false, error:e.message }; }
});
ipcMain.handle('open-settings',    () => createSettingsWindow());
ipcMain.handle('close-settings',   () => settingsWindow?.close());
ipcMain.handle('reload-bar',       () => mainWindow?.webContents.reload());
ipcMain.handle('open-config-file', () => shell.openPath(path.join(__dirname,'config.json')));
ipcMain.on('open-settings-from-tray', () => createSettingsWindow());

cfg.onChange(next => {
  broadcast('config-updated', next);
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setOpacity(next.bar?.opacity ?? 0.96);
});

// ── Lifecycle ─────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createMainWindow();
  createMediaWindow();
  createNotifWindow();
  trayManager.init(mainWindow);
  cfg.watch();
  startMonitors();
  startVolumePoll();
  updater.init(mainWindow, ipcMain);
});

app.on('window-all-closed', () => {});
app.on('before-quit', () => {
  clearInterval(volumePollTimer);
  try { updater.stop(); } catch (_) {}
  try { getAppBar()?.unregister(); } catch (_) {}
  stopMonitors();
  trayManager.destroy();
  cfg.stop();
});
