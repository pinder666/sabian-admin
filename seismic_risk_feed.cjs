// seismic_risk_feed.cjs
// USGS Earthquake API — seismic events as infrastructure collapse / instability signal
// High-magnitude events near population centers = acute destabilization risk
// Free, no key, real-time (USGS updates every 5 minutes)
// Follows convergence_engine.cjs signal pattern

require('dotenv').config({ path: './.env' });
const https = require('https');
const { logToHive } = require('./logger.cjs');

// Bounding boxes for each country [minLon, minLat, maxLon, maxLat]
const COUNTRY_BBOX = {
  'Sudan':       [21.8, 8.7,  38.6, 22.2],
  'Ethiopia':    [33.0, 3.4,  47.9, 15.0],
  'Somalia':     [40.9, -1.7, 51.4, 11.9],
  'Djibouti':    [41.7, 10.9, 43.4, 12.7],
  'Eritrea':     [36.4, 12.4, 43.1, 18.0],
  'DRC':         [12.2, -13.5,31.3,  5.4],
  'Rwanda':      [28.9, -2.8, 30.9,  -1.0],
  'Mozambique':  [30.2, -26.9,40.8, -10.5],
  'Tanzania':    [29.3, -11.7,40.4,  -1.0],
  'Kenya':       [33.9, -4.7, 41.9,   5.0],
  'Uganda':      [29.5, -1.5, 35.0,   4.2],
  'Afghanistan': [60.5, 29.4, 74.9,  38.5],
  'Pakistan':    [60.9, 23.7, 77.8,  37.1],
  'Iran':        [44.0, 25.1, 63.3,  39.8],
  'Iraq':        [38.8, 29.1, 48.6,  37.4],
  'Turkey':      [26.0, 35.9, 44.8,  42.1],
  'Syria':       [35.7, 32.3, 42.4,  37.3],
  'Lebanon':     [35.1, 33.0, 36.6,  34.7],
  'Armenia':     [43.4, 38.8, 46.6,  41.3],
  'Georgia':     [40.0, 41.0, 46.7,  43.6],
  'Myanmar':     [92.2, 9.8,  101.2, 28.5],
  'Bangladesh':  [88.0, 20.6, 92.7,  26.7],
  'Nepal':       [80.1, 26.4, 88.2,  30.4],
  'Haiti':       [-74.5,17.9, -71.6, 20.1],
  'Ecuador':     [-81.0,-5.1, -75.2,  1.4],
  'Colombia':    [-77.9, -4.2,-66.9, 12.5],
  'Venezuela':   [-73.4,  0.6,-59.8, 12.2],
  'Ukraine':     [22.1, 44.4, 40.2,  52.4],
  'Israel':      [34.2, 29.5, 35.9,  33.4],
  'Palestine':   [34.2, 31.2, 35.6,  32.6],
  'Yemen':       [42.5, 11.9, 54.5,  19.0],
  'Libya':       [9.3,  19.5, 25.2,  33.2],
  'Mali':        [-4.2, 10.1, 4.3,   25.0],
  'Niger':       [0.2,  11.7, 15.9,  23.5],
  'Nigeria':     [2.7,  4.2,  14.7,  13.9],
  'CAR':         [14.4,  2.2, 27.5,  11.0],
  'Chad':        [13.5,  7.4, 24.0,  23.5],
  'Burkina Faso':[-5.5, 9.4,  2.4,   15.1],
  'South Sudan': [23.4,  3.5, 35.9,  12.2],
  'Zimbabwe':    [25.2, -22.4,33.1, -15.6],
  'Zambia':      [21.9, -18.1,33.7,  -8.2],
  'Sri Lanka':   [79.7,  5.9, 81.9,   9.9],
  'Bosnia':      [15.7, 42.6, 19.6,  45.3],
  'Kosovo':      [20.0, 41.9, 21.8,  43.3],
  'Taiwan':      [119.9,21.9, 122.0, 25.4],
  'North Korea': [124.3,37.7, 130.7, 42.7],
  // INDOPACOM — high seismic activity
  'Philippines': [116.9, 4.6,  126.6, 20.5],
  'Indonesia':   [95.0, -11.0, 141.0,  6.0],
  'Japan':       [129.5, 30.0, 146.0,  45.6],
  'South Korea': [124.6, 33.1, 130.9,  38.6],
  'Papua New Guinea': [140.8,-11.7,156.0, -1.3],
  'Solomon Islands':  [155.5,-12.3,167.0, -5.1],
  'Vanuatu':     [166.5,-20.3, 170.2, -13.1],
  'New Zealand': [165.9,-47.3, 178.6, -34.3],
  'Timor-Leste': [124.0, -9.5, 127.3,  -8.1],
  'India':       [68.1,  6.7,  97.4,   37.1],
  'Nepal':       [80.1, 26.4,  88.2,   30.4],
  'Vietnam':     [102.1,  8.4, 109.5,  23.4],
  'Mongolia':    [87.7,  41.5, 119.9,  52.1],
  'China':       [73.5,  18.2, 134.8,  53.6],
  'Thailand':    [97.3,   5.6, 105.7,  20.5],
  'Cambodia':    [102.3, 10.4, 107.6,  14.7],
  'Malaysia':    [99.6,   0.8, 119.3,   7.4],
  // SOUTHCOM — Andes / Caribbean seismic belt
  'Peru':        [-81.4,-18.4, -68.7,  -0.0],
  'Chile':       [-75.6,-55.9, -66.1, -17.5],
  'Bolivia':     [-69.6,-22.9, -57.5,  -9.7],
  'Argentina':   [-73.6,-55.1, -53.6, -21.8],
  'Guatemala':   [-92.2, 13.7, -88.2,  17.8],
  'El Salvador': [-90.2, 13.1, -87.7,  14.5],
  'Nicaragua':   [-87.7, 10.7, -83.2,  15.0],
  'Costa Rica':  [-85.9,  8.0, -82.6,  11.2],
  'Panama':      [-83.1,  7.2, -77.2,   9.7],
  'Mexico':      [-118.5,14.5, -86.7,  32.7],
  'Cuba':        [-84.9, 19.8, -74.1,  23.3],
  'Trinidad and Tobago': [-61.9, 10.0, -60.5, 11.3],
  // CENTCOM — Arabian plate
  'Saudi Arabia':  [34.6, 16.4, 55.7, 32.2],
  'Jordan':        [34.9, 29.2, 39.3, 33.4],
  'Turkey':        [26.0, 35.9, 44.8, 42.1],
  'UAE':           [51.6, 22.6, 56.4, 26.1],
  'Oman':          [51.9, 16.6, 59.8, 26.4],
  'Azerbaijan':    [44.8, 38.3, 50.4, 41.9],
  'Kyrgyzstan':    [69.2, 39.2, 80.3, 43.2],
  'Tajikistan':    [67.4, 36.7, 75.1, 41.1],
  'Kazakhstan':    [50.3, 40.6, 87.3, 55.4],
  'Uzbekistan':    [55.9, 37.2, 73.2, 45.6],
  // EUCOM — seismically relevant
  'Greece':        [19.4, 34.8, 28.3, 41.8],
  'Italy':         [6.6,  36.6, 18.8, 47.1],
  'Romania':       [20.3, 43.7, 29.7, 48.3],
  'Bulgaria':      [22.4, 41.2, 28.6, 44.2],
  'Cyprus':        [32.3, 34.6, 34.6, 35.7],
  'Russia':        [19.6, 41.2,190.0, 81.9],
  'North Macedonia':[20.5,40.8, 23.0, 42.4],
  'Albania':       [19.3, 39.6, 21.1, 42.7],
  'Serbia':        [18.9, 42.2, 23.0, 46.2],
  'Montenegro':    [18.5, 41.9, 20.4, 43.6],
  'Portugal':      [-9.5, 36.9, -6.2, 42.2],
  'Spain':         [-9.3, 35.2,  4.4, 44.0]
};

