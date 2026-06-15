// gdelt_conflict_feed.cjs
// GDELT DOC 2.0 API -- Global Database of Events, Language and Tone
// Free, no key required, no Cloudflare, near real-time (news-based, 24-48hr latency)
// Signal: normalized volume intensity of conflict/violence coverage per country
// Primary conflict signal — ACLED removed 2026-06-01, GDELT is the production source
// Follows fred_macro_data.cjs pattern

require('dotenv').config({ path: './.env' });
const https = require('https');
const { logToHive } = require('./logger.cjs');
const { resolveTableKey } = require('./resolve_table_key.cjs');

// Conflict query terms per country -- tailored to what GDELT news coverage picks up
// General: "Country conflict attack violence" covers most cases
// Some countries need a more specific alias (GDELT searches English news)
const COUNTRY_QUERY = {
  'Sudan':       'Sudan civil war RSF attack violence',
  'Myanmar':     'Myanmar Burma military junta conflict attack',
  'Yemen':       'Yemen war Houthi attack airstrike',
  'Syria':       'Syria conflict attack airstrike violence',
  'DRC':         'Congo DRC M23 rebel attack violence',
  'Somalia':     'Somalia al-Shabaab attack conflict',
  'Afghanistan': 'Afghanistan Taliban attack violence',
  'South Sudan': 'South Sudan conflict attack fighting',
  'CAR':         'Central African Republic conflict attack',
  'Mali':        'Mali junta attack conflict violence',
  'Burkina Faso':'Burkina Faso attack jihadist conflict',
  'Niger':       'Niger attack conflict violence',
  'Ethiopia':    'Ethiopia Tigray Amhara attack conflict',
  'Nigeria':     'Nigeria Boko Haram bandit attack conflict',
  'Mozambique':  'Mozambique Cabo Delgado attack conflict',
  'Chad':        'Chad conflict attack violence',
  'Libya':       'Libya conflict militia attack fighting',
  'Haiti':       'Haiti gang attack violence',
  'Venezuela':   'Venezuela violence crime conflict protest',
  'Israel':      'Israel Gaza war attack airstrike',
  'Palestine':   'Gaza Palestine conflict attack airstrike',
  'Ukraine':     'Ukraine Russia war attack shelling',
  'Lebanon':     'Lebanon attack conflict Hezbollah violence',
  'Iraq':        'Iraq attack conflict militia violence',
  'Pakistan':    'Pakistan TTP attack conflict terrorism',
  'Colombia':    'Colombia FARC ELN attack conflict',
  'Cameroon':    'Cameroon Anglophone conflict attack',
  'Armenia':     'Armenia Azerbaijan conflict attack',
  'Georgia':     'Georgia Russia conflict attack',
  'Iran':        'Iran conflict protest crackdown attack',
  'Zimbabwe':    'Zimbabwe violence protest conflict',
  'Bangladesh':  'Bangladesh conflict attack violence',
  'Sri Lanka':   'Sri Lanka conflict attack violence',
  'Kenya':       'Kenya attack conflict al-Shabaab',
  'Uganda':      'Uganda attack conflict violence',
  'Tanzania':    'Tanzania conflict attack violence',
  'Zambia':      'Zambia conflict attack violence',
  'Senegal':     'Senegal protest conflict attack',
  'Guinea':      'Guinea conflict attack coup violence',
  'Ecuador':     'Ecuador crime gang attack violence',
  'Bolivia':     'Bolivia protest conflict violence',
  'Eritrea':     'Eritrea conflict attack violence',
  'Djibouti':    'Djibouti conflict attack violence',
  'Kosovo':      'Kosovo Serbia tension conflict',
  'Bosnia':      'Bosnia conflict tension violence',
  'Taiwan':      'Taiwan China military tension conflict',
  'North Korea': 'North Korea military threat conflict'
};

// Lookback window in days for coverage volume
const LOOKBACK_DAYS = 90;

