// who_health_feed.cjs
// Health Crisis Signal — disease.sh public API + WHO disease outbreak news
// Score 0–100: higher = greater active disease burden / outbreak risk
// No API key required — fully open data
// Cadence: 24h

require('dotenv').config({ path: './.env' });
const https = require('https');
const { logToHive } = require('./logger.cjs');

// disease.sh country name → API slug normalisation
const COUNTRY_SLUG = {
  'Bolivia': 'bolivia', 'Bosnia': 'bosnia', 'Burkina Faso': 'burkina-faso',
  'CAR': 'central-african-republic', 'Congo': 'congo', 'Cote d\'Ivoire': 'ivory-coast',
  'DRC': 'democratic-republic-of-congo', 'Ivory Coast': 'ivory-coast',
  'North Korea': 'north-korea', 'Palestine': 'state-of-palestine',
  'South Korea': 'south-korea', 'South Sudan': 'south-sudan',
  'Sri Lanka': 'sri-lanka', 'Trinidad and Tobago': 'trinidad-and-tobago',
  'UAE': 'uae', 'United Kingdom': 'uk', 'United States': 'usa',
  'Papua New Guinea': 'papua-new-guinea', 'Timor-Leste': 'timor-leste'
};

function fetchCountryHealth(slug) {
  return new Promise((resolve, reject) => {
    const url = `https://disease.sh/v3/covid-19/countries/${encodeURIComponent(slug)}?strict=true`;
    https.get(url, { headers: { 'Accept': 'application/json' }, timeout: 8000 }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch (e) { resolve({ status: res.statusCode, data: null }); }
      });
    }).on('error', reject).on('timeout', () => reject(new Error('timeout')));
  });
}

function fetchWHOOutbreaks() {
  return new Promise((resolve, reject) => {
    // WHO Disease Outbreak News API
    const url = 'https://www.who.int/api/news/diseaseoutbreaknews?sf_culture=en&$top=50';
    https.get(url, { headers: { 'Accept': 'application/json' }, timeout: 8000 }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { resolve(null); }
      });
    }).on('error', () => resolve(null)).on('timeout', () => resolve(null));
  });
}

async function fetchHealthCrisisData(country) {
  const slug = COUNTRY_SLUG[country] || country.toLowerCase().replace(/\s+/g, '-');

  try {
    const [healthResp, outbreaks] = await Promise.all([
      fetchCountryHealth(slug),
      fetchWHOOutbreaks()
    ]);

    let baseScore = 0;
    let details = {};

    // Component 1: Active disease cases per million (capped at 40 pts)
    if (healthResp.status === 200 && healthResp.data) {
      const d = healthResp.data;
      const activePer1M = d.activePerOneMillion || 0;
      const deathsPer1M = d.deathsPerOneMillion || 0;

      const caseScore  = Math.min(30, Math.round(activePer1M / 500));
      const deathScore = Math.min(10, Math.round(deathsPer1M / 200));
      baseScore += caseScore + deathScore;

      details = {
        active_per_million:  Math.round(activePer1M),
        deaths_per_million:  Math.round(deathsPer1M),
        case_score:  caseScore,
        death_score: deathScore
      };
    }

    // Component 2: WHO active outbreak mentions for this country (+15 per active outbreak, cap 60)
    let outbreakBonus = 0;
    if (outbreaks && outbreaks.value) {
      const countryLower = country.toLowerCase();
      const relevant = outbreaks.value.filter(o => {
        const title = (o.Title || o.title || '').toLowerCase();
        const summary = (o.Summary || o.summary || '').toLowerCase();
        return title.includes(countryLower) || summary.includes(countryLower);
      });
      outbreakBonus = Math.min(60, relevant.length * 15);
      details.who_outbreaks = relevant.length;
    }

    const score = Math.min(100, baseScore + outbreakBonus);
    return { score, ...details };

  } catch (err) {
    logToHive({ source: 'who_health_feed', level: 'warn', event: 'fetch_error', data: { country, error: err.message } });
    return { score: null, reason: 'fetch_error', error: err.message };
  }
}

module.exports = { fetchHealthCrisisData };
