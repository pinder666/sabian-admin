// historical/live_stream.cjs
// Phase 4 Step 9a — Live Signal Streaming
//
// Bridges today's live engine output into the historical record.
// Runs after each daily scan (cron 0700 UTC) or on demand.
//
// What it does:
//   1. Reads today's convergence_scores + signal_readings from live tables
//   2. Converts each live signal score to stress_z via inverse formula:
//      stress_z = (signal_score - 50) / 15
//   3. Writes to historical_convergence_scores as year = currentYear
//   4. Re-runs synthesizer → script_cache → paperclip to refresh all downstream
//
// The live convergence_score (0-100) is on the same scale as historical scores.
// The stress_z derivation is approximate — the live engine uses absolute scores,
// not baseline-relative z-scores. Directionally correct; marked live_source=true
// in the row so the distinction is traceable.
//
// Signal name normalization: live names ("Satellite Fire") → historical keys
// ("satellite_fire") via lowercase + underscore. Historical signal keys that
// have exact matches in the live engine are flagged in SIGNAL_NAME_MAP.
//
// Usage: node historical/live_stream.cjs
//        node historical/live_stream.cjs --date 2026-05-24  (backfill a date)

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const { logToHive }    = require('../logger.cjs');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SCORE_CENTER = 50;
const SCORE_SCALE  = 15;

// Maps live signal_name → historical signal_key where the meaning aligns.
// Live signals not in this map get normalized names (lowercase + underscore).
const SIGNAL_NAME_MAP = {
  'Displacement':      'displacement',
  'Conflict':          'gdelt_conflict',
  'GDELT Conflict':    'gdelt_conflict',
  'Governance':        'governance',
  'Economic Stress':   'economic_stress',
  'Capital Flows':     'capital_flows',
  'Trade':             'trade_collapse',
  'Power Grid':        'power_grid',
  'IMF Fiscal':        'imf_fiscal',
  'Satellite Fire':    'fire_hotspot',
  'Seismic':           'seismic_risk',
  'Climate Stress':    'seismic_risk',   // closest available; logged as approximate
};

function normalizeSignalName(name) {
  if (SIGNAL_NAME_MAP[name]) return SIGNAL_NAME_MAP[name];
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

// ── Load live data ────────────────────────────────────────────────────────────

async function loadLatestLiveScores(date) {
  const { data, error } = await sb
    .from('convergence_scores')
    .select('country,scan_date,convergence_score,signals_available')
    .eq('scan_date', date)
    .order('country');
  if (error) throw error;
  return data || [];
}

async function loadLiveSignalReadings(date) {
  // Returns: { [country]: [ { signal_name, score, raw_data } ] }
  const out = {};
  let page = 0;
  while (true) {
    const { data, error } = await sb
      .from('signal_readings')
      .select('country,signal_name,score,raw_data')
      .eq('scan_date', date)
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (!out[r.country]) out[r.country] = [];
      out[r.country].push(r);
    }
    if (data.length < 1000) break;
    page++;
  }
  return out;
}

// ── Build historical row ──────────────────────────────────────────────────────

function buildHistoricalRow(country, liveScore, signalReadings, year) {
  const signals = signalReadings[country] || [];
  const breakdown = {};

  for (const sig of signals) {
    if (sig.score === null || sig.score === undefined) continue;
    const key       = normalizeSignalName(sig.signal_name);
    const stressZ   = parseFloat(((sig.score - SCORE_CENTER) / SCORE_SCALE).toFixed(3));
    const weight    = sig.raw_data?.weight_used || sig.raw_data?.weight || 0;
    const contrib   = parseFloat((stressZ * weight).toFixed(3));
    breakdown[key]  = { z: stressZ, stress_z: stressZ, weight, contribution: contrib, live_source: true };
  }

  const signalsUsed = Object.keys(breakdown).length;
  if (signalsUsed === 0) return null;

  return {
    country,
    year,
    score:             parseFloat(liveScore.convergence_score),
    signals_used:      signalsUsed,
    signals_available: liveScore.signals_available || signalsUsed,
    breakdown,
    computed_at:       new Date().toISOString(),
    data_status:       'provisional',
  };
}