const LOOKBACK_DAYS = 90;
const MIN_MAGNITUDE = 4.5; // Only significant events

async function fetchSeismicRisk(country, date) {
  const bbox = COUNTRY_BBOX[country];
  if (!bbox) {
    return { source: 'USGS', country, conflict_score: null, warning: `No bounding box for ${country}` };
  }

  const endDate = date ? new Date(date) : new Date();
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - LOOKBACK_DAYS);

  const startStr = startDate.toISOString().slice(0, 10);
  const endStr   = endDate.toISOString().slice(0, 10);

  const [minLon, minLat, maxLon, maxLat] = bbox;
  const path = `/fdsnws/event/1/query?format=geojson&starttime=${startStr}&endtime=${endStr}&minmagnitude=${MIN_MAGNITUDE}&minlongitude=${minLon}&minlatitude=${minLat}&maxlongitude=${maxLon}&maxlatitude=${maxLat}&orderby=magnitude`;

  try {
    const raw = await fetchJson('earthquake.usgs.gov', path);
    const events = raw?.features || [];

    if (!events.length) {
      return {
        source: 'USGS',
        country,
        conflict_score: 0,
        event_count: 0,
        max_magnitude: null,
        trend: 'no significant seismic activity',
        period: `${startStr} to ${endStr}`
      };
    }

    const magnitudes = events.map(e => e.properties?.mag || 0);
    const maxMag = Math.max(...magnitudes);
    const eventCount = events.length;

    // Count major events
    const m7plus = magnitudes.filter(m => m >= 7.0).length;
    const m6plus = magnitudes.filter(m => m >= 6.0).length;
    const m5plus = magnitudes.filter(m => m >= 5.0).length;

    // Score: magnitude-weighted
    // M7+ = acute infrastructure collapse risk
    // M6+ = significant damage possible
    // M5+ = minor damage, heightens tension
    let score = 0;
    score += m7plus * 40;
    score += m6plus * 20;
    score += m5plus * 5;
    score = Math.min(100, score);

    // Recent acceleration: more events in last 30 days vs prior 60?
    const thirtyDaysAgo = new Date(endDate);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentCount = events.filter(e => new Date(e.properties?.time) >= thirtyDaysAgo).length;
    const priorCount = eventCount - recentCount;
    const acceleration = priorCount > 0 ? (recentCount - priorCount / 2) / (priorCount / 2) : 0;

    if (acceleration > 0.5 && score < 80) score = Math.min(100, score + 10);

    logToHive({
      source: 'seismic_risk_feed',
      level: 'intel',
      event: 'seismic_scored',
      data: { country, eventCount, maxMag, m7plus, m6plus, score },
      tags: ['usgs', 'seismic', country]
    });

    return {
      source: 'USGS',
      country,
      conflict_score: score,
      event_count: eventCount,
      max_magnitude: parseFloat(maxMag.toFixed(1)),
      m7plus,
      m6plus,
      m5plus,
      trend: maxMag >= 7.0 ? 'major seismic event' : maxMag >= 6.0 ? 'significant activity' : 'moderate activity',
      period: `${startStr} to ${endStr}`,
      fetched_at: new Date().toISOString()
    };

  } catch (err) {
    logToHive({
      source: 'seismic_risk_feed',
      level: 'error',
      event: 'fetch_failed',
      data: { country, message: err.message },
      tags: ['usgs', 'seismic', 'error']
    });
    return { source: 'USGS', country, conflict_score: null, error: err.message };
  }
}

function fetchJson(hostname, path) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname, path, method: 'GET', headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' } },
      res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          if (res.statusCode !== 200) { reject(new Error(`USGS HTTP ${res.statusCode}`)); return; }
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error(`Parse error: ${e.message}`)); }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('USGS timeout')); });
    req.end();
  });
}

module.exports = fetchSeismicRisk;

// Standalone: node seismic_risk_feed.cjs Afghanistan
if (require.main === module) {
  const country = process.argv[2] || 'Afghanistan';
  fetchSeismicRisk(country)
    .then(r => console.log(JSON.stringify(r, null, 2)))
    .catch(console.error);
}
