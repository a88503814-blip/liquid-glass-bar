'use strict';
/**
 * Media monitor — two-script approach.
 *
 * SCRIPT 1 (fast, runs every 2.5s):
 *   Fetches title, artist, app, isPlaying ONLY.
 *   No stream operations — can't crash.
 *
 * SCRIPT 2 (thumbnail, runs only when title changes):
 *   Fetches the SMTC thumbnail as base64.
 *   Runs in the background; failures are silent.
 *   Kept separate so a thumbnail failure never blocks the main data.
 */
const { execFile } = require('child_process');
const path = require('path');
const fs   = require('fs');
const os   = require('os');

// ── Script 1: fast media info ─────────────────────────────────────────────────
const FAST_PATH = path.join(os.tmpdir(), 'lgbar_media_fast.ps1');
const FAST_LINES = [
  '$ErrorActionPreference = \'SilentlyContinue\'',
  'try {',
  '    Add-Type -AssemblyName System.Runtime.WindowsRuntime',
  '    $atm = ([System.WindowsRuntimeSystemExtensions].GetMethods() |',
  '        Where-Object {',
  '            $_.Name -eq \'AsTask\' -and',
  '            $_.GetParameters().Count -eq 1 -and',
  '            $_.GetParameters()[0].ParameterType.Name -eq \'IAsyncOperation`1\'',
  '        })[0]',
  '    function Aw($op,$t){$m=$atm.MakeGenericMethod($t);$tk=$m.Invoke($null,@($op));$tk.Wait(4000)|Out-Null;$tk.Result}',
  '    [void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media,ContentType=WindowsRuntime]',
  '    [void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties,Windows.Media,ContentType=WindowsRuntime]',
  '    $mgr  = Aw ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])',
  '    $sess = @($mgr.GetSessions())',
  '    if($sess.Count -eq 0){Write-Output \'{"t":"","ar":"","pl":false,"ap":""}\';exit}',
  '    $best = $null',
  '    foreach($s in $sess){',
  '        try{',
  '            $pb=$s.GetPlaybackInfo()',
  '            if($pb.PlaybackStatus.ToString() -eq \'Playing\'){$best=$s;break}',
  '        }catch{}',
  '    }',
  '    if(-not $best){',
  '        foreach($s in $sess){',
  '            try{$p=Aw ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]);if($p.Title){$best=$s;break}}catch{}',
  '        }',
  '    }',
  '    if(-not $best){$best=$sess[0]}',
  '    $props = Aw ($best.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])',
  '    $pb2   = $best.GetPlaybackInfo()',
  '    $aid   = $best.SourceAppUserModelId',
  '    $an    = ($aid -split \'[!.]\')[0]',
  '    if($an -match \'chrome\'){$an=\'Chrome\'}',
  '    elseif($an -match \'msedge\'){$an=\'Edge\'}',
  '    elseif($an -match \'firefox\'){$an=\'Firefox\'}',
  '    elseif($an -match \'spotify\'){$an=\'Spotify\'}',
  '    [PSCustomObject]@{t="$($props.Title)";ar="$($props.Artist)";al="$($props.AlbumTitle)";pl=($pb2.PlaybackStatus.ToString() -eq \'Playing\');ap=$an}|ConvertTo-Json -Compress',
  '} catch {Write-Output \'{"t":"","ar":"","pl":false,"ap":""}\'}'
];
try { fs.writeFileSync(FAST_PATH, FAST_LINES.join('\r\n'), 'utf8'); } catch (_) {}

