// comtrade_import_feed.cjs
// UN Comtrade — country import volume tracking (collapse = crisis signal)
// Requires COMTRADE_API_PRIMARY key in .env
// Follows fred_macro_data.cjs pattern

require('dotenv').config({ path: './.env' });
const https = require('https');
const { logToHive } = require('./logger.cjs');

// UN Comtrade numeric country codes (M49)
const COUNTRY_M49 = {
  // Active conflicts
  'Mali': '466', 'Burkina Faso': '854', 'Niger': '562', 'Sudan': '729',
  'Ethiopia': '231', 'Myanmar': '104', 'Venezuela': '862', 'Somalia': '706',
  'DRC': '180', 'CAR': '140', 'Chad': '148', 'Nigeria': '566',
  'Mozambique': '508', 'South Sudan': '728', 'Afghanistan': '4',
  'Syria': '760', 'Yemen': '887', 'Haiti': '332', 'Libya': '434',
  'Israel': '376', 'Palestine': '275', 'Ukraine': '804', 'Colombia': '170',
  'Lebanon': '422', 'Iraq': '368', 'Pakistan': '586', 'Cameroon': '120',
  'Armenia': '51', 'Georgia': '268',
  // High-risk threshold watch
  'Zimbabwe': '716', 'Taiwan': '158', 'Iran': '364', 'North Korea': '408',
  'Bosnia': '70', 'Zambia': '894', 'Tanzania': '834', 'Senegal': '686',
  'Guinea': '324', 'Ecuador': '218', 'Bolivia': '68', 'Bangladesh': '50',
  'Sri Lanka': '144', 'Kenya': '404', 'Uganda': '800', 'Eritrea': '232',
  'Djibouti': '262'
};

async function fetchImportData(country, year) {
  const reporterCode = COUNTRY_M49[country] || country;
  // Comtrade annual data lags ~2 years; default to currentYear - 3
  const targetYear = year ? parseInt(year.slice(0, 4)) : new Date().getFullYear() - 3;
  const prevYear = targetYear - 1;
  const apiKey = process.env.COMTRADE_API_PRIMARY;

  if (!apiKey) {
    return { source: 'Comtrade', country, error: 'Missing COMTRADE_API_PRIMARY in .env' };
  }

  try {
    // Fetch total imports for target year and previous year (for delta)
    const [currentData, prevData] = await Promise.allSettled([
      fetchComtrade(reporterCode, String(targetYear), apiKey),
      fetchComtrade(reporterCode, String(prevYear), apiKey)
    ]);

    const currentVal = currentData.status === 'fulfilled' ? extractTotalImports(currentData.value) : null;
    const prevVal = prevData.status === 'fulfilled' ? extractTotalImports(prevData.value) : null;

    if (currentVal === null) {
      return { source: 'Comtrade', country, error: 'No import data returned', data_year: targetYear };
    }

    // Year-over-year change in import value
    const delta_pct = prevVal && prevVal > 0
      ? Math.round(((currentVal - prevVal) / prevVal) * 100)
      : null;

    // Score: import collapse = high risk
    // Normal growth (>0%) = low risk, mild decline (-20%) = medium, collapse (>-50%) = critical
    let import_risk_score;
    if (delta_pct === null) {
      import_risk_score = 40; // no comparison data — neutral
    } else if (delta_pct >= 5) {
      import_risk_score = Math.max(0, 20 - delta_pct); // growing = low risk
    } else if (delta_pct >= -10) {
      import_risk_score = 30; // flat — mild concern
    } else if (delta_pct >= -30) {
      import_risk_score = Math.round(30 + Math.abs(delta_pct + 10) * 2); // declining
    } else {
      import_risk_score = Math.min(100, Math.round(70 + Math.abs(delta_pct + 30))); // collapsing
    }

    logToHive({
      source: 'comtrade_import_feed',
      level: 'intel',
      event: 'imports_fetched',
      data: { country, reporterCode, currentVal, prevVal, delta_pct, import_risk_score },
      tags: ['comtrade', 'trade', 'imports', country]
    });

    return {
      source: 'Comtrade',
      country,
      reporter_code: reporterCode,
      total_imports_usd: currentVal,
      prev_year_imports_usd: prevVal,
      delta_pct,
      import_risk_score,
      data_year: targetYear,
      trend: delta_pct === null ? 'unknown'
        : delta_pct < -30 ? 'collapsing'
        : delta_pct < -10 ? 'declining'
        : delta_pct < 5 ? 'flat'
        : 'growing',
      fetched_at: new Date().toISOString()
    };

  } catch (err) {
    logToHive({
      source: 'comtrade_import_feed',
      level: 'error',
      event: 'fetch_failed',
      data: { country, message: err.message },
      tags: ['comtrade', 'error']
    });
    return { source: 'Comtrade', country, error: err.message };
  }
}

function extractTotalImports(data) {
  const records = data?.data || data?.dataset || [];
  if (!records.length) return null;
  // Sum all import records (flowCode M = imports)
  const imports = records.filter(r =>
    r.flowCode === 'M' || r.rgDesc === 'Import' || r.flow_desc === 'Import' || r.FlowCode === 'M'
  );
  if (!imports.length) {
    // If no flow filter matched, sum all records (single-flow query)
    return records.reduce((s, r) => s + (r.primaryValue || r.TradeValue || r.fobvalue || 0), 0);
  }
  return imports.reduce((s, r) => s + (r.primaryValue || r.TradeValue || r.fobvalue || 0), 0);
}

function fetchComtrade(reporterCode, period, apiKey) {
  return new Promise((resolve, reject) => {
    // Comtrade+ API v1
    // partnerCode=0 = World aggregate (total imports from all partners)
    const path = `/data/v1/get/C/A/HS?reporterCode=${reporterCode}&period=${period}&cmdCode=TOTAL&flowCode=M&partnerCode=0&maxRecords=5&format=JSON&breakdownMode=classic&countOnly=false`;
    const options = {
      hostname: 'comtradeapi.un.org',
      path,
      method: 'GET',
      headers: {
        'Ocp-Apim-Subscription-Key': apiKey,
        'Accept': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`Comtrade parse error: ${e.message}`)); }
      });
    });

    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Comtrade timeout')); });
    req.end();
  });
}

module.exports = fetchImportData;

// Standalone test: node comtrade_import_feed.cjs Mali
if (require.main === module) {
  const country = process.argv[2] || 'Mali';
  fetchImportData(country).then(result => {
    console.log(JSON.stringify(result, null, 2));
  }).catch(console.error);
}
