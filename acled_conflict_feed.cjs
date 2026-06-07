// DECOMMISSIONED 2026-06-01. ACLED removed from Sabian — no API key, no data, EULA risk
// (EULA: data may NOT be used for ML training). File kept for audit trail.
// All imports are null stubs. Conflict scoring now runs via GDELT only.
//
// acled_conflict_feed.cjs
// ACLED -- Armed Conflict Location & Event Data
// Auth: email + API access key in query params (NOT OAuth)
// EULA restriction: data may NOT be used to train/develop ML models

require('dotenv').config({ path: './.env' });
const https = require('https');
const { logToHive } = require('./logger.cjs');

const PRIORITY_COUNTRIES = [
  // Active conflicts
  'Mali', 'Burkina Faso', 'Niger', 'Sudan', 'Ethiopia', 'Somalia',
  'DRC', 'CAR', 'Chad', 'Myanmar', 'Venezuela', 'South Sudan',
  'Israel', 'Palestine', 'Ukraine', 'Colombia', 'Lebanon', 'Iraq',
  'Pakistan', 'Cameroon', 'Armenia', 'Georgia', 'Libya', 'Haiti',
  'Yemen', 'Syria', 'Afghanistan', 'Nigeria', 'Mozambique',
  // High-risk threshold watch
  'Zimbabwe', 'Iran', 'Kosovo', 'Bosnia', 'Zambia', 'Tanzania',
  'Senegal', 'Guinea', 'Ecuador', 'Bolivia', 'Bangladesh', 'Sri Lanka',
  'Kenya', 'Uganda', 'Eritrea', 'Djibouti'
];

// ACLED uses country names directly in query params
const COUNTRY_NAMES = {
  'Mali': 'Mali', 'Burkina Faso': 'Burkina Faso', 'Niger': 'Niger',
  'Sudan': 'Sudan', 'Ethiopia': 'Ethiopia', 'Somalia': 'Somalia',
  'DRC': 'Democratic Republic of Congo', 'CAR': 'Central African Republic',
  'Chad': 'Chad', 'Myanmar': 'Myanmar', 'Venezuela': 'Venezuela',
  'South Sudan': 'South Sudan', 'Israel': 'Israel', 'Palestine': 'Palestine',
  'Ukraine': 'Ukraine', 'Colombia': 'Colombia', 'Lebanon': 'Lebanon',
  'Iraq': 'Iraq', 'Pakistan': 'Pakistan', 'Cameroon': 'Cameroon',
  'Armenia': 'Armenia', 'Georgia': 'Georgia', 'Libya': 'Libya',
  'Haiti': 'Haiti', 'Yemen': 'Yemen', 'Syria': 'Syria',
  'Afghanistan': 'Afghanistan', 'Nigeria': 'Nigeria', 'Mozambique': 'Mozambique',
  'Zimbabwe': 'Zimbabwe', 'Iran': 'Iran', 'Kosovo': 'Kosovo',
  'Bosnia': 'Bosnia-Herzegovina', 'Zambia': 'Zambia', 'Tanzania': 'Tanzania',
  'Senegal': 'Senegal', 'Guinea': 'Guinea', 'Ecuador': 'Ecuador',
  'Bolivia': 'Bolivia', 'Bangladesh': 'Bangladesh', 'Sri Lanka': 'Sri Lanka',
  'Kenya': 'Kenya', 'Uganda': 'Uganda', 'Eritrea': 'Eritrea', 'Djibouti': 'Djibouti',
  'Taiwan': 'Taiwan', 'North Korea': 'North Korea'
};

// ── Fetch conflict events for a country ───────────────────────────────────────
// Auth: email + access key as query params -- no OAuth, no Bearer token

