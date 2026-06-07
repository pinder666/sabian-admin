// historical/synthesizer.cjs
// Phase 2 Step 5 — The Synthesizer.
//
// Takes everything Phase 1 built — raw history, baselines, reliability tiers,
// signal relationships, lead indicators, going-dark patterns, convergence scores —
// and synthesizes a single structured intelligence record per country.
//
// For each country:
//   - Current score vs historical baseline
//   - Trajectory over last 5 available years
//   - Which leading signals are elevated right now
//   - Which signals went dark and what historically follows
//   - Top 3 historical analogs (country-years that looked like this)
//
// No human opinion. The synthesis is what the data says about itself.
//
// Usage: node historical/synthesizer.cjs
//        node historical/synthesizer.cjs --country Mali

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const { logToHive } = require('../logger.cjs');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const LEAD_THRESHOLD    = 1.0;  // stress_z above this = "active" lead
const ANALOG_WINDOW     = 8;    // score must be within this many points for analog match
const TRAJECTORY_YEARS  = 5;    // how many years back to compute trajectory
const MIN_ANALOG_SIGS   = 2;    // analog must share at least this many signals

// ── Table check ───────────────────────────────────────────────────────────────

async function checkTable() {
  const { error } = await sb.from('synthesis_records').select('*').limit(1);
  if (error) {
    console.error('\n❌ Missing table: synthesis_records');
    console.error('  Run: historical/MIGRATION_SYNTHESIS.sql in Supabase SQL editor');
    console.error('  https://supabase.com/dashboard/project/qdxgcyawpqxhhjprqyas/sql\n');
    process.exit(1);
  }
}

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadAllHistoricalScores() {
  // Returns: scores[country][year] = { score, breakdown, signals_used }
  const out = {};
  let page = 0;
  process.stdout.write('  Loading historical scores .');
  while (true) {
    const { data, error } = await sb
      .from('historical_convergence_scores')
      .select('country,year,score,breakdown,signals_used')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (!out[r.country]) out[r.country] = {};
      out[r.country][r.year] = {
        score:        parseFloat(r.score),
        breakdown:    r.breakdown || {},
        signals_used: r.signals_used || 0,
      };
    }
    if (data.length < 1000) break;
    page++;
    if (page % 5 === 0) process.stdout.write('.');
  }
  console.log(` done.`);
  return out;
}

async function loadLeadIndicators() {
  const { data, error } = await sb.from('signal_lead_indicators').select('*');
  if (error) throw error;
  // leads[signal_key] = { best_lead_target, best_lead_lag, best_lead_r, signals_led }
  const out = {};
  for (const r of (data || [])) {
    out[r.signal_key] = {
      target: r.best_lead_target,
      lag:    r.best_lead_lag,
      r:      r.best_lead_r,
      all:    r.signals_led || [],
    };
  }
  return out;
}

async function loadGoingDarkPatterns() {
  const { data, error } = await sb.from('going_dark_patterns').select('*');
  if (error) throw error;
  // dark[signal_key][lag] = { spike_pct, affected_signals }
  const out = {};
  for (const r of (data || [])) {
    if (!out[r.signal_key]) out[r.signal_key] = {};
    out[r.signal_key][r.lag_years] = {
      spike_pct:        r.spike_pct,
      affected_signals: r.affected_signals || [],
    };
  }
  return out;
}

// ── Trajectory ────────────────────────────────────────────────────────────────

