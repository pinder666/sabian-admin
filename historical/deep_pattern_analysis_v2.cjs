// historical/deep_pattern_analysis_v2.cjs
// 5,000+ pattern tests across all 33 signals — every test traceable to exact rows.
// Going-dark is treated as a first-class signal: absence = data, silence = finding.
// No manipulation of data. No shaped outputs. Reveals what the record shows.
//
// TEST BATTERY:
//   A. All-pairs Spearman at lag 0            — 528 signal pairs
//   B. Extended lag (top 60 pairs × 10 lags)  — 600 tests
//   C. Signal-to-score (33 signals × 8 lags)  — 264 tests
//   D. Going-dark detection & sequences        — per-signal, per-country
//   E. Silence quantification                  — darkness % vs score correlation
//   F. Three-signal co-activation clusters     — C(15,3) = 455 clusters
//   G. Monte Carlo score band simulations      — 500 scenario draws
//   H. Conditional probability tables          — P(band_change | signal > threshold)
//   I. Signal co-activation pairs              — simultaneous elevation analysis
//   J. Recovery curve analysis                 — how fast each signal recovers
//   K. First-mover detection                   — expanded to all crossings
//   L. Regional divergence                     — 33 signals × 6 regions
//   M. Compound amplification                  — supralinear effects
//   N. Risk band transition matrix             — P(band_t+1 | band_t, signals)
//   O. Unknown-unknown cross-domain screen     — unexpected correlations r > 0.5
//   P. Asymmetry analysis                      — collapse vs recovery speed all signals
//   Q. Signal absence as signal                — null treated as data point
//   R. Bootstrap confidence intervals          — top 50 correlations
//
// Output: historical/DEEP_PATTERN_FINDINGS_V2.md + .json
// Usage:  node historical/deep_pattern_analysis_v2.cjs
//         node historical/deep_pattern_analysis_v2.cjs --countries=Nigeria,Sudan --stream

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs   = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// ── CLI flags ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const countriesArg = args.find(a => a.startsWith('--countries='));
const SCOPED_COUNTRIES = countriesArg
  ? countriesArg.replace('--countries=', '').split(',').map(c => c.trim())
  : null;
const STREAM_MODE = args.includes('--stream');

function emit(type, data) {
  if (STREAM_MODE) console.log(JSON.stringify({ type, ...data, ts: Date.now() }));
}

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const OUT_MD   = path.join(__dirname, 'DEEP_PATTERN_FINDINGS_V2.md');
const OUT_JSON = path.join(__dirname, 'deep_pattern_findings_v2.json');

// ── Signals derived at runtime from actual data ───────────────────────────────
// No hardcoded list — miner discovers whatever signals exist in breakdown column

let ALL_SIGNALS = []; // populated by deriveSignalsFromData()

async function deriveSignalsFromData() {
  process.stdout.write('  Deriving signal list from data...');
  emit('status', { msg: 'Deriving signal list from data...' });
  const signalSet = new Set();
  let page = 0;
  while (true) {
    let query = sb.from('historical_convergence_scores').select('breakdown');
    if (SCOPED_COUNTRIES && SCOPED_COUNTRIES.length > 0) {
      query = query.in('country', SCOPED_COUNTRIES);
    }
    const { data, error } = await query
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) {
      if (row.breakdown && typeof row.breakdown === 'object') {
        for (const key of Object.keys(row.breakdown)) signalSet.add(key);
      }
    }
    page++;
    if (data.length < 1000) break;
  }
  ALL_SIGNALS = [...signalSet].sort();
  console.log(` ${ALL_SIGNALS.length} signals found.`);
  return ALL_SIGNALS;
}

const CORE_SIGNALS = [
  'economic_stress','governance','trade_collapse','capital_flows','structural_pressure',
  'power_grid','night_lights','corruption_risk','sovereign_cds','currency_collapse',
  'sanctions_pressure','resource_conflict','vdem_governance','internet_freedom','fire_hotspot'
];

const REGIONS = {
  'Sub-Saharan Africa': [
    'Nigeria','Ethiopia','Sudan','DRC','Somalia','Mali','Burkina Faso','Niger','Chad',
    'CAR','Mozambique','Zimbabwe','South Sudan','Uganda','Tanzania','Kenya','Cameroon',
    'Ghana','Senegal','Guinea','Burundi','Rwanda','Benin','Togo','Gabon','Malawi',
    'Liberia','Sierra Leone','Madagascar','Zambia','Angola','Eritrea','Gambia',
    'Guinea-Bissau','Namibia','Botswana','South Africa','Mauritania'
  ],
  'MENA': [
    'Syria','Iraq','Yemen','Libya','Lebanon','Jordan','Egypt','Algeria','Tunisia','Morocco',
    'Palestine','Iran','Saudi Arabia','UAE','Kuwait','Oman','Qatar','Sudan'
  ],
  'Europe & FSU': [
    'Ukraine','Russia','Belarus','Moldova','Georgia','Armenia','Azerbaijan','Kazakhstan',
    'Kyrgyzstan','Uzbekistan','Tajikistan','Turkmenistan','Serbia','Bosnia and Herzegovina',
    'North Macedonia','Albania','Montenegro'
  ],
  'South & Southeast Asia': [
    'Afghanistan','Pakistan','India','Bangladesh','Myanmar','Cambodia','Laos',
    'Philippines','Vietnam','Thailand','Indonesia','Sri Lanka','Nepal','Timor-Leste'
  ],
  'Latin America': [
    'Venezuela','Colombia','Haiti','El Salvador','Guatemala','Honduras','Nicaragua',
    'Bolivia','Peru','Ecuador','Paraguay','Cuba','Mexico','Brazil','Argentina'
  ],
  'East Asia & Pacific': [
    'China','North Korea','Mongolia','Solomon Islands','Papua New Guinea','Taiwan','South Korea'
  ]
};

const BAND_ORDER = { 'MINIMAL': 1, 'LOW': 2, 'STABLE': 3, 'MODERATE': 4, 'ELEVATED': 5, 'HIGH': 6, 'CRITICAL': 7, 'EXTREME': 8 };

let totalTests = 0;
const allFindings = [];

// ── Statistics ────────────────────────────────────────────────────────────────

function rankArr(arr) {
  const sorted = [...arr].map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array(arr.length);
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j < sorted.length - 1 && sorted[j + 1].v === sorted[j].v) j++;
    const avgRank = (i + j) / 2;
    for (let k = i; k <= j; k++) ranks[sorted[k].i] = avgRank;
    i = j + 1;
  }
  return ranks;
}

function spearmanR(pairs) {
  const n = pairs.length;
  if (n < 8) return null;
  const xs = pairs.map(p => p.x);
  const ys = pairs.map(p => p.y);
  const rx = rankArr(xs);
  const ry = rankArr(ys);
  let sumX = 0, sumY = 0, sumXX = 0, sumYY = 0, sumXY = 0;
  for (let i = 0; i < n; i++) {
    sumX  += rx[i]; sumY  += ry[i];
    sumXX += rx[i] * rx[i]; sumYY += ry[i] * ry[i];
    sumXY += rx[i] * ry[i];
  }
  const mX = sumX / n, mY = sumY / n;
  let num = 0, dX = 0, dY = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i] - mX) * (ry[i] - mY);
    dX  += (rx[i] - mX) ** 2;
    dY  += (ry[i] - mY) ** 2;
  }
  if (dX === 0 || dY === 0) return null;
  return num / Math.sqrt(dX * dY);
}

