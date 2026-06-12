// historical/convergence_history.cjs
// Phase 1 Step 3 — Historical convergence scoring pass.
// Applies baselines, reliability tiers, and relationship-informed weights to
// produce a 0-100 stress score for every country × year in the historical record.
//
// Score = 50 at baseline. Higher = more stress. Each σ = 15 points.
// Weights come from the data (reliability tiers). Directions are signal semantics.
// No human opinion on weights or relationships.
//
// Usage: node historical/convergence_history.cjs

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { sb } = require('./db.cjs');
const { logToHive } = require('../logger.cjs');
const { logAuditEvent } = require('./audit_chain.cjs');

// Semantic direction per signal:
// +1 = higher raw value → more stress
// -1 = lower raw value → more stress
//
// ADD NEW SIGNALS HERE — any signal with data but no direction is silently skipped.
const STRESS_DIRECTION = {
  // ── Behavioral signals (previously excluded — now included for complete picture) ─
  night_lights:      -1,  // DMSP/VIIRS radiance — lower = economic contraction = more stress
  diaspora_remittance: -1, // remittance inflows — lower = diaspora stressed = more stress
  food_stress:       +1,  // food price/availability stress — higher = more stress
  defense_spending:  +1,  // military expenditure — higher = more buildup = more stress

  // ── Original institutional signals ────────────────────────────────────────
  displacement:      +1,
  gdelt_conflict:    +1,
  gdelt_tone:        -1,  // negative tone score = more stress
  seismic_risk:      +1,
  fire_hotspot:      +1,
  governance:        -1,
  economic_stress:   -1,
  capital_flows:     -1,
  trade_collapse:    -1,
  power_grid:        -1,
  imf_fiscal:        +1,
  vdem_governance:   -1,
  corruption_risk:   +1,  // TI CPI inverted: higher = more corrupt = more stress
  election_calendar: +1,  // NELDA violence-weighted: higher = more electoral violence
  sanctions_pressure:+1,  // TIES cost-severity: higher = more economic coercion

  // ── Financial & economic ──────────────────────────────────────────────────
  currency_collapse: +1,  // depreciation % — positive = currency weakened
  maritime_trade:    -1,  // trade volume USD bn — higher = more connected = less stress

  // ── Energy ────────────────────────────────────────────────────────────────
  energy_stress:     -1,  // electricity production/consumption — higher = less stress

  // ── Food & water ──────────────────────────────────────────────────────────
  fao_food:          +1,  // undernourishment % of population — higher = more stress
  water_stress:      +1,  // freshwater withdrawal % of internal resources — higher = more stress

  // ── Governance & corruption ───────────────────────────────────────────────
  occrp:             +1,  // inverted WGI corruption — higher = more corrupt = more stress

  // ── Environment ───────────────────────────────────────────────────────────
  climate_stress:    +1,  // temperature/rainfall anomaly from ERA5 — higher = more stress

  // ── Internet & communications ─────────────────────────────────────────────
  tor_censorship:         +1,  // bridge users — higher count = more censorship = more stress
  ooni_internet:          -1,  // freedom score (100 − anomaly_rate×100) — higher = more freedom
  internet_shutdown_ioda: +1,  // BGP outage events — higher = more disruption = more stress

  // ── Conflict & unrest ─────────────────────────────────────────────────────
  conflict:          +1,  // UCDP armed conflict events — more = more stress
  social_unrest:     +1,  // UCDP one-sided violence events — more = more stress

  // ── Displacement & humanitarian ───────────────────────────────────────────
  unhcr_odp:         +1,  // UNHCR refugee/asylum origins — higher = more displacement stress

  // ── Resource & financial risk ─────────────────────────────────────────────
  resource_conflict: +1,  // WB total natural resource rents % GDP — resource curse proxy
  sovereign_cds:     +1,  // Damodaran country risk premium — higher = more default risk

  // ── Physical risk ─────────────────────────────────────────────────────────
  flood_risk:        +1,  // WB disaster displacement + climate risk — higher = more stress
  dam_risk:          +1,  // WB water withdrawal + maintenance proxy — higher = more risk

  // ── Food & supply chain ───────────────────────────────────────────────────
  food_security:     +1,  // FEWS IPC classification — higher phase = more food insecurity
  usda_food:         +1,  // USDA PSD grain stocks deficit — lower stocks = more stress

  // ── Maritime & logistics ──────────────────────────────────────────────────
  dark_vessel:       +1,  // WB LPI inverted — lower logistics quality = more dark vessel risk
  port_congestion:   +1,  // WB LPI/LSCI — lower connectivity = more congestion
  pipeline_risk:     +1,  // WB oil/gas rents + electricity — higher dependency = more risk
  chokepoint:        +1,  // WB trade dependency × chokepoint weight — higher = more stress

  // ── Infrastructure ────────────────────────────────────────────────────────
  rail_corridor:     +1,  // WB rail lines — lower density = more disruption risk
  cable_disruption:  +1,  // Cloudflare Radar BGP anomaly — higher = more disruption

  // ── Electronic warfare & cyber ────────────────────────────────────────────
  gps_jamming:       +1,  // WB military expenditure % GDP — higher = more EW risk
  military_proximity:+1,  // WB arms imports — higher = more military buildup stress
  cyber_threat:      +1,  // WB internet security server (inverted) — lower = more threat

  // ── Transport ─────────────────────────────────────────────────────────────
  flight_movement:   +1,  // WB air passengers YoY drop — higher drop = more disruption

  // ── Behavioral & predictive ──────────────────────────────────────────────
  iom_displacement:  +1,  // IOM DTM + IDMC internal displacement — higher = more stress
  social_volume:     +1,  // Social media mention volume spike — higher = more attention/stress
  prediction_market: +1,  // Polymarket geopolitical contracts — higher odds = more expected instability

  // ── Structural Pressure (MDC composite) ──────────────────────────────────
  structural_pressure: +1, // MDC: iom_displacement+social_volume+prediction_market+food_security+usda_food. F1=0.825, precision=92%, 2yr early warning.

  // ── Public health ─────────────────────────────────────────────────────────
  health_crisis:     +1,  // WHO GHO mortality + WB health system capacity (inverted)
};

