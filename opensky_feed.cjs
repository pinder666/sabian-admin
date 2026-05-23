// opensky_feed.cjs
// Flight Movement Signal — OpenSky Network ADS-B data (free, no key required)
// Detects unusual air activity: emergency squawks, high departure density, airspace anomalies
// Score 0–100: higher = more anomalous flight activity over country
// Cadence: 6h (real-time ADS-B updates continuously)

require('dotenv').config({ path: './.env' });
const https = require('https');
const { logToHive } = require('./logger.cjs');

// Country bounding boxes [lat_min, lon_min, lat_max, lon_max]
const COUNTRY_BBOX = {
  'Afghanistan': [29.4, 60.5, 38.5, 74.9], 'Albania': [39.6, 19.3, 42.7, 21.1],
  'Algeria': [18.9, -8.7, 37.1, 12.0], 'Angola': [-18.1, 11.7, -4.4, 24.1],
  'Argentina': [-55.1, -73.6, -21.8, -53.6], 'Armenia': [38.8, 43.4, 41.3, 46.6],
  'Australia': [-43.6, 113.3, -10.7, 153.6], 'Azerbaijan': [38.4, 44.8, 41.9, 50.4],
  'Bahrain': [25.6, 50.4, 26.3, 50.8], 'Bangladesh': [20.7, 88.0, 26.6, 92.7],
  'Belarus': [51.3, 23.2, 56.2, 32.8], 'Bolivia': [-22.9, -69.7, -9.7, -57.5],
  'Bosnia': [42.6, 15.7, 45.3, 19.6], 'Brazil': [-33.8, -73.6, 5.3, -28.8],
  'Bulgaria': [41.2, 22.4, 44.2, 28.6], 'Burkina Faso': [9.4, -5.5, 15.1, 2.4],
  'Burundi': [-4.5, 29.0, -2.3, 30.9], 'Cambodia': [10.4, 102.3, 14.7, 107.6],
  'Cameroon': [1.7, 8.5, 13.1, 16.2], 'CAR': [2.2, 14.4, 11.0, 27.5],
  'Chad': [7.4, 13.5, 23.5, 24.0], 'Chile': [-55.9, -75.6, -17.5, -66.4],
  'China': [18.2, 73.5, 53.6, 134.8], 'Colombia': [-4.2, -79.0, 12.5, -66.9],
  'Congo': [-5.1, 11.2, 3.7, 18.6], 'DRC': [-13.5, 12.2, 5.4, 31.3],
  'Egypt': [22.0, 24.7, 31.7, 37.1], 'Ethiopia': [3.4, 33.0, 15.0, 47.9],
  'France': [41.3, -5.1, 51.1, 9.6], 'Germany': [47.3, 5.9, 55.1, 15.0],
  'Ghana': [4.7, -3.3, 11.2, 1.2], 'Greece': [34.8, 19.4, 41.8, 26.6],
  'Guatemala': [13.7, -92.3, 17.8, -88.2], 'Haiti': [18.0, -74.5, 20.1, -71.6],
  'India': [6.7, 68.1, 35.5, 97.4], 'Indonesia': [-11.0, 95.0, 5.9, 141.0],
  'Iran': [25.1, 44.0, 39.8, 63.3], 'Iraq': [29.1, 38.8, 37.4, 48.6],
  'Israel': [29.5, 34.3, 33.3, 35.9], 'Japan': [24.0, 122.9, 45.5, 145.8],
  'Jordan': [29.2, 34.9, 33.4, 39.3], 'Kazakhstan': [40.6, 50.3, 55.4, 87.4],
  'Kenya': [-4.7, 33.9, 5.0, 41.9], 'Kuwait': [28.5, 46.5, 30.1, 48.4],
  'Lebanon': [33.1, 35.1, 34.7, 36.6], 'Libya': [19.5, 9.3, 33.2, 25.2],
  'Mali': [10.2, -4.2, 25.0, 4.3], 'Mexico': [14.5, -117.1, 32.7, -86.7],
  'Morocco': [27.7, -13.2, 35.9, -1.0], 'Mozambique': [-26.9, 30.2, -10.5, 40.8],
  'Myanmar': [9.8, 92.2, 28.5, 101.2], 'Nepal': [26.4, 80.1, 30.4, 88.2],
  'Niger': [11.7, 0.2, 23.5, 15.9], 'Nigeria': [4.3, 2.7, 13.9, 14.7],
  'North Korea': [37.7, 124.2, 42.7, 130.7], 'Pakistan': [23.7, 60.9, 37.1, 77.1],
  'Palestine': [31.2, 34.2, 32.6, 35.6], 'Peru': [-18.4, -81.3, -0.1, -68.7],
  'Philippines': [5.0, 117.2, 20.9, 126.6], 'Poland': [49.0, 14.1, 54.8, 24.1],
  'Romania': [43.6, 20.3, 48.3, 29.7], 'Russia': [41.2, 19.6, 81.9, 190.0],
  'Rwanda': [-2.8, 28.9, -1.1, 30.9], 'Saudi Arabia': [16.4, 34.6, 32.2, 55.7],
  'Senegal': [12.3, -17.5, 16.7, -11.4], 'Serbia': [42.2, 18.8, 46.2, 23.0],
  'Somalia': [-1.7, 40.9, 12.0, 51.4], 'South Africa': [-34.8, 16.5, -22.1, 32.9],
  'South Korea': [33.1, 125.1, 38.6, 129.6], 'South Sudan': [3.5, 24.1, 12.2, 35.9],
  'Sudan': [8.7, 21.8, 22.2, 38.6], 'Syria': [32.3, 35.7, 37.3, 42.4],
  'Taiwan': [21.9, 119.3, 25.3, 122.0], 'Tanzania': [-11.7, 29.3, -1.0, 40.4],
  'Thailand': [5.6, 97.3, 20.5, 105.7], 'Turkey': [35.8, 25.7, 42.1, 44.8],
  'UAE': [22.6, 51.6, 26.1, 56.4], 'Uganda': [-1.5, 29.6, 4.2, 35.0],
  'Ukraine': [44.4, 22.1, 52.4, 40.2], 'United Kingdom': [49.9, -8.2, 60.9, 1.8],
  'United States': [24.5, -124.8, 49.4, -66.9], 'Venezuela': [0.7, -73.4, 12.2, -59.8],
  'Vietnam': [8.6, 102.1, 23.4, 109.5], 'Yemen': [12.5, 42.6, 19.0, 53.1],
  'Zambia': [-18.1, 22.0, -8.2, 33.7], 'Zimbabwe': [-22.4, 25.2, -15.6, 33.1]
};