function mean(arr) {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr) {
  if (arr.length < 2) return null;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// Bootstrap CI for Spearman r
function bootstrapCI(pairs, iterations = 500) {
  if (pairs.length < 10) return null;
  const samples = [];
  for (let i = 0; i < iterations; i++) {
    const boot = Array.from({ length: pairs.length }, () => pairs[Math.floor(Math.random() * pairs.length)]);
    const r = spearmanR(boot);
    if (r !== null) samples.push(r);
  }
  if (samples.length < 10) return null;
  return {
    lo95: percentile(samples, 2.5).toFixed(3),
    hi95: percentile(samples, 97.5).toFixed(3),
    mean: mean(samples).toFixed(3)
  };
}

// ── Load all convergence scores ───────────────────────────────────────────────

async function loadAllScores() {
  const scopeLabel = SCOPED_COUNTRIES ? `${SCOPED_COUNTRIES.length} countries` : 'all countries';
  process.stdout.write(`  Loading convergence scores (${scopeLabel})...`);
  emit('status', { msg: `Loading convergence scores for ${scopeLabel}...` });
  const all = [];
  let page = 0;
  while (true) {
    let query = sb.from('historical_convergence_scores')
      .select('country, year, score, breakdown, signals_used')
      .lte('year', 2026)
      .order('year');
    if (SCOPED_COUNTRIES && SCOPED_COUNTRIES.length > 0) {
      query = query.in('country', SCOPED_COUNTRIES);
    }
    const { data, error } = await query.range(page * 1000, (page + 1) * 1000 - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) {
      if (!row.breakdown || typeof row.breakdown !== 'object') continue;
      all.push(row);
    }
    if (SCOPED_COUNTRIES) {
      emit('status', { msg: `Loaded ${all.length} records...` });
    }
    page++;
    if (data.length < 1000) break;
  }
  console.log(` ${all.length.toLocaleString()} rows loaded.`);
  emit('status', { msg: `${all.length.toLocaleString()} country-year records loaded` });
  return all;
}

// ── Build signal matrix ───────────────────────────────────────────────────────
// Returns: Map<"country|year", {score, signals: {sigKey: stress_z}}>

function buildSignalMatrix(rows) {
  const matrix = new Map();
  for (const row of rows) {
    const key = `${row.country}|${row.year}`;
    const signals = {};
    for (const [sig, val] of Object.entries(row.breakdown)) {
      const z = val?.stress_z ?? val?.z ?? null;
      if (z !== null && !isNaN(z)) signals[sig] = z;
    }
    matrix.set(key, { country: row.country, year: row.year, score: row.score, signals });
  }
  return matrix;
}

// ── Test A: All-pairs Spearman lag 0 ─────────────────────────────────────────

function testAllPairs(matrix) {
  process.stdout.write('  Test A: All-pairs Spearman lag 0...');
  const sigs = ALL_SIGNALS;
  const results = [];

  for (let i = 0; i < sigs.length; i++) {
    for (let j = i + 1; j < sigs.length; j++) {
      const sigA = sigs[i];
      const sigB = sigs[j];
      const pairs = [];
      for (const row of matrix.values()) {
        const a = row.signals[sigA];
        const b = row.signals[sigB];
        if (a !== undefined && b !== undefined) {
          pairs.push({ x: a, y: b });
        }
      }
      totalTests++;
      const r = spearmanR(pairs);
      if (r !== null) {
        results.push({ sigA, sigB, r: +r.toFixed(3), n: pairs.length, lag: 0 });
      }
    }
  }

  results.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  console.log(` ${results.length} pairs computed.`);
  return results;
}

// ── Test B: Extended lags for top pairs ───────────────────────────────────────

function testExtendedLags(matrix, topPairs) {
  process.stdout.write('  Test B: Extended lags (1-10)...');

  // Build country → sorted year array
  const byCountry = new Map();
  for (const row of matrix.values()) {
    if (!byCountry.has(row.country)) byCountry.set(row.country, []);
    byCountry.get(row.country).push(row);
  }
  for (const [, rows] of byCountry) rows.sort((a, b) => a.year - b.year);

  const pairs60 = topPairs.slice(0, 60);
  const results = [];

  for (const { sigA, sigB } of pairs60) {
    for (let lag = 1; lag <= 10; lag++) {
      const pairs = [];
      for (const [, rows] of byCountry) {
        for (let k = 0; k < rows.length - lag; k++) {
          const x = rows[k].signals[sigA];
          const y = rows[k + lag].signals[sigB];
          if (x !== undefined && y !== undefined) pairs.push({ x, y });
        }
      }
      totalTests++;
      const r = spearmanR(pairs);
      if (r !== null) results.push({ sigA, sigB, r: +r.toFixed(3), n: pairs.length, lag });
    }
  }

  console.log(` ${results.length} lag results.`);
  return results;
}

// ── Test C: Signal-to-score ───────────────────────────────────────────────────

function testSignalToScore(matrix) {
  process.stdout.write('  Test C: Signal-to-score correlations...');

  const byCountry = new Map();
  for (const row of matrix.values()) {
    if (!byCountry.has(row.country)) byCountry.set(row.country, []);
    byCountry.get(row.country).push(row);
  }
  for (const [, rows] of byCountry) rows.sort((a, b) => a.year - b.year);

  const results = [];
  for (const sig of ALL_SIGNALS) {
    for (let lag = 0; lag <= 7; lag++) {
      const pairs = [];
      for (const [, rows] of byCountry) {
        for (let k = 0; k < rows.length - lag; k++) {
          const x = rows[k].signals[sig];
          const y = rows[k + lag].score;
          if (x !== undefined && y !== null) pairs.push({ x, y });
        }
      }
      totalTests++;
      const r = spearmanR(pairs);
      if (r !== null) results.push({ signal: sig, lag, r: +r.toFixed(3), n: pairs.length });
    }
  }

  console.log(` ${results.length} results.`);
  return results.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
}

// ── Test D: Going-dark detection ─────────────────────────────────────────────
// Silence is the signal. When a signal goes dark, what happens to the score?

// Signals excluded from going-dark analysis (absence is not meaningful)
const GOING_DARK_EXCLUSIONS = new Set([
  'election_calendar', // no scheduled election != silence
]);

function testGoingDark(matrix) {
  process.stdout.write('  Test D: Going-dark detection...');
  emit('status', { msg: 'Testing for data silence patterns...' });

  const byCountry = new Map();
  for (const row of matrix.values()) {
    if (!byCountry.has(row.country)) byCountry.set(row.country, []);
    byCountry.get(row.country).push(row);
  }
  for (const [, rows] of byCountry) rows.sort((a, b) => a.year - b.year);

  const darkEvents = [];

  for (const [country, rows] of byCountry) {
    if (rows.length < 5) continue;

    // Compute coverage universe — signals this country EVER reported
    const everPresent = new Set();
    for (const row of rows) {
      for (const sig of Object.keys(row.signals)) everPresent.add(sig);
    }
    if (everPresent.size < 5) continue; // Not enough coverage to detect meaningful silence

    const latestScore = rows[rows.length - 1].score;
    if (latestScore < 40) continue; // Stable countries — silence is not intelligence

    for (const sig of ALL_SIGNALS) {
      if (GOING_DARK_EXCLUSIONS.has(sig)) continue;
      // Find where signal was present then disappeared for 2+ years
      let wasPresent = false;
      let darkStart = null;
      let scoreAtDark = null;

      for (let k = 0; k < rows.length; k++) {
        const present = rows[k].signals[sig] !== undefined;

        if (wasPresent && !present && darkStart === null) {
          darkStart = rows[k].year;
          scoreAtDark = rows[k].score;
        }

        if (darkStart !== null && present) {
          // Signal came back — measure what happened during darkness
          const darkYears = rows[k].year - darkStart;
          if (darkYears >= 2) {
            const scoreAtReturn = rows[k].score;
            const scoreDelta = scoreAtReturn - scoreAtDark;
            darkEvents.push({
              country,
              signal: sig,
              domain: getDomain(sig),
              darkStart,
              darkEnd: rows[k].year,
              darkYears,
              scoreAtDark,
              scoreAtReturn,
              scoreDelta: +scoreDelta.toFixed(1)
            });
            emit('finding', { country, category: 'going_dark_event', darkYears });
          }
          darkStart = null;
          scoreAtDark = null;
        }

        if (present) wasPresent = true;
      }
      totalTests++;
    }
  }

  // Aggregate by signal
  const bySignal = {};
  for (const e of darkEvents) {
    if (!bySignal[e.signal]) bySignal[e.signal] = { events: [], totalDelta: 0 };
    bySignal[e.signal].events.push(e);
    bySignal[e.signal].totalDelta += e.scoreDelta;
  }

  const signalSummary = Object.entries(bySignal).map(([sig, data]) => ({
    signal: sig,
    darkEvents: data.events.length,
    avgScoreChangeDuringDarkness: +(data.totalDelta / data.events.length).toFixed(2),
    maxDelta: Math.max(...data.events.map(e => e.scoreDelta)),
    minDelta: Math.min(...data.events.map(e => e.scoreDelta))
  })).sort((a, b) => Math.abs(b.avgScoreChangeDuringDarkness) - Math.abs(a.avgScoreChangeDuringDarkness));

  console.log(` ${darkEvents.length} going-dark events found across ${Object.keys(bySignal).length} signals.`);
  emit('status', { msg: `Found ${darkEvents.length} silence patterns` });
  return { events: darkEvents, bySignal: signalSummary };
}

// ── Test E: Silence quantification ───────────────────────────────────────────
// What % of signals are dark in a given country-year vs score?

function testSilenceVsScore(matrix) {
  process.stdout.write('  Test E: Silence quantification...');

  const pairs = [];
  let maxDark = 0;
  let maxDarkRow = null;

  for (const row of matrix.values()) {
    const presentCount = Object.keys(row.signals).length;
    const darkCount = ALL_SIGNALS.length - presentCount;
    const darkPct = darkCount / ALL_SIGNALS.length;
    pairs.push({ x: darkPct, y: row.score, country: row.country, year: row.year, darkCount });
    if (darkCount > maxDark) { maxDark = darkCount; maxDarkRow = { country: row.country, year: row.year, darkCount }; }
    totalTests++;
  }

  const r = spearmanR(pairs);

  // Band the darkness levels
  const bands = { '0-10%': [], '10-30%': [], '30-50%': [], '50%+': [] };
  for (const p of pairs) {
    const pct = p.x * 100;
    if (pct <= 10) bands['0-10%'].push(p.y);
    else if (pct <= 30) bands['10-30%'].push(p.y);
    else if (pct <= 50) bands['30-50%'].push(p.y);
    else bands['50%+'].push(p.y);
  }

  const bandStats = {};
  for (const [band, scores] of Object.entries(bands)) {
    if (scores.length > 0) bandStats[band] = { n: scores.length, avgScore: +mean(scores).toFixed(1) };
  }

  console.log(` r=${r?.toFixed(3)}, n=${pairs.length}.`);
  return { r: r ? +r.toFixed(3) : null, n: pairs.length, bandStats, maxDarkRow };
}

// ── Test F: Three-signal co-activation ───────────────────────────────────────

function testThreeSignalClusters(matrix) {
  process.stdout.write('  Test F: Three-signal clusters...');

  const sigs = CORE_SIGNALS;
  const THRESHOLD = 1.0; // stress_z > 1.0 = elevated
  const results = [];

  for (let i = 0; i < sigs.length; i++) {
    for (let j = i + 1; j < sigs.length; j++) {
      for (let k = j + 1; k < sigs.length; k++) {
        const sigA = sigs[i], sigB = sigs[j], sigC = sigs[k];
        const allElevated = [];
        const baseline = [];

        for (const row of matrix.values()) {
          const a = row.signals[sigA], b = row.signals[sigB], c = row.signals[sigC];
          if (a === undefined || b === undefined || c === undefined) continue;
          if (a > THRESHOLD && b > THRESHOLD && c > THRESHOLD) {
            allElevated.push(row.score);
          } else {
            baseline.push(row.score);
          }
        }

        totalTests++;
        if (allElevated.length >= 30 && baseline.length >= 30) {
          const avgElev = mean(allElevated);
          const avgBase = mean(baseline);
          results.push({
            signals: [sigA, sigB, sigC],
            n: allElevated.length,
            avgScoreWhenAllElevated: +avgElev.toFixed(1),
            avgScoreBaseline: +avgBase.toFixed(1),
            amplification: +(avgElev - avgBase).toFixed(1)
          });
        }
      }
    }
  }

  results.sort((a, b) => b.amplification - a.amplification);
  console.log(` ${results.length} valid clusters.`);
  return results;
}

// ── Test G: Monte Carlo score band simulations ────────────────────────────────
// Draw from actual signal distributions per band. Compute score variance.

function testMonteCarlo(matrix) {
  process.stdout.write('  Test G: Monte Carlo simulations...');

  // Band score ranges (approximate)
  const BANDS = {
    'STABLE':   [40, 65],
    'MODERATE': [65, 75],
    'ELEVATED': [75, 85],
    'CRITICAL': [85, 100]
  };

  const results = {};

  for (const [bandName, [lo, hi]] of Object.entries(BANDS)) {
    const bandRows = [...matrix.values()].filter(r => r.score >= lo && r.score < hi);
    if (bandRows.length < 20) continue;

    // For each signal, get the distribution of stress_z values in this band
    const sigDistributions = {};
    for (const sig of CORE_SIGNALS) {
      const vals = bandRows.map(r => r.signals[sig]).filter(v => v !== undefined);
      if (vals.length >= 5) sigDistributions[sig] = vals;
    }

    // Run 1000 Monte Carlo draws — sample from signal distributions and compute synthetic score
    const syntheticScores = [];
    for (let sim = 0; sim < 1000; sim++) {
      let syntheticScore = 50; // baseline
      for (const [sig, vals] of Object.entries(sigDistributions)) {
        const sample = vals[Math.floor(Math.random() * vals.length)];
        syntheticScore += sample * 1.5; // approximate weight
      }
      syntheticScores.push(syntheticScore);
      totalTests++;
    }

    const p5  = percentile(syntheticScores, 5);
    const p95 = percentile(syntheticScores, 95);
    const sd  = stdDev(syntheticScores);

    results[bandName] = {
      empiricalRows: bandRows.length,
      empiricalAvgScore: +mean(bandRows.map(r => r.score)).toFixed(1),
      simulationN: syntheticScores.length,
      simMean: +mean(syntheticScores).toFixed(1),
      simStdDev: sd ? +sd.toFixed(1) : null,
      sim5thPct: +p5.toFixed(1),
      sim95thPct: +p95.toFixed(1),
      simRange: +(p95 - p5).toFixed(1)
    };
  }

  console.log(` ${Object.keys(results).length} bands simulated.`);
  return results;
}

// ── Test H: Conditional probability ──────────────────────────────────────────
// P(score > threshold | signal > threshold)

function testConditionalProbability(matrix) {
  process.stdout.write('  Test H: Conditional probability tables...');

  const SCORE_THRESHOLDS = [65, 75, 85];
  const SIG_THRESHOLDS = [0.5, 1.0, 1.5, 2.0];
  const results = [];

  for (const sig of CORE_SIGNALS) {
    for (const sigT of SIG_THRESHOLDS) {
      for (const scoreT of SCORE_THRESHOLDS) {
        const sigElevated = [...matrix.values()].filter(r => r.signals[sig] !== undefined && r.signals[sig] > sigT);
        const sigBaseline = [...matrix.values()].filter(r => r.signals[sig] !== undefined && r.signals[sig] <= sigT);

        if (sigElevated.length < 10) { totalTests++; continue; }

        const pScoreHigh_given_sigElev = sigElevated.filter(r => r.score > scoreT).length / sigElevated.length;
        const pScoreHigh_given_sigBase = sigBaseline.length > 0
          ? sigBaseline.filter(r => r.score > scoreT).length / sigBaseline.length
          : null;

        totalTests++;
        results.push({
          signal: sig,
          sigThreshold: sigT,
          scoreThreshold: scoreT,
          n_elevated: sigElevated.length,
          n_baseline: sigBaseline.length,
          P_scoreHigh_given_sigElevated: +pScoreHigh_given_sigElev.toFixed(3),
          P_scoreHigh_given_sigBaseline: pScoreHigh_given_sigBase !== null ? +pScoreHigh_given_sigBase.toFixed(3) : null,
          lift: pScoreHigh_given_sigBase ? +(pScoreHigh_given_sigElev / pScoreHigh_given_sigBase).toFixed(2) : null
        });
      }
    }
  }

  results.sort((a, b) => (b.lift || 0) - (a.lift || 0));
  console.log(` ${results.length} conditional tests.`);
  return results;
}

// ── Test I: Signal co-activation pairs ───────────────────────────────────────
// Which pairs of signals elevate together more than expected?

function testCoActivation(matrix) {
  process.stdout.write('  Test I: Signal co-activation pairs...');

  const THRESHOLD = 1.0;
  const n_total = matrix.size;
  const results = [];

  // Base rates
  const baseRates = {};
  for (const sig of ALL_SIGNALS) {
    const count = [...matrix.values()].filter(r => r.signals[sig] !== undefined && r.signals[sig] > THRESHOLD).length;
    baseRates[sig] = count / n_total;
  }

  for (let i = 0; i < ALL_SIGNALS.length; i++) {
    for (let j = i + 1; j < ALL_SIGNALS.length; j++) {
      const sigA = ALL_SIGNALS[i], sigB = ALL_SIGNALS[j];
      let bothElevated = 0, totalWithBoth = 0;
      for (const row of matrix.values()) {
        const a = row.signals[sigA], b = row.signals[sigB];
        if (a === undefined || b === undefined) continue;
        totalWithBoth++;
        if (a > THRESHOLD && b > THRESHOLD) bothElevated++;
      }
      totalTests++;
      if (totalWithBoth < 20) continue;
      const observedRate = bothElevated / totalWithBoth;
      const expectedRate = baseRates[sigA] * baseRates[sigB];
      const lift = expectedRate > 0 ? observedRate / expectedRate : null;
      if (lift !== null && lift > 1.5 && lift < 1000 && bothElevated >= 10 && expectedRate >= 0.001) {
        results.push({
          sigA, sigB,
          n: totalWithBoth,
          bothElevated,
          observedCoActivation: +observedRate.toFixed(3),
          expectedIfIndependent: +expectedRate.toFixed(3),
          lift: +lift.toFixed(2)
        });
      }
    }
  }

  results.sort((a, b) => b.lift - a.lift);
  console.log(` ${results.length} co-activation pairs above 1.5x lift.`);
  return results;
}

// ── Test J: Recovery curves ───────────────────────────────────────────────────
// After a signal peaks, how many years to return to baseline?

function testRecoveryCurves(matrix) {
  process.stdout.write('  Test J: Recovery curve analysis...');

  const byCountry = new Map();
  for (const row of matrix.values()) {
    if (!byCountry.has(row.country)) byCountry.set(row.country, []);
    byCountry.get(row.country).push(row);
  }
  for (const [, rows] of byCountry) rows.sort((a, b) => a.year - b.year);

  const PEAK_THRESHOLD = 1.5;
  const RECOVERY_THRESHOLD = 0.5;
  const results = {};

  for (const sig of CORE_SIGNALS) {
    const recoveryYears = [];
    const collapseYears = [];

    for (const [, rows] of byCountry) {
      let inPeak = false;
      let peakStart = null;
      let recoveryStart = null;

      for (let k = 0; k < rows.length; k++) {
        const z = rows[k].signals[sig];
        if (z === undefined) continue;

        if (!inPeak && z > PEAK_THRESHOLD) {
          inPeak = true;
          peakStart = rows[k].year;
          // Look backwards for collapse start
          let collapseK = k;
          while (collapseK > 0 && rows[collapseK - 1].signals[sig] !== undefined &&
                 rows[collapseK - 1].signals[sig] < RECOVERY_THRESHOLD) collapseK--;
          if (collapseK < k) collapseYears.push(rows[k].year - rows[collapseK].year);
        }

        if (inPeak && z < RECOVERY_THRESHOLD) {
          inPeak = false;
          if (peakStart !== null) {
            recoveryYears.push(rows[k].year - peakStart);
            peakStart = null;
          }
        }
      }
      totalTests++;
    }

    if (recoveryYears.length >= 3) {
      results[sig] = {
        recoveryEvents: recoveryYears.length,
        avgRecoveryYears: +mean(recoveryYears).toFixed(1),
        medianRecoveryYears: +percentile(recoveryYears, 50).toFixed(1),
        collapseEvents: collapseYears.length,
        avgCollapseYears: collapseYears.length ? +mean(collapseYears).toFixed(1) : null,
        asymmetryRatio: collapseYears.length && mean(collapseYears) > 0
          ? +(mean(recoveryYears) / mean(collapseYears)).toFixed(2)
          : null
      };
    }
  }

  console.log(` ${Object.keys(results).length} signals with recovery data.`);
  return results;
}

// ── Test K: First-mover detection (expanded) ──────────────────────────────────

function testFirstMover(matrix) {
  process.stdout.write('  Test K: First-mover detection (expanded)...');

  const byCountry = new Map();
  for (const row of matrix.values()) {
    if (!byCountry.has(row.country)) byCountry.set(row.country, []);
    byCountry.get(row.country).push(row);
  }
  for (const [, rows] of byCountry) rows.sort((a, b) => a.year - b.year);

  const ELEVATION_THRESHOLD = 60;
  const crossings = [];
  const firstMovers = {};

  for (const [country, rows] of byCountry) {
    let wasBelow = false;
    for (let k = 1; k < rows.length; k++) {
      const prev = rows[k - 1].score;
      const curr = rows[k].score;
      if (prev !== null && curr !== null && prev < ELEVATION_THRESHOLD && curr >= ELEVATION_THRESHOLD) {
        wasBelow = true;
        // Find which signal first crossed 1.0 in the 3 years before
        const lookbackYears = 3;
        let firstSig = null;
        let firstYear = Infinity;

        for (const sig of ALL_SIGNALS) {
          for (let m = Math.max(0, k - lookbackYears); m < k; m++) {
            if (rows[m].signals[sig] !== undefined && rows[m].signals[sig] > 1.0) {
              if (rows[m].year < firstYear) {
                firstYear = rows[m].year;
                firstSig = sig;
              }
              break;
            }
          }
        }

        crossings.push({ country, year: rows[k].year, firstMover: firstSig, firstMoverYear: firstYear });
        if (firstSig) firstMovers[firstSig] = (firstMovers[firstSig] || 0) + 1;
        totalTests++;
      }
    }
  }

  const firstMoverRanked = Object.entries(firstMovers)
    .map(([sig, count]) => ({ signal: sig, count, pct: +(count / crossings.length * 100).toFixed(1) }))
    .sort((a, b) => b.count - a.count);

  console.log(` ${crossings.length} score crossings, ${firstMoverRanked.length} first-movers identified.`);
  return { crossings: crossings.length, firstMovers: firstMoverRanked, noDetectedFirstMover: crossings.filter(c => !c.firstMover).length };
}

// ── Test L: Regional divergence ───────────────────────────────────────────────

function testRegionalDivergence(matrix) {
  process.stdout.write('  Test L: Regional divergence...');

  const results = [];

  for (const [region, countries] of Object.entries(REGIONS)) {
    const regionRows = [...matrix.values()].filter(r => countries.includes(r.country));
    if (regionRows.length < 20) continue;

    const globalRows = [...matrix.values()];

    for (const sig of ALL_SIGNALS) {
      const regionVals = regionRows.map(r => r.signals[sig]).filter(v => v !== undefined);
      const globalVals = globalRows.map(r => r.signals[sig]).filter(v => v !== undefined);

      totalTests++;
      if (regionVals.length < 10 || globalVals.length < 20) continue;

      const regionMean = mean(regionVals);
      const globalMean = mean(globalVals);
      const deviation = regionMean - globalMean;

      if (Math.abs(deviation) > 0.3) {
        results.push({
          region,
          signal: sig,
          regionMean: +regionMean.toFixed(3),
          globalMean: +globalMean.toFixed(3),
          deviation: +deviation.toFixed(3),
          n_region: regionVals.length,
          direction: deviation > 0 ? 'above_global' : 'below_global'
        });
      }
    }
  }

  results.sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation));
  console.log(` ${results.length} significant regional divergences.`);
  return results;
}

