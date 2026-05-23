// fao_food_feed.cjs
// FAO Food Import Dependency Signal — structural import reliance and price shock exposure
// Source: FAO GIEWS (Global Information and Early Warning System) + FAOSTAT
// Score 0–100: higher = country is structurally dependent on food imports + exposed to price shocks
// Logic: FAO FAOSTAT tracks food import dependency ratios (FDR) and import bills.
//   Countries that import 50%+ of their caloric needs are one shipping disruption
//   or currency collapse away from acute hunger. This differs from USDA (production balance)
//   by focusing on structural dependency, not current production gap.
// Cadence: annual baseline (FAOSTAT updates ~18 months lag); GIEWS alerts are near-real-time

require('dotenv').config({ path: './.env' });
const https = require('https');
const { logToHive } = require('./logger.cjs');

// FAO country codes (FAOSTAT numeric IDs)
const FAO_COUNTRY_CODES = {
  'Afghanistan': 2, 'Angola': 7, 'Bangladesh': 16, 'Burkina Faso': 233,
  'Burundi': 29, 'CAR': 40, 'Cambodia': 115, 'Cameroon': 32,
  'Chad': 39, 'Colombia': 44, 'DRC': 250, 'Djibouti': 72,
  'Ecuador': 58, 'Egypt': 59, 'El Salvador': 60, 'Ethiopia': 238,
  'Eritrea': 178, 'Ghana': 81, 'Guatemala': 86, 'Guinea': 88,
  'Guinea-Bissau': 175, 'Haiti': 93, 'Honduras': 95, 'India': 100,
  'Indonesia': 101, 'Iran': 102, 'Iraq': 103, 'Ivory Coast': 107,
  'Jordan': 109, 'Kenya': 114, 'Kyrgyzstan': 135, 'Laos': 120,
  'Lebanon': 121, 'Liberia': 122, 'Libya': 124, 'Madagascar': 129,
  'Malawi': 130, 'Mali': 132, 'Mauritania': 136, 'Mexico': 138,
  'Moldova': 145, 'Morocco': 143, 'Mozambique': 144, 'Myanmar': 28,
  'Nepal': 149, 'Nicaragua': 152, 'Niger': 153, 'Nigeria': 159,
  'Pakistan': 165, 'Philippines': 171, 'Rwanda': 184, 'Saudi Arabia': 187,
  'Senegal': 195, 'Sierra Leone': 197, 'Somalia': 201, 'South Sudan': 277,
  'Sri Lanka': 116, 'Sudan': 276, 'Syria': 212, 'Tajikistan': 208,
  'Tanzania': 215, 'Timor-Leste': 243, 'Tunisia': 222, 'Uganda': 226,
  'Ukraine': 230, 'Uzbekistan': 235, 'Venezuela': 236, 'Vietnam': 237,
  'Yemen': 249, 'Zambia': 251, 'Zimbabwe': 181
};

