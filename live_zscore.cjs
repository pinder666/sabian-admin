// live_zscore.cjs
// Live z-score convergence scoring — replicates historical/convergence_history.cjs formula.
// Uses data-derived baselines, thresholds, and weights. No hardcoded coefficients.
//
// Usage:
//   const { computeLiveScore } = require('./live_zscore.cjs');
//   const result = await computeLiveScore([
//     { signal_key: 'fire_hotspot', raw_value: 30000 },
//     { signal_key: 'governance', raw_value: 28 },
//     ...
//   ]);

require('dotenv').config({ path: './.env' });
const { createClient } = require('@supabase/supabase-js');

let _sb = null;
function getSupabase() {
  if (_sb) return _sb;
  _sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
  return _sb;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS — copied verbatim from historical/convergence_history.cjs
// ═══════════════════════════════════════════════════════════════════════════════

// Semantic direction per signal:
// +1 = higher raw value → more stress
// -1 = lower raw value → more stress
const STRESS_DIRECTION = {
  // Behavioral signals
  night_lights:      -1,
  diaspora_remittance: -1,
  food_stress:       +1,
  defense_spending:  +1,

  // Original institutional signals
  displacement:      +1,
  gdelt_conflict:    +1,
  gdelt_tone:        -1,
  seismic_risk:      +1,
  fire_hotspot:      +1,
  governance:        -1,
  economic_stress:   -1,
  capital_flows:     -1,
  trade_collapse:    -1,
  power_grid:        -1,
  imf_fiscal:        +1,
  vdem_governance:   -1,
  corruption_risk:   +1,
  election_calendar: +1,
  sanctions_pressure:+1,

  // Financial & economic
  currency_collapse: +1,
  maritime_trade:    -1,

  // Energy
  energy_stress:     -1,

  // Food & water
  fao_food:          +1,
  water_stress:      +1,

  // Governance & corruption
  occrp:             +1,

  // Environment
  climate_stress:    +1,

  // Internet & communications
  tor_censorship:         +1,
  ooni_internet:          -1,
  internet_shutdown_ioda: +1,

  // Conflict & unrest
  conflict:          +1,
  social_unrest:     +1,

  // Displacement & humanitarian
  unhcr_odp:         +1,

  // Resource & financial risk
  resource_conflict: +1,
  sovereign_cds:     +1,

  // Physical risk
  flood_risk:        +1,
  dam_risk:          +1,

  // Food & supply chain
  food_security:     +1,
  usda_food:         +1,

  // Maritime & logistics
  dark_vessel:       +1,
  port_congestion:   +1,
  pipeline_risk:     +1,
  chokepoint:        +1,

  // Infrastructure
  rail_corridor:     +1,
  cable_disruption:  +1,

  // Electronic warfare & cyber
  gps_jamming:       +1,
  military_proximity:+1,
  cyber_threat:      +1,

  // Transport
  flight_movement:   +1,

  // Behavioral & predictive
  iom_displacement:  +1,
  social_volume:     +1,
  prediction_market: +1,

  // Structural Pressure (MDC composite)
  structural_pressure: +1,

  // Public health
  health_crisis:     +1,
};

// Reliability tier → weight
const TIER_WEIGHT = {
  anchor:       1.0,
  supporting:   0.8,
  supplemental: 0.5,
  low_coverage: 0.2,
};

// Minimum signals required to emit a score
const MIN_SIGNALS_FLOOR = 3;

// Score scaling
const SCORE_CENTER = 50;
const SCORE_SCALE = 18;

// ═══════════════════════════════════════════════════════════════════════════════
// DATA LOADERS
// ═══════════════════════════════════════════════════════════════════════════════

// Cache for baselines, tiers, thresholds
let _globalBaselines = null;
let _reliabilityTiers = null;
let _thresholds = null;
let _scoreRef = null;

async function loadGlobalBaselines() {
  if (_globalBaselines) return _globalBaselines;

  const sb = getSupabase();
  const { data, error } = await sb
    .from('signal_baselines')
    .select('signal_key, baseline_median, baseline_p10, baseline_p90')
    .not('baseline_median', 'is', null);

  if (error) throw new Error('Failed to load signal_baselines: ' + error.message);

  // Step 1: Compute global median IQR per signal from all countries with IQR > 0
  // This becomes the floor — near-zero IQRs produce explosive z-scores from noise
  const signalIQRs = {};
  for (const row of (data || [])) {
    const iqr = (row.baseline_p90 ?? 0) - (row.baseline_p10 ?? 0);
    if (iqr > 0) {
      if (!signalIQRs[row.signal_key]) signalIQRs[row.signal_key] = [];
      signalIQRs[row.signal_key].push(iqr);
    }
  }
  const globalMedianIQR = {};
  for (const [sig, iqrs] of Object.entries(signalIQRs)) {
    iqrs.sort((a, b) => a - b);
    globalMedianIQR[sig] = iqrs[Math.floor(iqrs.length / 2)];
  }

  // Step 2: Build global median and IQR per signal (cross-country aggregation)
  const perSignal = {};
  for (const row of (data || [])) {
    const key = row.signal_key;
    if (!perSignal[key]) perSignal[key] = { medians: [], iqrs: [] };
    perSignal[key].medians.push(row.baseline_median);
    const rawIqr = (row.baseline_p90 ?? 0) - (row.baseline_p10 ?? 0);
    perSignal[key].iqrs.push(rawIqr);
  }

  _globalBaselines = {};
  for (const [signal, vals] of Object.entries(perSignal)) {
    const sortedMedians = [...vals.medians].sort((a, b) => a - b);
    const sortedIqrs = [...vals.iqrs].sort((a, b) => a - b);
    const midIdx = Math.floor(sortedMedians.length / 2);

    const medianOfMedians = sortedMedians[midIdx];
    const medianOfIqrs = sortedIqrs[midIdx] || 1;

    // Floor IQR to globalMedianIQR — prevents near-zero IQRs from exploding z-scores
    const fallbackIQR = globalMedianIQR[signal] || 1;
    const flooredIqr = Math.max(medianOfIqrs, fallbackIQR);

    _globalBaselines[signal] = {
      median: medianOfMedians,
      iqr: flooredIqr,
    };
  }

  return _globalBaselines;
}

async function loadReliabilityTiers() {
  if (_reliabilityTiers) return _reliabilityTiers;

  const sb = getSupabase();
  const { data, error } = await sb
    .from('signal_reliability_map')
    .select('signal_key, reliability_tier');

  if (error) throw new Error('Failed to load signal_reliability_map: ' + error.message);

  _reliabilityTiers = {};
  for (const row of (data || [])) {
    _reliabilityTiers[row.signal_key] = row.reliability_tier;
  }

  return _reliabilityTiers;
}

async function loadThresholds() {
  if (_thresholds && _scoreRef !== null) return { tau: _thresholds, scoreRef: _scoreRef };

  const sb = getSupabase();
  const { data, error } = await sb
    .from('live_score_thresholds')
    .select('signal_key, tau, score_ref');

  if (error) throw new Error('Failed to load live_score_thresholds: ' + error.message);
  if (!data || data.length === 0) {
    throw new Error('live_score_thresholds is empty — run threshold derivation first');
  }

  _thresholds = {};
  for (const row of data) {
    _thresholds[row.signal_key] = row.tau;
    if (row.score_ref !== null && _scoreRef === null) {
      _scoreRef = row.score_ref;
    }
  }

  if (_scoreRef === null) {
    throw new Error('No score_ref found in live_score_thresholds');
  }

  return { tau: _thresholds, scoreRef: _scoreRef };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN SCORING FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Compute live convergence score using z-score formula.
 * Replicates historical/convergence_history.cjs scoring exactly.
 *
 * @param {Array<{signal_key: string, raw_value: number}>} signalValues
 * @returns {Promise<{score: number|null, raw_stress: number, signals_used: number, breakdown: Array}>}
 */
async function computeLiveScore(signalValues) {
  // Load all required data
  const [globalBl, tiers, { tau, scoreRef }] = await Promise.all([
    loadGlobalBaselines(),
    loadReliabilityTiers(),
    loadThresholds(),
  ]);

  const contributions = [];

  for (const { signal_key, raw_value } of signalValues) {
    // Skip if no stress direction defined
    const direction = STRESS_DIRECTION[signal_key];
    if (direction === undefined) continue;

    // Skip if no global baseline
    const bl = globalBl[signal_key];
    if (!bl || bl.iqr === 0) continue;

    // Get reliability tier and weight
    const tier = tiers[signal_key];
    if (!tier) continue;
    const weight = TIER_WEIGHT[tier] || 0.2;

    // Get tau threshold
    const signalTau = tau[signal_key] ?? 0;

    // Compute z-score: how many IQRs above/below median, in stress direction
    const gz = ((raw_value - bl.median) / bl.iqr) * direction;

    // Excess above threshold — only elevated signals contribute
    const excess = Math.max(0, gz - signalTau);

    // Weighted contribution
    const contribution = weight * excess;

    contributions.push({
      signal_key,
      raw_value,
      baseline_median: bl.median,
      baseline_iqr: bl.iqr,
      direction,
      z_score: parseFloat(gz.toFixed(4)),
      tau: signalTau,
      excess: parseFloat(excess.toFixed(4)),
      tier,
      weight,
      contribution: parseFloat(contribution.toFixed(4)),
    });
  }

  // Filter to contributing signals (excess > 0)
  const contributing = contributions.filter(c => c.excess > 0);

  // Check minimum signal floor
  if (contributing.length < MIN_SIGNALS_FLOOR) {
    return {
      score: null,
      raw_stress: 0,
      signals_used: contributing.length,
      signals_available: contributions.length,
      reason: `insufficient_contributing_signals (${contributing.length} < ${MIN_SIGNALS_FLOOR})`,
      breakdown: contributions,
    };
  }

  // Aggregate raw stress (only from contributing signals with excess > 0)
  const raw_stress = contributing.reduce((sum, c) => sum + c.contribution, 0);

  // Scale to 1-99
  const score = Math.max(1, Math.min(99,
    SCORE_CENTER + (raw_stress / scoreRef) * SCORE_SCALE
  ));

  return {
    score: Math.round(score),
    raw_stress: parseFloat(raw_stress.toFixed(4)),
    signals_used: contributing.length,
    signals_available: contributions.length,
    score_ref: scoreRef,
    formula: `score = 50 + (${raw_stress.toFixed(4)} / ${scoreRef}) * 18`,
    breakdown: contributions,
  };
}

/**
 * Clear cached data (useful for testing or after threshold updates)
 */
function clearCache() {
  _globalBaselines = null;
  _reliabilityTiers = null;
  _thresholds = null;
  _scoreRef = null;
}

module.exports = {
  computeLiveScore,
  clearCache,
  // Expose constants for testing
  STRESS_DIRECTION,
  TIER_WEIGHT,
  MIN_SIGNALS_FLOOR,
  SCORE_CENTER,
  SCORE_SCALE,
};
