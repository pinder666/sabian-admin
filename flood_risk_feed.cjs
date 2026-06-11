// flood_risk_feed.cjs
// Flood Risk Signal — precipitation anomaly + river basin stress
// Source: Open-Meteo archive/forecast API (no key required)
// Score 0–100: higher = higher probability of imminent or active flooding
// Logic: Extreme precipitation over 14 days signals flood risk.
//   Open-Meteo provides daily precipitation forecasts globally.
//   Threshold: >100mm/14d = elevated, >200mm/14d = warning, >300mm/14d = critical
// Cadence: 24h

require('dotenv').config({ path: './.env' });
const https = require('https');
const { logToHive } = require('./logger.cjs');

// Country coordinates for Open-Meteo queries
const COUNTRY_COORDS = {
  'Afghanistan':        { lat: 33.9391, lon:  67.7100 },
  'Angola':             { lat:-11.2027, lon:  17.8739 },
  'Argentina':          { lat:-38.4161, lon: -63.6167 },
  'Bangladesh':         { lat: 23.6850, lon:  90.3563 },
  'Bolivia':            { lat:-16.2902, lon: -63.5887 },
  'Brazil':             { lat:-14.2350, lon: -51.9253 },
  'Burkina Faso':       { lat: 12.3644, lon:  -1.5353 },
  'Burundi':            { lat: -3.3731, lon:  29.9189 },
  'Cambodia':           { lat: 12.5657, lon: 104.9910 },
  'Cameroon':           { lat:  3.8480, lon:  11.5021 },
  'CAR':                { lat:  6.6111, lon:  20.9394 },
  'Chad':               { lat: 15.4542, lon:  18.7322 },
  'China':              { lat: 35.8617, lon: 104.1954 },
  'Colombia':           { lat:  4.5709, lon: -74.2973 },
  'DRC':                { lat: -4.0383, lon:  21.7587 },
  'Ecuador':            { lat: -1.8312, lon: -78.1834 },
  'Ethiopia':           { lat:  9.1450, lon:  40.4897 },
  'Ghana':              { lat:  7.9465, lon:  -1.0232 },
  'Guatemala':          { lat: 15.7835, lon: -90.2308 },
  'Haiti':              { lat: 18.9712, lon: -72.2852 },
  'Honduras':           { lat: 15.1999, lon: -86.2419 },
  'India':              { lat: 20.5937, lon:  78.9629 },
  'Indonesia':          { lat: -0.7893, lon: 113.9213 },
  'Iraq':               { lat: 33.2232, lon:  43.6793 },
  'Ivory Coast':        { lat:  7.5400, lon:  -5.5471 },
  'Kenya':              { lat: -1.2921, lon:  36.8219 },
  'Laos':               { lat: 19.8563, lon: 102.4955 },
  'Liberia':            { lat:  6.4281, lon:  -9.4295 },
  'Libya':              { lat: 26.3351, lon:  17.2283 },
  'Malawi':             { lat:-13.2543, lon:  34.3015 },
  'Mali':               { lat: 17.5707, lon:  -3.9962 },
  'Mexico':             { lat: 23.6345, lon:-102.5528 },
  'Moldova':            { lat: 47.4116, lon:  28.3699 },
  'Mozambique':         { lat:-18.6657, lon:  35.5296 },
  'Myanmar':            { lat: 19.1633, lon:  96.7742 },
  'Nepal':              { lat: 28.3949, lon:  84.1240 },
  'Nicaragua':          { lat: 12.8654, lon: -85.2072 },
  'Niger':              { lat: 17.6078, lon:   8.0817 },
  'Nigeria':            { lat:  9.0820, lon:   8.6753 },
  'Pakistan':           { lat: 30.3753, lon:  69.3451 },
  'Peru':               { lat: -9.1900, lon: -75.0152 },
  'Philippines':        { lat: 12.8797, lon: 121.7740 },
  'Romania':            { lat: 45.9432, lon:  24.9668 },
  'Russia':             { lat: 61.5240, lon: 105.3188 },
  'Senegal':            { lat: 14.4974, lon: -14.4524 },
  'Sierra Leone':       { lat:  8.4657, lon: -11.7799 },
  'Somalia':            { lat:  5.1521, lon:  46.1996 },
  'South Sudan':        { lat:  6.8770, lon:  31.3070 },
  'Sri Lanka':          { lat:  7.8731, lon:  80.7718 },
  'Sudan':              { lat: 15.5007, lon:  32.5599 },
  'Tanzania':           { lat: -6.3690, lon:  34.8888 },
  'Thailand':           { lat: 15.8700, lon: 100.9925 },
  'Timor-Leste':        { lat: -8.8742, lon: 125.7275 },
  'Uganda':             { lat:  1.3733, lon:  32.2903 },
  'Ukraine':            { lat: 48.3794, lon:  31.1656 },
  'Venezuela':          { lat:  6.4238, lon: -66.5897 },
  'Vietnam':            { lat: 14.0583, lon: 108.2772 },
  'Zambia':             { lat:-13.1339, lon:  27.8493 },
  'Zimbabwe':           { lat:-19.0154, lon:  29.1549 },
  'Kazakhstan':         { lat: 48.0196, lon:  66.9237 },
  'Uzbekistan':         { lat: 41.3775, lon:  64.5853 },
  'Tajikistan':         { lat: 38.8610, lon:  71.2761 },
  'Bolivia':            { lat:-16.2902, lon: -63.5887 },
  'Paraguay':           { lat:-23.4425, lon: -58.4438 },
  'Uruguay':            { lat:-32.5228, lon: -55.7658 },
  'Bangladesh':         { lat: 23.6850, lon:  90.3563 },
  'Iran':               { lat: 32.4279, lon:  53.6880 },
  'Turkey':             { lat: 38.9637, lon:  35.2433 },
  'Egypt':              { lat: 26.8206, lon:  30.8025 },
  'Morocco':            { lat: 31.7917, lon:  -7.0926 },
  'Algeria':            { lat: 28.0339, lon:   1.6596 },
  'Tunisia':            { lat: 33.8869, lon:   9.5375 }
};