// Food Import Dependency Ratio (FDR) baseline — % of calories from imports
// >50% = high structural dependency; >70% = critical
// Sources: FAO FAOSTAT Food Balance Sheets (2021 data)
const FOOD_IMPORT_DEPENDENCY = {
  'Djibouti': 92, 'Somalia': 85, 'Eritrea': 60, 'Yemen': 88,
  'Haiti': 52, 'Lebanon': 82, 'Jordan': 78, 'Libya': 72,
  'Saudi Arabia': 68, 'UAE': 85, 'Qatar': 90, 'Kuwait': 88,
  'Bahrain': 80, 'Oman': 65, 'Israel': 45, 'Tunisia': 38,
  'Egypt': 42, 'Morocco': 35, 'Algeria': 40, 'Senegal': 52,
  'Mauritania': 55, 'Guinea-Bissau': 35, 'Sierra Leone': 32,
  'Ghana': 28, 'Ivory Coast': 22, 'Togo': 32, 'Benin': 28,
  'Nigeria': 18, 'Cameroon': 20, 'CAR': 22, 'Chad': 15,
  'Niger': 12, 'Mali': 18, 'Burkina Faso': 20, 'Rwanda': 15,
  'Burundi': 18, 'DRC': 12, 'Uganda': 10, 'Tanzania': 12,
  'Kenya': 22, 'Ethiopia': 18, 'Somalia': 85, 'South Sudan': 42,
  'Sudan': 28, 'Zambia': 15, 'Zimbabwe': 28, 'Mozambique': 22,
  'Malawi': 18, 'Madagascar': 20, 'Angola': 35, 'Namibia': 38,
  'South Africa': 15, 'Iraq': 55, 'Syria': 32, 'Iran': 25,
  'Turkey': 15, 'Afghanistan': 28, 'Pakistan': 18, 'India': 8,
  'Bangladesh': 20, 'Nepal': 22, 'Sri Lanka': 38, 'Myanmar': 10,
  'Cambodia': 12, 'Laos': 15, 'Vietnam': 12, 'Indonesia': 18,
  'Philippines': 22, 'China': 5, 'North Korea': 28, 'Mongolia': 32,
  'Kazakhstan': 8, 'Uzbekistan': 15, 'Tajikistan': 28, 'Kyrgyzstan': 22,
  'Turkmenistan': 18, 'Georgia': 42, 'Armenia': 48, 'Azerbaijan': 32,
  'Moldova': 35, 'Ukraine': 8, 'Russia': 5, 'Belarus': 10,
  'Cuba': 45, 'Haiti': 52, 'Venezuela': 38, 'Colombia': 12,
  'Ecuador': 10, 'Peru': 10, 'Bolivia': 8, 'Paraguay': 5,
  'Argentina': 5, 'Brazil': 5, 'Mexico': 18, 'Guatemala': 18,
  'Honduras': 22, 'El Salvador': 25, 'Nicaragua': 15, 'Costa Rica': 18,
  'Panama': 22, 'Nicaragua': 15
};

function fetchGiewsAlert(countryCode) {
  return new Promise((resolve) => {
    // FAO GIEWS country food security snapshots
    const url = `https://www.fao.org/giews/data-tools/tool-detail/en/c/${countryCode}/`;
    https.get(url, {
      headers: { 'User-Agent': 'SabianIntelligence/3.0' },
      timeout: 10000
    }, (res) => {
      // GIEWS doesn't have a simple JSON API — check HTTP status as proxy for active alert
      resolve({ status: res.statusCode });
    }).on('error', () => resolve(null)).on('timeout', () => resolve(null));
  });
}

async function fetchFaoFoodData(country) {
  try {
    const fdr = FOOD_IMPORT_DEPENDENCY[country];
    if (fdr === undefined) return { score: 10, reason: 'no_fao_data', trend: 'stable' };

    // Base score from food import dependency ratio
    let score = 0;
    if (fdr >= 80)      score = 90;
    else if (fdr >= 60) score = 72;
    else if (fdr >= 40) score = 55;
    else if (fdr >= 25) score = 38;
    else if (fdr >= 15) score = 22;
    else                score = 10;

    // Cross-check GIEWS for active food crisis alert
    const countryCode = FAO_COUNTRY_CODES[country];
    if (countryCode) {
      const giews = await fetchGiewsAlert(countryCode);
      // If GIEWS page returns 200, country is in active monitoring — small bonus
      if (giews && giews.status === 200 && score >= 40) {
        score = Math.min(100, score + 5);
      }
    }

    return {
      score,
      food_import_dependency_pct: fdr,
      source: 'FAO_FAOSTAT_baseline',
      trend: score >= 65 ? 'critical_dependency' : score >= 40 ? 'high_dependency' : 'moderate'
    };

  } catch (err) {
    logToHive({ source: 'fao_food_feed', level: 'warn', event: 'error', data: { country, error: err.message } });
    return { score: null, reason: 'error', error: err.message };
  }
}

module.exports = { fetchFaoFoodData };
