// eia_energy_feed.cjs
// Energy Stress Signal — EIA (US Energy Information Administration) international data
// Score 0–100: higher = greater energy infrastructure stress / supply disruption
// EIA publishes global energy data: production, consumption, import dependency
// Cadence: weekly (168h) — EIA updates monthly, weekly fetch catches new releases
// Key: process.env.EIA_API

require('dotenv').config({ path: './.env' });
const https = require('https');
const { logToHive } = require('./logger.cjs');

const EIA_KEY = process.env.EIA_API || '';

// EIA country codes (ISO alpha-2 used by EIA international series)
const COUNTRY_EIA = {
  'Afghanistan': 'AF', 'Algeria': 'AL', 'Angola': 'AO', 'Argentina': 'AR',
  'Australia': 'AS', 'Azerbaijan': 'AJ', 'Bahrain': 'BA', 'Bangladesh': 'BG',
  'Bolivia': 'BL', 'Brazil': 'BR', 'Burma': 'BM', 'Cambodia': 'CB',
  'Cameroon': 'CM', 'Canada': 'CA', 'Chad': 'CD', 'Chile': 'CI',
  'China': 'CH', 'Colombia': 'CO', 'Congo': 'CF', 'DRC': 'CG',
  'Ecuador': 'EC', 'Egypt': 'EG', 'Ethiopia': 'ET', 'France': 'FR',
  'Germany': 'GM', 'Ghana': 'GH', 'Greece': 'GR', 'India': 'IN',
  'Indonesia': 'ID', 'Iran': 'IR', 'Iraq': 'IZ', 'Israel': 'IS',
  'Italy': 'IT', 'Japan': 'JA', 'Jordan': 'JO', 'Kazakhstan': 'KZ',
  'Kenya': 'KE', 'Kuwait': 'KU', 'Libya': 'LY', 'Malaysia': 'MY',
  'Mexico': 'MX', 'Morocco': 'MO', 'Mozambique': 'MZ', 'Myanmar': 'BM',
  'Nigeria': 'NI', 'North Korea': 'KN', 'Norway': 'NO', 'Oman': 'MU',
  'Pakistan': 'PK', 'Peru': 'PE', 'Philippines': 'RP', 'Poland': 'PL',
  'Qatar': 'QA', 'Romania': 'RO', 'Russia': 'RS', 'Saudi Arabia': 'SA',
  'Somalia': 'SO', 'South Africa': 'SF', 'South Korea': 'KS', 'Sudan': 'SU',
  'Syria': 'SY', 'Taiwan': 'TW', 'Tanzania': 'TZ', 'Thailand': 'TH',
  'Tunisia': 'TS', 'Turkey': 'TU', 'Turkmenistan': 'TX', 'UAE': 'TC',
  'Uganda': 'UG', 'Ukraine': 'UP', 'United Kingdom': 'UK',
  'United States': 'US', 'Uzbekistan': 'UZ', 'Venezuela': 'VE',
  'Vietnam': 'VM', 'Yemen': 'YM', 'Zambia': 'ZA', 'Zimbabwe': 'ZI'
};

// Static energy stress baseline (judgment-set) for countries with poor EIA coverage
// Based on import dependency, grid fragility, and energy poverty indices
const ENERGY_BASELINE = {
  'South Sudan': 72, 'CAR': 68, 'DRC': 65, 'Somalia': 70, 'Haiti': 66,
  'Niger': 60, 'Mali': 58, 'Burkina Faso': 55, 'Chad': 62, 'Burundi': 64,
  'Malawi': 52, 'Rwanda': 48, 'Sierra Leone': 58, 'Guinea-Bissau': 55,
  'Liberia': 54, 'Guinea': 50, 'Togo': 45, 'Benin': 42, 'Eritrea': 60,
  'North Korea': 75
};

function fetchEIASeries(seriesId) {
  return new Promise((resolve, reject) => {
    const url = `https://api.eia.gov/v2/international/data/?api_key=${EIA_KEY}&frequency=annual&data[0]=value&facets[seriesId][]=${seriesId}&sort[0][column]=period&sort[0][direction]=desc&length=5`;
    https.get(url, { timeout: 10000 }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { resolve(null); }
      });
    }).on('error', () => resolve(null)).on('timeout', () => resolve(null));
  });
}

async function fetchEnergyStressData(country) {
  // Use baseline for countries without EIA data
  if (ENERGY_BASELINE[country] !== undefined) {
    return { score: ENERGY_BASELINE[country], source: 'baseline' };
  }

  const eiaCode = COUNTRY_EIA[country];
  if (!eiaCode || !EIA_KEY) {
    return { score: null, reason: !EIA_KEY ? 'no_api_key' : 'no_country_code' };
  }

  try {
    // Fetch petroleum consumption and production to calculate import dependency
    const [consResp, prodResp] = await Promise.all([
      fetchEIASeries(`INTL.57-6-${eiaCode}-TBPD.A`),  // petroleum consumption
      fetchEIASeries(`INTL.57-1-${eiaCode}-TBPD.A`)   // petroleum production
    ]);

    const consumption = consResp?.response?.data?.[0]?.value;
    const production  = prodResp?.response?.data?.[0]?.value;

    if (!consumption) return { score: null, reason: 'no_eia_data' };

    // Import dependency score: 0 if self-sufficient, higher if heavily dependent
    let importScore = 0;
    if (production !== null && production !== undefined) {
      const importDependency = Math.max(0, (consumption - production) / consumption);
      importScore = Math.round(importDependency * 50);  // 0–50 pts
    }

    // Consumption per capita as proxy for economic vulnerability to energy shocks
    // High consumption + high import dependency = high score
    const score = Math.min(100, importScore + 10);  // base 10 for any energy risk

    return {
      score,
      consumption_tbpd: consumption,
      production_tbpd: production,
      import_score: importScore,
      source: 'eia'
    };
  } catch (err) {
    logToHive({ source: 'eia_energy_feed', level: 'warn', event: 'fetch_error', data: { country, error: err.message } });
    return { score: null, reason: 'fetch_error', error: err.message };
  }
}

module.exports = { fetchEnergyStressData };
