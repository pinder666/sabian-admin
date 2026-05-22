// worldbank_governance.cjs
// World Bank governance indicators by country
// Open API — no key required
// Follows fred_macro_data.cjs pattern

require('dotenv').config({ path: './.env' });
const https = require('https');
const { logToHive } = require('./logger.cjs');

// World Bank Worldwide Governance Indicators (WGI)
// Codes updated May 2026 — old PV.EST/GE.EST format archived, now GOV_WGI_* prefix
// .SC suffix = 0-100 score (higher = better governance)
const INDICATORS = [
  { code: 'GOV_WGI_PV.SC', label: 'Political Stability', description: 'Absence of violence/terrorism likelihood' },
  { code: 'GOV_WGI_GE.SC', label: 'Government Effectiveness', description: 'Quality of public services and policy' },
  { code: 'GOV_WGI_RL.SC', label: 'Rule of Law', description: 'Property rights, courts, crime enforcement' },
  { code: 'GOV_WGI_CC.SC', label: 'Control of Corruption', description: 'Extent to which public power is used for private gain' }
];

// Country name to ISO2 map for common target countries
const COUNTRY_ISO_MAP = {
  'Mali': 'ML', 'Burkina Faso': 'BF', 'Niger': 'NE', 'Sudan': 'SD',
  'Ethiopia': 'ET', 'Myanmar': 'MM', 'Venezuela': 'VE', 'Somalia': 'SO',
  'DRC': 'CD', 'CAR': 'CF', 'Chad': 'TD', 'Nigeria': 'NG', 'Mozambique': 'MZ'
};

async function fetchGovernance(country, year) {
  const iso = COUNTRY_ISO_MAP[country] || country;
  const targetYear = year || new Date().getFullYear() - 1; // WB lags 1 year

  try {
    const results = [];

    for (const indicator of INDICATORS) {
      const url = `https://api.worldbank.org/v2/country/${iso}/indicator/${indicator.code}?format=json&mrv=3&per_page=3`;
      const json = await fetchJson(url);
      const observations = json[1] || [];
      const latest = observations.find(o => o.value !== null) || observations[0];

      if (latest) {
        results.push({
          indicator: indicator.label,
          code: indicator.code,
          description: indicator.description,
          value: latest.value !== null ? parseFloat(latest.value.toFixed(2)) : null,
          year: latest.date,
          // .SC codes return 0-100 directly (higher = better governance)
          normalized_score: latest.value !== null ? Math.round(latest.value) : null,
          source: 'World Bank'
        });
      }
    }

    const avg_governance = results.length
      ? Math.round(results.reduce((s, r) => s + (r.normalized_score || 50), 0) / results.length)
      : null;

    logToHive({
      source: 'worldbank_governance',
      level: 'intel',
      event: 'governance_fetched',
      data: { country, iso, avg_governance, indicators: results.map(r => ({ code: r.code, score: r.normalized_score })) },
      tags: ['worldbank', 'governance', country]
    });

    return {
      source: 'World_Bank',
      country,
      iso,
      avg_governance_score: avg_governance,
      indicators: results,
      fetched_at: new Date().toISOString()
    };

  } catch (err) {
    logToHive({
      source: 'worldbank_governance',
      level: 'error',
      event: 'fetch_failed',
      data: { country, message: err.message },
      tags: ['worldbank', 'error']
    });
    return { source: 'World_Bank', country, error: err.message };
  }
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'Accept': 'application/json' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`World Bank parse error: ${e.message}`)); }
      });
    }).on('error', reject);
  });
}

module.exports = fetchGovernance;

// Standalone test: node worldbank_governance.cjs
if (require.main === module) {
  fetchGovernance('Mali').then(result => {
    console.log(JSON.stringify(result, null, 2));
  }).catch(console.error);
}
