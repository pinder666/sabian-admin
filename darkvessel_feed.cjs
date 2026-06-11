// darkvessel_feed.cjs
// Dark Vessel Signal — AIS/transponder silence detection
// Source: OpenSky Network (OPENSKY_CLIENT_ID + OPENSKY_CLIENT_SECRET)
// Score 0–100: higher = more transponder-off activity in country airspace/maritime zone
// Logic: Aircraft and vessels turning off transponders is a pre-operation signal.
//   OpenSky tracks ADS-B gaps — aircraft going dark over a country's airspace.
//   Landlocked countries score 0 — no maritime zone to monitor.
// Cadence: 24h
// NOTE: GFW AIS gap API requires dataset access request (pending).
//   This fetcher uses OpenSky flight state anomalies as proxy until GFW access granted.

require('dotenv').config({ path: './.env' });
const https = require('https');
const { logToHive } = require('./logger.cjs');

const OPENSKY_CLIENT_ID     = process.env.OPENSKY_CLIENT_ID;
const OPENSKY_CLIENT_SECRET = process.env.OPENSKY_CLIENT_SECRET;

// Country bounding boxes [minLon, minLat, maxLon, maxLat]
// Only coastal/maritime countries — landlocked return score 0
const MARITIME_BBOX = {
  'Afghanistan':        null,  // landlocked
  'Algeria':            [-2.2, 30.0, 9.0, 38.0],
  'Angola':             [10.0, -18.0, 16.0, -3.0],
  'Australia':          [113.0, -44.0, 154.0, -10.0],
  'Azerbaijan':         null,  // landlocked (Caspian — closed)
  'Bahrain':            [50.3, 25.5, 50.9, 26.4],
  'Bangladesh':         [88.0, 20.0, 93.0, 23.0],
  'Brazil':             [-50.0, -35.0, -28.0, 5.0],
  'Cambodia':           [102.0, 9.5, 107.5, 12.0],
  'Cameroon':           [8.4, 3.5, 10.0, 5.0],
  'Chile':              [-75.0, -56.0, -66.0, -17.0],
  'China':              [108.0, 15.0, 130.0, 42.0],
  'Colombia':           [-78.0, 1.0, -66.0, 12.0],
  'DRC':                [12.0, -5.5, 12.5, -4.0],
  'Djibouti':           [41.5, 10.5, 43.5, 12.5],
  'Egypt':              [25.0, 22.0, 37.0, 32.0],
  'Eritrea':            [38.0, 12.5, 45.0, 18.0],
  'France':             [-5.0, 42.0, 9.5, 51.5],
  'Germany':            [7.0, 53.5, 14.5, 55.5],
  'Ghana':              [-3.5, 4.5, 1.5, 6.0],
  'Greece':             [19.0, 35.0, 28.5, 42.0],
  'India':              [65.0, 6.0, 98.0, 25.0],
  'Indonesia':          [95.0, -11.0, 141.0, 6.0],
  'Iran':               [44.0, 23.0, 63.5, 30.5],
  'Iraq':               [46.5, 29.0, 48.5, 30.5],
  'Israel':             [34.2, 29.3, 35.5, 33.5],
  'Italy':              [6.5, 36.0, 18.5, 47.0],
  'Japan':              [122.0, 24.0, 148.0, 46.0],
  'Jordan':             [34.9, 29.2, 35.2, 30.0],
  'Kenya':              [39.0, -5.0, 42.0, 2.5],
  'Kuwait':             [46.5, 28.5, 48.5, 30.1],
  'Lebanon':            [34.8, 33.0, 36.5, 34.8],
  'Libya':              [9.0, 28.0, 25.5, 34.0],
  'Malaysia':           [99.5, 0.5, 120.0, 8.0],
  'Mexico':             [-118.0, 14.0, -86.5, 32.5],
  'Morocco':            [-17.0, 27.0, -1.0, 36.0],
  'Mozambique':         [34.0, -27.0, 41.0, -10.0],
  'Myanmar':            [92.0, 9.5, 100.0, 20.0],
  'Nigeria':            [2.5, 3.5, 15.0, 6.5],
  'North Korea':        [124.0, 37.5, 131.0, 43.0],
  'Norway':             [4.0, 57.5, 31.5, 71.5],
  'Oman':               [51.5, 16.5, 60.0, 26.5],
  'Pakistan':           [60.5, 23.0, 67.5, 25.5],
  'Philippines':        [116.5, 4.5, 126.5, 21.0],
  'Portugal':           [-31.5, 30.0, -6.0, 42.5],
  'Qatar':              [50.6, 24.4, 52.5, 26.5],
  'Romania':            [28.5, 43.5, 30.5, 45.5],
  'Russia':             [19.5, 40.0, 180.0, 77.5],
  'Saudi Arabia':       [36.0, 16.0, 56.5, 32.0],
  'Senegal':            [-17.5, 12.0, -11.5, 15.0],
  'Singapore':          [103.5, 1.1, 104.5, 1.6],
  'Somalia':            [40.5, -2.0, 51.5, 12.0],
  'South Africa':       [15.0, -35.0, 35.0, -22.0],
  'South Korea':        [124.5, 33.5, 130.5, 38.5],
  'Spain':              [-9.5, 35.5, 5.0, 44.0],
  'Sri Lanka':          [79.5, 5.5, 82.5, 10.0],
  'Sudan':              [36.5, 18.5, 38.5, 22.5],
  'Syria':              [35.5, 34.5, 37.0, 36.0],
  'Taiwan':             [119.5, 21.5, 122.5, 25.5],
  'Tanzania':           [37.5, -11.5, 41.5, -3.0],
  'Thailand':           [97.5, 3.5, 105.5, 14.5],
  'UAE':                [51.0, 22.5, 56.5, 26.5],
  'UK':                 [-8.5, 49.5, 2.5, 61.5],
  'Ukraine':            [31.5, 45.0, 38.5, 47.5],
  'United States':      [-125.0, 24.0, -66.0, 49.0],
  'Venezuela':          [-73.5, 10.0, -59.0, 15.5],
  'Vietnam':            [102.0, 8.5, 110.0, 24.0],
  'Yemen':              [42.5, 11.5, 53.5, 18.5]
};

