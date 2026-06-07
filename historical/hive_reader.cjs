// historical/hive_reader.cjs
// Phase 3 Step 8 — Hive Feedback Loop.
//
// Reads sabian_hive_report.json — the operational log since day one.
// Surfaces patterns across four categories:
//
//   signal_failure_rate  — signals with persistent fetch failures
//   coverage_drift       — ingestion run sizes trending up or down
//   pipeline_anomaly     — runs where coverage dropped significantly vs prior run
//   observation_frequency — countries crossing thresholds repeatedly in the ledger
//
// ACLED removed 2026-06-01 (no key, EULA risk). acled_conflict_feed exclusion preserved for
// historical log entries that may still reference it.
//
// Writes findings to hive_observations (upsert on pattern_type, signal_key, country).
// Does NOT modify any source table. Surfaces only.
//
// Usage: node historical/hive_reader.cjs

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs   = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { logToHive } = require('../logger.cjs');

const sb       = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const HIVE_LOG = path.join(__dirname, '../sabian_hive_report.json');

// Excluded from failure analysis — known gaps, not reliability problems
const EXCLUDED_FROM_FAILURE = new Set(['acled_conflict_feed']);

// Failure rate above this → warn
const FAILURE_RATE_WARN     = 0.40;
const FAILURE_RATE_CRITICAL = 0.70;

// Coverage drop vs prior run above this → pipeline anomaly
const COVERAGE_DROP_THRESHOLD = 0.15;

// Country threshold crossings above this → observation_frequency flag
const OBS_FREQUENCY_THRESHOLD = 3;

// ── Table check ───────────────────────────────────────────────────────────────

async function checkTable() {
  const { error } = await sb.from('hive_observations').select('*').limit(1);
  if (error) {
    console.error('\n❌ Missing table: hive_observations');
    console.error('  Run: historical/MIGRATION_HIVE_OBSERVATIONS.sql in Supabase SQL editor');
    console.error('  https://supabase.com/dashboard/project/qdxgcyawpqxhhjprqyas/sql\n');
    process.exit(1);
  }
}

// ── Load hive ─────────────────────────────────────────────────────────────────

