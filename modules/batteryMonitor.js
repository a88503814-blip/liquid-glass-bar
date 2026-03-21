'use strict';
const si = require('systeminformation');

class BatteryMonitor {
  constructor() { this.interval = null; }

  async getBattery() {
    try {
      const b = await si.battery();
      return {
        hasBattery:    b.hasBattery,
        percent:       b.percent,
        isCharging:    b.isCharging,
        acConnected:   b.acConnected,
        timeRemaining: b.timeRemaining,
      };
    } catch {
      return { hasBattery: false, percent: 100, isCharging: false, acConnected: true, timeRemaining: -1 };
    }
  }

  start(cb) {
    this.getBattery().then(cb);
    this.interval = setInterval(() => this.getBattery().then(cb), 15000);
  }
  stop() { clearInterval(this.interval); }
}

module.exports = BatteryMonitor;
