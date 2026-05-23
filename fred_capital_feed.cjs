// fred_capital_feed.cjs
// Capital Flows & Banking Stress Signal — FRED (Federal Reserve Economic Data)
// Score 0–100: higher = greater capital flight / financial stress risk
// Sources: FRED FX rate series, financial stress indices, sovereign spread proxies
// Cadence: 24h — FRED updates daily for most series
// Key: process.env.FRED_API_KEY

require('dotenv').config({ path: './.env' });
const https = require('https');
const { logToHive } = require('./logger.cjs');

const FRED_KEY = process.env.FRED_API_KEY || '';

// Country → FRED FX series ID (units: local currency per USD)
// Higher value = weaker local currency = capital flight pressure
const FRED_FX_SERIES = {
  'Australia':     'DEXUSAL',  // USD per AUD (inverted)
  'Brazil':        'DEXBZUS',
  'Canada':        'DEXCAUS',
  'China':         'DEXCHUS',
  'Colombia':      'DEXCOUS',
  'Denmark':       'DEXDNUS',
  'European Union':'DEXUSEU',  // USD per EUR (inverted)
  'France':        'DEXUSEU',
  'Germany':       'DEXUSEU',
  'Greece':        'DEXUSEU',
  'Hungary':       'DEXHUS',
  'India':         'DEXINUS',
  'Israel':        'DEXIAUS',  // NIS per USD
  'Japan':         'DEXJPUS',
  'Malaysia':      'DEXMAUS',
  'Mexico':        'DEXMXUS',
  'New Zealand':   'DEXUSNZ',  // USD per NZD (inverted)
  'Norway':        'DEXNOUS',
  'Pakistan':      'DEXPAUS',
  'Philippines':   'DEXPAUS',
  'Poland':        'DEXPZUS',
  'Russia':        'DEXRUUS',
  'Saudi Arabia':  'DEXSAUS',
  'Singapore':     'DEXSIUS',
  'South Africa':  'DEXSFUS',
  'South Korea':   'DEXKOUS',
  'Sri Lanka':     'DEXSLUS',
  'Sweden':        'DEXSDUS',
  'Switzerland':   'DEXSZUS',
  'Taiwan':        'DEXTAUS',
  'Thailand':      'DEXTHUS',
  'Turkey':        'DEXTUS',
  'UAE':           'DEXUAE',
  'Ukraine':       'DEXUAUS',  // UAH per USD proxy
  'United Kingdom':'DEXUSUK',  // USD per GBP (inverted)
  'United States': 'DTWEXBGS', // Trade-weighted USD index
  'Venezuela':     'DEXVZUS',
  'Vietnam':       'DEXVNUS'
};

// Global financial stress index — applies as a baseline multiplier to all countries
const GLOBAL_STRESS_SERIES = 'STLFSI4';  // St. Louis Fed Financial Stress Index

function fetchFREDSeries(seriesId, limit = 60) {
  return new Promise((resolve, reject) => {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${FRED_KEY}&file_type=json&sort_order=desc&limit=${limit}`;
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

// Static capital stress baseline for countries without FRED FX coverage
// Based on IMF capital flow volatility and sovereign debt ratings
const CAPITAL_BASELINE = {
  'Afghanistan': 75, 'CAR': 60, 'DRC': 65, 'Ethiopia': 50, 'Haiti': 70,
  'Iraq': 55, 'Libya': 62, 'Mali': 48, 'Myanmar': 58, 'Niger': 45,
  'North Korea': 80, 'Somalia': 72, 'South Sudan': 78, 'Sudan': 68,
  'Syria': 85, 'Yemen': 80, 'Zimbabwe': 72, 'Burkina Faso': 42,
  'Burundi': 55, 'Chad': 50, 'Eritrea': 65, 'Guinea': 45,
  'Guinea-Bissau': 50, 'Liberia': 48, 'Malawi': 52, 'Mozambique': 45,
  'Rwanda': 35, 'Sierra Leone': 50, 'Togo': 38
};

async function fetchCapitalFlowsData(country) {
  if (CAPITAL_BASELINE[country] !== undefined) {
    return { score: CAPITAL_BASELINE[country], source: 'baseline' };
  }

  if (!FRED_KEY) return { score: null, reason: 'no_api_key' };

  const seriesId = FRED_FX_SERIES[country];
  if (!seriesId) return { score: null, reason: 'no_fred_series' };

  try {
    const [fxResp, stressResp] = await Promise.all([
      fetchFREDSeries(seriesId, 90),
      fetchFREDSeries(GLOBAL_STRESS_SERIES, 5)
    ]);

    const obs = fxResp?.observations?.filter(o => o.value !== '.' && o.value !== 'NA') || [];
    if (obs.length < 20) return { score: null, reason: 'insufficient_data' };

    // 90-day FX trend — depreciation vs USD
    const recent   = parseFloat(obs[0].value);
    const prev90   = parseFloat(obs[Math.min(obs.length - 1, 89)].value);

    // Inverted series (USD per local) need special handling
    const inverted = ['DEXUSAL','DEXUSEU','DEXUSNZ','DEXUSUK'].includes(seriesId);
    const changePct = inverted
      ? ((prev90 - recent) / prev90) * 100   // declining USD/local = local weakening
      : ((recent - prev90) / prev90) * 100;  // rising local/USD = local weakening

    const fxScore = Math.min(50, Math.max(0, Math.round(changePct * 1.5)));

    // Global financial stress overlay (St. Louis FSI: >1 = elevated, >2 = high)
    let globalStress = 0;
    const stressObs = stressResp?.observations?.filter(o => o.value !== '.' && o.value !== 'NA') || [];
    if (stressObs.length > 0) {
      const fsi = parseFloat(stressObs[0].value);
      if (fsi > 2)      globalStress = 20;
      else if (fsi > 1) globalStress = 10;
      else if (fsi > 0) globalStress = 5;
    }

    const score = Math.min(100, fxScore + globalStress);
    return {
      score,
      fx_change_pct:  Math.round(changePct * 10) / 10,
      fx_score:       fxScore,
      global_stress:  globalStress,
      series:         seriesId,
      source:         'fred'
    };
  } catch (err) {
    logToHive({ source: 'fred_capital_feed', level: 'warn', event: 'fetch_error', data: { country, error: err.message } });
    return { score: null, reason: 'fetch_error', error: err.message };
  }
}

module.exports = { fetchCapitalFlowsData };
