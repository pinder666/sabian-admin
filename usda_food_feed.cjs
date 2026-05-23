// usda_food_feed.cjs
// USDA Food Supply Signal — food production, consumption, and trade balance
// Source: USDA FAS Production Supply and Distribution (PSD) — free public API
// Score 0–100: higher = country has structural food supply deficit or import dependency
// Logic: USDA PSD tracks grain balance sheets by country — ending stocks,
//   production vs consumption ratios, import dependency.
//   A country with low ending stocks + high import dependency is one shipping
//   disruption away from a food crisis.
// Cadence: monthly (USDA publishes WASDE on 2nd week of each month)

require('dotenv').config({ path: './.env' });
const https = require('https');
const { logToHive } = require('./logger.cjs');

// USDA FAS country codes for PSD API
// https://apps.fas.usda.gov/psdonline/app/index.html#/app/compositeViz
const USDA_COUNTRY_CODES = {
  'Afghanistan': 'AF', 'Angola': 'AO', 'Argentina': 'AR', 'Australia': 'AS',
  'Bangladesh': 'BG', 'Bolivia': 'BO', 'Brazil': 'BR', 'Burkina Faso': 'UV',
  'Cambodia': 'CB', 'Cameroon': 'CM', 'CAR': 'CT', 'Chad': 'CD',
  'China': 'CH', 'Colombia': 'CO', 'Cuba': 'CU', 'DRC': 'CG',
  'Ecuador': 'EC', 'Egypt': 'EG', 'Ethiopia': 'ET', 'Ghana': 'GH',
  'Guatemala': 'GT', 'Guinea': 'GV', 'Haiti': 'HA', 'Honduras': 'HO',
  'India': 'IN', 'Indonesia': 'ID', 'Iran': 'IR', 'Iraq': 'IZ',
  'Ivory Coast': 'IV', 'Jordan': 'JO', 'Kazakhstan': 'KZ', 'Kenya': 'KE',
  'Kyrgyzstan': 'KG', 'Laos': 'LA', 'Lebanon': 'LE', 'Liberia': 'LI',
  'Libya': 'LY', 'Madagascar': 'MA', 'Malawi': 'MI', 'Mali': 'ML',
  'Mauritania': 'MR', 'Mexico': 'MX', 'Moldova': 'MD', 'Morocco': 'MO',
  'Mozambique': 'MZ', 'Myanmar': 'BM', 'Nepal': 'NP', 'Nicaragua': 'NU',
  'Niger': 'NG', 'Nigeria': 'NI', 'Pakistan': 'PK', 'Peru': 'PE',
  'Philippines': 'RP', 'Russia': 'RS', 'Rwanda': 'RW', 'Saudi Arabia': 'SA',
  'Senegal': 'SG', 'Sierra Leone': 'SL', 'Somalia': 'SO', 'South Africa': 'SF',
  'South Sudan': 'OD', 'Sri Lanka': 'CE', 'Sudan': 'SU', 'Syria': 'SY',
  'Tajikistan': 'TI', 'Tanzania': 'TZ', 'Thailand': 'TH', 'Tunisia': 'TS',
  'Turkey': 'TU', 'Turkmenistan': 'TX', 'Uganda': 'UG', 'Ukraine': 'UP',
  'Uzbekistan': 'UZ', 'Venezuela': 'VE', 'Vietnam': 'VM', 'Yemen': 'YM',
  'Zambia': 'ZA', 'Zimbabwe': 'ZI'
};

// Commodity code for wheat (most globally critical grain)
const WHEAT_COMMODITY = '0410000'; // USDA PSD wheat code

function fetchUsdaPsd(countryCode, commodityCode) {
  return new Promise((resolve) => {
    const url = `https://apps.fas.usda.gov/psdonline/api/psd/country/${countryCode}/commodity/${commodityCode}?api_key=DEMO_KEY`;
    https.get(url, {
      headers: { 'User-Agent': 'SabianIntelligence/3.0' },
      timeout: 15000
    }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { resolve(null); }
      });
    }).on('error', () => resolve(null)).on('timeout', () => resolve(null));
  });
}