// Reliability tier → weight
const TIER_WEIGHT = {
  anchor:       1.0,
  supporting:   0.8,
  supplemental: 0.5,
  low_coverage: 0.2,
};

// Signals with true dataset endpoints — source published its final data at this year.
// Past this year: excluded from scoring even if stray backfill data exists in the DB.
// Distinct from slow-updating signals (UCDP, WB WDI) which are alive but lag 1-2 years.
const SIGNAL_ENDPOINTS = {
  election_calendar:  2020,  // NELDA v6.0 — published dataset complete
  resource_conflict:  2021,  // TIES v4.1 — published dataset complete
};

// Minimum signals required to emit a score. Below this threshold the score is
// statistically unreliable — return null rather than a number the buyer would trust.
const MIN_SIGNALS_FLOOR = 3;

// Score scaling: each z-unit = 15 score points from baseline of 50
const SCORE_CENTER = 50;
const SCORE_SCALE  = 18;

function buildGlobalBaselines(baselines) {
  // Compute cross-country median and IQR per signal.
  // Used as the absolute eye: z-scores against the global distribution
  // so chronically distressed countries still spike during acute crises.
  const perSignal = {};
  for (const countryBl of Object.values(baselines)) {
    for (const [signal, bl] of Object.entries(countryBl)) {
      if (!perSignal[signal]) perSignal[signal] = { medians: [], iqrs: [] };
      if (bl.median !== null && bl.median !== undefined) perSignal[signal].medians.push(bl.median);
      if (bl.iqr > 0) perSignal[signal].iqrs.push(bl.iqr);
    }
  }
  const out = {};
  for (const [signal, { medians, iqrs }] of Object.entries(perSignal)) {
    medians.sort((a, b) => a - b);
    iqrs.sort((a, b) => a - b);
    out[signal] = {
      median: medians[Math.floor(medians.length / 2)] ?? 0,
      iqr:    iqrs[Math.floor(iqrs.length / 2)] || 1,
    };
  }
  return out;
}