// ── Test M: Compound amplification ───────────────────────────────────────────
// When N signals are simultaneously elevated, does score increase superlinearly?

function testCompoundAmplification(matrix) {
  process.stdout.write('  Test M: Compound amplification...');

  const THRESHOLD = 1.0;
  const results = [];

  // Group rows by how many signals are elevated simultaneously
  const byElevCount = {};
  for (const row of matrix.values()) {
    const elevCount = ALL_SIGNALS.filter(sig => row.signals[sig] !== undefined && row.signals[sig] > THRESHOLD).length;
    if (!byElevCount[elevCount]) byElevCount[elevCount] = [];
    byElevCount[elevCount].push(row.score);
    totalTests++;
  }

  for (const [count, scores] of Object.entries(byElevCount)) {
    if (scores.length >= 5) {
      results.push({
        signalsElevated: +count,
        n: scores.length,
        avgScore: +mean(scores).toFixed(1),
        medianScore: +percentile(scores, 50).toFixed(1),
        p90Score: +percentile(scores, 90).toFixed(1)
      });
    }
  }

  results.sort((a, b) => a.signalsElevated - b.signalsElevated);
  console.log(` ${results.length} elevation-count buckets.`);
  return results;
}

// ── Test N: Risk band transition matrix ───────────────────────────────────────