// ── Script 2: thumbnail (separate, non-blocking) ──────────────────────────────
const THUMB_PATH = path.join(os.tmpdir(), 'lgbar_media_thumb.ps1');
const THUMB_LINES = [
  '$ErrorActionPreference = \'SilentlyContinue\'',
  'try {',
  '    Add-Type -AssemblyName System.Runtime.WindowsRuntime',
  '    $atm = ([System.WindowsRuntimeSystemExtensions].GetMethods() |',
  '        Where-Object {',
  '            $_.Name -eq \'AsTask\' -and',
  '            $_.GetParameters().Count -eq 1 -and',
  '            $_.GetParameters()[0].ParameterType.Name -eq \'IAsyncOperation`1\'',
  '        })[0]',
  '    function Aw($op,$t){$m=$atm.MakeGenericMethod($t);$tk=$m.Invoke($null,@($op));$tk.Wait(4000)|Out-Null;$tk.Result}',
  '    [void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media,ContentType=WindowsRuntime]',
  '    [void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties,Windows.Media,ContentType=WindowsRuntime]',
  '    [void][Windows.Storage.Streams.IRandomAccessStream,Windows.Storage.Streams,ContentType=WindowsRuntime]',
  '    [void][Windows.Storage.Streams.DataReader,Windows.Storage.Streams,ContentType=WindowsRuntime]',
  '    $mgr   = Aw ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])',
  '    $sess  = @($mgr.GetSessions())',
  '    if($sess.Count -eq 0){Write-Output \'\';exit}',
  '    $best  = $null',
  '    foreach($s in $sess){try{$pb=$s.GetPlaybackInfo();if($pb.PlaybackStatus.ToString() -eq \'Playing\'){$best=$s;break}}catch{}}',
  '    if(-not $best){$best=$sess[0]}',
  '    $props = Aw ($best.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])',
  '    $ref   = $props.Thumbnail',
  '    if(-not $ref){Write-Output \'\';exit}',
  '    $stream= Aw ($ref.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStream])',
  '    $sz    = [uint32]$stream.Size',
  '    if($sz -eq 0){Write-Output \'\';exit}',
  '    $reader= [Windows.Storage.Streams.DataReader]::new($stream)',
  '    Aw ($reader.LoadAsync($sz)) ([System.UInt32]) | Out-Null',
  '    $bytes = New-Object byte[] $sz',
  '    $reader.ReadBytes($bytes)',
  '    $reader.DetachStream()|Out-Null',
  '    Write-Output ([Convert]::ToBase64String($bytes))',
  '} catch { Write-Output \'\' }',
];
try { fs.writeFileSync(THUMB_PATH, THUMB_LINES.join('\r\n'), 'utf8'); } catch (_) {}

function runPs(file, timeout) {
  return new Promise(resolve => {
    execFile('powershell.exe',
      ['-NonInteractive', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', file],
      { timeout, windowsHide: true },
      (err, stdout) => resolve(stdout?.trim() || '')
    );
  });
}

class MediaMonitor {
  constructor() {
    this.interval   = null;
    this.thumbTimer = null;
    this.last       = { title:'', artist:'', album:'', isPlaying:false, app:'', thumb:'' };
    this.lastTitle  = '';
  }

  async poll(cb) {
    const raw = await runPs(FAST_PATH, 8000);
    if (!raw) return;

    // Find JSON line
    const line = raw.split('\n').find(l => l.trim().startsWith('{'));
    if (!line) return;

    let parsed;
    try { parsed = JSON.parse(line.trim()); } catch { return; }

    const title  = parsed.t  || '';
    const artist = parsed.ar || '';
    const album  = parsed.al || '';
    const playing = !!parsed.pl;
    const app    = parsed.ap || '';

    const trackChanged = title !== this.lastTitle;
    this.lastTitle = title;

    // If track changed, fetch thumbnail async (don't block)
    if (trackChanged) {
      this.last.thumb = ''; // clear old art immediately
      if (title) {
        // Fetch thumb in background
        clearTimeout(this.thumbTimer);
        this.thumbTimer = setTimeout(async () => {
          const b64 = await runPs(THUMB_PATH, 12000);
          if (b64 && b64.length > 100) {
            this.last.thumb = b64;
            cb(this.last); // push update with art
          }
        }, 300);
      }
    }

    this.last = { title, artist, album, isPlaying: playing, app, thumb: this.last.thumb };
    cb(this.last);
  }

  start(cb) {
    this.poll(cb);
    this.interval = setInterval(() => this.poll(cb), 2500);
  }

  stop() {
    clearInterval(this.interval);
    clearTimeout(this.thumbTimer);
    try { fs.unlinkSync(FAST_PATH); } catch (_) {}
    try { fs.unlinkSync(THUMB_PATH); } catch (_) {}
  }
}

module.exports = MediaMonitor;
