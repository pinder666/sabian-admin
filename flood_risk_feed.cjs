// flood_risk_feed.cjs
// Flood Risk Signal — river flood forecasts and discharge anomalies
// Source: Copernicus GloFAS (Global Flood Awareness System) — free EU service
// Score 0–100: higher = higher probability of imminent or active flooding
// Logic: GloFAS issues flood alerts when river discharge exceeds return period thresholds.
//   Alert levels: Advisory (2-yr return), Watch (5-yr), Warning (20-yr)
//   Flooding is a major displacement and food crisis trigger in Bangladesh, Pakistan,
//   Nigeria, Mozambique, DRC, Ethiopia, India, China, and other river-basin countries.
// Cadence: 24h — GloFAS updates daily with 30-day ensemble forecasts

require('dotenv').config({ path: './.env' });
const https = require('https');
const { logToHive } = require('./logger.cjs');

// Country bounding boxes for GloFAS spatial queries [minLon, minLat, maxLon, maxLat]
const GLOFAS_BBOX = {
  'Afghanistan':   [60.5, 29.4, 74.9, 38.5],
  'Angola':        [11.7, -18.1, 24.1, -4.4],
  'Argentina':     [-73.6, -55.1, -53.6, -21.8],
  'Bangladesh':    [88.0, 20.7, 92.7, 26.6],
  'Bolivia':       [-69.7, -22.9, -57.5, -9.7],
  'Brazil':        [-73.6, -33.8, -28.8, 5.3],
  'Burkina Faso':  [-5.5, 9.4, 2.4, 15.1],
  'Burundi':       [29.0, -4.5, 30.9, -2.3],
  'Cambodia':      [102.3, 10.4, 107.6, 14.7],
  'Cameroon':      [8.5, 1.7, 16.2, 13.1],
  'CAR':           [14.4, 2.2, 27.5, 11.0],
  'Chad':          [13.5, 7.4, 24.0, 23.5],
  'China':         [73.5, 18.2, 134.8, 53.6],
  'Colombia':      [-79.0, -4.2, -66.9, 12.5],
  'DRC':           [12.2, -13.5, 31.3, 5.4],
  'Ecuador':       [-92.3, -5.5, -75.2, 2.0],
  'Ethiopia':      [33.0, 3.4, 47.9, 15.0],
  'Ghana':         [-3.3, 4.7, 1.2, 11.2],
  'Guatemala':     [-92.3, 13.7, -88.2, 17.8],
  'Haiti':         [-74.5, 18.0, -71.6, 20.1],
  'Honduras':      [-89.4, 13.0, -83.1, 16.5],
  'India':         [68.1, 6.7, 97.4, 35.5],
  'Indonesia':     [95.0, -11.0, 141.0, 5.9],
  'Iraq':          [38.8, 29.1, 48.6, 37.4],
  'Ivory Coast':   [-8.5, 4.3, -2.5, 10.7],
  'Kenya':         [33.9, -4.7, 41.9, 5.0],
  'Laos':          [100.1, 13.9, 107.6, 22.5],
  'Liberia':       [-11.5, 4.1, -7.4, 8.6],
  'Libya':         [9.3, 19.5, 25.2, 33.2],
  'Malawi':        [32.7, -17.1, 35.9, -9.4],
  'Mali':          [-4.2, 10.2, 4.3, 25.0],
  'Mexico':        [-117.1, 14.5, -86.7, 32.7],
  'Moldova':       [26.6, 45.5, 30.1, 48.5],
  'Mozambique':    [30.2, -26.9, 40.8, -10.5],
  'Myanmar':       [92.2, 9.8, 101.2, 28.5],
  'Nepal':         [80.1, 26.4, 88.2, 30.4],
  'Nicaragua':     [-87.7, 10.7, -83.2, 15.0],
  'Niger':         [0.2, 11.7, 15.9, 23.5],
  'Nigeria':       [2.7, 4.3, 14.7, 13.9],
  'Pakistan':      [60.9, 23.7, 77.1, 37.1],
  'Peru':          [-81.4, -18.4, -68.7, 0.0],
  'Philippines':   [116.9, 5.6, 126.5, 20.0],
  'Romania':       [20.3, 43.6, 30.0, 48.3],
  'Russia':        [19.6, 41.2, 180.0, 77.7],
  'Senegal':       [-17.5, 12.3, -11.4, 15.0],
  'Sierra Leone':  [-13.3, 6.9, -10.3, 9.5],
  'Somalia':       [40.5, -2.0, 51.5, 12.0],
  'South Sudan':   [23.4, 3.5, 35.9, 12.2],
  'Sri Lanka':     [79.5, 5.9, 82.0, 9.8],
  'Sudan':         [21.9, 8.7, 38.6, 22.2],
  'Tanzania':      [29.3, -11.7, 40.4, -0.9],
  'Thailand':      [97.3, 5.6, 105.6, 20.5],
  'Timor-Leste':   [124.0, -9.5, 127.3, -8.1],
  'Uganda':        [29.6, -1.5, 35.0, 4.2],
  'Ukraine':       [22.1, 44.4, 40.1, 52.4],
  'Venezuela':     [-73.5, 0.7, -59.8, 12.2],
  'Vietnam':       [102.1, 8.5, 109.5, 23.4],
  'Zambia':        [22.0, -18.1, 33.7, -8.2],
  'Zimbabwe':      [25.2, -22.4, 33.1, -15.6],
  'Kazakhstan':    [50.3, 40.6, 87.4, 55.4],
  'Uzbekistan':    [56.0, 37.2, 73.1, 45.6],
  'Tajikistan':    [67.4, 36.7, 75.1, 41.0],
  'Bolivia':       [-69.7, -22.9, -57.5, -9.7],
  'Paraguay':      [-62.7, -27.5, -54.3, -19.3],
  'Uruguay':       [-58.4, -35.0, -53.1, -30.1]
};

