# How to Build Liquid Glass Bar as a Windows App

This guide shows you how to turn the project into a proper Windows installer (.exe).

---

## Prerequisites

Install these **once** on your Windows machine:

1. **Node.js 18+** — https://nodejs.org
2. **Git** (optional) — https://git-scm.com

---

## Step 1 — Install all dependencies

Open a terminal in the `liquid-glass-bar` folder and run:

```bash
npm install
```

This installs Electron, electron-builder, koffi, sql.js, and all other dependencies.

---

## Step 2 — Test it first

Make sure everything works before building:

```bash
npm start
```

The bar should appear at the top of your screen.

---

## Step 3 — Build the installer

```bash
npm run build:win
```

This creates two files in a new `dist/` folder:

| File | Description |
|---|---|
| `Liquid Glass Bar Setup 1.0.0.exe` | **NSIS installer** — recommended. Has install/uninstall, creates shortcuts, adds to startup |
| `LiquidGlassBar-portable.exe` | **Portable** — single .exe, no installation needed. Just double-click to run |

The build takes 2-5 minutes on first run (it downloads Electron binaries).

---

## Step 4 — Install it

Double-click `Liquid Glass Bar Setup 1.0.0.exe` and follow the installer.

It will:
- Install to `C:\Program Files\Liquid Glass Bar\` (or wherever you choose)
- Add a desktop shortcut
- Add a Start Menu shortcut
- **Automatically add itself to Windows startup** so it runs on every login

---

## What the installer does silently

The `installer.nsh` script adds this registry key after install:

```
HKCU\Software\Microsoft\Windows\CurrentVersion\Run
  LiquidGlassBar = "C:\...\Liquid Glass Bar.exe"
```

On uninstall, that key is removed and your startup is clean again.

---

## Build outputs

```
liquid-glass-bar/
└── dist/
    ├── Liquid Glass Bar Setup 1.0.0.exe   ← Share this with others
    ├── LiquidGlassBar-portable.exe         ← Or this for no-install version
    └── win-unpacked/                       ← Unpacked app folder (for testing)
```

---

## Troubleshooting

| Error | Fix |
|---|---|
| `Cannot find module 'electron-builder'` | Run `npm install` again |
| `icon.ico not found` | It's already in `assets/icon.ico`. If missing, run `npm start` once to regenerate |
| Build hangs downloading Electron | Normal on first run — it's downloading ~100MB. Wait for it |
| `error NSIS` | Install NSIS from https://nsis.sourceforge.io or use `npm run build:dir` instead |

---

## Quick portable build (no NSIS needed)

If you don't want an installer, just build the portable version:

```bash
npm run build:dir
```

This creates `dist/win-unpacked/Liquid Glass Bar.exe` — copy that folder anywhere and run it.