function loadHive() {
  if (!fs.existsSync(HIVE_LOG)) {
    console.error(`  No hive log found at ${HIVE_LOG}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(HIVE_LOG, 'utf8');
  return JSON.parse(raw);
}

// ── Pattern 1: Signal failure rate ───────────────────────────────────────────
// Counts fetch_failed vs fetch-success events per source.
// Maps source name → signal key for known feed sources.

const SOURCE_TO_SIGNAL = {
  worldbank_governance:     'governance',
  unhcr_displacement_feed:  'displacement',
  firms_fire_feed:          'fire_hotspot',
  imf_dots_feed:            'imf_fiscal',
  gdelt_conflict_feed:      'gdelt_conflict',
  comtrade_import_feed:     'trade_collapse',
  resource_conflict_feed:   'capital_flows',
  ooni_feed:                'power_grid',
  sanctions_feed:           'capital_flows',
};

function analyzeFailureRates(logs) {
  const counts = {};

  for (const entry of logs) {
    const src = entry.source;
    if (EXCLUDED_FROM_FAILURE.has(src)) continue;
    if (!SOURCE_TO_SIGNAL[src]) continue;

    if (!counts[src]) counts[src] = { failures: 0, successes: 0 };

    const ev = (entry.event || '').toLowerCase();
    if (ev.includes('fail') || ev.includes('error')) {
      counts[src].failures++;
    } else if (ev.includes('fetch') || ev.includes('scored') || ev.includes('complete')) {
      counts[src].successes++;
    }
  }

  const findings = [];
  for (const [src, c] of Object.entries(counts)) {
    const total = c.failures + c.successes;
    if (total < 5) continue; // not enough data
    const rate = c.failures / total;
    if (rate < FAILURE_RATE_WARN) continue;

    const signal   = SOURCE_TO_SIGNAL[src];
    const severity = rate >= FAILURE_RATE_CRITICAL ? 'critical' : 'warn';
    findings.push({
      pattern_type: 'signal_failure_rate',
      signal_key:   signal,
      country:      null,
      severity,
      finding:      `${signal} (${src}) has a ${(rate * 100).toFixed(0)}% fetch failure rate across ${total} attempts.`,
      evidence:     { source: src, failures: c.failures, successes: c.successes, failure_rate: parseFloat(rate.toFixed(3)) },
    });
  }

  return findings;
}

// ── Pattern 2: Coverage drift ─────────────────────────────────────────────────
// Reads ingestion_complete events and checks if total_written is trending.

function analyzeCoverageDrift(logs) {
  const runs = logs
    .filter(l => l.source === 'ingest_runner' && l.event === 'ingestion_complete' && l.data?.total_written)
    .map(l => ({ ts: l.timestamp, total: l.data.total_written, countries: l.data.countries }))
    .sort((a, b) => new Date(a.ts) - new Date(b.ts));

  if (runs.length < 3) return [];

  const first = runs[0].total;
  const last  = runs[runs.length - 1].total;
  const growth = (last - first) / first;

  const findings = [];

  if (growth < -0.05) {
    findings.push({
      pattern_type: 'coverage_drift',
      signal_key:   null,
      country:      null,
      severity:     'warn',
      finding:      `Ingestion coverage has contracted ${(Math.abs(growth)*100).toFixed(1)}% over ${runs.length} runs (${first.toLocaleString()} → ${last.toLocaleString()} rows).`,
      evidence:     { runs: runs.length, first_run_rows: first, last_run_rows: last, growth_pct: parseFloat((growth*100).toFixed(1)) },
    });
  } else {
    findings.push({
      pattern_type: 'coverage_drift',
      signal_key:   null,
      country:      null,
      severity:     'info',
      finding:      `Ingestion coverage has grown ${(growth*100).toFixed(1)}% over ${runs.length} runs (${first.toLocaleString()} → ${last.toLocaleString()} rows).`,
      evidence:     { runs: runs.length, first_run_rows: first, last_run_rows: last, growth_pct: parseFloat((growth*100).toFixed(1)) },
    });
  }

  return findings;
}

// ── Pattern 3: Pipeline anomalies ────────────────────────────────────────────
// Detects runs where country count or row count dropped sharply vs prior run.

function analyzePipelineAnomalies(logs) {
  const runs = logs
    .filter(l => l.source === 'ingest_runner' && l.event === 'ingestion_complete' && l.data)
    .map(l => ({ ts: l.timestamp, total: l.data.total_written || 0, countries: l.data.countries || 0 }))
    .sort((a, b) => new Date(a.ts) - new Date(b.ts));

  if (runs.length < 2) return [];

  const anomalies = [];
  for (let i = 1; i < runs.length; i++) {
    const prev = runs[i - 1];
    const curr = runs[i];
    if (prev.total === 0) continue;

    const drop = (prev.total - curr.total) / prev.total;
    if (drop > COVERAGE_DROP_THRESHOLD) {
      anomalies.push({ ts: curr.ts, drop, prev: prev.total, curr: curr.total });
    }
  }

  if (anomalies.length === 0) return [];

  return [{
    pattern_type: 'pipeline_anomaly',
    signal_key:   null,
    country:      null,
    severity:     'warn',
    finding:      `${anomalies.length} ingestion run(s) showed coverage drops >15% vs prior run. Largest drop: ${(Math.max(...anomalies.map(a=>a.drop))*100).toFixed(0)}%.`,
    evidence:     { anomaly_count: anomalies.length, anomalies: anomalies.slice(0, 5) },
  }];
}

// ── Pattern 4: Observation frequency ─────────────────────────────────────────
// Countries that appear repeatedly in observation_created events.

function analyzeObservationFrequency(logs) {
  const obsCounts = {};
  for (const entry of logs) {
    if (entry.source !== 'observation_ledger' || entry.event !== 'observation_created') continue;
    const country = entry.data?.country;
    if (!country) continue;
    obsCounts[country] = (obsCounts[country] || 0) + 1;
  }

  const findings = [];
  for (const [country, count] of Object.entries(obsCounts)) {
    if (count < OBS_FREQUENCY_THRESHOLD) continue;
    findings.push({
      pattern_type: 'observation_frequency',
      signal_key:   null,
      country,
      severity:     count >= 6 ? 'warn' : 'info',
      finding:      `${country} has crossed a risk threshold ${count} times in the observation ledger.`,
      evidence:     { country, crossing_count: count },
    });
  }

  return findings;
}

// ── Write observations ────────────────────────────────────────────────────────

async function writeObservations(findings) {
  if (findings.length === 0) return;

  // Normalize nulls for the UNIQUE constraint (country or signal_key = null → empty string for upsert key)
  const rows = findings.map(f => ({
    ...f,
    signal_key: f.signal_key || '',
    country:    f.country    || '',
    surfaced_at: new Date().toISOString(),
  }));

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb
      .from('hive_observations')
      .upsert(rows.slice(i, i + 500), { onConflict: 'pattern_type,signal_key,country' });
    if (error) throw error;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🛰️  Phase 3 Step 8 — Hive Feedback Loop');
  console.log('   Reading the hive. Surfacing patterns.\n');
  console.log('   Note: ACLED removed 2026-06-01 — conflict scoring via GDELT only.\n');

  await checkTable();

  console.log('  Loading hive log...');
  const logs = loadHive();
  console.log(`  ${logs.length} entries loaded. Date range: ${logs[0]?.timestamp?.slice(0,10)} → ${logs[logs.length-1]?.timestamp?.slice(0,10)}\n`);

  const allFindings = [
    ...analyzeFailureRates(logs),
    ...analyzeCoverageDrift(logs),
    ...analyzePipelineAnomalies(logs),
    ...analyzeObservationFrequency(logs),
  ];

  console.log(`  ${allFindings.length} patterns surfaced:\n`);

  const byType = {};
  for (const f of allFindings) {
    if (!byType[f.pattern_type]) byType[f.pattern_type] = [];
    byType[f.pattern_type].push(f);
  }

  for (const [type, items] of Object.entries(byType)) {
    console.log(`  [${type}]`);
    for (const item of items) {
      const sev = item.severity === 'critical' ? '🔴' : item.severity === 'warn' ? '🟡' : '⚪';
      console.log(`    ${sev} ${item.finding}`);
    }
    console.log('');
  }

  console.log('  Writing to Supabase...');
  await writeObservations(allFindings);
  console.log(`  hive_observations: ${allFindings.length} rows written.\n`);

  const warnCount = allFindings.filter(f => f.severity === 'warn' || f.severity === 'critical').length;

  logToHive({
    source: 'hive_reader',
    level: 'intel',
    event: 'hive_patterns_surfaced',
    data: {
      total_findings: allFindings.length,
      warn_or_critical: warnCount,
      by_type: Object.fromEntries(Object.entries(byType).map(([k,v]) => [k, v.length])),
    },
  });

  console.log('═'.repeat(60));
  console.log('✅ Phase 3 Step 8 — Hive feedback loop complete.');
  console.log(`   Patterns surfaced: ${allFindings.length}`);
  console.log(`   Warn/critical:     ${warnCount}`);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