function testBandTransitions(matrix) {
  process.stdout.write('  Test N: Risk band transition matrix...');

  function scoreToBand(s) {
    if (s < 45) return 'MINIMAL';
    if (s < 55) return 'STABLE';
    if (s < 65) return 'MODERATE';
    if (s < 75) return 'ELEVATED';
    if (s < 85) return 'HIGH';
    return 'CRITICAL';
  }

  const byCountry = new Map();
  for (const row of matrix.values()) {
    if (!byCountry.has(row.country)) byCountry.set(row.country, []);
    byCountry.get(row.country).push(row);
  }
  for (const [, rows] of byCountry) rows.sort((a, b) => a.year - b.year);

  const transitions = {};

  for (const [, rows] of byCountry) {
    for (let k = 0; k < rows.length - 1; k++) {
      if (rows[k + 1].year - rows[k].year > 2) continue;
      const from = scoreToBand(rows[k].score);
      const to   = scoreToBand(rows[k + 1].score);
      if (!transitions[from]) transitions[from] = {};
      transitions[from][to] = (transitions[from][to] || 0) + 1;
      totalTests++;
    }
  }

  const matrix2 = {};
  for (const [from, tos] of Object.entries(transitions)) {
    const total = Object.values(tos).reduce((a, b) => a + b, 0);
    matrix2[from] = {};
    for (const [to, count] of Object.entries(tos)) {
      matrix2[from][to] = { count, pct: +(count / total * 100).toFixed(1) };
    }
    matrix2[from]._total = total;
  }

  console.log(` ${Object.keys(matrix2).length} bands with transition data.`);
  return matrix2;
}

// ── Test O: Unknown-unknown cross-domain screen ───────────────────────────────
// Pairs where signals are from different domains but correlate above 0.5

const DOMAIN_MAP = {
  // Economic
  'economic_stress': 'economic', 'trade_collapse': 'economic', 'capital_flows': 'economic',
  'currency_collapse': 'economic', 'sovereign_cds': 'economic', 'fao_food_import': 'economic',
  'fao_food': 'economic', 'sanctions_pressure': 'economic', 'imf_fiscal': 'economic',
  'defense_spending': 'economic', 'diaspora_remittance': 'economic', 'usda_food': 'economic',
  'usda_food_supply': 'economic', 'energy_stress': 'economic', 'climate_stress': 'economic',
  'structural_pressure': 'economic',
  // Governance
  'governance': 'governance', 'vdem_governance': 'governance', 'corruption_risk': 'governance',
  'election_calendar': 'governance', 'internet_freedom': 'governance', 'ooni_internet': 'governance',
  'tor_censorship': 'governance', 'cyber_threat': 'governance', 'occrp': 'governance',
  // Physical
  'power_grid': 'physical', 'dam_risk': 'physical', 'flood_risk': 'physical',
  'seismic_risk': 'physical', 'pipeline_risk': 'physical', 'rail_corridor': 'physical',
  'chokepoint': 'physical', 'maritime_trade': 'physical', 'port_congestion': 'physical',
  'water_stress': 'physical', 'cable_disruption': 'physical', 'dark_vessel': 'physical',
  'gps_jamming': 'physical',
  // Behavioral
  'night_lights': 'behavioral', 'fire_hotspot': 'behavioral', 'social_volume': 'behavioral',
  'prediction_market': 'behavioral', 'flight_movement': 'behavioral', 'gdelt_conflict': 'behavioral',
  'gdelt_tone': 'behavioral', 'social_unrest': 'behavioral',
  // Security
  'resource_conflict': 'security', 'military_proximity': 'security', 'conflict': 'security',
  'conflict_events': 'security',
  // Humanitarian
  'food_security': 'humanitarian', 'health_crisis': 'humanitarian', 'unhcr_refugees': 'humanitarian',
  'iom_displacement': 'humanitarian', 'unhcr_odp': 'humanitarian', 'displacement': 'humanitarian',
  'food_stress': 'humanitarian',
};

