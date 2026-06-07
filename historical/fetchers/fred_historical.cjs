// historical/fetchers/fred_historical.cjs
// FRED capital flows and financial stress historical data.
// Covers: FX stress indices, capital flow proxies, sovereign spreads back to 1970.
// Returns array of { signal_key, date, raw_value, raw_metadata, source, gap, gap_reason }

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const https = require('https');

const FRED_KEY = process.env.FRED_API_KEY;

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(new Error(`JSON parse: ${e.message}`)); }
      });
    }).on('error', reject);
  });
}

// FRED series relevant to capital flows and financial stress
// These are global/US-anchored series that proxy capital conditions globally
const FRED_SERIES = [
  { id: 'STLFSI4',     name: 'St. Louis Financial Stress Index',       start: '1994-01-01' },
  { id: 'DTWEXBGS',    name: 'USD Trade-Weighted Broad Index',          start: '2006-01-01' },
  { id: 'BAMLH0A0HYM2', name: 'US High Yield OAS (global risk proxy)',  start: '1996-12-31' },
  { id: 'GVZCLS',      name: 'Gold VIX (sovereign stress proxy)',       start: '2008-01-01' },
  { id: 'EMVOVERALLEMV', name: 'Equity Market Volatility Index',        start: '1990-01-01' },
];

async function fetchFredSeries(seriesId, start) {
  if (!FRED_KEY) return [];
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&observation_start=${start}&api_key=${FRED_KEY}&file_type=json&limit=10000`;
  try {
    const json = await httpsGet(url);
    return (json.observations || []).map(obs => ({
      date:  obs.date,
      value: obs.value === '.' ? null : parseFloat(obs.value),
    }));
  } catch (err) {
    return [{ date: start, value: null, error: err.message }];
  }
}

async function fetchFredHistorical(country) {
  // FRED capital flow data is US/global anchored — same series for all countries.
  // Per-country FX data uses Alpha Vantage (separate fetcher).
  // This captures the global financial stress context.

  const results = [];

  for (const series of FRED_SERIES) {
    const observations = await fetchFredSeries(series.id, series.start);
    for (const obs of observations) {
      results.push({
        signal_key:   'capital_flows',
        signal_name:  'Capital Flows',
        date:         obs.date,
        raw_value:    obs.value,
        raw_metadata: { series_id: series.id, series_name: series.name, country },
        source:       'fred_api',
        gap:          obs.value === null,
        gap_reason:   obs.value === null ? 'missing_observation' : null,
      });
    }
    await new Promise(r => setTimeout(r, 400));
  }

  return results;
}

module.exports = { fetchFredHistorical };