function computeTrajectory(country, currentYear, scores) {
  const countryScores = scores[country] || {};
  // Collect last TRAJECTORY_YEARS scores ending at currentYear
  const window = [];
  for (let y = currentYear - TRAJECTORY_YEARS; y <= currentYear; y++) {
    if (countryScores[y]) window.push({ year: y, score: countryScores[y].score });
  }
  if (window.length < 2) return { label: 'insufficient_data', slope: null };

  // Linear regression slope
  const n = window.length;
  const meanY = window.reduce((s, p) => s + p.year, 0) / n;
  const meanS = window.reduce((s, p) => s + p.score, 0) / n;
  let num = 0, den = 0;
  for (const p of window) {
    num += (p.year - meanY) * (p.score - meanS);
    den += (p.year - meanY) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;

  let label;
  if (slope > 1.5)       label = 'ascending';
  else if (slope < -1.5) label = 'descending';
  else                   label = 'stable';

  return { label, slope: parseFloat(slope.toFixed(3)) };
}

// ── Baseline score ────────────────────────────────────────────────────────────

function computeBaselineScore(country, scores) {
  const countryScores = Object.values(scores[country] || {}).map(r => r.score);
  if (countryScores.length === 0) return null;
  return parseFloat((countryScores.reduce((a, b) => a + b, 0) / countryScores.length).toFixed(2));
}

// ── Active leads ──────────────────────────────────────────────────────────────

function getActiveLeads(breakdown, leadIndicators) {
  const active = [];
  for (const [signal, data] of Object.entries(breakdown)) {
    if (!data || data.stress_z === undefined) continue;
    if (Math.abs(data.stress_z) < LEAD_THRESHOLD) continue;
    const lead = leadIndicators[signal];
    if (!lead) continue;
    active.push({
      signal,
      stress_z:    parseFloat(data.stress_z.toFixed(3)),
      leads:       lead.target,
      lag_years:   lead.lag,
      correlation: lead.r,
      direction:   data.stress_z > 0 ? 'elevated' : 'suppressed',
    });
  }
  return active.sort((a, b) => Math.abs(b.stress_z) - Math.abs(a.stress_z));
}

// ── Going dark ────────────────────────────────────────────────────────────────

function getDarkSignals(country, currentYear, previousYear, scores, darkPatterns) {
  if (!previousYear) return [];
  const prevBreakdown = scores[country]?.[previousYear]?.breakdown || {};
  const currBreakdown = scores[country]?.[currentYear]?.breakdown || {};

  const dark = [];
  for (const signal of Object.keys(prevBreakdown)) {
    if (currBreakdown[signal]) continue; // still present — not dark
    const patterns = darkPatterns[signal];
    if (!patterns) continue;

    const lags = Object.entries(patterns)
      .map(([lag, p]) => ({ lag: parseInt(lag), spike_pct: p.spike_pct, affected: p.affected_signals }))
      .sort((a, b) => b.spike_pct - a.spike_pct);

    dark.push({
      signal,
      went_dark_at: currentYear,
      patterns:     lags,
      highest_spike_pct: lags[0]?.spike_pct || 0,
    });
  }
  return dark.sort((a, b) => b.highest_spike_pct - a.highest_spike_pct);
}

// ── Historical analogs ────────────────────────────────────────────────────────

function findHistoricalAnalogs(country, currentYear, currentScore, currentBreakdown, trajectory, allScores) {
  if (currentScore === null) return [];

  const currentSignals = Object.keys(currentBreakdown);
  const candidates = [];

  for (const [candCountry, yearMap] of Object.entries(allScores)) {
    for (const [yearStr, data] of Object.entries(yearMap)) {
      const year = parseInt(yearStr);
      if (candCountry === country && year === currentYear) continue; // skip self
      if (Math.abs(data.score - currentScore) > ANALOG_WINDOW) continue;

      // Check signal overlap
      const candSignals = Object.keys(data.breakdown || {});
      const overlap = currentSignals.filter(s => candSignals.includes(s));
      if (overlap.length < MIN_ANALOG_SIGS) continue;

      // Compute similarity score: score proximity + signal vector distance
      const scoreDiff = Math.abs(data.score - currentScore);

      // Signal vector distance (stress_z for shared signals)
      let vecDist = 0;
      for (const sig of overlap) {
        const dz = (currentBreakdown[sig]?.stress_z || 0) - (data.breakdown[sig]?.stress_z || 0);
        vecDist += dz * dz;
      }
      vecDist = Math.sqrt(vecDist / overlap.length);

      // Combined similarity: lower is better
      const similarity = scoreDiff * 0.5 + vecDist * 10;

      candidates.push({
        country:    candCountry,
        year,
        score:      parseFloat(data.score.toFixed(1)),
        similarity: parseFloat(similarity.toFixed(3)),
        shared_signals: overlap.length,
        score_diff: parseFloat(scoreDiff.toFixed(1)),
      });
    }
  }

  // Prefer cross-country analogs, then sort by similarity
  return candidates
    .sort((a, b) => {
      const aForeign = a.country !== country ? 0 : 1;
      const bForeign = b.country !== country ? 0 : 1;
      if (aForeign !== bForeign) return aForeign - bForeign;
      return a.similarity - b.similarity;
    })
    .slice(0, 3);
}

// ── Synthesize one country ────────────────────────────────────────────────────

function synthesizeCountry(country, allScores, leadIndicators, darkPatterns) {
  const countryScores = allScores[country];
  if (!countryScores || Object.keys(countryScores).length === 0) return null;

  // Most recent available year (cap at current calendar year — excludes FRED projections beyond today)
  const currentCalendarYear = new Date().getFullYear();
  const realYears = Object.keys(countryScores).map(Number).filter(y => y <= currentCalendarYear).sort((a, b) => b - a);
  if (realYears.length === 0) return null;

  const currentYear = realYears[0];
  const previousYear = realYears[1] || null;
  const current = countryScores[currentYear];

  const trajectory    = computeTrajectory(country, currentYear, allScores);
  const baselineScore = computeBaselineScore(country, allScores);
  const activeLeads   = getActiveLeads(current.breakdown, leadIndicators);
  const darkSignals   = getDarkSignals(country, currentYear, previousYear, allScores, darkPatterns);
  const topAnalogs    = findHistoricalAnalogs(country, currentYear, current.score, current.breakdown, trajectory.label, allScores);

  return {
    country,
    as_of_year:      currentYear,
    current_score:   parseFloat(current.score.toFixed(2)),
    baseline_score:  baselineScore,
    score_delta:     baselineScore !== null ? parseFloat((current.score - baselineScore).toFixed(2)) : null,
    trajectory:      trajectory.label,
    trajectory_slope: trajectory.slope,
    active_leads:    activeLeads,
    dark_signals:    darkSignals,
    top_analogs:     topAnalogs,
    signal_breakdown: current.breakdown,
    signals_active:  current.signals_used,
    computed_at:     new Date().toISOString(),
  };
}

// ── Write ─────────────────────────────────────────────────────────────────────

async function writeSyntheses(rows) {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb
      .from('synthesis_records')
      .upsert(rows.slice(i, i + 500), { onConflict: 'country,as_of_year' });
    if (error) throw error;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const targetCountry = args.includes('--country') ? args[args.indexOf('--country') + 1] : null;

  console.log('\n🛰️  Phase 2 Step 5 — The Synthesizer');
  console.log('   Assembling the full picture. What the data says about itself.\n');

  await checkTable();

  const allScores     = await loadAllHistoricalScores();
  const leadIndicators = await loadLeadIndicators();
  const darkPatterns  = await loadGoingDarkPatterns();

  const countries = targetCountry ? [targetCountry] : Object.keys(allScores);
  console.log(`\n  Synthesizing ${countries.length} countries...\n`);

  const results = [];
  for (const country of countries) {
    const record = synthesizeCountry(country, allScores, leadIndicators, darkPatterns);
    if (record) results.push(record);
  }

  console.log(`  ${results.length} syntheses produced.\n`);

  // Print summary table
  const sorted = [...results].sort((a, b) => b.current_score - a.current_score);

  console.log('  Top 15 highest stress (most recent scored year):');
  for (const r of sorted.slice(0, 15)) {
    const delta = r.score_delta !== null ? (r.score_delta > 0 ? `+${r.score_delta}` : `${r.score_delta}`) : 'n/a';
    const traj  = r.trajectory === 'ascending' ? '↑' : r.trajectory === 'descending' ? '↓' : '→';
    const leads = r.active_leads.length > 0 ? ` ⚡${r.active_leads[0].signal}→${r.active_leads[0].leads}` : '';
    const dark  = r.dark_signals.length > 0 ? ` 🔇${r.dark_signals[0].signal}` : '';
    console.log(`    ${r.country.padEnd(22)} ${r.current_score.toFixed(1).padStart(5)} ${traj} (${r.as_of_year}) Δ${delta}${leads}${dark}`);
  }

  console.log('\n  Bottom 10 lowest stress:');
  for (const r of sorted.slice(-10).reverse()) {
    const traj = r.trajectory === 'ascending' ? '↑' : r.trajectory === 'descending' ? '↓' : '→';
    console.log(`    ${r.country.padEnd(22)} ${r.current_score.toFixed(1).padStart(5)} ${traj} (${r.as_of_year})`);
  }

  // Lead signals summary
  const activeLeadCount = results.filter(r => r.active_leads.length > 0).length;
  const darkSigCount    = results.filter(r => r.dark_signals.length > 0).length;
  console.log(`\n  ${activeLeadCount} countries have active leading indicators`);
  console.log(`  ${darkSigCount} countries have going-dark signals\n`);

  console.log('  Writing to Supabase...');
  await writeSyntheses(results);
  console.log(`  synthesis_records: ${results.length} rows written.\n`);

  logToHive({
    source: 'synthesizer',
    level: 'intel',
    event: 'synthesis_complete',
    data: { countries: results.length, active_leads: activeLeadCount, dark_signals: darkSigCount },
  });

  console.log('═'.repeat(60));
  console.log('✅ Phase 2 Step 5 — Synthesis complete.');
  console.log(`   Countries synthesized: ${results.length}`);
  console.log(`   Active lead signals:   ${activeLeadCount} countries`);
  console.log(`   Going-dark alerts:     ${darkSigCount} countries`);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