const unmappedSignals = new Set();

function getDomain(sig) {
  if (DOMAIN_MAP[sig]) return DOMAIN_MAP[sig];
  if (!unmappedSignals.has(sig)) {
    unmappedSignals.add(sig);
    console.warn(`  [WARN] Signal "${sig}" has no domain mapping — logged for review.`);
  }
  return 'unknown';
}

function testUnknownUnknowns(allPairs) {
  process.stdout.write('  Test O: Unknown-unknown cross-domain screen...');

  const crossDomain = allPairs.filter(p => {
    const domA = getDomain(p.sigA);
    const domB = getDomain(p.sigB);
    return domA !== 'unknown' && domB !== 'unknown' && domA !== domB && Math.abs(p.r) >= 0.5 && p.n >= 30;
  });

  crossDomain.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  console.log(` ${crossDomain.length} cross-domain pairs with r >= 0.5.`);
  return crossDomain;
}

// ── Test P: Asymmetry (collapse vs recovery speed) ────────────────────────────

function testAsymmetry(recoveryCurves) {
  process.stdout.write('  Test P: Asymmetry analysis...');

  const results = Object.entries(recoveryCurves)
    .filter(([, d]) => d.asymmetryRatio !== null)
    .map(([sig, d]) => ({
      signal: sig,
      avgRecoveryYears: d.avgRecoveryYears,
      avgCollapseYears: d.avgCollapseYears,
      asymmetryRatio: d.asymmetryRatio,
      recoverySlower: d.asymmetryRatio > 1
    }))
    .sort((a, b) => b.asymmetryRatio - a.asymmetryRatio);

  totalTests += results.length;
  console.log(` ${results.length} signals with asymmetry data.`);
  return results;
}

// ── Test Q: Signal absence as data ───────────────────────────────────────────
// Treat null/missing = 0 and recompute correlations. Does absence correlate?

function testAbsenceAsSignal(matrix) {
  process.stdout.write('  Test Q: Signal absence as signal...');

  const results = [];

  for (const sig of ALL_SIGNALS) {
    const pairs = [];
    for (const row of matrix.values()) {
      const isAbsent = row.signals[sig] === undefined ? 1 : 0;
      pairs.push({ x: isAbsent, y: row.score });
    }
    totalTests++;
    const r = spearmanR(pairs);
    if (r !== null && Math.abs(r) >= 0.1) {
      results.push({
        signal: sig,
        r_absence_vs_score: +r.toFixed(3),
        n: pairs.length,
        darkCount: pairs.filter(p => p.x === 1).length,
        interpretation: r > 0 ? 'absence correlates with higher score' : 'absence correlates with lower score'
      });
    }
  }

  results.sort((a, b) => Math.abs(b.r_absence_vs_score) - Math.abs(a.r_absence_vs_score));
  console.log(` ${results.length} signals where absence is correlated with score.`);
  return results;
}

// ── Test R: Bootstrap CI for top correlations ─────────────────────────────────

function testBootstrap(matrix, topPairs) {
  process.stdout.write('  Test R: Bootstrap confidence intervals...');

  const top50 = topPairs.slice(0, 50);
  const results = [];

  for (const { sigA, sigB, r, n } of top50) {
    const pairs = [];
    for (const row of matrix.values()) {
      const a = row.signals[sigA], b = row.signals[sigB];
      if (a !== undefined && b !== undefined) pairs.push({ x: a, y: b });
    }
    totalTests++;
    const ci = bootstrapCI(pairs, 300);
    if (ci) results.push({ sigA, sigB, r, n, ci });
  }

  console.log(` ${results.length} bootstrap CIs computed.`);
  return results;
}

// ── Going-dark sequence analysis ──────────────────────────────────────────────
// Which signals go dark FIRST before a cascade of other signals fail?

function testGoingDarkSequences(matrix) {
  process.stdout.write('  Test D2: Going-dark sequences...');

  const byCountry = new Map();
  for (const row of matrix.values()) {
    if (!byCountry.has(row.country)) byCountry.set(row.country, []);
    byCountry.get(row.country).push(row);
  }
  for (const [, rows] of byCountry) rows.sort((a, b) => a.year - b.year);

  const firstToDark = {};

  for (const [, rows] of byCountry) {
    if (rows.length < 5) continue;

    // Track which signals go dark per country
    const darkOrder = [];
    for (const sig of ALL_SIGNALS) {
      if (GOING_DARK_EXCLUSIONS.has(sig)) continue;
      let lastPresent = null;
      for (const row of rows) {
        if (row.signals[sig] !== undefined) lastPresent = row.year;
      }
      if (lastPresent !== null && lastPresent < rows[rows.length - 1].year - 2) {
        darkOrder.push({ sig, year: lastPresent });
      }
    }

    darkOrder.sort((a, b) => a.year - b.year);
    if (darkOrder.length >= 2) {
      const firstSig = darkOrder[0].sig;
      firstToDark[firstSig] = (firstToDark[firstSig] || 0) + 1;
    }
    totalTests++;
  }

  const ranked = Object.entries(firstToDark)
    .map(([sig, count]) => ({ signal: sig, timesFirstDark: count }))
    .sort((a, b) => b.timesFirstDark - a.timesFirstDark);

  console.log(` ${ranked.length} signals tracked as first-to-go-dark.`);
  return ranked;
}

// ── Score Shift Detector — real events showing up in the data ─────────────────

function detectScoreShifts(matrix) {
  process.stdout.write('  Detecting score shifts...');

  const THRESHOLD = 20;
  const WINDOW = 3;

  const byCountry = new Map();
  for (const row of matrix.values()) {
    if (!byCountry.has(row.country)) byCountry.set(row.country, []);
    byCountry.get(row.country).push(row);
  }
  for (const [, rows] of byCountry) rows.sort((a, b) => a.year - b.year);

  const shifts = [];

  for (const [country, rows] of byCountry) {
    if (rows.length < 3) continue;

    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j <= Math.min(i + WINDOW, rows.length - 1); j++) {
        const startYear = rows[i].year;
        const endYear = rows[j].year;
        const startScore = rows[i].score;
        const endScore = rows[j].score;

        if (startScore === null || endScore === null) continue;

        const delta = endScore - startScore;
        const windowYears = endYear - startYear;

        if (Math.abs(delta) >= THRESHOLD && windowYears <= WINDOW) {
          const startSignals = rows[i].signals || {};
          const endSignals = rows[j].signals || {};
          const signalDeltas = [];

          for (const sig of Object.keys(endSignals)) {
            const startZ = startSignals[sig] ?? 0;
            const endZ = endSignals[sig] ?? 0;
            const sigDelta = endZ - startZ;
            if (Math.abs(sigDelta) > 0.5) {
              signalDeltas.push({ signal: sig, domain: getDomain(sig), delta: +sigDelta.toFixed(2) });
            }
          }
          signalDeltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

          shifts.push({
            country,
            year: endYear,
            startYear,
            startScore: +startScore.toFixed(1),
            endScore: +endScore.toFixed(1),
            delta: +delta.toFixed(1),
            direction: delta > 0 ? 'up' : 'down',
            windowYears,
            leadingSignals: signalDeltas.slice(0, 5)
          });
        }
      }
    }
  }

  shifts.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const deduped = [];
  const seen = new Set();
  for (const s of shifts) {
    const windowKey = `${s.country}|${Math.floor(s.year / 5)}`;
    if (!seen.has(windowKey)) {
      seen.add(windowKey);
      deduped.push(s);
    }
  }

  console.log(` ${deduped.length} significant score shifts found.`);
  totalTests += shifts.length;
  return deduped;
}

// ── Collapse Pattern Excavation — anchored on validated score shifts ──────────
// Takes the real events (scoreShifts) as anchors.
// Pulls RAW signal readings from historical_signal_readings (966K rows).
// Finds patterns that recur across 3+ distinct countries.

