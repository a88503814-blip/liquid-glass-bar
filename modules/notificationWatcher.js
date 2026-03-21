'use strict';
const { spawn }    = require('child_process');
const path         = require('path');
const fs           = require('fs');
const os           = require('os');

const SCRIPT_PATH = path.join(os.tmpdir(), 'lgbar_notif_wrt.ps1');

const SCRIPT = [
  '$ErrorActionPreference = "SilentlyContinue"',
  'try {',
  '    Add-Type -AssemblyName System.Runtime.WindowsRuntime',
  '    [void][Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime]',
  '    [void][Windows.UI.Notifications.ToastNotificationHistory,Windows.UI.Notifications,ContentType=WindowsRuntime]',
  '    $hist = [Windows.UI.Notifications.ToastNotificationManager]::History',
  '    $seen = @{}',
  '    try { foreach ($n in $hist.GetHistory()) { $seen[$n.Tag + "|" + $n.Group] = $true } } catch {}',
  '    [Console]::Out.WriteLine("READY"); [Console]::Out.Flush()',
  '    while ($true) {',
  '        Start-Sleep -Milliseconds 1500',
  '        try {',
  '            foreach ($n in $hist.GetHistory()) {',
  '                $key = $n.Tag + "|" + $n.Group',
  '                if ($seen.ContainsKey($key)) { continue }',
  '                $seen[$key] = $true',
  '                $title = ""; $body = ""',
  '                try {',
  '                    $nodes = $n.Content.SelectNodes("//text")',
  '                    if ($nodes.Count -ge 1) { $title = $nodes[0].InnerText.Trim() }',
  '                    if ($nodes.Count -ge 2) { $body  = $nodes[1].InnerText.Trim() }',
  '                } catch {}',
  '                $app = "System"',
  '                try { $app = $n.AppInfo.DisplayInfo.DisplayName } catch {}',
  '                if ($title -ne "") {',
  '                    $obj = @{id=$key; appName=$app; title=$title; body=$body}',
  '                    [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))',
  '                    [Console]::Out.Flush()',
  '                }',
  '            }',
  '        } catch {}',
  '    }',
  '} catch {',
  '    [Console]::Out.WriteLine("WINFAIL"); [Console]::Out.Flush()',
  '    exit 1',
  '}',
].join('\r\n');

try { fs.writeFileSync(SCRIPT_PATH, SCRIPT, 'utf8'); } catch (_) {}

class NotificationWatcher {
  constructor() {
    this.proc  = null;
    this._cb   = null;
    this._buf  = '';
    this._dead = false;
  }

  _launch(cb) {
    this._cb = cb;
    this.proc = spawn('powershell.exe',
      ['-NonInteractive', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT_PATH],
      { windowsHide: true });

    this.proc.stdout.setEncoding('utf8');
    this.proc.stdout.on('data', chunk => {
      this._buf += chunk;
      const lines = this._buf.split('\n');
      this._buf = lines.pop();
      for (const raw of lines) {
        const line = raw.trim();
        if (!line || line === 'READY' || line === 'WINFAIL') continue;
        try {
          const n = JSON.parse(line);
          if (n?.title) cb(n);
        } catch {}
      }
    });
    this.proc.stderr?.on('data', () => {});
    this.proc.on('exit', code => {
      if (this._dead) return;
      setTimeout(() => { if (!this._dead) this._launch(this._cb); }, 5000);
    });
  }

  start(cb) { this._launch(cb); }
  stop() {
    this._dead = true;
    try { this.proc?.kill(); } catch (_) {}
    try { fs.unlinkSync(SCRIPT_PATH); } catch (_) {}
  }
}

module.exports = NotificationWatcher;