function fetchOpenSkyStates(bbox) {
  return new Promise((resolve) => {
    if (!OPENSKY_CLIENT_ID || !OPENSKY_CLIENT_SECRET) return resolve(null);
    const [minLon, minLat, maxLon, maxLat] = bbox;
    const auth = Buffer.from(`${OPENSKY_CLIENT_ID}:${OPENSKY_CLIENT_SECRET}`).toString('base64');
    const url = `https://opensky-network.org/api/states/all?lamin=${minLat}&lomin=${minLon}&lamax=${maxLat}&lomax=${maxLon}`;
    const options = {
      headers: {
        'Authorization': `Basic ${auth}`,
        'User-Agent': 'SabianIntelligence/3.0'
      },
      timeout: 15000
    };
    https.get(url, options, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch { resolve(null); }
      });
    }).on('error', () => resolve(null))
      .on('timeout', () => resolve(null));
  });
}

async function fetchDarkVesselData(country) {
  try {
    const bbox = MARITIME_BBOX[country];
    if (!bbox) return { score: 0, reason: 'landlocked_or_no_maritime_zone' };

    if (!OPENSKY_CLIENT_ID || !OPENSKY_CLIENT_SECRET) {
      logToHive({ source: 'darkvessel_feed', level: 'warn', event: 'no_credentials', data: { country } });
      return { score: null, reason: 'no_opensky_credentials' };
    }

    const result = await fetchOpenSkyStates(bbox);

    if (!result || result.status !== 200 || !result.data) {
      return { score: null, reason: 'no_opensky_response' };
    }

    const states = result.data.states || [];
    const total  = states.length;

    if (total === 0) return { score: 5, aircraft_count: 0, trend: 'no_activity' };

    // Count aircraft with squawk 7500 (hijack), 7600 (radio failure), 7700 (emergency)
    // or on_ground=false but position_source=0 (ADSB off/unreliable)
    const emergencySquawks = states.filter(s => ['7500','7600','7700'].includes(String(s[13]))).length;
    const noPosition       = states.filter(s => s[5] === null && s[6] === null).length;
    const darkRatio        = total > 0 ? noPosition / total : 0;

    // Score: emergency squawks are highest signal
    let score = 5;
    if (emergencySquawks >= 3)       score = 80;
    else if (emergencySquawks >= 1)  score = 50;
    else if (darkRatio >= 0.5)       score = 60;
    else if (darkRatio >= 0.3)       score = 35;
    else if (darkRatio >= 0.1)       score = 15;

    return {
      score,
      aircraft_count:    total,
      emergency_squawks: emergencySquawks,
      no_position_count: noPosition,
      dark_ratio:        Math.round(darkRatio * 100) / 100,
      source:            'OpenSky_Network',
      trend:             score >= 50 ? 'elevated' : score >= 20 ? 'watch' : 'stable'
    };

  } catch (err) {
    logToHive({ source: 'darkvessel_feed', level: 'warn', event: 'fetch_error', data: { country, error: err.message } });
    return { score: null, reason: 'fetch_error', error: err.message };
  }
}

module.exports = { fetchDarkVesselData };