async function excavateCollapsePatterns(matrix, scoreShifts) {
  process.stdout.write('  Excavating collapse patterns from score shifts...');

  const MIN_COUNTRIES = 3;
  const ELEVATION_THRESHOLD = 0.5;
  const LOOKBACK_YEARS = 10;

  // Step 0: Load ALL raw signal readings from historical_signal_readings
  // This is the 966K source — the real data.
  process.stdout.write('\n    Loading raw signal readings...');
  const rawReadings = new Map(); // key: "country|year|signal" -> raw_value
  const countrySignalYears = new Map(); // key: "country" -> Map<signal, Set<year>>

  let page = 0;
  let totalLoaded = 0;
  while (true) {
    const { data, error } = await sb.from('historical_signal_readings')
      .select('country, date, signal_key, raw_value, gap')
      .eq('gap', false)
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const row of data) {
      if (row.raw_value === null) continue;
      const year = parseInt(row.date.slice(0, 4));
      const key = `${row.country}|${year}|${row.signal_key}`;
      rawReadings.set(key, parseFloat(row.raw_value));

      if (!countrySignalYears.has(row.country)) {
        countrySignalYears.set(row.country, new Map());
      }
      const signalMap = countrySignalYears.get(row.country);
      if (!signalMap.has(row.signal_key)) {
        signalMap.set(row.signal_key, new Set());
      }
      signalMap.get(row.signal_key).add(year);
    }

    totalLoaded += data.length;
    page++;
    if (data.length < 1000) break;
  }
  process.stdout.write(` ${totalLoaded.toLocaleString()} readings loaded.\n`);

  // Compute per-signal global stats for z-score normalization
  const signalStats = new Map(); // signal -> { mean, std }
  const signalValues = new Map(); // signal -> [values]
  for (const [key, val] of rawReadings) {
    const signal = key.split('|')[2];
    if (!signalValues.has(signal)) signalValues.set(signal, []);
    signalValues.get(signal).push(val);
  }
  for (const [signal, values] of signalValues) {
    const n = values.length;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    const std = Math.sqrt(variance) || 1;
    signalStats.set(signal, { mean, std });
  }

  // Helper to get z-score from raw value
  function getZScore(country, year, signal) {
    const key = `${country}|${year}|${signal}`;
    const raw = rawReadings.get(key);
    if (raw === undefined) return null;
    const stats = signalStats.get(signal);
    if (!stats) return null;
    return (raw - stats.mean) / stats.std;
  }

  // Step 1: Build chronicles for each score shift using RAW readings
  const chronicles = [];

  for (const shift of scoreShifts) {
    const { country, year, startYear, startScore, endScore, delta, direction } = shift;

    const signalMap = countrySignalYears.get(country);
    if (!signalMap) continue;

    // Track when each signal FIRST elevated (z > threshold)
    const signalFirstElevated = new Map();
    // Track when each signal went DARK
    const signalWentDark = new Map();
    // Track last year each signal was seen
    const signalLastSeen = new Map();

    // Check each signal's readings in the lookback window
    for (const [signal, years] of signalMap) {
      const lookbackYears = [...years].filter(y => y < year && y >= year - LOOKBACK_YEARS).sort((a,b) => a - b);

      for (const y of lookbackYears) {
        const z = getZScore(country, y, signal);
        if (z === null) continue;

        // Track elevation
        if (z > ELEVATION_THRESHOLD && !signalFirstElevated.has(signal)) {
          signalFirstElevated.set(signal, { year: y, z: +z.toFixed(2) });
        }
        signalLastSeen.set(signal, y);
      }
    }

    // Detect going dark: signal present earlier but absent later in lookback
    const maxLookbackYear = year - 1;
    for (const [sig, lastYear] of signalLastSeen) {
      if (lastYear < maxLookbackYear - 1) {
        signalWentDark.set(sig, lastYear);
      }
    }

    // Build the chronicle: ordered list of signal events
    const chronicleEvents = [];

    // Add elevation events
    for (const [sig, data] of signalFirstElevated) {
      chronicleEvents.push({
        signal: sig,
        domain: getDomain(sig),
        event: 'elevated',
        year: data.year,
        yearsBefore: year - data.year,
        z: data.z
      });
    }

    // Add going-dark events
    for (const [sig, darkYear] of signalWentDark) {
      chronicleEvents.push({
        signal: sig,
        domain: getDomain(sig),
        event: 'dark',
        year: darkYear,
        yearsBefore: year - darkYear
      });
    }

    // Sort by year (earliest first)
    chronicleEvents.sort((a, b) => a.year - b.year);

    if (chronicleEvents.length === 0) continue;

    // Extract key features for pattern matching
    const elevatedSignals = chronicleEvents.filter(e => e.event === 'elevated').map(e => e.signal);
    const darkSignals = chronicleEvents.filter(e => e.event === 'dark').map(e => e.signal);
    const leadSignal = chronicleEvents[0]?.signal || null;
    const leadEvent = chronicleEvents[0]?.event || null;
    const leadYearsBefore = chronicleEvents[0]?.yearsBefore || null;

    chronicles.push({
      country,
      shiftYear: year,
      startScore,
      endScore,
      delta,
      direction,
      chronicle: chronicleEvents,
      elevatedSignals,
      darkSignals,
      leadSignal,
      leadEvent,
      leadYearsBefore
    });
    totalTests++;
  }

  // Step 2: Find recurring patterns across 3+ distinct countries

  function groupAndFilter(keyFn, enrichFn) {
    const groups = new Map();
    for (const c of chronicles) {
      const key = keyFn(c);
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(c);
    }
    const results = [];
    for (const [fingerprint, instances] of groups) {
      const distinctCountries = new Set(instances.map(i => i.country));
      if (distinctCountries.size >= MIN_COUNTRIES) {
        const result = {
          fingerprint,
          countryCount: distinctCountries.size,
          countries: [...distinctCountries].sort(),
          instances: instances.map(i => ({
            country: i.country,
            shiftYear: i.shiftYear,
            delta: i.delta,
            direction: i.direction,
            chronicle: i.chronicle
          }))
        };
        if (enrichFn) enrichFn(result, instances[0]);
        results.push(result);
      }
    }
    results.sort((a, b) => b.countryCount - a.countryCount);
    return results;
  }

  // GRAIN 1: Ordered sequence — signals in the order they first elevated
  const orderedSequences = groupAndFilter(
    c => {
      if (c.elevatedSignals.length < 2) return null;
      return c.elevatedSignals.slice(0, 5).join(' → ');
    },
    (result, sample) => {
      result.signalSequence = sample.elevatedSignals.slice(0, 5);
      result.domainSequence = result.signalSequence.map(s => getDomain(s));
    }
  );

  // GRAIN 2: Signal set — order-independent combination of elevated signals
  const signalSets = groupAndFilter(
    c => {
      if (c.elevatedSignals.length < 2) return null;
      return [...c.elevatedSignals].sort().slice(0, 5).join(' + ');
    },
    (result, sample) => {
      result.signalSet = [...sample.elevatedSignals].sort().slice(0, 5);
      result.domainSet = [...new Set(result.signalSet.map(s => getDomain(s)))].sort();
    }
  );

  // GRAIN 3: Signal pairs — every 2-signal combination
  const pairMap = new Map();
  for (const c of chronicles) {
    const sigs = [...c.elevatedSignals].sort();
    for (let i = 0; i < sigs.length && i < 6; i++) {
      for (let j = i + 1; j < sigs.length && j < 6; j++) {
        const pairKey = `${sigs[i]} + ${sigs[j]}`;
        if (!pairMap.has(pairKey)) pairMap.set(pairKey, []);
        pairMap.get(pairKey).push(c);
      }
    }
  }
  const signalPairs = [];
  for (const [fingerprint, instances] of pairMap) {
    const distinctCountries = new Set(instances.map(i => i.country));
    if (distinctCountries.size >= MIN_COUNTRIES) {
      signalPairs.push({
        fingerprint,
        signalPair: fingerprint.split(' + '),
        domainPair: fingerprint.split(' + ').map(s => getDomain(s)),
        countryCount: distinctCountries.size,
        countries: [...distinctCountries].sort(),
        instances: instances.map(i => ({
          country: i.country,
          shiftYear: i.shiftYear,
          delta: i.delta,
          direction: i.direction
        }))
      });
    }
  }
  signalPairs.sort((a, b) => b.countryCount - a.countryCount);

  // GRAIN 4: Lead signal — which signal moved first before the shift
  const leadSignals = groupAndFilter(
    c => c.leadSignal,
    (result, sample) => {
      result.signal = sample.leadSignal;
      result.domain = getDomain(sample.leadSignal);
      result.leadEvent = sample.leadEvent;
    }
  );

  // GRAIN 5: Timing — how many years before the shift did signals first move
  const timingPatterns = groupAndFilter(
    c => {
      if (c.leadYearsBefore === null) return null;
      if (c.leadYearsBefore <= 1) return '0-1 years before';
      if (c.leadYearsBefore <= 2) return '1-2 years before';
      if (c.leadYearsBefore <= 3) return '2-3 years before';
      if (c.leadYearsBefore <= 5) return '3-5 years before';
      return '5+ years before';
    },
    (result) => {
      result.timingWindow = result.fingerprint;
    }
  );

  console.log(` ${scoreShifts.length} shifts analyzed, ${chronicles.length} with data. Patterns: ${orderedSequences.length} sequences, ${signalSets.length} sets, ${signalPairs.length} pairs, ${leadSignals.length} leads, ${timingPatterns.length} timing.`);

  return {
    totalShiftsAnalyzed: scoreShifts.length,
    shiftsWithData: chronicles.length,
    orderedSequences,
    signalSets,
    signalPairs,
    leadSignals,
    timingPatterns,
    chronicles: chronicles.map(c => ({
      country: c.country,
      shiftYear: c.shiftYear,
      delta: c.delta,
      direction: c.direction,
      chronicle: c.chronicle
    }))
  };
}

