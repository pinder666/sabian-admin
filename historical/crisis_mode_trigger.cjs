// historical/crisis_mode_trigger.cjs
// PHASE 5: Crisis Mode Trigger
//
// Trigger condition (all three must be true):
//   1. score ≥ 75
//   2. trajectory = RISING or SHARP_RISE
//   3. 2+ active lead signals (signals with stress_z > 0.5 that historically precede crises)
//
// Data sources:
//   convergence_scores        — live scan scores + trajectory (stored by global_scan.cjs)
//   historical_convergence_scores — breakdown column for lead signal stress_z values
//   signal_lead_indicators    — the validated list of lead signals from temporal analysis
//
// Usage: node historical/crisis_mode_trigger.cjs
// Exports: getCrisisCountries(), buildCrisisReport()

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CRISIS_SCORE_THRESHOLD     = 75;
const LEAD_SIGNAL_Z_THRESHOLD    = 0.5;   // stress_z above this = signal is active
const MIN_ACTIVE_LEAD_SIGNALS    = 2;      // need at least this many to trigger
const RISING_TRAJECTORIES        = ['RISING', 'SHARP_RISE'];

// ── Load lead indicators from DB ─────────────────────────────────────────────

async function loadLeadIndicators() {
  const { data, error } = await sb
    .from('signal_lead_indicators')
    .select('signal_key, best_lead_target, best_lead_lag, best_lead_r')
    .order('best_lead_r', { ascending: false });

  if (error) {
    console.warn('[CRISIS] Could not load lead indicators:', error.message);
    return [];
  }
  return data || [];
}

// ── Load most recent live scan per country ────────────────────────────────────

async function loadLiveScores() {
  const { data, error } = await sb
    .from('convergence_scores')
    .select('country, scan_date, convergence_score, risk_level, trajectory, theater')
    .order('scan_date', { ascending: false })
    .limit(1000);

  if (error) throw new Error(`Live scores: ${error.message}`);

  // Keep only most recent per country
  const latest = {};
  for (const row of (data || [])) {
    if (!latest[row.country]) latest[row.country] = row;
  }
  return latest;
}

// ── Load most recent historical breakdown per country ─────────────────────────
// Used for lead signal stress_z when live scan doesn't have breakdown

async function loadHistoricalBreakdowns() {
  const { data, error } = await sb
    .from('historical_convergence_scores')
    .select('country, year, score, breakdown')
    .order('year', { ascending: false })
    .limit(3000);

  if (error) {
    console.warn('[CRISIS] Historical breakdown unavailable:', error.message);
    return {};
  }

  // Keep most recent year per country
  const latest = {};
  for (const row of (data || [])) {
    if (!latest[row.country]) latest[row.country] = row;
  }
  return latest;
}

// ── Compute trajectory from historical scores (fallback when live scan is old) ─

function computeHistoricalTrajectory(historicalData, country) {
  if (!historicalData[country]) return 'STABLE';

  const allYears = Object.values(historicalData)
    .filter(r => r.country === country)
    .sort((a, b) => b.year - a.year);

  if (allYears.length < 2) return 'STABLE';

  const delta = allYears[0].score - allYears[1].score;
  if      (delta >= 10) return 'SHARP_RISE';
  else if (delta >=  5) return 'RISING';
  else if (delta <= -10) return 'SHARP_FALL';
  else if (delta <=  -5) return 'FALLING';
  return 'STABLE';
}

// ── Check active lead signals from breakdown ──────────────────────────────────

function getActiveLeadSignals(breakdown, leadIndicators) {
  if (!breakdown || !leadIndicators.length) return [];

  const active = [];
  for (const indicator of leadIndicators) {
    const signal = breakdown[indicator.signal_key];
    if (!signal) continue;
    const z = typeof signal === 'object' ? (signal.stress_z || 0) : signal;
    if (z > LEAD_SIGNAL_Z_THRESHOLD) {
      active.push({
        signal:      indicator.signal_key,
        stress_z:    z,
        leadsTo:     indicator.best_lead_target,
        lagYears:    indicator.best_lead_lag,
        correlation: indicator.best_lead_r
      });
    }
  }

  // Sort by stress_z descending
  return active.sort((a, b) => b.stress_z - a.stress_z);
}

// ── Main: get all countries currently in crisis mode ─────────────────────────