// Derive each signal's stress threshold from its OWN global z-distribution.
// τ = the percentile where this signal becomes genuinely abnormal across all country-years.
// No hand-picked threshold — each signal declares its own from its own spread.
function deriveSignalThresholds(ts, globalBl, percentile) {
  const perSignalZ = {};
  for (const [country, signals] of Object.entries(ts)) {
    for (const [signal, byYear] of Object.entries(signals)) {
      const gbl = globalBl[signal];
      if (!gbl || gbl.iqr === 0) continue;
      const direction = STRESS_DIRECTION[signal];
      if (direction === undefined) continue;
      for (const value of Object.values(byYear)) {
        const gz = ((value - gbl.median) / gbl.iqr) * direction;
        if (!perSignalZ[signal]) perSignalZ[signal] = [];
        perSignalZ[signal].push(gz);
      }
    }
  }
  const tau = {};
  for (const [signal, zs] of Object.entries(perSignalZ)) {
    zs.sort((a, b) => a - b);
    const idx = Math.floor(zs.length * percentile);
    tau[signal] = zs[Math.min(idx, zs.length - 1)];
  }
  return tau;
}

// The score ceiling is the observed spread of raw_stress, not an invented number.
// SCORE_REF = a high percentile of all actual raw_stress values across all country-years.
function deriveScoreRef(rawStressValues, percentile) {
  const sorted = [...rawStressValues].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * percentile);
  return sorted[Math.min(idx, sorted.length - 1)] || 1;
}

// ── Table check ───────────────────────────────────────────────────────────────

async function checkTable() {
  const { error } = await sb.from('historical_convergence_scores').select('*').limit(1);
  if (error) {
    console.error('\n❌ Missing table: historical_convergence_scores');
    console.error('  Run: historical/MIGRATION_CONVERGENCE.sql in Supabase SQL editor');
    console.error('  https://supabase.com/dashboard/project/qdxgcyawpqxhhjprqyas/sql\n');
    process.exit(1);
  }
}

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadReliabilityTiers() {
  const { data, error } = await sb.from('signal_reliability_map').select('signal_key,reliability_tier');
  if (error) throw error;
  const out = {};
  for (const r of (data || [])) out[r.signal_key] = r.reliability_tier;
  return out;
}

async function loadBaselines() {
  // Load all baselines, then compute per-signal global IQR to use as fallback
  // when a country's IQR=0 (e.g. Libya fire_hotspot — all historical values zero).
  // IQR=0 fallback to 1 produces z = raw_value, creating explosive scores.
  const rawBaselines = [];
  let page = 0;
  while (true) {
    const { data, error } = await sb
      .from('signal_baselines')
      .select('country,signal_key,baseline_median,baseline_p10,baseline_p90')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rawBaselines.push(...data);
    if (data.length < 1000) break;
    page++;
  }

  // Compute global median IQR per signal from all countries with IQR > 0
  const signalIQRs = {};
  for (const r of rawBaselines) {
    const iqr = (r.baseline_p90 ?? 0) - (r.baseline_p10 ?? 0);
    if (iqr > 0) {
      if (!signalIQRs[r.signal_key]) signalIQRs[r.signal_key] = [];
      signalIQRs[r.signal_key].push(iqr);
    }
  }
  const globalIQR = {};
  for (const [sig, iqrs] of Object.entries(signalIQRs)) {
    iqrs.sort((a, b) => a - b);
    globalIQR[sig] = iqrs[Math.floor(iqrs.length / 2)]; // median IQR across countries
  }

  const out = {};
  for (const r of rawBaselines) {
    if (!out[r.country]) out[r.country] = {};
    const iqr = (r.baseline_p90 ?? 0) - (r.baseline_p10 ?? 0);
    // Use global median IQR as a hard minimum floor, not just a zero fallback.
    // Near-zero IQRs (e.g. South Korea displacement IQR=0.0022) produce z-scores of 26+
    // from tiny deviations that are statistical noise, not real stress signals.
    const fallbackIQR = globalIQR[r.signal_key] || 1;
    out[r.country][r.signal_key] = {
      median: r.baseline_median,
      iqr: Math.max(iqr > 0 ? iqr : 0, fallbackIQR),
    };
  }
  return out;
}

