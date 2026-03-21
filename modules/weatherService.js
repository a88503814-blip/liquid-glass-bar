'use strict';
const https  = require('https');
const config = require('./configLoader');

class WeatherService {
  constructor() {
    this.interval = null;
    this.cached   = { temp: '--', feelsLike: '--', code: 116, desc: 'Loading…', humidity: 0 };
  }

  _buildPath() {
    const cfg = config.get().weather;
    const loc  = (!cfg.location || cfg.location === 'auto') ? '' : encodeURIComponent(cfg.location);
    return `/${loc}?format=j1`;
  }

  _convert(tempC) {
    const cfg = config.get().weather;
    if (cfg.unit === 'F') return Math.round(tempC * 9 / 5 + 32);
    return tempC;
  }

  _unit() {
    return (config.get().weather.unit === 'F') ? '°F' : '°C';
  }

  fetchWeather() {
    return new Promise(resolve => {
      const req = https.request(
        { hostname: 'wttr.in', path: this._buildPath(), method: 'GET',
          headers: { 'User-Agent': 'curl/7.68', Accept: 'application/json' },
          timeout: 8000 },
        res => {
          let raw = '';
          res.on('data', c => raw += c);
          res.on('end', () => {
            try {
              const j = JSON.parse(raw);
              const c = j.current_condition[0];
              const tempC = parseInt(c.temp_C);
              this.cached = {
                temp:      `${this._convert(tempC)}${this._unit()}`,
                feelsLike: `${this._convert(parseInt(c.FeelsLikeC))}${this._unit()}`,
                code:      parseInt(c.weatherCode),
                desc:      c.weatherDesc[0].value,
                humidity:  parseInt(c.humidity),
              };
              resolve(this.cached);
            } catch { resolve(this.cached); }
          });
        }
      );
      req.on('error',   () => resolve(this.cached));
      req.on('timeout', () => { req.destroy(); resolve(this.cached); });
      req.end();
    });
  }

  start(cb) {
    this.fetchWeather().then(cb);
    this.interval = setInterval(() => this.fetchWeather().then(cb), 600_000);
  }
  stop() { clearInterval(this.interval); }
}

module.exports = WeatherService;