// Static food insecurity baseline (WFP/FAO-derived)
// Score = structural import dependency + production gap risk
const FOOD_BASELINE = {
  'Somalia': 88, 'South Sudan': 90, 'Yemen': 85, 'Haiti': 82,
  'CAR': 80, 'Afghanistan': 78, 'DRC': 75, 'Syria': 72,
  'Burkina Faso': 70, 'Niger': 72, 'Mali': 68, 'Chad': 68,
  'Eritrea': 65, 'Sudan': 65, 'Ethiopia': 58, 'Liberia': 58,
  'Guinea-Bissau': 55, 'Sierra Leone': 55, 'Malawi': 55, 'Mozambique': 52,
  'Burundi': 60, 'Rwanda': 45, 'Uganda': 42, 'Tanzania': 40,
  'Zimbabwe': 52, 'Zambia': 45, 'Lebanon': 62, 'Egypt': 45,
  'Jordan': 42, 'Bangladesh': 38, 'Pakistan': 42, 'Myanmar': 38,
  'Cambodia': 35, 'Laos': 35, 'Nepal': 40, 'Nigeria': 48,
  'Kenya': 42, 'Madagascar': 55, 'Mauritania': 55, 'Senegal': 42,
  'Ghana': 35, 'Ivory Coast': 32, 'Cameroon': 38, 'Angola': 42,
  'Venezuela': 55, 'Bolivia': 35, 'Honduras': 42, 'Guatemala': 40,
  'Nicaragua': 38, 'Cuba': 45, 'Iraq': 38, 'Iran': 30,
  'Libya': 40, 'Tunisia': 30, 'Morocco': 30, 'Algeria': 28,
  'Russia': 15, 'Ukraine': 12, 'India': 35, 'China': 20,
  'Brazil': 15, 'Argentina': 10, 'Australia': 5, 'Thailand': 18,
  'Vietnam': 20, 'Indonesia': 28, 'Philippines': 32, 'Sri Lanka': 35,
  'Tajikistan': 45, 'Uzbekistan': 35, 'Kyrgyzstan': 38, 'Turkmenistan': 30,
  'Kazakhstan': 18, 'Turkey': 20, 'Mexico': 25, 'Colombia': 22,
  'Peru': 28, 'Ecuador': 25, 'South Africa': 28, 'Tanzania': 40,
  'Saudi Arabia': 38, 'Yemen': 85, 'Somalia': 88
};

async function fetchUsdaFoodData(country) {
  try {
    const countryCode = USDA_COUNTRY_CODES[country];
    const baseline = FOOD_BASELINE[country];

    if (!countryCode && baseline === undefined) {
      return { score: 10, reason: 'no_food_data', trend: 'stable' };
    }

    // Try USDA PSD for live grain balance data
    let liveScore = null;
    if (countryCode) {
      const psdData = await fetchUsdaPsd(countryCode, WHEAT_COMMODITY);
      if (psdData && Array.isArray(psdData) && psdData.length > 0) {
        const latest = psdData[psdData.length - 1];
        const prod = parseFloat(latest.production_qty || 0);
        const cons = parseFloat(latest.dom_consumption_qty || 1);
        const endStocks = parseFloat(latest.ending_stocks_qty || 0);

        // Production-to-consumption ratio
        const ratio = prod / cons;
        // Ending stocks as days of supply
        const stockDays = cons > 0 ? (endStocks / cons) * 365 : 90;

        if (!isNaN(ratio) && !isNaN(stockDays)) {
          liveScore = Math.min(100,
            (ratio < 0.3 ? 40 : ratio < 0.6 ? 20 : ratio < 0.9 ? 10 : 0) +
            (stockDays < 30 ? 40 : stockDays < 60 ? 20 : stockDays < 90 ? 10 : 0)
          );
        }
      }
    }

    const score = liveScore !== null ? liveScore : (baseline || 20);

    return {
      score,
      source: liveScore !== null ? 'USDA_PSD_live' : 'WFP_FAO_baseline',
      trend: score >= 65 ? 'acute_food_risk' : score >= 40 ? 'stressed' : 'adequate'
    };

  } catch (err) {
    logToHive({ source: 'usda_food_feed', level: 'warn', event: 'error', data: { country, error: err.message } });
    return { score: null, reason: 'error', error: err.message };
  }
}

module.exports = { fetchUsdaFoodData };
