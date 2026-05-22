// imf_dots_feed.cjs
// World Bank imports signal -- replaces IMF DOTS (dataservices.imf.org decommissioned May 2026)
// Indicator: BM.GSR.GNFS.CD -- Imports of goods and services (BoP, current USD)
// Free API, no key required -- same World Bank endpoint used by governance + economic signals
// Annual data, last 4 years, YoY delta -- same scoring as comtrade_import_feed.cjs
// Function signature unchanged so convergence_engine.cjs requires no update

require('dotenv').config({ path: './.env' });
const https = require('https');
const { logToHive } = require('./logger.cjs');

// World Bank uses ISO2 codes -- same mapping as before
const COUNTRY_ISO2 = {
  'Mali': 'ML', 'Burkina Faso': 'BF', 'Niger': 'NE', 'Sudan': 'SD',
  'Ethiopia': 'ET', 'Myanmar': 'MM', 'Venezuela': 'VE', 'Somalia': 'SO',
  'DRC': 'CD', 'CAR': 'CF', 'Chad': 'TD', 'Nigeria': 'NG',
  'Mozambique': 'MZ', 'Libya': 'LY', 'Haiti': 'HT', 'Yemen': 'YE',
  'Afghanistan': 'AF', 'Syria': 'SY', 'Iraq': 'IQ', 'South Sudan': 'SS',
  'Israel': 'IL', 'Palestine': 'PS', 'Ukraine': 'UA', 'Colombia': 'CO',
  'Lebanon': 'LB', 'Pakistan': 'PK', 'Cameroon': 'CM', 'Armenia': 'AM',
  'Georgia': 'GE', 'Zimbabwe': 'ZW', 'Iran': 'IR', 'Bosnia': 'BA',
  'Zambia': 'ZM', 'Tanzania': 'TZ', 'Senegal': 'SN', 'Guinea': 'GN',
  'Ecuador': 'EC', 'Bolivia': 'BO', 'Bangladesh': 'BD', 'Sri Lanka': 'LK',
  'Kenya': 'KE', 'Uganda': 'UG', 'Eritrea': 'ER', 'Djibouti': 'DJ',
  // Kosovo and Taiwan not in World Bank system -- graceful null
  'Kosovo': null, 'Taiwan': null,
  'North Korea': 'KP'
};

async function fetchTradeData(country) {
  const iso2 = COUNTRY_ISO2[country];
  if (iso2 === undefined) {
    return { source: 'WorldBank_Imports', country, error: `No ISO2 code mapped for ${country}` };
  }
  if (iso2 === null) {
    return { source: 'WorldBank_Imports', country, error: `${country} not in World Bank system (non-member territory)` };
  }

  try {
    // Fetch last 4 years of annual imports data
    const url = `https://api.worldbank.org/v2/country/${iso2}/indicator/BM.GSR.GNFS.CD?format=json&mrv=4&per_page=4`;
    const raw = await fetchJson(url);

    const records = raw[1] || [];
    const valid = records
      .filter(r => r.value !== null && r.value !== undefined)
      .sort((a, b) => parseInt(b.date) - parseInt(a.date));

    if (valid.length < 1) {
      return { source: 'WorldBank_Imports', country, error: 'No import data returned', iso2 };
    }

    const latest = valid[0];
    const prior = valid[1] || null;

    const latestVal = latest.value;
    const priorVal = prior ? prior.value : null;
    const latestYear = latest.date;

    const delta_pct = priorVal && priorVal > 0
      ? Math.round(((latestVal - priorVal) / priorVal) * 100)
      : null;

    // Same scoring as comtrade_import_feed.cjs
    let import_risk_score;
    if (delta_pct === null) {
      import_risk_score = 40;
    } else if (delta_pct >= 5) {
      import_risk_score = Math.max(0, 20 - delta_pct);
    } else if (delta_pct >= -10) {
      import_risk_score = 30;
    } else if (delta_pct >= -30) {
      import_risk_score = Math.round(30 + Math.abs(delta_pct + 10) * 2);
    } else {
      import_risk_score = Math.min(100, Math.round(70 + Math.abs(delta_pct + 30)));
    }

    logToHive({
      source: 'imf_dots_feed',
      level: 'intel',
      event: 'trade_fetched',
      data: { country, iso2, latestVal, priorVal, delta_pct, import_risk_score, latest_year: latestYear },
      tags: ['worldbank', 'trade', 'imports', country]
    });

    return {
      source: 'WorldBank_Imports',
      country,
      iso2,
      latest_period: latestYear,
      total_imports_usd: Math.round(latestVal),
      prior_year_imports_usd: priorVal ? Math.round(priorVal) : null,
      delta_pct,
      import_risk_score,
      trend: delta_pct === null   ? 'unknown'
           : delta_pct < -30      ? 'collapsing'
           : delta_pct < -10      ? 'declining'
           : delta_pct <  5       ? 'flat'
           : 'growing',
      fetched_at: new Date().toISOString()
    };

  } catch (err) {
    logToHive({
      source: 'imf_dots_feed',
      level: 'error',
      event: 'fetch_failed',
      data: { country, message: err.message },
      tags: ['worldbank', 'trade', 'error']
    });
    return { source: 'WorldBank_Imports', country, error: err.message };
  }
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'Accept': 'application/json' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`World Bank HTTP ${res.statusCode}`));
          return;
        }
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`World Bank parse error: ${e.message}`)); }
      });
    }).on('error', reject);
  });
}

module.exports = fetchTradeData;

// Standalone test: node imf_dots_feed.cjs Sudan
if (require.main === module) {
  const country = process.argv[2] || 'Sudan';
  fetchTradeData(country)
    .then(r => console.log(JSON.stringify(r, null, 2)))
    .catch(console.error);
}