function fetchOpenSky(bbox) {
  return new Promise((resolve, reject) => {
    const [lamin, lomin, lamax, lomax] = bbox;
    const url = `https://opensky-network.org/api/states/all?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`;
    const options = { headers: { 'User-Agent': 'SabianIntelligence/2.0' }, timeout: 10000 };
    https.get(url, options, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject).on('timeout', () => reject(new Error('timeout')));
  });
}

async function fetchFlightMovementData(country) {
  const bbox = COUNTRY_BBOX[country];
  if (!bbox) return { score: null, reason: 'no_bbox' };

  try {
    const data = await fetchOpenSky(bbox);
    if (!data || !data.states) return { score: 0, aircraft_count: 0, reason: 'no_data' };

    const states = data.states;
    const total = states.length;

    // Emergency squawk codes: 7500=hijack, 7600=comms failure, 7700=emergency
    const emergencies = states.filter(s => s[14] && ['7500','7600','7700'].includes(String(s[14]))).length;

    // On-ground aircraft (potential staging/evacuation indicator)
    const onGround = states.filter(s => s[8] === true).length;

    // High altitude fast-movers (military-like: >30,000ft, >500 knots)
    const highFast = states.filter(s => s[7] && s[9] && s[7] > 9000 && s[9] > 250).length;

    // Score components
    const emergencyScore  = Math.min(40, emergencies * 20);
    const densityScore    = Math.min(20, Math.round(total / 10));
    const groundScore     = Math.min(15, Math.round(onGround / 5));
    const militaryLike    = Math.min(25, highFast * 3);

    const score = Math.min(100, emergencyScore + densityScore + groundScore + militaryLike);

    return {
      score,
      aircraft_count: total,
      emergency_squawks: emergencies,
      on_ground: onGround,
      high_speed_high_alt: highFast
    };
  } catch (err) {
    logToHive({ source: 'opensky_feed', level: 'warn', event: 'fetch_error', data: { country, error: err.message } });
    return { score: null, reason: 'fetch_error', error: err.message };
  }
}

module.exports = { fetchFlightMovementData };