async function getCrisisCountries() {
  const [liveScores, historicalBreakdowns, leadIndicators] = await Promise.all([
    loadLiveScores(),
    loadHistoricalBreakdowns(),
    loadLeadIndicators()
  ]);

  const crisisCountries = [];
  const allCountries = new Set([
    ...Object.keys(liveScores),
    ...Object.keys(historicalBreakdowns)
  ]);

  for (const country of allCountries) {
    const live = liveScores[country];
    const hist = historicalBreakdowns[country];

    // Score: prefer live, fall back to historical
    const score = live?.convergence_score ?? hist?.score ?? 0;
    if (score < CRISIS_SCORE_THRESHOLD) continue;

    // Trajectory: prefer stored value from live scan, fall back to historical computation
    let trajectory = live?.trajectory || 'STABLE';
    if (trajectory === 'STABLE' && hist) {
      // If live scan trajectory is STABLE but we haven't had a recent scan,
      // try computing from historical year-over-year
      trajectory = computeHistoricalTrajectory(
        Object.values(historicalBreakdowns).filter(r => r.country === country),
        country
      );
    }
    if (!RISING_TRAJECTORIES.includes(trajectory)) continue;

    // Lead signals: read from historical breakdown
    const breakdown = hist?.breakdown || {};
    const activeLeads = getActiveLeadSignals(breakdown, leadIndicators);
    if (activeLeads.length < MIN_ACTIVE_LEAD_SIGNALS) continue;

    // All three conditions met — crisis mode active
    crisisCountries.push({
      country,
      score:            Math.round(score),
      risk_level:       live?.risk_level || getRiskBand(score),
      trajectory,
      theater:          live?.theater || null,
      scan_date:        live?.scan_date || hist?.year?.toString() || null,
      active_lead_count: activeLeads.length,
      active_leads:     activeLeads.slice(0, 5),
      crisis_mode_active: true,
      triggered_at:     new Date().toISOString()
    });
  }

  // Sort by score descending — highest risk first
  crisisCountries.sort((a, b) => b.score - a.score);
  return crisisCountries;
}

function getRiskBand(score) {
  if (score >= 81) return 'CRITICAL';
  if (score >= 66) return 'WARNING';
  if (score >= 41) return 'ELEVATED';
  return 'STABLE';
}

// ── Build full crisis report ──────────────────────────────────────────────────

async function buildCrisisReport() {
  const countries = await getCrisisCountries();

  const byTheater = {};
  for (const c of countries) {
    const t = c.theater || 'GLOBAL';
    if (!byTheater[t]) byTheater[t] = [];
    byTheater[t].push(c);
  }

  return {
    generated_at:    new Date().toISOString(),
    crisis_count:    countries.length,
    trigger_criteria: {
      score_threshold:      CRISIS_SCORE_THRESHOLD,
      trajectories:         RISING_TRAJECTORIES,
      min_lead_signals:     MIN_ACTIVE_LEAD_SIGNALS,
      lead_signal_z_floor:  LEAD_SIGNAL_Z_THRESHOLD
    },
    countries,
    by_theater: byTheater
  };
}

// ── CLI: run directly to print report ────────────────────────────────────────

if (require.main === module) {
  (async () => {
    console.log('\n══════════════════════════════════════════════');
    console.log('  SABIAN CRISIS MODE TRIGGER');
    console.log('  Conditions: score≥75 + RISING + 2+ lead signals');
    console.log('══════════════════════════════════════════════\n');

    try {
      const report = await buildCrisisReport();

      console.log(`Generated: ${report.generated_at}`);
      console.log(`Countries in crisis mode: ${report.crisis_count}\n`);

      if (report.crisis_count === 0) {
        console.log('  No countries currently meeting all three crisis conditions.\n');
      } else {
        for (const c of report.countries) {
          console.log(`  ⚡ ${c.country.padEnd(25)} score=${c.score}  ${c.trajectory.padEnd(12)}  leads=${c.active_lead_count}`);
          for (const l of c.active_leads.slice(0, 3)) {
            console.log(`       ${l.signal} → ${l.leadsTo} (z=${l.stress_z.toFixed(2)}, r=${l.correlation?.toFixed(2) || 'n/a'})`);
          }
        }
        console.log('');

        const theaters = Object.entries(report.by_theater);
        if (theaters.length > 1) {
          console.log('By theater:');
          for (const [t, countries] of theaters) {
            console.log(`  ${t}: ${countries.length} country/countries`);
          }
        }
      }
    } catch (err) {
      console.error('[CRISIS] Fatal:', err.message);
      process.exit(1);
    }
  })();
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  getCrisisCountries,
  buildCrisisReport,
  CRISIS_SCORE_THRESHOLD,
  RISING_TRAJECTORIES,
  MIN_ACTIVE_LEAD_SIGNALS
};
