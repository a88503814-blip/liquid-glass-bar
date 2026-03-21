'use strict';
/**
 * AppBar Native — full SHAppBarMessage lifecycle via koffi.
 *
 * WHAT THIS DOES (per the Windows AppBar spec):
 *   ABM_NEW       — registers the window as an official AppBar
 *   ABM_QUERYPOS  — asks Windows for the approved position rect
 *   ABM_SETPOS    — confirms it; Windows updates work area for all apps
 *   ABM_REMOVE    — unregisters on exit; work area is restored
 *
 * WHY THIS WORKS (and SPI_SETWORKAREA didn't):
 *   SPI_SETWORKAREA just writes a value. Windows can (and does) reset it
 *   whenever a window moves, a DPI change occurs, or Explorer refreshes.
 *   SHAppBarMessage(ABM_SETPOS) tells the shell to MAINTAIN the reservation
 *   permanently until ABM_REMOVE is called.
 *
 * DPI SAFETY:
 *   GetSystemMetrics(SM_CXSCREEN/SM_CYSCREEN) → always physical pixels.
 *   Electron screen.bounds → logical pixels (wrong on 125%+ DPI).
 *   We use GetSystemMetrics everywhere to avoid coordinate mismatches.
 *
 * KOFFI:
 *   Prebuilt binary — no Visual Studio, no node-gyp.
 *   npm install pulls the right .node for your Windows/arch.
 */

const koffi = require('koffi');

// ── Win32 types ───────────────────────────────────────────────────────────────
const RECT_T = koffi.struct('RECT_T', {
  left:   'int32',
  top:    'int32',
  right:  'int32',
  bottom: 'int32',
});

// APPBARDATA — hWnd stored as uintptr (platform-width integer, not a JS pointer)
const APPBARDATA_T = koffi.struct('APPBARDATA_T', {
  cbSize:           'uint32',
  hWnd:             'uintptr',
  uCallbackMessage: 'uint32',
  uEdge:            'uint32',
  rc:               RECT_T,
  lParam:           'intptr',
});

// ── DLL bindings ──────────────────────────────────────────────────────────────
const user32  = koffi.load('user32.dll');
const shell32 = koffi.load('shell32.dll');

const GetSystemMetrics = user32.func('int GetSystemMetrics(int nIndex)');
const SHAppBarMessage  = shell32.func(
  'uintptr SHAppBarMessage(uint32 dwMessage, _Inout_ APPBARDATA_T *pData)'
);

// ── Constants ─────────────────────────────────────────────────────────────────
const SM_CXSCREEN = 0;
const SM_CYSCREEN = 1;
const ABM_NEW      = 0;
const ABM_REMOVE   = 1;
const ABM_QUERYPOS = 2;
const ABM_SETPOS   = 3;
const ABE_TOP      = 1;
const WM_APP_CB    = 0xC0A0; // arbitrary callback message in WM_APP range

const BAR_H_LOGICAL = 44; // Electron window height in logical pixels

// ── Module state ──────────────────────────────────────────────────────────────
let _hwnd        = 0n;
let _registered  = false;
let _physBarH    = BAR_H_LOGICAL; // overwritten with DPI-correct value on register()

function readHwnd(buf) {
  try {
    return process.arch === 'x64'
      ? buf.readBigInt64LE(0)
      : BigInt(buf.readInt32LE(0));
  } catch { return 0n; }
}

/**
 * physBarH(scaleFactor)
 * Converts the logical bar height to physical pixels.
 * Electron uses logical pixels for window dimensions.
 * Win32 SHAppBarMessage requires physical pixels.
 *
 * Example at 125% DPI (scaleFactor=1.25):
 *   logical 44px → physical 44 * 1.25 = 55px
 *   We must reserve 55 physical px or Chrome will overlap the bottom 11px.
 *
 * We also add 1 extra physical pixel as a safety buffer to prevent
 * the 1px overlap that can occur at non-integer scale factors.
 */
function physBarH(scale) {
  return Math.ceil(BAR_H_LOGICAL * (scale || 1)) + 1;
}

function makeData(hwnd, physH) {
  const w = GetSystemMetrics(SM_CXSCREEN);
  return {
    cbSize:           koffi.sizeof(APPBARDATA_T),
    hWnd:             Number(hwnd),
    uCallbackMessage: WM_APP_CB,
    uEdge:            ABE_TOP,
    rc:               { left:0, top:0, right:w, bottom:physH },
    lParam:           0,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────
/**
 * register(hwndBuffer, scaleFactor)
 * scaleFactor comes from Electron's screen.getPrimaryDisplay().scaleFactor
 * This is the key DPI value — e.g. 1.0 at 100%, 1.25 at 125%, 1.5 at 150%.
 */
function register(hwndBuffer, scaleFactor) {
  _hwnd = readHwnd(hwndBuffer);
  if (!_hwnd) { console.error('[AppBar] invalid HWND'); return false; }

  _physBarH = physBarH(scaleFactor);
  const w   = GetSystemMetrics(SM_CXSCREEN);
  const h   = GetSystemMetrics(SM_CYSCREEN);

  console.log(`[AppBar] screen=${w}x${h} physical | scale=${scaleFactor} | logical=${BAR_H_LOGICAL}px | physical reserved=${_physBarH}px`);

  let data = makeData(_hwnd, _physBarH);

  SHAppBarMessage(ABM_NEW, data);

  data.uEdge     = ABE_TOP;
  data.rc        = { left:0, top:0, right:w, bottom:_physBarH };
  SHAppBarMessage(ABM_QUERYPOS, data);

  data.rc.bottom = _physBarH; // re-enforce after QUERYPOS may have adjusted it
  SHAppBarMessage(ABM_SETPOS, data);

  _registered = true;
  console.log('[AppBar] registered — work area locked');
  return true;
}

/**
 * reapply(scaleFactor)
 * Re-runs ABM_QUERYPOS + ABM_SETPOS — call on WM_DISPLAYCHANGE.
 */
function reapply(scaleFactor) {
  if (!_registered || !_hwnd) return;
  if (scaleFactor) _physBarH = physBarH(scaleFactor);
  const w = GetSystemMetrics(SM_CXSCREEN);
  const h = GetSystemMetrics(SM_CYSCREEN);
  let data = makeData(_hwnd, _physBarH);
  data.rc = { left:0, top:0, right:w, bottom:_physBarH };
  SHAppBarMessage(ABM_QUERYPOS, data);
  data.rc.bottom = _physBarH;
  SHAppBarMessage(ABM_SETPOS, data);
  console.log(`[AppBar] re-applied ${w}x${h} physBarH=${_physBarH}`);
}

/**
 * unregister()
 * MUST be called before app quits — restores the system work area.
 */
function unregister() {
  if (!_registered || !_hwnd) return;
  const data = makeData(_hwnd, _physBarH);
  SHAppBarMessage(ABM_REMOVE, data);
  _registered = false;
  console.log('[AppBar] unregistered — work area restored');
}

module.exports = { register, reapply, unregister };