// ── Highest-darkness countries ────────────────────────────────────────────────

function findDarkestCountries(matrix) {
  const byCountry = new Map();
  for (const row of matrix.values()) {
    if (!byCountry.has(row.country)) byCountry.set(row.country, []);
    byCountry.get(row.country).push(row);
  }

  const results = [];
  for (const [country, rows] of byCountry) {
    // Signals this country EVER reported across its full history
    const everPresent = new Set();
    for (const row of rows) {
      for (const sig of Object.keys(row.signals)) everPresent.add(sig);
    }
    const coverageUniverse = everPresent.size;
    const latestRow = rows.sort((a, b) => b.year - a.year)[0];
    // Dark = was ever present for this country but absent in latest row
    let darkSignals = 0;
    for (const sig of everPresent) {
      if (latestRow.signals[sig] === undefined) darkSignals++;
    }
    const presentSignals = Object.keys(latestRow.signals).length;
    // Only meaningful if the country had real coverage to lose
    if (coverageUniverse >= 5) {
      results.push({ country, year: latestRow.year, darkSignals, presentSignals, coverageUniverse, score: latestRow.score });
    }
  }

  return results.sort((a, b) => b.darkSignals - a.darkSignals).slice(0, 20);
}

// ── Generate claims report ────────────────────────────────────────────────────

