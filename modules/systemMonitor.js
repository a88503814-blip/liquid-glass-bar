'use strict';
/**
 * SystemMonitor — os.cpus() delta with startup-spike rejection.
 *
 * WHY os.cpus() AND NOT GetSystemTimes:
 *   koffi's _Out_ struct-pointer parameters don't work reliably
 *   on all Windows 10/11 configurations — returns zeroed structs
 *   on some machines, causing math to show 100%.
 *
 *   os.cpus() is a Node.js built-in that calls GetSystemInfo
 *   internally and is battle-tested. We do the same idle/total
 *   delta math but with proper spike filtering.
 *
 * STARTUP-SPIKE FIX:
 *   Electron startup saturates the CPU for 3-5 seconds.
 *   Strategy: take baseline at t=0, first real reading at t=3s.
 *   Any reading > 90% in the first 5 readings is suspect —
 *   but instead of discarding it, we run a "confirm" check:
 *   if the NEXT reading is also high, it's real. If it drops,
 *   the first was a spike and we use the lower value.
 */
const os = require('os');

class SystemMonitor {
  constructor() {
    this.interval   = null;
    this.prevIdle   = 0;
    this.prevTotal  = 0;
    this.baselineSet = false;
    this.readCount  = 0;
    this.pending    = null; // held high reading waiting for confirmation
  }

  _snap() {
    const cpus = os.cpus();
    let idle = 0, total = 0;
    for (const c of cpus) {
      for (const v of Object.values(c.times)) total += v;
      idle += c.times.idle;
    }
    return { idle, total };
  }

  _delta() {
    const { idle, total } = this._snap();
    if (!this.baselineSet) {
      this.prevIdle = idle; this.prevTotal = total;
      this.baselineSet = true;
      return null;
    }
    const dIdle  = idle  - this.prevIdle;
    const dTotal = total - this.prevTotal;
    this.prevIdle  = idle;
    this.prevTotal = total;
    if (dTotal === 0) return 0;
    return Math.max(0, Math.min(100, Math.round(100 * (1 - dIdle / dTotal))));
  }

  _fmtUp(sec) {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  _ram() {
    const tot = os.totalmem(), used = tot - os.freemem();
    return {
      ramPercent: Math.round(used / tot * 100),
      ramUsedGB:  (used / 1073741824).toFixed(1),
      ramTotalGB: (tot  / 1073741824).toFixed(1),
      uptime:     this._fmtUp(os.uptime()),
    };
  }

  start(cb) {
    // Send RAM immediately — it's always accurate
    cb({ cpu: null, ...this._ram() });

    // Establish baseline at t=0 (captures Electron startup noise)
    this._delta(); // sets prevIdle / prevTotal

    // First real reading at t=3s (clean 3-second window)
    setTimeout(() => {
      const raw = this._delta();
      this.readCount = 1;

      // Hold suspicious high readings and confirm on next tick
      if (raw !== null && raw > 85) {
        this.pending = raw;
        cb({ cpu: null, ...this._ram() }); // show -- while confirming
      } else if (raw !== null) {
        cb({ cpu: raw, ...this._ram() });
      }

      // Regular 2s readings
      this.interval = setInterval(() => {
        const r = this._delta();
        this.readCount++;

        if (this.pending !== null) {
          // If still high → it's real (real high load). If dropped → was spike.
          const confirmed = r !== null && r > 50 ? this.pending : r;
          this.pending = null;
          cb({ cpu: confirmed, ...this._ram() });
          return;
        }

        cb({ cpu: r, ...this._ram() });
      }, 2000);
    }, 3000);
  }

  stop() { clearInterval(this.interval); }
}

module.exports = SystemMonitor;
