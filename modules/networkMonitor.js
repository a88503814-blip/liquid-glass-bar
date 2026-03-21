'use strict';
/**
 * Network monitor.
 *
 * PING FIX:
 *   si.inetLatency() spawns a child process that silently times out.
 *   Replaced with a pure Node.js TCP connect to 8.8.8.8:53 (Google DNS).
 *   This is synchronous from JS's perspective, never spawns a process,
 *   and always returns a value (or null if no internet).
 */
const si  = require('systeminformation');
const net = require('net');

const PING_HOST    = '8.8.8.8';
const PING_PORT    = 53;
const PING_TIMEOUT = 3000;

const WIFI_RX = [/wi.fi/i, /wireless/i, /wlan/i, /802\.11/i, /wifi/i];
const ETH_RX  = [/ethernet/i, /realtek/i, /gigabit/i];

function tcpPing() {
  return new Promise(resolve => {
    const t0     = Date.now();
    const socket = new net.Socket();
    let   done   = false;

    const finish = (val) => {
      if (done) return; done = true;
      socket.destroy();
      resolve(val);
    };

    socket.setTimeout(PING_TIMEOUT);
    socket.once('connect', () => finish(Date.now() - t0));
    socket.once('error',   () => finish(null));
    socket.once('timeout', () => finish(null));
    socket.connect(PING_PORT, PING_HOST);
  });
}

function guessWifi(iface) {
  if (iface.type) {
    if (/wireless|wifi/i.test(iface.type))  return true;
    if (/wired|ethernet/i.test(iface.type)) return false;
  }
  const n = `${iface.iface || ''} ${iface.ifaceName || ''}`;
  if (WIFI_RX.some(r => r.test(n))) return true;
  if (ETH_RX.some(r => r.test(n)))  return false;
  if (/^wi.?fi$/i.test(iface.iface))    return true;
  if (/^ethernet$/i.test(iface.iface))  return false;
  return false;
}

class NetworkMonitor {
  constructor() {
    this.interval = null;
    this.last = { connected: false, type: 'unknown', ping: null };
  }

  async getNetwork() {
    try {
      const all    = await si.networkInterfaces();
      const ifaces = (Array.isArray(all) ? all : []).filter(
        i => !i.internal && i.ip4 && i.ip4 !== '0.0.0.0' &&
             (i.operstate === 'up' || i.operstate === 'unknown')
      );

      if (!ifaces.length) {
        return (this.last = { connected: false, type: 'none', ping: null, ssid: null });
      }

      const wifiIface = ifaces.find(guessWifi);
      const active    = wifiIface || ifaces[0];
      const isWifi    = !!wifiIface;

      // TCP ping — always returns a number or null, never hangs
      const ping = await tcpPing();

      let ssid = null;
      if (isWifi) {
        try {
          const wc = await si.wifiConnections();
          if (Array.isArray(wc) && wc.length > 0) ssid = wc[0].ssid || null;
        } catch { /* ignore */ }
        if (!ssid) ssid = active.iface || 'Wi-Fi';
      }

      return (this.last = {
        connected: true,
        type:      isWifi ? 'wifi' : 'ethernet',
        ssid,
        ip:        active.ip4,
        ping,
      });
    } catch {
      return this.last;
    }
  }

  start(cb) {
    this.getNetwork().then(cb);
    // 5s interval — network state doesn't change rapidly
    this.interval = setInterval(() => this.getNetwork().then(cb), 5000);
  }

  stop() { clearInterval(this.interval); }
}

module.exports = NetworkMonitor;