function generateReport(findings) {
  const {
    allPairs, extendedLags, signalToScore, goingDark, silenceVsScore,
    threeSigClusters, monteCarlo, conditionalProb, coActivation, recoveryCurves,
    firstMover, regionalDivergence, compoundAmplification, bandTransitions,
    unknownUnknowns, asymmetry, absenceAsSignal, bootstrap, goingDarkSequences,
    darkestCountries
  } = findings;

  const lines = [];
  const ts = new Date().toISOString();

  lines.push(`# SABIAN DEEP PATTERN ANALYSIS — ${ts}`);
  lines.push(`## ${totalTests.toLocaleString()} total tests | Every finding traceable to exact database rows`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Top pairwise correlations
  lines.push('## A. SIGNAL-PAIR CORRELATIONS (All 33 Signals, Lag 0)');
  lines.push(`Tested: ${allPairs.length} pairs | Showing top 20 by |r|`);
  lines.push('');
  for (const p of allPairs.slice(0, 20)) {
    lines.push(`${p.sigA} ↔ ${p.sigB}: r=${p.r}, n=${p.n}`);
  }
  lines.push('');

  // Extended lags
  const topLagFindings = extendedLags.filter(p => Math.abs(p.r) >= 0.4).slice(0, 15);
  lines.push('## B. LEAD INDICATORS (Extended Lag Analysis, Lags 1-10)');
  lines.push(`Pairs tested: ${extendedLags.length} | Lead indicators with |r| >= 0.4:`);
  lines.push('');
  for (const p of topLagFindings) {
    lines.push(`${p.sigA} → ${p.sigB} (lag ${p.lag}yr): r=${p.r}, n=${p.n}`);
  }
  lines.push('');

  // Signal-to-score
  lines.push('## C. SIGNAL-TO-SCORE CORRELATIONS (All Signals × 8 Lags)');
  lines.push('Top 15 signal-to-score relationships:');
  lines.push('');
  for (const p of signalToScore.slice(0, 15)) {
    lines.push(`${p.signal} → score (lag ${p.lag}yr): r=${p.r}, n=${p.n}`);
  }
  lines.push('');

  // Going dark
  lines.push('## D. GOING-DARK ANALYSIS — SILENCE AS SIGNAL');
  lines.push(`Going-dark events detected: ${goingDark.events.length}`);
  lines.push('When a signal goes dark, average score change during darkness:');
  lines.push('');
  for (const s of goingDark.bySignal.slice(0, 15)) {
    if (s.darkEvents >= 3) {
      lines.push(`${s.signal}: ${s.darkEvents} events, avg score change during darkness = ${s.avgScoreChangeDuringDarkness > 0 ? '+' : ''}${s.avgScoreChangeDuringDarkness}`);
    }
  }
  lines.push('');

  // Going-dark sequences
  lines.push('## D2. GOING-DARK SEQUENCES — WHICH SIGNAL FAILS FIRST');
  lines.push('First signal to go dark (most common):');
  lines.push('');
  for (const s of goingDarkSequences.slice(0, 10)) {
    lines.push(`${s.signal}: first to go dark in ${s.timesFirstDark} countries`);
  }
  lines.push('');

  // Darkest countries
  lines.push('## D3. DARKEST COUNTRIES (Most Signals Currently Dark)');
  for (const c of darkestCountries.slice(0, 10)) {
    lines.push(`${c.country} (${c.year}): ${c.darkSignals} of ${c.coverageUniverse} ever-present signals now dark, score=${c.score}`);
  }
  lines.push('');

  // Silence vs score
  lines.push('## E. SILENCE QUANTIFICATION — DARKNESS % vs SCORE');
  lines.push(`Spearman r (darkness% vs score): ${silenceVsScore.r}, n=${silenceVsScore.n}`);
  lines.push('Average score by darkness level:');
  for (const [band, stats] of Object.entries(silenceVsScore.bandStats || {})) {
    lines.push(`  ${band} dark: avg score ${stats.avgScore}, n=${stats.n}`);
  }
  lines.push('');

  // Three-signal clusters
  lines.push('## F. THREE-SIGNAL CO-ACTIVATION CLUSTERS');
  lines.push('Top 10 clusters by score amplification:');
  lines.push('');
  for (const c of threeSigClusters.slice(0, 10)) {
    lines.push(`[${c.signals.join(' + ')}] → avg score ${c.avgScoreWhenAllElevated} (baseline ${c.avgScoreBaseline}, +${c.amplification} pts), n=${c.n}`);
  }
  lines.push('');

  // Monte Carlo
  lines.push('## G. MONTE CARLO SCORE BAND SIMULATIONS (1,000 draws per band)');
  for (const [band, stats] of Object.entries(monteCarlo)) {
    lines.push(`${band}: empirical avg=${stats.empiricalAvgScore} (n=${stats.empiricalRows}) | sim mean=${stats.simMean}, 5th-95th pct=[${stats.sim5thPct},${stats.sim95thPct}], sd=${stats.simStdDev}`);
  }
  lines.push('');

  // Conditional probability
  lines.push('## H. CONDITIONAL PROBABILITY — P(score > threshold | signal > threshold)');
  lines.push('Top 15 by lift ratio:');
  lines.push('');
  for (const p of conditionalProb.slice(0, 15)) {
    lines.push(`${p.signal} > ${p.sigThreshold} → P(score>${p.scoreThreshold}) = ${p.P_scoreHigh_given_sigElevated} vs baseline ${p.P_scoreHigh_given_sigBaseline} (lift ${p.lift}x), n_elevated=${p.n_elevated}`);
  }
  lines.push('');

  // Co-activation
  lines.push('## I. SIGNAL CO-ACTIVATION PAIRS (Simultaneous Elevation, Lift > 1.5x)');
  lines.push(`${coActivation.length} pairs co-activate more than expected. Top 15:`);
  lines.push('');
  for (const p of coActivation.slice(0, 15)) {
    lines.push(`${p.sigA} + ${p.sigB}: lift ${p.lift}x (observed ${p.observedCoActivation} vs expected ${p.expectedIfIndependent}), n=${p.n}`);
  }
  lines.push('');

  // Recovery curves
  lines.push('## J. RECOVERY CURVE ANALYSIS');
  lines.push('Time for signal to return to baseline after peak:');
  lines.push('');
  for (const [sig, d] of Object.entries(recoveryCurves).slice(0, 12)) {
    lines.push(`${sig}: avg recovery ${d.avgRecoveryYears}yr (${d.recoveryEvents} events), avg collapse ${d.avgCollapseYears}yr, asymmetry ratio ${d.asymmetryRatio}`);
  }
  lines.push('');

  // First mover
  lines.push('## K. FIRST-MOVER DETECTION (Score Crossing Events)');
  lines.push(`Total score crossings analyzed: ${firstMover.crossings}`);
  lines.push(`No detectable first-mover: ${firstMover.noDetectedFirstMover} (${firstMover.crossings > 0 ? (firstMover.noDetectedFirstMover / firstMover.crossings * 100).toFixed(1) : 0}% — these are the true unknown unknowns)`);
  lines.push('');
  for (const f of firstMover.firstMovers.slice(0, 12)) {
    lines.push(`${f.signal}: first-mover in ${f.count} crossings (${f.pct}%)`);
  }
  lines.push('');

  // Regional divergence
  lines.push('## L. REGIONAL DIVERGENCE (Top 20 Signal-Region Deviations from Global Mean)');
  for (const d of regionalDivergence.slice(0, 20)) {
    lines.push(`[${d.region}] ${d.signal}: ${d.direction} by ${d.deviation > 0 ? '+' : ''}${d.deviation} (regional=${d.regionMean}, global=${d.globalMean}, n=${d.n_region})`);
  }
  lines.push('');

  // Compound amplification
  lines.push('## M. COMPOUND AMPLIFICATION — N SIGNALS ELEVATED SIMULTANEOUSLY');
  for (const c of compoundAmplification) {
    lines.push(`${c.signalsElevated} signals elevated: avg score ${c.avgScore}, median ${c.medianScore}, p90 ${c.p90Score} (n=${c.n})`);
  }
  lines.push('');

  // Band transitions
  lines.push('## N. RISK BAND TRANSITION MATRIX (Year-over-Year)');
  for (const [from, tos] of Object.entries(bandTransitions)) {
    const toStr = Object.entries(tos)
      .filter(([k]) => k !== '_total')
      .map(([to, d]) => `→${to}:${d.pct}%`)
      .join(' ');
    lines.push(`${from} (n=${tos._total}): ${toStr}`);
  }
  lines.push('');

  // Unknown unknowns
  lines.push('## O. UNKNOWN UNKNOWNS — CROSS-DOMAIN CORRELATIONS (r >= 0.5)');
  lines.push('Signal pairs from DIFFERENT domains with unexpected correlation:');
  lines.push('');
  for (const p of unknownUnknowns.slice(0, 20)) {
    const domA = getDomain(p.sigA);
    const domB = getDomain(p.sigB);
    lines.push(`[${domA}] ${p.sigA} ↔ [${domB}] ${p.sigB}: r=${p.r}, n=${p.n}`);
  }
  lines.push('');

  // Asymmetry
  lines.push('## P. ASYMMETRY — COLLAPSE VS RECOVERY SPEED');
  for (const a of asymmetry.slice(0, 12)) {
    lines.push(`${a.signal}: recovery ${a.avgRecoveryYears}yr, collapse ${a.avgCollapseYears}yr, ratio=${a.asymmetryRatio} (${a.recoverySlower ? 'RECOVERY SLOWER' : 'COLLAPSE SLOWER'})`);
  }
  lines.push('');

  // Absence as signal
  lines.push('## Q. SIGNAL ABSENCE AS DATA POINT');
  lines.push('Signals where absence (going dark) correlates with score:');
  lines.push('');
  for (const s of absenceAsSignal.slice(0, 15)) {
    lines.push(`${s.signal} absence: r=${s.r_absence_vs_score} (${s.interpretation}), dark in ${s.darkCount}/${s.n} country-years`);
  }
  lines.push('');

  // Bootstrap
  lines.push('## R. BOOTSTRAP CONFIDENCE INTERVALS (Top 50 Correlations, 300 iterations)');
  lines.push('95% CI for top correlations:');
  lines.push('');
  for (const b of bootstrap.slice(0, 15)) {
    lines.push(`${b.sigA} ↔ ${b.sigB}: r=${b.r}, 95%CI=[${b.ci.lo95}, ${b.ci.hi95}], n=${b.n}`);
  }
  lines.push('');

  lines.push('---');
  lines.push(`## SUMMARY STATISTICS`);
  lines.push(`Total tests executed: ${totalTests.toLocaleString()}`);
  lines.push(`Total convergence rows: ${[...new Set([...findings.rawMatrix?.values() || []].map(() => 1))].length || 'see DB'}`);
  lines.push(`Going-dark events: ${goingDark.events.length}`);
  lines.push(`Cross-domain unknown unknowns: ${unknownUnknowns.length}`);
  lines.push(`Signal pairs with r >= 0.7: ${allPairs.filter(p => Math.abs(p.r) >= 0.7).length}`);
  lines.push(`Signal pairs with r >= 0.9: ${allPairs.filter(p => Math.abs(p.r) >= 0.9).length}`);
  lines.push(`Score crossings analyzed: ${firstMover.crossings}`);
  lines.push(`Unexplained crossings (no first-mover): ${firstMover.noDetectedFirstMover}`);
  lines.push('');
  lines.push(`Generated: ${ts}`);

  return lines.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!STREAM_MODE) {
    console.log('\n  SABIAN DEEP PATTERN ANALYSIS V2');
    console.log('  ================================');
    console.log('  5,000+ tests | Going-dark as first-class signal | No data manipulation\n');
  }

  if (SCOPED_COUNTRIES) {
    if (!STREAM_MODE) {
      console.log(`  SCOPED MODE: ${SCOPED_COUNTRIES.length} countries`);
      console.log(`  Countries: ${SCOPED_COUNTRIES.join(', ')}\n`);
    }
    emit('start', { countries: SCOPED_COUNTRIES, count: SCOPED_COUNTRIES.length });
  }

  // Derive signal list from actual data — no hardcoded array
  await deriveSignalsFromData();
  if (ALL_SIGNALS.length === 0) throw new Error('No signals found in data — cannot proceed');

  const rows = await loadAllScores();
  const matrix = buildSignalMatrix(rows);
  if (!STREAM_MODE) console.log(`  Signal matrix: ${matrix.size.toLocaleString()} country-year entries\n`);

  // Run all tests
  const allPairs        = testAllPairs(matrix);
  const extendedLags    = testExtendedLags(matrix, allPairs);
  const signalToScore   = testSignalToScore(matrix);
  const goingDark       = testGoingDark(matrix);
  const goingDarkSeqs   = testGoingDarkSequences(matrix);
  const darkestCountries = findDarkestCountries(matrix);
  const scoreShifts     = detectScoreShifts(matrix);
  const collapsePatterns = await excavateCollapsePatterns(matrix, scoreShifts);
  const silenceVsScore  = testSilenceVsScore(matrix);
  const threeSigClusters = testThreeSignalClusters(matrix);
  const monteCarlo      = {}; // Test G disabled: synthetic-score construction does not mirror real scoring formula, produced impossible values
  const conditionalProb = testConditionalProbability(matrix);
  const coActivation    = testCoActivation(matrix);
  const recoveryCurves  = testRecoveryCurves(matrix);
  const firstMover      = testFirstMover(matrix);
  const regionalDiv     = testRegionalDivergence(matrix);
  const compoundAmp     = testCompoundAmplification(matrix);
  const bandTransitions = testBandTransitions(matrix);
  const unknownUnknowns = testUnknownUnknowns(allPairs);
  const asymmetry       = testAsymmetry(recoveryCurves);
  const absenceAsSignal = testAbsenceAsSignal(matrix);
  const bootstrap       = testBootstrap(matrix, allPairs);

  if (!STREAM_MODE) console.log(`\n  Total tests: ${totalTests.toLocaleString()}\n`);

  const findings = {
    allPairs, extendedLags, signalToScore, goingDark, silenceVsScore,
    threeSigClusters, monteCarlo, conditionalProb, coActivation, recoveryCurves,
    firstMover, regionalDivergence: regionalDiv, compoundAmplification: compoundAmp,
    bandTransitions, unknownUnknowns, asymmetry, absenceAsSignal, bootstrap, scoreShifts, collapsePatterns,
    goingDarkSequences: goingDarkSeqs, darkestCountries,
    meta: { totalTests, generatedAt: new Date().toISOString(), matrixSize: matrix.size }
  };

  if (STREAM_MODE) {
    // In stream mode, emit findings directly, don't write files
    const allFindings = [];

    // score_shift (LEAD with real events)
    for (const s of (findings.scoreShifts || [])) {
      allFindings.push({ category: 'score_shift', payload: s });
    }

    // going_dark_event
    for (const e of (findings.goingDark?.events || [])) {
      allFindings.push({ category: 'going_dark_event', payload: { ...e, domain: getDomain(e.signal) } });
    }

    // first_mover
    for (const m of (findings.firstMover?.firstMovers || [])) {
      allFindings.push({ category: 'first_mover', payload: { ...m, domain: getDomain(m.signal) } });
    }

    // conditional_probability
    for (const p of (findings.conditionalProb || [])) {
      allFindings.push({ category: 'conditional_probability', payload: { ...p, domain: getDomain(p.signal) } });
    }

    // recovery_curve
    for (const [sig, data] of Object.entries(findings.recoveryCurves || {})) {
      allFindings.push({ category: 'recovery_curve', payload: { signal: sig, domain: getDomain(sig), ...data } });
    }

    // darkest_country
    for (const d of (findings.darkestCountries || [])) {
      allFindings.push({ category: 'darkest_country', payload: d });
    }

    // going_dark_sequence
    for (const s of (findings.goingDarkSequences || [])) {
      allFindings.push({ category: 'going_dark_sequence', payload: { ...s, domain: getDomain(s.signal) } });
    }

    emit('complete', { findings: allFindings, count: allFindings.length });
  } else {
    const md = generateReport({ ...findings, rawMatrix: matrix });
    fs.writeFileSync(OUT_MD, md, 'utf8');
    fs.writeFileSync(OUT_JSON, JSON.stringify(findings, null, 2), 'utf8');

    console.log(`  Report: ${OUT_MD}`);
    console.log(`  JSON:   ${OUT_JSON}`);
    console.log('');
  }
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
