'use strict';
/**
 * Volume control via Windows Core Audio API (IAudioEndpointVolume).
 * Far more reliable than WinMM waveOut which ignores per-app mixer sessions.
 */
const { execFile } = require('child_process');
const path = require('path');
const fs   = require('fs');
const os   = require('os');

const SCRIPT_PATH = path.join(os.tmpdir(), 'lgbar_vol2.ps1');

const SCRIPT = `
param([float]$Set = -1)
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"),
 InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
    void notused0(); void notused1();
    void GetChannelCount(out uint c);
    void SetMasterVolumeLevel(float db, Guid ctx);
    void SetMasterVolumeLevelScalar(float level, Guid ctx);
    void GetMasterVolumeLevel(out float db);
    void GetMasterVolumeLevelScalar(out float level);
    void SetChannelVolumeLevel(uint ch, float db, Guid ctx);
    void SetChannelVolumeLevelScalar(uint ch, float level, Guid ctx);
    void GetChannelVolumeLevel(uint ch, out float db);
    void GetChannelVolumeLevelScalar(uint ch, out float level);
    void SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, Guid ctx);
    void GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
}

[Guid("D666063F-1587-4E43-81F1-B948E807363F"),
 InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
    void Activate(ref Guid iid, uint ctx, IntPtr ap,
                  [MarshalAs(UnmanagedType.IUnknown)] out object ppv);
    void GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
    void GetState(out uint state);
}

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"),
 InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
    void EnumAudioEndpoints(uint flow, uint mask,
                            [MarshalAs(UnmanagedType.IUnknown)] out object ppv);
    void GetDefaultAudioEndpoint(uint flow, uint role, out IMMDevice ppv);
}

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class MMDeviceEnumeratorCls {}

public static class CoreAudio {
    static IAudioEndpointVolume GetEP() {
        var en  = (IMMDeviceEnumerator)(new MMDeviceEnumeratorCls());
        IMMDevice dev;
        en.GetDefaultAudioEndpoint(0, 1, out dev);
        var g   = typeof(IAudioEndpointVolume).GUID;
        object o;
        dev.Activate(ref g, 23, IntPtr.Zero, out o);
        return (IAudioEndpointVolume)o;
    }
    public static int GetVolume() {
        float v; GetEP().GetMasterVolumeLevelScalar(out v);
        return (int)Math.Round(v * 100);
    }
    public static void SetVolume(float pct) {
        GetEP().SetMasterVolumeLevelScalar(pct / 100f, Guid.Empty);
    }
}
'@ -Language CSharp

if ($Set -lt 0) {
    [CoreAudio]::GetVolume()
} else {
    [CoreAudio]::SetVolume($Set)
}
`;

try { fs.writeFileSync(SCRIPT_PATH, SCRIPT, 'utf8'); } catch (_) {}

const PS_ARGS_BASE = [
  '-NonInteractive', '-NoProfile',
  '-ExecutionPolicy', 'Bypass',
  '-File', SCRIPT_PATH,
];

function getVolume() {
  return new Promise(resolve => {
    execFile('powershell.exe', PS_ARGS_BASE,
      { windowsHide: true, timeout: 5000 },
      (err, stdout) => {
        const v = parseInt(stdout?.trim());
        resolve(isNaN(v) ? 50 : Math.max(0, Math.min(100, v)));
      }
    );
  });
}

function setVolume(level) {
  return new Promise(resolve => {
    execFile('powershell.exe',
      [...PS_ARGS_BASE, '-Set', String(Math.max(0, Math.min(100, Math.round(level))))],
      { windowsHide: true, timeout: 5000 },
      () => resolve()
    );
  });
}

module.exports = { getVolume, setVolume };