async function loadAllReadings() {
  // Returns: ts[country][signal][year] = annualAvgValue (non-gap only)
  // Also returns: tsSrc[country][signal][source][year] = sourceAvgValue
  // tsSrc preserves source identity so source-aware z-scoring can be applied
  // for signals like health_crisis that have incompatible source scales.
  const raw    = {};   // combined: raw[country][signal][year] = [values]
  const rawSrc = {};   // by-source: rawSrc[country][signal][source][year] = [values]
  let page = 0;
  let total = 0;
  process.stdout.write('  Loading readings .');
  while (true) {
    const { data, error } = await sb
      .from('historical_signal_readings')
      .select('country,signal_key,date,raw_value,gap,source')
      .order('id', { ascending: true })
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (r.gap || r.raw_value === null) continue;
      // Use string slice, not Date constructor. new Date('2014-01-01') creates a UTC midnight
      // timestamp; .getFullYear() then returns 2013 in Pacific timezone (UTC-7/8).
      // That shifts every score to use the FOLLOWING year's data.
      const year = parseInt(r.date.slice(0, 4));
      if (!raw[r.country]) raw[r.country] = {};
      if (!raw[r.country][r.signal_key]) raw[r.country][r.signal_key] = {};
      if (!raw[r.country][r.signal_key][year]) raw[r.country][r.signal_key][year] = [];
      raw[r.country][r.signal_key][year].push(parseFloat(r.raw_value));

      // Source-indexed copy
      const src = r.source || '';
      if (!rawSrc[r.country]) rawSrc[r.country] = {};
      if (!rawSrc[r.country][r.signal_key]) rawSrc[r.country][r.signal_key] = {};
      if (!rawSrc[r.country][r.signal_key][src]) rawSrc[r.country][r.signal_key][src] = {};
      if (!rawSrc[r.country][r.signal_key][src][year]) rawSrc[r.country][r.signal_key][src][year] = [];
      rawSrc[r.country][r.signal_key][src][year].push(parseFloat(r.raw_value));
    }
    total += data.length;
    if (data.length < 1000) break;
    page++;
    if (page % 30 === 0) process.stdout.write('.');
  }
  console.log(` ${total} rows loaded.`);

  // Average sub-annual readings to annual (combined path — unchanged)
  const ts = {};
  for (const [country, signals] of Object.entries(raw)) {
    ts[country] = {};
    for (const [signal, byYear] of Object.entries(signals)) {
      ts[country][signal] = {};
      for (const [year, vals] of Object.entries(byYear)) {
        ts[country][signal][parseInt(year)] = vals.reduce((a, b) => a + b, 0) / vals.length;
      }
    }
  }

  // Average sub-annual readings per source
  const tsSrc = {};
  for (const [country, signals] of Object.entries(rawSrc)) {
    tsSrc[country] = {};
    for (const [signal, bySrc] of Object.entries(signals)) {
      tsSrc[country][signal] = {};
      for (const [src, byYear] of Object.entries(bySrc)) {
        tsSrc[country][signal][src] = {};
        for (const [year, vals] of Object.entries(byYear)) {
          tsSrc[country][signal][src][parseInt(year)] = vals.reduce((a, b) => a + b, 0) / vals.length;
        }
      }
    }
  }

  return { ts, tsSrc };
}

// Loads source-specific baselines stored as signal_key = 'baseSignal:source'.
// Returns srcBl[country][baseSignal][source] = {median, iqr}
// These are computed by baseline_discovery.cjs for signals with multiple sources.
async function loadSourceBaselines() {
  const rows = [];
  let page = 0;
  while (true) {
    const { data, error } = await sb
      .from('signal_baselines')
      .select('country,signal_key,baseline_median,baseline_p10,baseline_p90')
      .like('signal_key', '%:%')   // compound keys only: 'baseSignal:source'
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < 1000) break;
    page++;
  }

  // Compute global median IQR per base signal for the same fallback floor used in loadBaselines
  const signalIQRs = {};
  for (const r of rows) {
    const iqr = (r.baseline_p90 ?? 0) - (r.baseline_p10 ?? 0);
    const baseKey = r.signal_key.split(':')[0];
    if (iqr > 0) {
      if (!signalIQRs[baseKey]) signalIQRs[baseKey] = [];
      signalIQRs[baseKey].push(iqr);
    }
  }
  const globalIQR = {};
  for (const [sig, iqrs] of Object.entries(signalIQRs)) {
    iqrs.sort((a, b) => a - b);
    globalIQR[sig] = iqrs[Math.floor(iqrs.length / 2)];
  }

  const out = {};
  for (const r of rows) {
    const colonIdx  = r.signal_key.indexOf(':');
    const baseKey   = r.signal_key.slice(0, colonIdx);
    const source    = r.signal_key.slice(colonIdx + 1);
    const iqr       = (r.baseline_p90 ?? 0) - (r.baseline_p10 ?? 0);
    const fallback  = globalIQR[baseKey] || 1;
    if (!out[r.country]) out[r.country] = {};
    if (!out[r.country][baseKey]) out[r.country][baseKey] = {};
    out[r.country][baseKey][source] = {
      median: r.baseline_median,
      iqr:    Math.max(iqr > 0 ? iqr : 0, fallback),
    };
  }
  return out;
}

