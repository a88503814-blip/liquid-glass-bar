# Liquid Glass Bar — v3.0

An ultra-modern, Glassmorphism-style top status bar for Windows built with Electron.
All windows are pushed below the bar automatically. No emojis — clean SVG icons throughout.

---

## Quick Start

```
1. Extract the zip anywhere you like, e.g. C:\Tools\liquid-glass-bar\
2. Double-click  start.bat          ← installs deps on first run, then launches
   — OR —
   Open a terminal in the folder and run:
      npm install
      npm start
```

> Requires **Node.js 18+**.  Download from https://nodejs.org if needed.
> No Visual Studio, no native build tools, no API keys required.

---

## Auto-Start on Windows Login

Double-click **install-autostart.bat** once.
It drops a launcher into your Windows Startup folder so the bar appears automatically every time you log in.
To remove it: press Win+R, type `shell:startup`, delete `LiquidGlassBar.bat`.

---

## File Structure

```
liquid-glass-bar/
├── start.bat                    ← Double-click to launch
├── install-autostart.bat        ← One-click startup registration
├── package.json
├── main.js                      ← Electron main process
├── preload.js                   ← Secure IPC bridge (contextBridge)
├── config.json                  ← All user settings — edit & save to hot-reload
│
├── assets/
│   └── icons.svg                ← 40+ SVG icon symbols (no emojis anywhere)
│
├── modules/
│   ├── appBar.js                ← Registers bar as Windows AppBar (pushes windows down)
│   ├── volumeControl.js         ← Windows Core Audio API (IAudioEndpointVolume)
│   ├── virtualDesktop.js        ← Registry detection + Win+Ctrl+Arrow switching
│   ├── systemMonitor.js         ← CPU delta + os.mem() for accurate readings
│   ├── batteryMonitor.js        ← Battery level, charge state
│   ├── networkMonitor.js        ← Wi-Fi / Ethernet detection + ping
│   ├── mediaMonitor.js          ← SMTC — all sessions (Spotify, Chrome, YT…)
│   ├── weatherService.js        ← wttr.in (no API key, auto geo-detect)
│   ├── notificationWatcher.js   ← WPN database + PowerShell event fallback
│   ├── configLoader.js          ← Hot-reload config singleton
│   └── trayManager.js           ← System tray icon and context menu
│
└── renderer/
    ├── index.html               ← Bar layout
    ├── style.css                ← Liquid glass styles and animations
    ├── renderer.js              ← All bar UI logic
    ├── settings.html            ← Settings panel layout
    ├── settings.css             ← Settings panel styles
    └── settings.js              ← Settings panel logic (tabs, save, live preview)
```

---

## Features

| Widget | What it does |
|---|---|
| Workspaces | Shows virtual desktops. Click any number to switch. Auto-detects GlazeWM / Komorebi when running; falls back to native Windows registry detection |
| Media Player | Shows currently playing track from Spotify, Chrome (YouTube / Spotify Web), Edge, or any SMTC-registered app |
| Clock | HH:MM:SS + day and date |
| Weather | Live temperature and condition icon via wttr.in — auto-detects location by IP, or set a city in Settings |
| Pomodoro | Left-click to start / pause. Right-click to reset. Switches to break mode automatically. Fires a Dynamic Island notification when each session ends |
| Network | Wi-Fi or Ethernet icon + SSID + colour-coded ping (green < 50ms, yellow < 120ms, red ≥ 120ms) |
| System | CPU %, RAM %, and Volume. Click to open the volume slider panel |
| Uptime | How long Windows has been running |
| Battery | Fill-state icon that changes shape at 75 / 50 / 25 % and shows a bolt when charging |
| Notifications | Dynamic Island — drops down from the bar with a spring animation, progress bar drain, and queuing for multiple notifications |
| Settings | Gear button (far right) or tray icon → Settings. Change accent colour, bar opacity, widget toggles, weather location/unit, and pomodoro durations |

---

## Keyboard Interaction

| Action | How |
|---|---|
| Switch desktop | Click a workspace number in the bar |
| Start/pause Pomodoro | Click the timer widget |
| Reset Pomodoro | Right-click the timer widget |
| Dismiss notification | Click the Dynamic Island |
| Open volume slider | Click the System (CPU/RAM/VOL) widget |
| Open Settings | Click the gear icon, or right-click tray → Settings |

---

## config.json Reference

Edit this file with any text editor. **Save it — the bar hot-reloads automatically.**

```json
{
  "bar": {
    "height":       44,       // px — requires restart
    "opacity":      0.92,     // 0.4 – 1.0
    "accentColor":  "#60c8ff" // any CSS hex colour
  },
  "weather": {
    "location": "auto",       // city name, postcode, or "auto"
    "unit":     "C"           // "C" or "F"
  },
  "pomodoro": {
    "focusMinutes": 25,
    "breakMinutes": 5
  },
  "network": {
    "pingTarget": "8.8.8.8"
  },
  "notifications": {
    "enabled":        true,
    "dismissAfterMs": 5000
  },
  "widgets": {
    "workspaces": true,
    "media":      true,
    "weather":    true,
    "pomodoro":   true,
    "network":    true,
    "system":     true,
    "uptime":     true,
    "battery":    true
  }
}
```

---

## Troubleshooting

| Problem | Solution |
|---|---|
| Bar background is solid black | Enable transparency: Settings → Personalization → Colors → Transparency effects ON |
| Windows still overlap the bar | Run as Administrator on first launch so SHAppBarMessage can register fully. After the first run it works normally |
| Wi-Fi shows as Ethernet | Your adapter may have a non-standard name. Rename it in Control Panel → Network Connections to "Wi-Fi" |
| Media shows "Nothing Playing" | Chrome needs to have played audio at least once this session. Check chrome://settings/content/sound is not blocked |
| Workspaces always show desktop 1 | Normal until you create more desktops with Win+Ctrl+D |
| Workspace click does nothing | The virtual desktop switch uses Win+Ctrl+Arrow key injection — make sure no app has those shortcuts captured |
| Notifications never appear | Settings → Privacy & Security → Notifications → "Allow apps to access notifications" must be ON |
| Volume slider doesn't change sound | The bar uses the Windows master volume via Core Audio. Per-app volume in the mixer is separate |
| Weather shows "--°C" on startup | Normal — wttr.in takes ~2-3 s on first load. Requires internet |
| Settings panel doesn't open | Make sure you ran `npm install` first. Try `npm run dev` to see error logs |

---

## Running in Dev Mode (with logs)

```bash
npm run dev
```

This enables Electron logging so you can see IPC messages, module errors, and network failures in the terminal.
