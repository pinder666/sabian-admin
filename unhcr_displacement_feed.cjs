// unhcr_displacement_feed.cjs
// UNHCR refugee statistics — IDP and refugee counts by country
// Open API — no key required (api.unhcr.org/population/v1/)
// Follows fred_macro_data.cjs pattern

require('dotenv').config({ path: './.env' });
const https = require('https');
const { logToHive } = require('./logger.cjs');

// ISO3 codes — active conflicts + high-risk threshold watch
const COUNTRY_ISO3 = {
  // Active conflicts
  'Mali': 'MLI', 'Burkina Faso': 'BFA', 'Niger': 'NER', 'Sudan': 'SDN',
  'Ethiopia': 'ETH', 'Myanmar': 'MMR', 'Venezuela': 'VEN', 'Somalia': 'SOM',
  'DRC': 'COD', 'CAR': 'CAF', 'Chad': 'TCD', 'Nigeria': 'NGA',
  'Mozambique': 'MOZ', 'South Sudan': 'SSD', 'Afghanistan': 'AFG',
  'Syria': 'SYR', 'Yemen': 'YEM', 'Haiti': 'HTI', 'Libya': 'LBY',
  'Israel': 'ISR', 'Palestine': 'PSE', 'Ukraine': 'UKR', 'Colombia': 'COL',
  'Lebanon': 'LBN', 'Iraq': 'IRQ', 'Pakistan': 'PAK', 'Cameroon': 'CMR',
  'Armenia': 'ARM', 'Georgia': 'GEO',
  // High-risk threshold watch
  'Zimbabwe': 'ZWE', 'Taiwan': 'TWN', 'Iran': 'IRN', 'North Korea': 'PRK',
  'Kosovo': 'XKX', 'Bosnia': 'BIH', 'Zambia': 'ZMB', 'Tanzania': 'TZA',
  'Senegal': 'SEN', 'Guinea': 'GIN', 'Ecuador': 'ECU', 'Bolivia': 'BOL',
  'Bangladesh': 'BGD', 'Sri Lanka': 'LKA', 'Kenya': 'KEN', 'Uganda': 'UGA',
  'Eritrea': 'ERI', 'Djibouti': 'DJI'
};

async function fetchDisplacement(country, year) {
  const iso3 = COUNTRY_ISO3[country] || country;
  // UNHCR data lags ~1 year; 2023 is latest available as of 2026
  const targetYear = year ? parseInt(year.slice(0, 4)) - 1 : new Date().getFullYear() - 2;
  const yearFrom = targetYear - 2;

  try {
    // Single endpoint returns IDPs + refugees + asylum seekers together
    const url = `https://api.unhcr.org/population/v1/population/?limit=10&yearFrom=${yearFrom}&yearTo=${targetYear}&coo=${iso3}`;
    const raw = await fetchJson(url);
    const items = raw.items || [];

    if (!items.length) {
      return { source: 'UNHCR', country, iso3, error: 'No displacement data returned', data_year: targetYear };
    }

    // Sort descending by year, get latest and previous
    const sorted = items.sort((a, b) => (b.year || 0) - (a.year || 0));
    const latest = sorted[0];
    const prev = sorted[1];

    const idp_count = typeof latest.idps === 'number' ? latest.idps : parseInt(latest.idps) || 0;
    const refugee_count = typeof latest.refugees === 'number' ? latest.refugees : parseInt(latest.refugees) || 0;
    const asylum_count = typeof latest.asylum_seekers === 'number' ? latest.asylum_seekers : parseInt(latest.asylum_seekers) || 0;
    const latestRefugees = refugee_count + asylum_count;
    const prevRefugees = prev ? (
      (typeof prev.refugees === 'number' ? prev.refugees : parseInt(prev.refugees) || 0) +
      (typeof prev.asylum_seekers === 'number' ? prev.asylum_seekers : parseInt(prev.asylum_seekers) || 0)
    ) : 0;
    const total_displaced = idp_count + latestRefugees;

    // YoY delta — acceleration is a key leading indicator
    const refugee_delta_pct = prevRefugees > 0
      ? Math.round(((latestRefugees - prevRefugees) / prevRefugees) * 100)
      : null;

    const data_year = latest.year || targetYear;

    // Normalize displacement to 0-100 risk score
    // Thresholds calibrated to Sahel/conflict zone scale:
    // >3M displaced = 100, 1M-3M = 70-90, 100k-1M = 30-70, <100k = 0-30
    let displacement_score;
    if (total_displaced >= 3000000) displacement_score = 100;
    else if (total_displaced >= 1000000) displacement_score = Math.round(70 + ((total_displaced - 1000000) / 2000000) * 30);
    else if (total_displaced >= 100000) displacement_score = Math.round(30 + ((total_displaced - 100000) / 900000) * 40);
    else displacement_score = Math.round((total_displaced / 100000) * 30);

    // Acceleration bonus: if refugees grew >30% YoY, add up to 15 points
    if (refugee_delta_pct !== null && refugee_delta_pct > 30) {
      displacement_score = Math.min(100, displacement_score + Math.round(refugee_delta_pct / 10));
    }

    logToHive({
      source: 'unhcr_displacement_feed',
      level: 'intel',
      event: 'displacement_fetched',
      data: { country, iso3, idp_count, refugee_count, total_displaced, displacement_score, refugee_delta_pct },
      tags: ['unhcr', 'displacement', country]
    });

    return {
      source: 'UNHCR',
      country,
      iso3,
      idp_count,
      refugee_count: latestRefugees,
      total_displaced,
      displacement_score,
      refugee_delta_pct,
      data_year,
      trend: refugee_delta_pct !== null
        ? (refugee_delta_pct > 20 ? 'accelerating' : refugee_delta_pct < -10 ? 'improving' : 'stable')
        : 'unknown',
      fetched_at: new Date().toISOString()
    };

  } catch (err) {
    logToHive({
      source: 'unhcr_displacement_feed',
      level: 'error',
      event: 'fetch_failed',
      data: { country, message: err.message },
      tags: ['unhcr', 'error']
    });
    return { source: 'UNHCR', country, error: err.message };
  }
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'Accept': 'application/json' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`UNHCR parse error: ${e.message}`)); }
      });
    }).on('error', reject);
  });
}

module.exports = fetchDisplacement;

// Standalone test: node unhcr_displacement_feed.cjs
if (require.main === module) {
  const country = process.argv[2] || 'Mali';
  fetchDisplacement(country).then(result => {
    console.log(JSON.stringify(result, null, 2));
  }).catch(console.error);
}
