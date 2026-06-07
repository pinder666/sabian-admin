// historical/baseline_discovery.cjs
// Discovers what "stable" looks like for each country × signal pair.
// Stable is not defined by humans — it is found from the data.
//
// Method:
//   For each country × signal:
//   1. Collect all non-gap historical readings
//   2. Remove statistical outliers (readings > 2 std deviations from rolling median)
//   3. What remains is the signal's stable-state distribution for that country
//   4. Store: median, P10, P90, and how many years of data were used
//
// The baseline is not a score. It is a reference range.
// When a current reading sits outside the P90 for that country, that is information.
// When it sits outside P90 for 90+ consecutive days, that is convergence material.

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const { logToHive } = require('../logger.cjs');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fetchCountrySignalReadings(country, signalKey) {
  const rows = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await sb
      .from('historical_signal_readings')
      .select('date, raw_value, gap, source')
      .eq('country', country)
      .eq('signal_key', signalKey)
      .eq('gap', false)
      .order('date', { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    page++;
  }
  return rows;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = (p / 100) * (sorted.length - 1);
  const lo  = Math.floor(idx);
  const hi  = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function removeOutliers(values) {
  if (values.length < 4) return values;
  const sorted = [...values].sort((a, b) => a - b);
  const med = percentile(sorted, 50);
  const q1  = percentile(sorted, 25);
  const q3  = percentile(sorted, 75);
  const iqr = q3 - q1;
  const lo  = q1 - 1.5 * iqr;
  const hi  = q3 + 1.5 * iqr;
  return values.filter(v => v >= lo && v <= hi);
}

async function buildBaselinesForCountry(country) {
  // Get all distinct signals — paginate to avoid Supabase 1000-row limit.
  // Countries with many signals (or signals added after initial load) would be cut off otherwise.
  const allRows = [];
  let page = 0;
  while (true) {
    const { data, error } = await sb
      .from('historical_signal_readings')
      .select('signal_key')
      .eq('country', country)
      .eq('gap', false)
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error || !data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < 1000) break;
    page++;
  }
  if (allRows.length === 0) return;

  const signals = [...new Set(allRows.map(r => r.signal_key))];

  for (const signalKey of signals) {
    const readings = await fetchCountrySignalReadings(country, signalKey);
    const values   = readings.map(r => r.raw_value).filter(v => v !== null);

    if (values.length < 3) {
      // Not enough data to establish a baseline
      await sb.from('signal_baselines').upsert({
        country,
        signal_key:      signalKey,
        baseline_median: null,
        baseline_p10:    null,
        baseline_p90:    null,
        sample_years:    values.length,
        note:            'insufficient_data',
        computed_at:     new Date().toISOString(),
      }, { onConflict: 'country,signal_key' });
      continue;
    }

    const stable = removeOutliers(values);
    const sorted = [...stable].sort((a, b) => a - b);

    const baseline_median = percentile(sorted, 50);
    const baseline_p10    = percentile(sorted, 10);
    const baseline_p90    = percentile(sorted, 90);

    await sb.from('signal_baselines').upsert({
      country,
      signal_key:      signalKey,
      baseline_median: parseFloat(baseline_median.toFixed(4)),
      baseline_p10:    parseFloat(baseline_p10.toFixed(4)),
      baseline_p90:    parseFloat(baseline_p90.toFixed(4)),
      sample_years:    stable.length,
      note:            `derived_from_${stable.length}_readings_outliers_removed`,
      computed_at:     new Date().toISOString(),
    }, { onConflict: 'country,signal_key' });

    // Source-specific baselines: if multiple sources write to this signal_key,
    // compute a separate baseline per source so incompatible scales don't contaminate
    // each other's IQR. Stored as signal_key = 'signalKey:source' — never in STRESS_DIRECTION
    // so invisible to existing scoring paths; only the source-aware path in
    // convergence_history.cjs uses them.
    const bySource = {};
    for (const r of readings) {
      if (r.raw_value === null) continue;
      const src = r.source || '';
      if (!bySource[src]) bySource[src] = [];
      bySource[src].push(r.raw_value);
    }
    if (Object.keys(bySource).length > 1) {
      for (const [src, srcVals] of Object.entries(bySource)) {
        if (srcVals.length < 3) continue;
        const srcStable = removeOutliers(srcVals);
        const srcSorted = [...srcStable].sort((a, b) => a - b);
        const srcKey    = `${signalKey}:${src}`;
        await sb.from('signal_baselines').upsert({
          country,
          signal_key:      srcKey,
          baseline_median: parseFloat(percentile(srcSorted, 50).toFixed(4)),
          baseline_p10:    parseFloat(percentile(srcSorted, 10).toFixed(4)),
          baseline_p90:    parseFloat(percentile(srcSorted, 90).toFixed(4)),
          sample_years:    srcStable.length,
          note:            `source_specific:${src}|derived_from_${srcStable.length}_readings`,
          computed_at:     new Date().toISOString(),
        }, { onConflict: 'country,signal_key' });
      }
    }
  }
}

async function buildAllBaselines() {
  console.log('\n🛰️  Baseline discovery — finding what stable looks like...\n');

  // Paginate to collect all distinct countries across the full table
  const allCountryRows = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await sb
      .from('historical_signal_readings')
      .select('country')
      .order('id', { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allCountryRows.push(...data);
    if (data.length < pageSize) break;
    page++;
  }
  const countries = [...new Set(allCountryRows.map(r => r.country))];
  console.log(`Processing ${countries.length} countries...\n`);

  let done = 0;
  for (const country of countries) {
    try {
      await buildBaselinesForCountry(country);
      done++;
      if (done % 10 === 0) console.log(`  ${done}/${countries.length} countries processed`);
    } catch (err) {
      console.error(`  ❌ ${country}: ${err.message}`);
    }
  }

  logToHive({
    source: 'baseline_discovery',
    level:  'intel',
    event:  'baselines_computed',
    data:   { countries_processed: done }
  });
  console.log(`\n✅ Baselines complete. ${done} countries processed.\n`);
}

buildAllBaselines().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
