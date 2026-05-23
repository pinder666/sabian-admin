// darkvessel_feed.cjs
// Dark Vessel Signal — AIS gap events (vessels going dark) in a country's maritime zone
// Source: Global Fishing Watch Events API (GFW_API_KEY required)
// Score 0–100: higher = more vessels going dark = sanctions evasion / military movement
// Logic: Vessels turn off AIS transponders to hide position.
//   Sanctioned tankers go dark to move oil. Military moves dark before operations.
//   Landlocked countries score 0 — no maritime zone to monitor.
// Cadence: 24h — GFW updates daily from satellite AIS aggregation

require('dotenv').config({ path: './.env' });
const https = require('https');
const { logToHive } = require('./logger.cjs');

const GFW_API_KEY = process.env.GFW_API_KEY;

// Country bounding boxes for maritime zone queries [minLon, minLat, maxLon, maxLat]
// Only coastal/island countries — landlocked return score 0
const MARITIME_BBOX = {
  'Afghanistan':       null,  // landlocked
  'Algeria':           [-2.2, 30.0, 9.0, 38.0],
  'Angola':            [10.0, -18.0, 16.0, -3.0],
  'Australia':         [113.0, -44.0, 154.0, -10.0],
  'Azerbaijan':        null,  // landlocked (Caspian Sea — closed)
  'Bahrain':           [50.3, 25.5, 50.9, 26.4],
  'Bangladesh':        [88.0, 20.0, 93.0, 23.0],
  'Belize':            [-89.0, 15.5, -87.0, 18.5],
  'Benin':             [0.8, 5.9, 2.8, 6.8],
  'Bosnia':            null,  // near-landlocked
  'Brazil':            [-50.0, -35.0, -28.0, 5.0],
  'Cambodia':          [102.0, 9.5, 107.5, 12.0],
  'Cameroon':          [8.4, 3.5, 10.0, 5.0],
  'Chile':             [-75.0, -56.0, -66.0, -17.0],
  'China':             [108.0, 15.0, 130.0, 42.0],
  'Colombia':          [-78.0, 1.0, -66.0, 12.0],
  'Congo':             [10.0, -5.5, 12.5, -4.0],
  'Costa Rica':        [-87.0, 7.0, -82.0, 11.0],
  'Cuba':              [-85.0, 19.5, -74.0, 23.5],
  'Cyprus':            [31.8, 34.4, 35.0, 35.8],
  'Denmark':           [7.5, 54.5, 15.2, 57.8],
  'Djibouti':          [41.5, 10.5, 43.5, 12.5],
  'Dominican Republic': [-72.0, 17.5, -68.3, 20.0],
  'DRC':               [12.0, -6.0, 14.5, -4.5],
  'Ecuador':           [-92.0, -5.5, -75.0, 2.0],
  'Egypt':             [25.0, 22.0, 37.0, 32.0],
  'El Salvador':       [-90.5, 12.5, -87.5, 14.5],
  'Equatorial Guinea': [9.0, 1.0, 10.5, 3.8],
  'Eritrea':           [38.0, 12.5, 45.0, 18.0],
  'Fiji':              [176.0, -20.0, -179.0, -15.0],
  'France':            [-5.0, 42.0, 9.5, 51.5],
  'Gabon':             [8.5, -3.5, 10.0, 2.5],
  'Germany':           [7.0, 53.5, 14.5, 55.5],
  'Ghana':             [-3.5, 4.5, 1.5, 6.0],
  'Greece':            [19.0, 35.0, 28.5, 42.0],
  'Guatemala':         [-92.5, 13.5, -88.0, 15.5],
  'Guinea':            [-15.5, 9.0, -13.0, 11.5],
  'Guinea-Bissau':     [-16.8, 10.5, -13.5, 12.5],
  'Guyana':            [-60.0, 5.0, -56.0, 8.5],
  'Haiti':             [-74.5, 18.0, -71.5, 20.5],
  'Honduras':          [-89.0, 12.5, -83.0, 16.5],
  'India':             [65.0, 6.0, 98.0, 25.0],
  'Indonesia':         [95.0, -11.0, 141.0, 6.0],
  'Iran':              [44.0, 23.0, 63.5, 30.5],
  'Iraq':              [46.5, 29.0, 48.5, 30.5],
  'Israel':            [34.2, 29.3, 35.5, 33.5],
  'Italy':             [6.5, 36.0, 18.5, 47.0],
  'Ivory Coast':       [-8.5, 4.3, -2.5, 6.0],
  'Jamaica':           [-78.5, 17.5, -76.0, 18.8],
  'Japan':             [122.0, 24.0, 148.0, 46.0],
  'Jordan':            [34.9, 29.2, 35.2, 30.0],
  'Kenya':             [39.0, -5.0, 42.0, 2.5],
  'Kuwait':            [46.5, 28.5, 48.5, 30.1],
  'Laos':              null,  // landlocked
  'Lebanon':           [34.8, 33.0, 36.5, 34.8],
  'Liberia':           [-11.5, 4.0, -7.5, 7.0],
  'Libya':             [9.0, 28.0, 25.5, 34.0],
  'Malaysia':          [99.5, 0.5, 120.0, 8.0],
  'Mali':              null,  // landlocked
  'Mexico':            [-118.0, 14.0, -86.5, 32.5],
  'Morocco':           [-17.0, 27.0, -1.0, 36.0],
  'Mozambique':        [34.0, -27.0, 41.0, -10.0],
  'Myanmar':           [92.0, 9.5, 100.0, 20.0],
  'Namibia':           [11.5, -29.0, 16.0, -16.5],
  'New Zealand':       [165.0, -48.0, 178.5, -34.0],
  'Nicaragua':         [-87.5, 10.5, -82.5, 15.0],
  'Nigeria':           [2.5, 3.5, 15.0, 6.5],
  'North Korea':       [124.0, 37.5, 131.0, 43.0],
  'Norway':            [4.0, 57.5, 31.5, 71.5],
  'Oman':              [51.5, 16.5, 60.0, 26.5],
  'Pakistan':          [60.5, 23.0, 67.5, 25.5],
  'Palestine':         null,
  'Panama':            [-83.0, 7.0, -77.0, 10.0],
  'Papua New Guinea':  [140.0, -12.0, 155.0, -1.0],
  'Peru':              [-84.0, -18.5, -68.0, 0.5],
  'Philippines':       [116.5, 4.5, 126.5, 21.0],
  'Portugal':          [-31.5, 30.0, -6.0, 42.5],
  'Qatar':             [50.6, 24.4, 52.5, 26.5],
  'Romania':           [28.5, 43.5, 30.5, 45.5],
  'Russia':            [19.5, 40.0, 180.0, 77.5],
  'Saudi Arabia':      [36.0, 16.0, 56.5, 32.0],
  'Senegal':           [-17.5, 12.0, -11.5, 15.0],
  'Sierra Leone':      [-13.5, 6.5, -10.5, 9.5],
  'Singapore':         [103.5, 1.1, 104.5, 1.6],
  'Somalia':           [40.5, -2.0, 51.5, 12.0],
  'South Africa':      [15.0, -35.0, 35.0, -22.0],
  'South Korea':       [124.5, 33.5, 130.5, 38.5],
  'Spain':             [-9.5, 35.5, 5.0, 44.0],
  'Sri Lanka':         [79.5, 5.5, 82.5, 10.0],
  'Sudan':             [36.5, 18.5, 38.5, 22.5],
  'Suriname':          [-58.0, 5.5, -53.5, 7.5],
  'Syria':             [35.5, 34.5, 37.0, 36.0],
  'Taiwan':            [119.5, 21.5, 122.5, 25.5],
  'Tanzania':          [37.5, -11.5, 41.5, -3.0],
  'Thailand':          [97.5, 3.5, 105.5, 14.5],
  'Timor-Leste':       [124.0, -9.5, 127.5, -8.0],
  'Togo':              [0.8, 5.9, 2.0, 6.5],
  'Trinidad and Tobago': [-62.0, 9.8, -60.0, 11.5],
  'Tunisia':           [7.5, 30.0, 11.5, 37.5],
  'Turkey':            [25.5, 35.5, 44.5, 42.5],
  'UAE':               [51.0, 22.5, 56.5, 26.5],
  'UK':                [-8.5, 49.5, 2.5, 61.5],
  'Ukraine':           [31.5, 45.0, 38.5, 47.5],
  'United States':     [-125.0, 24.0, -66.0, 49.0],
  'Uruguay':           [-58.5, -35.0, -52.5, -29.5],
  'Venezuela':         [-73.5, 10.0, -59.0, 15.5],
  'Vietnam':           [102.0, 8.5, 110.0, 24.0],
  'Yemen':             [42.5, 11.5, 53.5, 18.5]
};