// ── Scoring ───────────────────────────────────────────────────────────────────

// tsSrc and srcBl are optional. When present, any signal that has source-specific baselines
// in srcBl is z-scored per source then averaged — never averaging raw values from
// incompatible measurement scales (e.g. WHO GHO mortality vs World Bank composite).
function scoreCountryYear(country, year, ts, baselines, tiers, tsSrc, srcBl, globalBl, tau, scoreRef) {
  const signals = ts[country] || {};
  const stressEntries = [];
  let available = 0;

  for (const [signal, byYear] of Object.entries(signals)) {
    if (SIGNAL_ENDPOINTS[signal] !== undefined && year > SIGNAL_ENDPOINTS[signal]) continue;
    const value = byYear[year];
    if (value === undefined) continue;
    available++;

    const direction = STRESS_DIRECTION[signal];
    if (direction === undefined) continue;

    const tier = tiers[signal];
    if (!tier) continue;
    const weight = TIER_WEIGHT[tier] || 0.2;

    const gbl = globalBl?.[signal];
    if (!gbl || gbl.iqr === 0) continue;

    const gz = ((value - gbl.median) / gbl.iqr) * direction;
    const signalTau = tau[signal] ?? 0;
    const excess = Math.max(0, gz - signalTau);
    stressEntries.push({ signal, gz, excess, weight, value });
  }

  if (stressEntries.length < MIN_SIGNALS_FLOOR) return null;

  const rawStress = stressEntries.reduce((s, e) => s + e.weight * e.excess, 0);

  // Score = this country-year's position in the observed raw_stress distribution
  let score;
  if (scoreRef) {
    score = Math.max(1, Math.min(99, SCORE_CENTER + (rawStress / scoreRef) * SCORE_SCALE));
  } else {
    // first pass (computing the distribution): return rawStress for ref derivation
    return { country, year, rawStress, _rawOnly: true };
  }

  const breakdown = {};
  for (const e of stressEntries.filter(e => e.excess > 0)) {
    breakdown[e.signal] = {
      gz:           parseFloat(e.gz.toFixed(3)),
      excess:       parseFloat(e.excess.toFixed(3)),
      weight:       e.weight,
      contribution: parseFloat((e.weight * e.excess).toFixed(3)),
    };
  }

  return {
    country, year,
    score:             parseFloat(score.toFixed(2)),
    raw_stress:        parseFloat(rawStress.toFixed(4)),
    signals_used:      stressEntries.length,
    signals_available: available,
    breakdown,
    computed_at:       new Date().toISOString(),
    data_status:       'validated',
  };
}

// ── Write ─────────────────────────────────────────────────────────────────────

