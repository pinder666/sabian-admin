// gps_jamming_feed.cjs
// GPS Jamming / Navigation Warfare Signal — gpsjam.org daily hexgrid data
// Source: gpsjam.org (John Wiseman) — public data, no auth required
// Data: H3 resolution-4 hexagons with daily GPS interference probability 0–1
// Freshness: previous-day data available ~0800 UTC
//
// Dependency: h3-js (optional npm package)
//   Install once: npm install h3-js
//   Without h3-js: all scores return null and weight redistributes cleanly
//
// EULA: no restrictions — public data, free use

require('dotenv').config({ path: './.env' });
const https = require('https');
const { logToHive } = require('./logger.cjs');

// Soft dependency — null if h3-js not installed
let h3;
try {
  h3 = require('h3-js');
  // Detect h3-js API version (v3 vs v4 changed function names)
  if (typeof h3.latLngToCell !== 'function' && typeof h3.geoToH3 === 'function') {
    // v3 shim — normalise to v4 API names
    h3.latLngToCell = (lat, lng, res) => h3.geoToH3(lat, lng, res);
    h3.gridDisk     = (cell, k)       => h3.kRing(cell, k);
  }
} catch (_) { /* not installed */ }

// Rings of H3 cells to sample around country center
// ring=2 → 19 cells, covers ~200km radius at resolution 4
const SAMPLE_RINGS = 2;

// In-process cache: one date → data object per process run
const _cache = {};

// ── Fetch daily hex data from gpsjam.org ───────────────────────────────────────
// Falls back up to 3 previous days if latest not available

async function fetchDailyHexData(date) {
  const dateStr = date
    ? date.slice(0, 10)
    : (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })();

  if (_cache[dateStr]) return _cache[dateStr];

  const data = await _fetchWithFallback(dateStr, 0);
  _cache[dateStr] = data;
  return data;
}

function _fetchWithFallback(dateStr, depth) {
  if (depth > 3) throw new Error('GPSJam: no data found for the last 4 days');

  return new Promise((resolve, reject) => {
    const url = `https://gpsjam.org/data/${dateStr}.json`;
    const req = https.get(url, { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode === 404) {
        const prev = new Date(dateStr);
        prev.setDate(prev.getDate() - 1);
        resolve(_fetchWithFallback(prev.toISOString().slice(0, 10), depth + 1));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`GPSJam HTTP ${res.statusCode}`));
        return;
      }
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          // Normalise: gpsjam may return { h3_index: prob } flat or { cells: { h3_index: prob } }
          resolve(parsed.cells || parsed);
        } catch (e) {
          reject(new Error(`GPSJam JSON parse: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(45000, () => { req.destroy(); reject(new Error('GPSJam fetch timeout')); });
  });
}

// ── Main export: score GPS jamming for a lat/lon center ───────────────────────
// lat, lon: country center coordinates
// date:     ISO date string or null (defaults to yesterday)

async function fetchGpsJammingData(lat, lon, date) {
  if (!h3) {
    return {
      gps_jamming_score: null,
      warning: 'h3-js not installed — run: npm install h3-js',
      source: 'GPSJam'
    };
  }

  try {
    const hexData = await fetchDailyHexData(date);

    if (!hexData || typeof hexData !== 'object') {
      return { gps_jamming_score: null, warning: 'GPSJam: empty or invalid response', source: 'GPSJam' };
    }

    const centerCell  = h3.latLngToCell(lat, lon, 4);
    const sampleCells = h3.gridDisk(centerCell, SAMPLE_RINGS);

    const found = [];
    for (const cell of sampleCells) {
      const prob = hexData[cell];
      if (prob !== undefined && prob !== null) {
        found.push(parseFloat(prob));
      }
    }

    if (!found.length) {
      return {
        gps_jamming_score: null,
        warning: `GPSJam: no data cells near (${lat.toFixed(2)}, ${lon.toFixed(2)}) — ${sampleCells.length} checked`,
        source: 'GPSJam'
      };
    }

    const avg  = found.reduce((s, v) => s + v, 0) / found.length;
    const peak = Math.max(...found);

    // Weight toward peak — burst jamming signals matter more than background average
    const rawScore = (avg * 0.35 + peak * 0.65) * 100;
    const score    = Math.round(Math.min(100, rawScore));

    logToHive({
      source: 'gps_jamming_feed',
      level: 'intel',
      event: 'gps_scored',
      data: { lat, lon, date, score, avg_prob: avg.toFixed(3), peak_prob: peak.toFixed(3), cells: found.length },
      tags: ['gps', 'jamming']
    });

    return {
      gps_jamming_score: score,
      avg_probability:   parseFloat(avg.toFixed(3)),
      peak_probability:  parseFloat(peak.toFixed(3)),
      cells_found:       found.length,
      cells_checked:     sampleCells.length,
      trend: peak > 0.7 ? 'severe' : peak > 0.4 ? 'elevated' : peak > 0.2 ? 'detectable' : 'minimal',
      source: 'GPSJam',
      fetched_at: new Date().toISOString()
    };

  } catch (err) {
    logToHive({
      source: 'gps_jamming_feed',
      level: 'error',
      event: 'fetch_failed',
      data: { lat, lon, date, message: err.message },
      tags: ['gps', 'error']
    });
    return { gps_jamming_score: null, error: err.message, source: 'GPSJam' };
  }
}

module.exports = { fetchGpsJammingData };

// Standalone test: node gps_jamming_feed.cjs Ukraine
if (require.main === module) {
  const COORDS = {
    'Ukraine': { lat: 48.3794, lon:  31.1656 },
    'Russia':  { lat: 61.5240, lon: 105.3188 },
    'Israel':  { lat: 31.5000, lon:  34.8000 },
    'Lebanon': { lat: 33.8547, lon:  35.8623 },
    'Mali':    { lat: 17.5707, lon:  -3.9962 }
  };
  const country = process.argv[2] || 'Ukraine';
  const coords  = COORDS[country] || { lat: 48.38, lon: 31.17 };
  const date    = process.argv[3] || null;
  console.log(`\nGPS Jamming — ${country} (${coords.lat}, ${coords.lon})...\n`);
  fetchGpsJammingData(coords.lat, coords.lon, date).then(r => {
    console.log(JSON.stringify(r, null, 2));
  }).catch(console.error);
}
