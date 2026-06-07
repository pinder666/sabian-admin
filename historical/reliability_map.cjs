// historical/reliability_map.cjs
// Builds the signal reliability map from ingested historical data.
// Runs after ingest_runner.cjs has populated historical_signal_readings.
// Outputs to signal_reliability_map table.
//
// Reliability is derived from the data — not defined by humans.
// It measures: coverage, variance, noise, and behavioral patterns under stress.

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const { logToHive } = require('../logger.cjs');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Fetch all readings for a signal across all countries
async function fetchSignalReadings(signalKey) {
  const rows = [];
  let page = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await sb
      .from('historical_signal_readings')
      .select('country, date, raw_value, gap')
      .eq('signal_key', signalKey)
      .order('id', { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    page++;
  }
  return rows;
}

function computeStats(values) {
  const valid = values.filter(v => v !== null && !isNaN(v));
  if (valid.length === 0) return { mean: null, median: null, std_dev: null, noise_index: null };

  const sorted = [...valid].sort((a, b) => a - b);
  const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  const variance = valid.reduce((acc, v) => acc + (v - mean) ** 2, 0) / valid.length;
  const std_dev = Math.sqrt(variance);
  // Noise index: coefficient of variation, capped at 1.0
  const noise_index = mean !== 0 ? Math.min(1.0, std_dev / Math.abs(mean)) : null;

  return { mean, median, std_dev, noise_index };
}

// Reliability tiers based on coverage and noise
function assignReliabilityTier(coveragePct, noiseIndex) {
  if (coveragePct >= 0.80 && (noiseIndex === null || noiseIndex < 0.5))
    return 'anchor';
  if (coveragePct >= 0.60)
    return 'supporting';
  if (coveragePct >= 0.30)
    return 'supplemental';
  return 'low_coverage';
}

async function buildReliabilityMap() {
  console.log('\n🛰️  Building signal reliability map...\n');

  // Discover signal keys directly from data — not from registry.
  // Any signal with rows in historical_signal_readings gets a reliability entry.
  // This ensures new signals and legacy signals (e.g. corruption_risk from TI CPI)
  // are automatically picked up without requiring registry updates.
  const allKeys = new Set();
  let kPage = 0;
  while (true) {
    const { data, error } = await sb
      .from('historical_signal_readings')
      .select('signal_key')
      .order('id', { ascending: true })
      .range(kPage * 1000, (kPage + 1) * 1000 - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) allKeys.add(r.signal_key);
    if (data.length < 1000) break;
    kPage++;
  }

  const unique = [...allKeys].sort();
  console.log(`Found ${unique.length} signals with data in historical_signal_readings.\n`);

  for (const signalKey of unique) {
    const readings = await fetchSignalReadings(signalKey);
    if (readings.length === 0) continue;

    const total = readings.length;
    const gaps  = readings.filter(r => r.gap).length;
    const coveragePct = (total - gaps) / total;

    const values = readings.map(r => r.raw_value);
    const stats  = computeStats(values);
    const tier   = assignReliabilityTier(coveragePct, stats.noise_index);

    const countries = new Set(readings.map(r => r.country));

    const row = {
      signal_key:       signalKey,
      coverage_pct:     parseFloat(coveragePct.toFixed(4)),
      mean_value:       stats.mean !== null ? parseFloat(stats.mean.toFixed(4)) : null,
      median_value:     stats.median !== null ? parseFloat(stats.median.toFixed(4)) : null,
      std_dev:          stats.std_dev !== null ? parseFloat(stats.std_dev.toFixed(4)) : null,
      noise_index:      stats.noise_index !== null ? parseFloat(stats.noise_index.toFixed(4)) : null,
      goes_dark_before_event: null, // requires event matching — populated in Phase 3
      reliability_tier: tier,
      countries_covered: countries.size,
      total_readings:   total,
      computed_at:      new Date().toISOString(),
    };

    const { error } = await sb
      .from('signal_reliability_map')
      .upsert(row, { onConflict: 'signal_key' });

    if (error) {
      console.error(`  ❌ ${signalKey}: ${error.message}`);
    } else {
      console.log(`  ✅ ${signalKey}: coverage=${(coveragePct * 100).toFixed(1)}% tier=${tier} countries=${countries.size}`);
    }
  }

  logToHive({ source: 'reliability_map', level: 'intel', event: 'reliability_map_built', data: { signals: unique.length } });
  console.log('\n✅ Reliability map complete.\n');
}

buildReliabilityMap().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