async function writeScores(rows) {
  if (rows.length === 0) return;
  const BATCH = 100;
  const delay = ms => new Promise(r => setTimeout(r, ms));
  let written = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    let attempts = 0;
    while (attempts < 5) {
      try {
        const { error } = await sb
          .from('historical_convergence_scores')
          .upsert(chunk, { onConflict: 'country,year' });
        if (error) throw error;
        break;
      } catch (err) {
        attempts++;
        if (attempts >= 5) throw err;
        await delay(1000 * attempts);
      }
    }
    written += chunk.length;
    if (written % 2000 === 0 || written === rows.length) {
      process.stdout.write(`\r  Written: ${written.toLocaleString()}/${rows.length.toLocaleString()} rows   `);
    }
  }
  console.log('');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🛰️  Phase 1 Step 3 — Historical convergence scoring pass');
  console.log('   Every country. Every year. Scored against its own baseline.\n');

  await checkTable();

  console.log('  Loading reliability tiers...');
  const tiers = await loadReliabilityTiers();
  console.log(`  ${Object.keys(tiers).length} signals with tiers.\n`);

  console.log('  Loading baselines...');
  const baselines = await loadBaselines();
  console.log(`  ${Object.keys(baselines).length} countries with baselines.\n`);

  console.log('  Building global baselines...');
  const globalBl = buildGlobalBaselines(baselines);
  console.log(`  ${Object.keys(globalBl).length} signals with global baselines.\n`);

  console.log('  Deriving per-signal stress thresholds from data (p60 of each signal z-distribution)...');
  const { ts: tsForTau, tsSrc: tsSrcForTau } = await loadAllReadings();
  const tau = deriveSignalThresholds(tsForTau, globalBl, 0.60);
  console.log(`  ${Object.keys(tau).length} signal thresholds derived from data.\n`);

  console.log('  Loading source-specific baselines...');
  const srcBl = await loadSourceBaselines();
  const srcBlSignals = new Set(Object.values(srcBl).flatMap(c => Object.keys(c)));
  console.log(`  Source baselines found for: ${[...srcBlSignals].join(', ') || 'none'}\n`);

  const { ts, tsSrc } = await loadAllReadings();
  const countries = Object.keys(ts);
  console.log(`\n  ${countries.length} countries loaded.\n`);

  // Collect all (country, year) pairs
  const pairs = [];
  for (const country of countries) {
    const allYears = new Set();
    for (const byYear of Object.values(ts[country])) {
      for (const year of Object.keys(byYear)) allYears.add(parseInt(year));
    }
    for (const year of allYears) pairs.push({ country, year });
  }
  console.log(`  Scoring ${pairs.length} country-year pairs...\n`);

  const rows = [];
  let scored = 0;
  let skipped = 0;

  // Pass 1 — collect raw_stress values to derive the score reference ceiling from real data
  console.log('  Pass 1: collecting raw stress distribution...');
  const rawStressValues = [];
  for (const { country, year } of pairs) {
    const result = scoreCountryYear(country, year, ts, baselines, tiers, tsSrc, srcBl, globalBl, tau, null);
    if (result?._rawOnly) rawStressValues.push(result.rawStress);
  }
  const scoreRef = deriveScoreRef(rawStressValues, 0.97);
  console.log(`  Score reference ceiling (p97 of raw stress): ${scoreRef.toFixed(4)}\n`);

  // Pass 2 — score using the data-derived reference
  console.log('  Pass 2: scoring all country-years against self-derived reference...');
  for (const { country, year } of pairs) {
    const result = scoreCountryYear(country, year, ts, baselines, tiers, tsSrc, srcBl, globalBl, tau, scoreRef);
    if (result && !result._rawOnly) {
      rows.push(result);
      scored++;
    } else {
      skipped++;
    }
  }

  console.log(`  ${scored} scores computed. ${skipped} skipped (no scoreable signals).\n`);

  // Print sample — highest and lowest scoring country-years
  const sorted = [...rows].sort((a, b) => b.score - a.score);
  console.log('  Highest stress country-years:');
  for (const r of sorted.slice(0, 8)) {
    console.log(`    ${r.country} ${r.year}: ${r.score.toFixed(1)}  (${r.signals_used} signals)`);
  }
  console.log('  Lowest stress country-years:');
  for (const r of sorted.slice(-8).reverse()) {
    console.log(`    ${r.country} ${r.year}: ${r.score.toFixed(1)}  (${r.signals_used} signals)`);
  }
  console.log('');

  console.log('  Writing to Supabase...');
  await writeScores(rows);
  console.log(`  historical_convergence_scores: ${rows.length} rows written.\n`);

  logToHive({
    source: 'convergence_history',
    level: 'intel',
    event: 'historical_scores_computed',
    data: { countries: countries.length, scores: rows.length, skipped },
  });

  await logAuditEvent('convergence_scored', null, {
    countries: countries.length,
    country_year_pairs: rows.length,
    skipped,
    year_min: Math.min(...rows.map(r => r.year)),
    year_max: Math.max(...rows.map(r => r.year)),
  }).catch(() => {});

  console.log('═'.repeat(60));
  console.log('✅ Phase 1 Step 3 complete.');
  console.log(`   Countries scored:   ${countries.length}`);
  console.log(`   Country-year pairs: ${rows.length}`);
  console.log(`   Years span:         ${Math.min(...rows.map(r => r.year))} – ${Math.max(...rows.map(r => r.year))}`);
  console.log('\nNext: Phase 1 complete. Move to Phase 2.');
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