async function fetchConflictCoverage(country, dateFrom, dateTo) {
  const { value: query } = await resolveTableKey(country, COUNTRY_QUERY);
  if (!query) {
    return { source: 'GDELT', country, error: `No GDELT query configured for ${country}` };
  }

  const endDate = dateTo || new Date().toISOString().slice(0, 10);
  const startDate = dateFrom || subtractDays(endDate, LOOKBACK_DAYS);

  // Format for GDELT: YYYYMMDDHHMMSS
  const startDT = startDate.replace(/-/g, '') + '000000';
  const endDT   = endDate.replace(/-/g, '')   + '235959';

  try {
    const encodedQuery = encodeURIComponent(query);
    const path = `/api/v2/doc/doc?query=${encodedQuery}&mode=timelinevol&format=json&startdatetime=${startDT}&enddatetime=${endDT}&sourcelang=eng`;

    const raw = await fetchJson('api.gdeltproject.org', path);

    const timeline = raw?.timeline?.[0]?.data;
    if (!timeline || !timeline.length) {
      return { source: 'GDELT', country, error: 'No timeline data returned', period: `${startDate} to ${endDate}` };
    }

    // Split into first half / second half to detect acceleration
    const mid = Math.floor(timeline.length / 2);
    const firstHalf  = timeline.slice(0, mid);
    const secondHalf = timeline.slice(mid);

    const avgFirst  = firstHalf.reduce((s, d)  => s + (d.value || 0), 0) / (firstHalf.length  || 1);
    const avgSecond = secondHalf.reduce((s, d) => s + (d.value || 0), 0) / (secondHalf.length || 1);
    const avgAll    = timeline.reduce((s, d)   => s + (d.value || 0), 0) / timeline.length;

    const acceleration = avgFirst > 0
      ? (avgSecond - avgFirst) / avgFirst
      : (avgSecond > 0 ? 1 : 0);

    // Peak intensity -- highest single-day volume in the period
    const peak = Math.max(...timeline.map(d => d.value || 0));

    // Score: GDELT volume intensity is normalized (0-1 range, 1 = top of global coverage)
    // Typical active conflict countries see 0.005-0.05 sustained; major wars hit 0.05+
    // >0.03 avg = 100, 0.01-0.03 = 60-90, 0.003-0.01 = 30-60, <0.003 = 0-30
    let base_score;
    if (avgAll >= 0.03)  base_score = 100;
    else if (avgAll >= 0.01) base_score = Math.round(60 + ((avgAll - 0.01) / 0.02) * 40);
    else if (avgAll >= 0.003) base_score = Math.round(30 + ((avgAll - 0.003) / 0.007) * 30);
    else base_score = Math.round((avgAll / 0.003) * 30);

    // Acceleration bonus: rising coverage in second half = escalation
    const accel_bonus = acceleration > 0.3 ? Math.min(15, Math.round(acceleration * 10)) : 0;

    const conflict_score = Math.min(100, base_score + accel_bonus);

    logToHive({
      source: 'gdelt_conflict_feed',
      level: 'intel',
      event: 'conflict_scored',
      data: { country, avgAll: parseFloat(avgAll.toFixed(5)), peak: parseFloat(peak.toFixed(5)), acceleration: parseFloat(acceleration.toFixed(2)), conflict_score },
      tags: ['gdelt', 'conflict', country]
    });

    return {
      source: 'GDELT',
      country,
      period: `${startDate} to ${endDate}`,
      conflict_score,
      avg_volume_intensity: parseFloat(avgAll.toFixed(5)),
      peak_intensity: parseFloat(peak.toFixed(5)),
      acceleration_ratio: parseFloat(acceleration.toFixed(2)),
      trend: acceleration > 0.3 ? 'escalating' : acceleration < -0.3 ? 'de-escalating' : 'sustained',
      data_points: timeline.length,
      fetched_at: new Date().toISOString()
    };

  } catch (err) {
    logToHive({
      source: 'gdelt_conflict_feed',
      level: 'error',
      event: 'fetch_failed',
      data: { country, message: err.message },
      tags: ['gdelt', 'conflict', 'error']
    });
    return { source: 'GDELT', country, error: err.message };
  }
}

function fetchJson(hostname, path) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`GDELT HTTP ${res.statusCode}`));
          return;
        }
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`GDELT parse error: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('GDELT timeout')); });
    req.end();
  });
}

function subtractDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

module.exports = fetchConflictCoverage;

// Standalone test: node gdelt_conflict_feed.cjs Sudan
if (require.main === module) {
  const country = process.argv[2] || 'Sudan';
  fetchConflictCoverage(country)
    .then(r => console.log(JSON.stringify(r, null, 2)))
    .catch(console.error);
}