function fetchOpenMeteo(lat, lon) {
  return new Promise((resolve) => {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=precipitation_sum,precipitation_probability_max&timezone=auto&forecast_days=14`;
    https.get(url, { headers: { 'User-Agent': 'SabianIntelligence/3.0' }, timeout: 15000 }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { resolve(null); }
      });
    }).on('error', () => resolve(null))
      .on('timeout', () => resolve(null));
  });
}

async function fetchFloodRiskData(country) {
  try {
    const coords = COUNTRY_COORDS[country];
    if (!coords) return { score: 5, reason: 'no_coordinate_data', trend: 'stable' };

    const data = await fetchOpenMeteo(coords.lat, coords.lon);

    if (!data || !data.daily) {
      return { score: 5, reason: 'no_openmeteo_response', trend: 'stable' };
    }

    const precip = (data.daily.precipitation_sum || []).filter(v => v !== null);
    const probMax = (data.daily.precipitation_probability_max || []).filter(v => v !== null);

    if (precip.length === 0) {
      return { score: 5, reason: 'no_precipitation_data', trend: 'stable' };
    }

    const totalPrecip14d = precip.reduce((s, v) => s + v, 0);
    const maxDailyPrecip = Math.max(...precip);
    const avgFloodProb   = probMax.length ? probMax.reduce((s, v) => s + v, 0) / probMax.length : 0;

    // Scoring:
    // Total 14d precip: >300mm = critical (85+), >200mm = warning (60-80), >100mm = elevated (35-55), <100mm = stable (5-30)
    // Max single day: >50mm = extreme event bonus
    let baseScore;
    if      (totalPrecip14d >= 300) baseScore = 85;
    else if (totalPrecip14d >= 200) baseScore = 60;
    else if (totalPrecip14d >= 100) baseScore = 35;
    else if (totalPrecip14d >= 50)  baseScore = 20;
    else                            baseScore = 5;

    // Bonus for extreme single-day event
    const extremeBonus = maxDailyPrecip >= 80 ? 15 : maxDailyPrecip >= 50 ? 8 : 0;
    const score = Math.min(100, baseScore + extremeBonus);

    return {
      score,
      total_precip_14d_mm: Math.round(totalPrecip14d * 10) / 10,
      max_daily_precip_mm: Math.round(maxDailyPrecip * 10) / 10,
      avg_flood_probability_pct: Math.round(avgFloodProb),
      source: 'Open-Meteo',
      trend: score >= 60 ? 'flood_risk_elevated' : score >= 35 ? 'wet_conditions' : 'normal'
    };

  } catch (err) {
    logToHive({ source: 'flood_risk_feed', level: 'warn', event: 'fetch_error', data: { country, error: err.message } });
    return { score: null, reason: 'fetch_error', error: err.message };
  }
}

module.exports = { fetchFloodRiskData };
