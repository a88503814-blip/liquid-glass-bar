'use strict';
/**
 * Auto-updater — powered by electron-updater + GitHub Releases.
 *
 * HOW IT WORKS:
 *   1. On startup (after 8s delay so bar is fully loaded), silently checks
 *      GitHub Releases for a newer version.
 *   2. If one is found, broadcasts 'update-available' to the renderer
 *      which shows a pill notification in the bar.
 *   3. When the user clicks "Update", the new installer downloads in the
 *      background. Progress is broadcast to the renderer.
 *   4. When download completes, 'update-ready' is broadcast.
 *      Clicking "Restart & Install" quits + installs.
 *
 * SETUP (required before publishing):
 *   1. Create a GitHub repo named exactly what's in package.json build.publish.repo
 *   2. Set GH_TOKEN env var to a GitHub Personal Access Token with 'repo' scope
 *      — only needed when building/publishing, not for the end user.
 *   3. Run:  npm run release
 *      This builds, signs (if configured), and uploads to GitHub Releases.
 *
 * For end users: the app downloads from your public GitHub Releases
 * automatically. No token needed to receive updates.
 */

let autoUpdater  = null;
let _mainWindow  = null;
let _ipcMain     = null;
let _checkTimer  = null;

function broadcast(ch, data) {
  if (_mainWindow && !_mainWindow.isDestroyed()) {
    try { _mainWindow.webContents.send(ch, data); } catch (_) {}
  }
}

function init(mainWindow, ipcMain) {
  _mainWindow = mainWindow;
  _ipcMain    = ipcMain;

  // electron-updater is a devDependency — only available in packaged app
  try {
    const { autoUpdater: au } = require('electron-updater');
    autoUpdater = au;
  } catch (e) {
    console.log('[Updater] electron-updater not available (dev mode):', e.message);
    return;
  }

  // Don't auto-install — let user choose when to restart
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.autoDownload         = false; // download only when user clicks

  // ── Events ─────────────────────────────────────────────────────────────────

  autoUpdater.on('checking-for-update', () => {
    console.log('[Updater] Checking for update…');
  });

  autoUpdater.on('update-available', info => {
    console.log(`[Updater] Update available: v${info.version}`);
    broadcast('update-available', {
      version:     info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes || '',
    });
  });

  autoUpdater.on('update-not-available', () => {
    console.log('[Updater] Already on latest version.');
  });

  autoUpdater.on('download-progress', progress => {
    broadcast('update-progress', {
      percent:   Math.round(progress.percent),
      transferred: progress.transferred,
      total:     progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    });
  });

  autoUpdater.on('update-downloaded', info => {
    console.log(`[Updater] Update downloaded: v${info.version}`);
    broadcast('update-ready', { version: info.version });
  });

  autoUpdater.on('error', err => {
    console.warn('[Updater] Error:', err.message);
    broadcast('update-error', { message: err.message });
  });

  // ── IPC: user actions ───────────────────────────────────────────────────────

  // User clicked "Update" in the bar notification
  _ipcMain.handle('update-download', () => {
    try { autoUpdater.downloadUpdate(); }
    catch (e) { console.warn('[Updater] download failed:', e.message); }
  });

  // User clicked "Restart & Install"
  _ipcMain.handle('update-install', () => {
    autoUpdater.quitAndInstall(false, true); // isSilent=false, isForceRunAfter=true
  });

  // Manual check trigger (e.g. from settings panel)
  _ipcMain.handle('update-check', () => {
    try { autoUpdater.checkForUpdates(); }
    catch (e) { console.warn('[Updater] check failed:', e.message); }
  });

  // ── Initial check after startup settles ────────────────────────────────────
  // Delay 8 seconds so the bar finishes rendering first
  _checkTimer = setTimeout(() => {
    try { autoUpdater.checkForUpdates(); }
    catch (e) { console.warn('[Updater] initial check failed:', e.message); }
  }, 8000);

  // Then recheck every 4 hours
  setInterval(() => {
    try { autoUpdater.checkForUpdates(); }
    catch (e) { /* silent */ }
  }, 4 * 60 * 60 * 1000);
}

function stop() {
  clearTimeout(_checkTimer);
}

module.exports = { init, stop };