async function fetchConflictEvents(country, dateFrom, dateTo) {
  const email = process.env.ACLED_EMAIL;
  const apiKey = process.env.ACLED_API_KEY;

  if (!email || !apiKey) {
    throw new Error('ACLED_EMAIL + ACLED_API_KEY required -- get access key at developer.acleddata.com > Account Settings');
  }

  const acledName = COUNTRY_NAMES[country] || country;
  const endDate = dateTo || new Date().toISOString().slice(0, 10);
  const startDate = dateFrom || subtractDays(endDate, 180);

  const params = new URLSearchParams({
    email,
    key: apiKey,
    country: acledName,
    event_date: `${startDate}|${endDate}`,
    event_date_where: 'BETWEEN',
    limit: '500',
    fields: 'event_date|event_type|sub_event_type|fatalities|country|admin1|actor1|actor2',
    format: 'json'
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'acleddata.com',
      path: `/api/acled/read/?${params.toString()}`,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`ACLED HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
          return;
        }
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`ACLED parse error: ${e.message} -- raw: ${data.slice(0, 200)}`)); }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('ACLED fetch timeout')); });
    req.end();
  });
}

// ── Score conflict intensity 0-100 ────────────────────────────────────────────

function scoreConflict(events, dateFrom) {
  if (!events || !events.length) return { score: null, reason: 'no events returned' };

  const total_events = events.length;
  const total_fatalities = events.reduce((s, e) => s + (parseInt(e.fatalities) || 0), 0);

  // Split into first half and second half of period to detect acceleration
  const midDate = new Date((new Date(dateFrom).getTime() + Date.now()) / 2).toISOString().slice(0, 10);
  const firstHalf = events.filter(e => e.event_date < midDate);
  const secondHalf = events.filter(e => e.event_date >= midDate);

  const first_fatalities = firstHalf.reduce((s, e) => s + (parseInt(e.fatalities) || 0), 0);
  const second_fatalities = secondHalf.reduce((s, e) => s + (parseInt(e.fatalities) || 0), 0);

  // Acceleration ratio — rising fatalities in second half = higher risk
  const acceleration = first_fatalities > 0
    ? (second_fatalities - first_fatalities) / first_fatalities
    : second_fatalities > 0 ? 1 : 0;

  // Event type weighting — battles and violence against civilians score higher
  const violent_events = events.filter(e =>
    ['Battles', 'Violence against civilians', 'Explosions/Remote violence'].includes(e.event_type)
  );
  const violent_pct = total_events > 0 ? violent_events.length / total_events : 0;

  // Base score from fatality volume (calibrated to Sahel/conflict zone scale)
  // >2000 fatalities/6mo = 100, 500-2000 = 60-90, 100-500 = 30-60, <100 = 0-30
  let base_score;
  if (total_fatalities >= 2000) base_score = 100;
  else if (total_fatalities >= 500) base_score = Math.round(60 + ((total_fatalities - 500) / 1500) * 30);
  else if (total_fatalities >= 100) base_score = Math.round(30 + ((total_fatalities - 100) / 400) * 30);
  else base_score = Math.round((total_fatalities / 100) * 30);

  // Acceleration modifier: +0 to +15 points if escalating
  const accel_bonus = acceleration > 0.5 ? Math.min(15, Math.round(acceleration * 10)) : 0;

  // Violence type modifier: +0 to +10 if mostly violent events
  const type_bonus = Math.round(violent_pct * 10);

  const conflict_score = Math.min(100, base_score + accel_bonus + type_bonus);

  return {
    score: conflict_score,
    total_events,
    total_fatalities,
    violent_events: violent_events.length,
    violent_pct: Math.round(violent_pct * 100),
    acceleration_ratio: parseFloat(acceleration.toFixed(2)),
    trend: acceleration > 0.3 ? 'escalating' : acceleration < -0.3 ? 'de-escalating' : 'sustained'
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

async function fetchConflictData(country, dateFrom, dateTo) {
  const endDate = dateTo || new Date().toISOString().slice(0, 10);
  const startDate = dateFrom || subtractDays(endDate, 180);

  try {
    const raw = await fetchConflictEvents(country, startDate, endDate);
    const events = raw.data || raw.results || raw || [];

    if (!Array.isArray(events) || !events.length) {
      logToHive({
        source: 'acled_conflict_feed',
        level: 'warn',
        event: 'no_events_returned',
        data: { country, startDate, endDate },
        tags: ['acled', 'empty', country]
      });
      return {
        source: 'ACLED',
        country,
        period: `${startDate} to ${endDate}`,
        conflict_score: null,
        warning: 'No events returned for this country/period'
      };
    }

    const scored = scoreConflict(events, startDate);

    logToHive({
      source: 'acled_conflict_feed',
      level: 'intel',
      event: 'conflict_scored',
      data: {
        country,
        period: `${startDate} to ${endDate}`,
        total_events: scored.total_events,
        total_fatalities: scored.total_fatalities,
        conflict_score: scored.score,
        trend: scored.trend
      },
      tags: ['acled', 'conflict', country]
    });

    return {
      source: 'ACLED',
      country,
      period: `${startDate} to ${endDate}`,
      conflict_score: scored.score,
      total_events: scored.total_events,
      total_fatalities: scored.total_fatalities,
      violent_events: scored.violent_events,
      violent_pct: scored.violent_pct,
      acceleration_ratio: scored.acceleration_ratio,
      trend: scored.trend,
      fetched_at: new Date().toISOString()
    };

  } catch (err) {
    logToHive({
      source: 'acled_conflict_feed',
      level: 'error',
      event: 'fetch_failed',
      data: { country, message: err.message },
      tags: ['acled', 'error']
    });
    return { source: 'ACLED', country, error: err.message };
  }
}

// ── Bulk fetch all 12 priority countries ──────────────────────────────────────

async function fetchAllPriorityCountries(dateFrom, dateTo) {
  console.log(`Fetching ACLED data for ${PRIORITY_COUNTRIES.length} priority countries...`);
  const results = [];

  for (const country of PRIORITY_COUNTRIES) {
    const result = await fetchConflictData(country, dateFrom, dateTo);
    results.push(result);
    console.log(`  ${country}: ${result.conflict_score !== null ? result.conflict_score + '/100 — ' + (result.trend || '') : result.error || result.warning}`);
  }

  return results;
}

function subtractDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

module.exports = { fetchConflictData, fetchAllPriorityCountries, PRIORITY_COUNTRIES };

// Standalone tests:
//   node acled_conflict_feed.cjs Mali              — single country
//   node acled_conflict_feed.cjs all               — all 12 priority countries
//   node acled_conflict_feed.cjs Mali 2025-09-01 2026-03-01  — retroactive
if (require.main === module) {
  const arg = process.argv[2] || 'Mali';
  const dateFrom = process.argv[3] || null;
  const dateTo = process.argv[4] || null;

  if (arg === 'all') {
    fetchAllPriorityCountries(dateFrom, dateTo).then(results => {
      console.log('\n' + JSON.stringify(results, null, 2));
    }).catch(console.error);
  } else {
    fetchConflictData(arg, dateFrom, dateTo).then(result => {
      console.log(JSON.stringify(result, null, 2));
    }).catch(console.error);
  }
}