function fetchGfwGaps(bbox, startDate, endDate) {
  return new Promise((resolve) => {
    if (!GFW_API_KEY) return resolve(null);
    const [minLon, minLat, maxLon, maxLat] = bbox;
    const params = new URLSearchParams({
      datasets:   'public-global-gaps:latest',
      startDate,
      endDate,
      bbox:       `${minLon},${minLat},${maxLon},${maxLat}`,
      limit:      '50',
      offset:     '0'
    });
    const options = {
      hostname: 'gateway.api.globalfishingwatch.org',
      path:     `/v3/events?${params.toString()}`,
      headers:  { 'Authorization': `Bearer ${GFW_API_KEY}`, 'Content-Type': 'application/json' },
      timeout:  15000
    };
    https.get(options, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { resolve(null); }
      });
    }).on('error', () => resolve(null)).on('timeout', () => resolve(null));
  });
}

async function fetchDarkVesselData(country) {
  try {
    const bbox = MARITIME_BBOX[country];
    if (!bbox) return { score: 0, reason: 'landlocked_or_no_maritime_zone' };

    if (!GFW_API_KEY) {
      logToHive({ source: 'darkvessel_feed', level: 'warn', event: 'no_api_key', data: { country } });
      return { score: null, reason: 'no_gfw_api_key' };
    }

    const endDate   = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const data = await fetchGfwGaps(bbox, startDate, endDate);

    if (!data || data.error || !Array.isArray(data.entries)) {
      return { score: null, reason: 'no_gfw_data' };
    }

    const gaps = data.entries;
    const gapCount = gaps.length;

    if (gapCount === 0) return { score: 5, gap_events: 0, reason: 'no_dark_events' };

    // Score based on number of gap events and average gap duration
    const avgDurationHrs = gaps.reduce((sum, g) => {
      if (!g.start || !g.end) return sum;
      return sum + (new Date(g.end) - new Date(g.start)) / 3600000;
    }, 0) / gapCount;

    // 1-5 gaps = low (10-25), 6-15 = moderate (30-55), 16-30 = high (60-80), 30+ = critical (85-100)
    let baseScore;
    if (gapCount >= 30) baseScore = 85;
    else if (gapCount >= 16) baseScore = 60;
    else if (gapCount >= 6) baseScore = 30;
    else baseScore = 10;

    // Long gaps (>12h) are more suspicious — vessels hiding for extended periods
    const durationBonus = avgDurationHrs > 24 ? 15 : avgDurationHrs > 12 ? 8 : 0;
    const score = Math.min(100, baseScore + durationBonus);

    return {
      score,
      gap_events: gapCount,
      avg_gap_duration_hrs: Math.round(avgDurationHrs * 10) / 10,
      window_days: 30
    };

  } catch (err) {
    logToHive({ source: 'darkvessel_feed', level: 'warn', event: 'fetch_error', data: { country, error: err.message } });
    return { score: null, reason: 'fetch_error', error: err.message };
  }
}

module.exports = { fetchDarkVesselData };