// ── Write ─────────────────────────────────────────────────────────────────────

async function writeHistoricalRows(rows) {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb
      .from('historical_convergence_scores')
      .upsert(rows.slice(i, i + 500), { onConflict: 'country,year' });
    if (error) throw error;
  }
}

// ── Refresh synthesis chain ───────────────────────────────────────────────────

async function refreshSynthesisChain() {
  // Synthesizer → script_cache → paperclip — all read from Supabase, no extra args needed
  console.log('\n  Refreshing synthesis chain...');
  const { execSync } = require('child_process');
  const root = require('path').join(__dirname, '..');

  const steps = [
    { name: 'synthesizer',   cmd: 'node historical/synthesizer.cjs' },
    { name: 'script_cache',  cmd: 'node historical/script_cache.cjs' },
    { name: 'paperclip',     cmd: 'node historical/paperclip.cjs' },
  ];

  for (const step of steps) {
    process.stdout.write(`    Running ${step.name}...`);
    try {
      execSync(step.cmd, { cwd: root, stdio: 'pipe' });
      console.log(' done.');
    } catch (err) {
      console.log(` ⚠️  ${err.message.slice(0, 80)}`);
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  let targetDate = args.includes('--date') ? args[args.indexOf('--date') + 1] : null;

  // Default to today
  if (!targetDate) targetDate = new Date().toISOString().slice(0, 10);
  const year = parseInt(targetDate.slice(0, 4));

  console.log('\n🛰️  Phase 4 Step 9a — Live Signal Streaming');
  console.log(`   Bridging live scan (${targetDate}) into historical record as year ${year}.\n`);

  console.log('  Loading live scores...');
  const liveScores = await loadLatestLiveScores(targetDate);
  if (liveScores.length === 0) {
    console.error(`  No live scores found for ${targetDate}. Has the daily scan run?`);
    process.exit(1);
  }
  console.log(`  ${liveScores.length} countries loaded from live scan.\n`);

  console.log('  Loading live signal readings...');
  const signalReadings = await loadLiveSignalReadings(targetDate);
  const sigCountries = Object.keys(signalReadings).length;
  const sigTotal     = Object.values(signalReadings).reduce((s, a) => s + a.length, 0);
  console.log(`  ${sigTotal} signal readings across ${sigCountries} countries.\n`);

  console.log('  Building historical rows...');
  const rows = [];
  let skipped = 0;
  for (const ls of liveScores) {
    const row = buildHistoricalRow(ls.country, ls, signalReadings, year);
    if (row) rows.push(row);
    else skipped++;
  }
  console.log(`  ${rows.length} rows built. ${skipped} skipped (no signals).\n`);

  // Sample
  const sample = rows.find(r => r.country === 'Mali') || rows[0];
  if (sample) {
    const keys = Object.keys(sample.breakdown).slice(0, 4).map(k => {
      const s = sample.breakdown[k];
      return `${k}(z=${s.stress_z})`;
    });
    console.log(`  Sample: ${sample.country} ${year} → score ${sample.score} | ${keys.join(', ')}${keys.length < Object.keys(sample.breakdown).length ? '...' : ''}`);
    console.log('');
  }

  console.log('  Writing to historical_convergence_scores...');
  await writeHistoricalRows(rows);
  console.log(`  ${rows.length} rows written as year ${year}.\n`);

  logToHive({
    source: 'live_stream',
    level: 'intel',
    event: 'live_stream_complete',
    data: { scan_date: targetDate, year, countries: rows.length, skipped },
  });

  await refreshSynthesisChain();

  console.log('');
  console.log('═'.repeat(60));
  console.log('✅ Phase 4 Step 9a — Live stream complete.');
  console.log(`   Live scan bridged:  ${targetDate} → year ${year}`);
  console.log(`   Countries written:  ${rows.length}`);
  console.log(`   Synthesis refreshed: synthesizer → script_cache → paperclip`);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
