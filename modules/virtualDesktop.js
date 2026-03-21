'use strict';
/**
 * Virtual Desktop monitor + switcher.
 * Detection: Windows registry (100% reliable, no WinRT needed)
 * Switching: Win+Ctrl+Arrow key injection via user32.dll
 * TWM: auto-detects GlazeWM (port 6123) and Komorebi (komorebic state)
 *
 * Poll interval: 1000ms (was 300ms — that was causing lag)
 */
const { execFile } = require('child_process');
const http         = require('http');
const path         = require('path');
const fs           = require('fs');
const os           = require('os');

// ── PowerShell scripts ────────────────────────────────────────────────────────
const DETECT_PATH = path.join(os.tmpdir(), 'lgbar_vd_detect2.ps1');
const DETECT_LINES = [
  '$ErrorActionPreference = \'SilentlyContinue\'',
  '$reg = \'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VirtualDesktops\'',
  '$cur = (Get-ItemProperty $reg -ErrorAction SilentlyContinue).CurrentVirtualDesktop',
  '$all = (Get-ItemProperty $reg -ErrorAction SilentlyContinue).VirtualDesktopIDs',
  'if (-not $cur -or -not $all) { Write-Output \'{"current":1,"total":1}\'; exit }',
  '$total = [Math]::Floor($all.Count / 16)',
  '$idx   = 1',
  'for ($i = 0; $i -lt $total; $i++) {',
  '    $slice = $all[($i*16)..(($i*16)+15)]',
  '    $ok    = $true',
  '    for ($j = 0; $j -lt 16; $j++) { if ($slice[$j] -ne $cur[$j]) { $ok = $false; break } }',
  '    if ($ok) { $idx = $i + 1; break }',
  '}',
  'Write-Output (\'{"current":\' + $idx + \',"total":\' + $total + \'}\')',
];
try { fs.writeFileSync(DETECT_PATH, DETECT_LINES.join('\r\n'), 'utf8'); } catch (_) {}

const SWITCH_PATH = path.join(os.tmpdir(), 'lgbar_vd_switch2.ps1');
const SWITCH_LINES = [
  'param([int]$Steps, [int]$Dir)',
  '$ErrorActionPreference = \'SilentlyContinue\'',
  'Add-Type -TypeDefinition @\'',
  'using System;',
  'using System.Runtime.InteropServices;',
  'using System.Threading;',
  'public static class KB {',
  '    [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte sc, uint fl, IntPtr ex);',
  '    const byte WIN=0x5B, CTRL=0x11, LEFT=0x25, RIGHT=0x27;',
  '    const uint UP=2;',
  '    public static void Switch(bool left) {',
  '        byte arr = left ? LEFT : RIGHT;',
  '        keybd_event(WIN,0,0,IntPtr.Zero);',
  '        keybd_event(CTRL,0,0,IntPtr.Zero);',
  '        keybd_event(arr,0,0,IntPtr.Zero);',
  '        Thread.Sleep(40);',
  '        keybd_event(arr,0,UP,IntPtr.Zero);',
  '        keybd_event(CTRL,0,UP,IntPtr.Zero);',
  '        keybd_event(WIN,0,UP,IntPtr.Zero);',
  '        Thread.Sleep(60);',
  '    }',
  '}',
  '\'@ -Language CSharp',
  'for ($i=0;$i -lt $Steps;$i++) { [KB]::Switch($Dir -lt 0) }',
  'Write-Output "ok"',
];
try { fs.writeFileSync(SWITCH_PATH, SWITCH_LINES.join('\r\n'), 'utf8'); } catch (_) {}

function ps(file, args = []) {
  return new Promise(resolve => {
    execFile('powershell.exe',
      ['-NonInteractive', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', file, ...args],
      { windowsHide: true, timeout: 4000 },
      (_, out) => resolve((out || '').trim())
    );
  });
}

// ── GlazeWM ───────────────────────────────────────────────────────────────────
function queryGlazeWM() {
  return new Promise((res, rej) => {
    const req = http.request(
      { hostname: 'localhost', port: 6123, path: '/api/v1/state', timeout: 800 },
      r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>{ try{res(JSON.parse(d));}catch{rej();} }); }
    );
    req.on('error', rej); req.on('timeout', () => { req.destroy(); rej(); }); req.end();
  });
}
function parseGlazeWM(s) {
  const list = [];
  for (const m of (s.monitors||[])) for (const w of (m.workspaces||[]))
    list.push({ index:list.length+1, name:w.name??String(list.length+1), active:!!w.is_focused, occupied:Array.isArray(w.children)&&w.children.length>0 });
  return list.length ? list : null;
}

// ── Komorebi ──────────────────────────────────────────────────────────────────
function queryKomorebi() {
  return new Promise((res, rej) => {
    execFile('komorebic.exe', ['state'],
      { windowsHide: true, timeout: 1200 },
      (e, out) => { if(e||!out?.trim())return rej(); try{res(JSON.parse(out.trim()));}catch{rej();} }
    );
  });
}
function parseKomorebi(s) {
  const list = [], mons=s?.monitors?.elements??[], fMon=s?.monitors?.focused??0;
  mons.forEach((m,mi)=>{
    const wss=m?.workspaces?.elements??[], fWs=m?.workspaces?.focused??0;
    wss.forEach((w,wi)=>list.push({ index:list.length+1, name:w.name??String(list.length+1), active:mi===fMon&&wi===fWs, occupied:(w.containers?.elements?.length??0)>0 }));
  });
  return list.length ? list : null;
}

// ── Native registry detection ────────────────────────────────────────────────
async function detectNative() {
  const raw = await ps(DETECT_PATH);
  try {
    const { current, total } = JSON.parse(raw);
    return Array.from({ length: total }, (_, i) => ({
      index: i+1, name: String(i+1), active: i+1 === current, occupied: false
    }));
  } catch { return null; }
}

const DEFAULT = [1,2,3,4].map(i=>({ index:i, name:String(i), active:i===1, occupied:false }));

class VirtualDesktopMonitor {
  constructor() { this.interval=null; this.last={ workspaces:DEFAULT, source:'default' }; }

  async getWorkspaces() {
    try { const w=parseGlazeWM(await queryGlazeWM()); if(w) return (this.last={workspaces:w,source:'glazewm'}); } catch{}
    try { const w=parseKomorebi(await queryKomorebi()); if(w) return (this.last={workspaces:w,source:'komorebi'}); } catch{}
    try { const w=await detectNative(); if(w) return (this.last={workspaces:w,source:'native'}); } catch{}
    return this.last.source!=='default' ? this.last : { workspaces:DEFAULT, source:'default' };
  }

  start(cb) {
    this.getWorkspaces().then(cb);
    // 1000ms — was 300ms which caused constant thrashing
    this.interval = setInterval(() => this.getWorkspaces().then(cb), 2500);
  }
  stop() { clearInterval(this.interval); }

  async switch(targetIdx) {
    const raw = await ps(DETECT_PATH);
    let current = 1;
    try { current = JSON.parse(raw).current; } catch {}
    const delta = targetIdx - current;
    if (delta === 0) return;
    await ps(SWITCH_PATH, ['-Steps', String(Math.abs(delta)), '-Dir', String(delta<0?-1:1)]);
  }
}

module.exports = VirtualDesktopMonitor;