function fetchGloFasAlerts(bbox) {
  return new Promise((resolve) => {
    const [minX, minY, maxX, maxY] = bbox;
    const params = new URLSearchParams({
      bbox:        `${minX},${minY},${maxX},${maxY}`,
      alert_level: 'Advisory',
      format:      'json'
    });
    const url = `https://globalfloods.eu/glofas-forecasting/api/v1/flood-alerts/?${params.toString()}`;
    https.get(url, { headers: { 'User-Agent': 'SabianIntelligence/3.0' }, timeout: 15000 }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { resolve(null); }
      });
    }).on('error', () => resolve(null)).on('timeout', () => resolve(null));
  });
}

async function fetchFloodRiskData(country) {
  try {
    const bbox = GLOFAS_BBOX[country];
    if (!bbox) return { score: 5, reason: 'no_river_basin_data', trend: 'stable' };

    const data = await fetchGloFasAlerts(bbox);

    if (!data || !Array.isArray(data)) {
      // GloFAS endpoint may vary — return low base score on no data
      return { score: 5, reason: 'no_glofas_response', trend: 'stable' };
    }

    if (data.length === 0) {
      return { score: 5, alert_count: 0, trend: 'normal' };
    }

    const warnings  = data.filter(a => (a.alert_level || a.level || '').toLowerCase().includes('warning'));
    const watches   = data.filter(a => (a.alert_level || a.level || '').toLowerCase().includes('watch'));
    const advisories = data.filter(a => (a.alert_level || a.level || '').toLowerCase().includes('advisory'));

    // Warning = 20-yr return period event, Watch = 5-yr, Advisory = 2-yr
    const score = Math.min(100,
      warnings.length   * 35 +
      watches.length    * 20 +
      advisories.length * 10
    );

    return {
      score: Math.max(5, score),
      warning_count:  warnings.length,
      watch_count:    watches.length,
      advisory_count: advisories.length,
      total_alerts:   data.length,
      trend: warnings.length > 0 ? 'flood_warning' : watches.length > 0 ? 'flood_watch' : 'advisory'
    };

  } catch (err) {
    logToHive({ source: 'flood_risk_feed', level: 'warn', event: 'fetch_error', data: { country, error: err.message } });
    return { score: null, reason: 'fetch_error', error: err.message };
  }
}

module.exports = { fetchFloodRiskData };
