// iom_displacement_feed.cjs
// IOM Internal Displacement Signal — real DTM API wrapper
// Source: IOM Displacement Tracking Matrix (DTM) v3 API
// Score 0–100: higher = more active internal displacement
// No hardcoded fallbacks — returns null if DTM has no data for the country

require('dotenv').config({ path: './.env' });
const { createClient } = require('@supabase/supabase-js');
const { fetchIomDtmHistorical } = require('./historical/fetchers/iom_dtm_historical.cjs');
const { logToHive } = require('./logger.cjs');

let _sbClient = null;
function getSupabase() {
  if (_sbClient) return _sbClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  _sbClient = createClient(url, key, { auth: { persistSession: false } });
  return _sbClient;
}

async function fetchIomDisplacementData(country) {
  const sb = getSupabase();

  // 1. Get canonical name + aliases from countries_canonical
  const { data: canonRow, error: canonErr } = await sb
    .from('countries_canonical')
    .select('canonical_name, aliases')
    .ilike('canonical_name', country)
    .maybeSingle();

  let namesToTry = [country];
  if (canonRow) {
    namesToTry = [canonRow.canonical_name, ...(canonRow.aliases || [])];
  }

  // 2. Try each name against DTM until we get rows with real data
  let matchedName = null;
  let dtmRows = [];

  for (const name of namesToTry) {
    try {
      const rows = await fetchIomDtmHistorical(name);
      const withData = rows.filter(r => r.raw_value > 0);
      if (withData.length > 0) {
        matchedName = name;
        dtmRows = rows;
        break;
      }
    } catch (err) {
      // continue to next alias
    }
  }

  // 3. If no match, return null score
  if (!matchedName || dtmRows.length === 0) {
    logToHive({
      source: 'iom_displacement_feed',
      level: 'warn',
      event: 'dtm_no_match',
      data: { country, tried_names: namesToTry },
      tags: ['displacement', 'dtm', 'no_data']
    });
    return {
      score: null,
      source: 'iom_dtm_v3',
      reason: 'no_dtm_match_for_any_alias',
      tried_names: namesToTry
    };
  }

  // 4. Aggregate: latest reportingDate per admin1 region, then sum
  // Group by admin1 region, keep only latest row per region
  const byRegion = {};
  for (const row of dtmRows) {
    const region = row.raw_metadata?.row?.idpOriginAdmin1Pcode || row.raw_metadata?.row?.idpOriginAdmin1Name || 'unknown';
    const date = row.date || '1900-01-01';
    if (!byRegion[region] || date > byRegion[region].date) {
      byRegion[region] = { date, value: row.raw_value, reason: row.raw_metadata?.row?.displacementReason };
    }
  }

  let conflictIdps = 0;
  let disasterIdps = 0;
  let totalIdps = 0;

  for (const r of Object.values(byRegion)) {
    totalIdps += r.value || 0;
    const reason = (r.reason || '').toLowerCase();
    if (reason.includes('conflict') || reason.includes('violence')) {
      conflictIdps += r.value || 0;
    } else if (reason.includes('disaster') || reason.includes('flood') || reason.includes('drought') || reason.includes('cyclone')) {
      disasterIdps += r.value || 0;
    } else {
      // default unclassified to conflict (conservative)
      conflictIdps += r.value || 0;
    }
  }

  // 5. Score: log scale, 100k IDPs ~ 84, 1M ~ 100
  // Formula: Math.min(100, Math.round(Math.log10(total + 1) * 16.7))
  const score = Math.min(100, Math.round(Math.log10(totalIdps + 1) * 16.7));

  logToHive({
    source: 'iom_displacement_feed',
    level: 'intel',
    event: 'dtm_fetched',
    data: { country, matched_name: matchedName, total_idps: totalIdps, score, regions: Object.keys(byRegion).length },
    tags: ['displacement', 'dtm', country]
  });

  return {
    score,
    idps_thousands: Math.round(totalIdps / 1000),
    conflict_idps: conflictIdps,
    disaster_idps: disasterIdps,
    trend: 'baseline',
    source: 'iom_dtm_v3',
    tried_names: [matchedName],
    reason: null
  };
}

module.exports = { fetchIomDisplacementData };
