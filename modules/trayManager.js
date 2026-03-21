'use strict';
const { Tray, Menu, nativeImage, app, BrowserWindow, shell } = require('electron');
const path   = require('path');
const os     = require('os');
const fs     = require('fs');

// 32×32 Liquid Glass diamond icon — base64 PNG (no external dep)
const TRAY_ICON_B64 =
  'data:image/png;base64,' +
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAj0lEQVR42mNgGAWjgAKQcOJ/' +
  'AAgPmOUcXGJbQJjujkC2nO6OwGY53RyBbrlNz50TIEwXR+CynC6OIGQ5TR2Bz3Kg3B0Qppkj' +
  'iLGcZo4gxXKqO4JYy0+8/v8BhKnqCFItp7ojBtwBAx4FgyIRDopsOCgKokFRFA+KymhQVMeD' +
  'okEyKJpkg6JROiia5aNg2AAAyHJlJ107Ky0AAAAASUVORK5CYII=';

class TrayManager {
  constructor() {
    this.tray       = null;
    this.mainWindow = null;
    this.barVisible = true;
  }

  init(mainWindow) {
    this.mainWindow = mainWindow;

    const img = nativeImage.createFromDataURL(TRAY_ICON_B64);
    this.tray = new Tray(img);
    this.tray.setToolTip('Liquid Glass Bar');
    this._buildMenu();

    // Left-click = toggle bar
    this.tray.on('click', () => this._toggleBar());
  }

  _toggleBar() {
    if (!this.mainWindow) return;
    this.barVisible = !this.barVisible;
    if (this.barVisible) {
      this.mainWindow.show();
    } else {
      this.mainWindow.hide();
    }
    this._buildMenu();
  }

  _buildMenu() {
    const menu = Menu.buildFromTemplate([
      {
        label:   'Liquid Glass Bar',
        enabled: false,
      },
      { type: 'separator' },
      {
        label: this.barVisible ? 'Hide Bar' : 'Show Bar',
        click: () => this._toggleBar(),
      },
      {
        label: 'Settings...',
        click: () => {
          // Send IPC to open settings window via main process
          const { ipcMain } = require('electron');
          // Directly open settings window
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('open-settings-from-tray');
          }
        },
      },
      {
        label: 'Reload Bar',
        click: () => {
          if (this.mainWindow) this.mainWindow.webContents.reload();
        },
      },
      { type: 'separator' },
      {
        label: 'Open config.json',
        click: () => require('./configLoader').openInEditor(),
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => app.quit(),
      },
    ]);

    this.tray.setContextMenu(menu);
  }

  destroy() {
    try { this.tray?.destroy(); } catch (_) {}
  }
}

module.exports = new TrayManager();
