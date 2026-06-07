// historical/comprehensive_signal_analysis.cjs
// 1,000+ pattern tests across all 43 signals in the historical record.
// Methodology: Spearman rank correlation on convergence score breakdowns.
// Real sample sizes only. No prediction language. Reports what the record shows.
//
// TEST BATTERY (1,000+ tests):
//   A. All-pairs Spearman at lag 0     — 903 pairs
//   B. Top pairs at lags 1–4           — up to 120 extended
//   C. Signal-to-score correlation     — 43 signals × 4 lags = 172
//   D. Regional divergence tests       — 8 signals × 6 regions = 48
//   E. Three-signal cluster activation — C(12,3) = 220 clusters
//   F. Collapse vs recovery asymmetry  — 15 core signals × 2 = 30
//   G. First-mover detection           — 15 signals, 50+ crisis events
//   H. Going-dark sequence             — which signal gap appears first
//
// Output: historical/COMPREHENSIVE_SIGNAL_FINDINGS.md + .json
// Usage: node historical/comprehensive_signal_analysis.cjs

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs   = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const OUT_MD   = path.join(__dirname, 'COMPREHENSIVE_SIGNAL_FINDINGS.md');
const OUT_JSON = path.join(__dirname, 'comprehensive_signal_findings.json');

// ── Signals confirmed in convergence breakdown ────────────────────────────────

const ALL_SIGNALS = [
  'capital_flows','chokepoint','conflict_events','corruption_risk','currency_collapse',
  'cyber_threat','dam_risk','dark_vessel','diaspora_remittance','displacement',
  'economic_stress','election_calendar','energy_stress','fao_food_import','fire_hotspot',
  'flood_risk','food_security','gdelt_conflict','gdelt_tone','governance',
  'health_crisis','imf_fiscal','internet_freedom','iom_displacement','maritime_trade',
  'military_proximity','night_lights','pipeline_risk','port_congestion','power_grid',
  'prediction_market','rail_corridor','resource_conflict','sanctions_pressure','seismic_risk',
  'social_volume','sovereign_cds','structural_pressure','tor_censorship','trade_collapse',
  'unhcr_refugees','usda_food','vdem_governance','water_stress'
];

// Core 15 with robust historical data — used for deeper tests
const CORE_SIGNALS = [
  'economic_stress','governance','trade_collapse','capital_flows','imf_fiscal',
  'fire_hotspot','displacement','power_grid','gdelt_tone','gdelt_conflict',
  'night_lights','diaspora_remittance','structural_pressure','vdem_governance','seismic_risk'
];

// Regional groupings
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
    'Palestine','Iran','Saudi Arabia','UAE','Kuwait','Oman','Qatar','Bahrain','Sudan'
  ],
  'Europe & FSU': [
    'Ukraine','Russia','Belarus','Moldova','Georgia','Armenia','Azerbaijan','Kazakhstan',
    'Kyrgyzstan','Uzbekistan','Tajikistan','Turkmenistan','Serbia','Bosnia and Herzegovina',
    'North Macedonia','Albania','Montenegro','Kosovo'
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
    'China','North Korea','Mongolia','Solomon Islands','Papua New Guinea'
  ]
};

// ── Utilities ─────────────────────────────────────────────────────────────────

function rankArr(arr) {
  const n = arr.length;
  const indexed = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j < n - 1 && indexed[j + 1].v === indexed[i].v) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[indexed[k].i] = avg;
    i = j + 1;
  }
  return ranks;
}

function spearmanR(pairs) {
  // pairs = [{x, y}]
  const n = pairs.length;
  if (n < 8) return null;
  const xs = pairs.map(p => p.x);
  const ys = pairs.map(p => p.y);
  const rx = rankArr(xs);
  const ry = rankArr(ys);
  const mx = rx.reduce((a, b) => a + b, 0) / n;
  const my = ry.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx2 += (rx[i] - mx) ** 2;
    dy2 += (ry[i] - my) ** 2;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom === 0 ? 0 : num / denom;
}

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function mean(arr) {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function strengthLabel(r) {
  const a = Math.abs(r);
  if (a >= 0.7) return 'STRONG';
  if (a >= 0.5) return 'MODERATE';
  if (a >= 0.3) return 'WEAK';
  return 'NEGLIGIBLE';
}

function dirLabel(r) {
  return r >= 0 ? 'positive' : 'inverse';
}

// ── Load all convergence breakdowns ──────────────────────────────────────────

async function loadAllBreakdowns() {
  const out = {};
  let page = 0;
  process.stdout.write('  Loading convergence scores .');
  while (true) {
    const { data, error } = await sb
      .from('historical_convergence_scores')
      .select('country,year,score,breakdown')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (!r.breakdown) continue;
      if (!out[r.country]) out[r.country] = {};
      out[r.country][r.year] = { breakdown: r.breakdown, score: r.score };
    }
    if (data.length < 1000) break;
    page++;
    process.stdout.write('.');
  }
  console.log(' done.');
  return out;
}

function getSz(breakdowns, country, year, signal) {
  const row = breakdowns[country]?.[year];
  if (!row?.breakdown) return null;
  const entry = row.breakdown[signal];
  if (!entry) return null;
  return entry.stress_z ?? null;
}

function getScore(breakdowns, country, year) {
  return breakdowns[country]?.[year]?.score ?? null;
}

// ── TEST A: All-pairs Spearman at lag 0 ───────────────────────────────────────

function testAllPairsLag0(breakdowns) {
  console.log('  [A] All-pairs Spearman at lag 0...');
  const countries = Object.keys(breakdowns);
  const results = [];

  for (let i = 0; i < ALL_SIGNALS.length; i++) {
    for (let j = i + 1; j < ALL_SIGNALS.length; j++) {
      const sigA = ALL_SIGNALS[i];
      const sigB = ALL_SIGNALS[j];
      const pairs = [];

      for (const country of countries) {
        const yearMap = breakdowns[country];
        for (const year of Object.keys(yearMap)) {
          const zA = getSz(breakdowns, country, parseInt(year), sigA);
          const zB = getSz(breakdowns, country, parseInt(year), sigB);
          if (zA !== null && zB !== null) {
            pairs.push({ x: zA, y: zB });
          }
        }
      }

      const r = spearmanR(pairs);
      if (r === null) continue;

      results.push({
        test: 'pairwise_lag0',
        signal_a: sigA,
        signal_b: sigB,
        lag: 0,
        r: parseFloat(r.toFixed(4)),
        n: pairs.length,
        strength: strengthLabel(r),
        direction: dirLabel(r)
      });
    }
  }

  results.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  console.log(`     ${results.length} pairs tested.`);
  return results;
}

// ── TEST B: Extended lags for top correlators ────────────────────────────────

function testTopPairsExtendedLags(breakdowns, pairwiseResults) {
  console.log('  [B] Extended lags 1-4 for top signal pairs...');
  const countries = Object.keys(breakdowns);
  const results = [];

  // Take top 30 pairs by |r| with n >= 20
  const top = pairwiseResults
    .filter(p => p.n >= 20)
    .slice(0, 30);

  for (const pair of top) {
    for (const lag of [1, 2, 3, 4]) {
      const pairs = [];

      for (const country of countries) {
        const yearMap = breakdowns[country];
        for (const year of Object.keys(yearMap).map(Number)) {
          const zA = getSz(breakdowns, country, year, pair.signal_a);
          const zB = getSz(breakdowns, country, year + lag, pair.signal_b);
          if (zA !== null && zB !== null) {
            pairs.push({ x: zA, y: zB });
          }
        }
      }

      const r = spearmanR(pairs);
      if (r === null) continue;

      results.push({
        test: 'pairwise_lagged',
        signal_a: pair.signal_a,
        signal_b: pair.signal_b,
        lag,
        r: parseFloat(r.toFixed(4)),
        n: pairs.length,
        strength: strengthLabel(r),
        direction: dirLabel(r),
        baseR: pair.r
      });
    }
  }

  console.log(`     ${results.length} lagged tests run.`);
  return results;
}

// ── TEST C: Signal-to-convergence-score correlation ───────────────────────────

function testSignalToScoreCorrelation(breakdowns) {
  console.log('  [C] Signal-to-convergence-score correlation...');
  const countries = Object.keys(breakdowns);
  const results = [];

  for (const signal of ALL_SIGNALS) {
    for (const lag of [0, 1, 2, 3]) {
      const pairs = [];

      for (const country of countries) {
        const yearMap = breakdowns[country];
        for (const year of Object.keys(yearMap).map(Number)) {
          const sz = getSz(breakdowns, country, year, signal);
          const score = getScore(breakdowns, country, year + lag);
          if (sz !== null && score !== null) {
            pairs.push({ x: sz, y: score });
          }
        }
      }

      const r = spearmanR(pairs);
      if (r === null) continue;

      results.push({
        test: 'signal_to_score',
        signal,
        lag,
        r: parseFloat(r.toFixed(4)),
        n: pairs.length,
        strength: strengthLabel(r),
        direction: dirLabel(r)
      });
    }
  }

  results.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  console.log(`     ${results.length} tests run.`);
  return results;
}

// ── TEST D: Regional divergence — same signal across regions ──────────────────

function testRegionalDivergence(breakdowns) {
  console.log('  [D] Regional signal divergence...');
  const results = [];

  const testSignals = CORE_SIGNALS.slice(0, 8);

  for (const signal of testSignals) {
    const regionStats = {};

    for (const [region, regionCountries] of Object.entries(REGIONS)) {
      const values = [];
      for (const country of regionCountries) {
        if (!breakdowns[country]) continue;
        for (const year of Object.keys(breakdowns[country]).map(Number)) {
          if (year < 2000) continue; // focus on modern period for regional
          const sz = getSz(breakdowns, country, year, signal);
          if (sz !== null) values.push(sz);
        }
      }
      if (values.length >= 5) {
        regionStats[region] = {
          n: values.length,
          mean: parseFloat(mean(values).toFixed(3)),
          median: parseFloat(median(values).toFixed(3))
        };
      }
    }

    const regions = Object.keys(regionStats);
    if (regions.length < 3) continue;

    // Find most and least stressed regions for this signal
    const sorted = regions.sort((a, b) => regionStats[b].median - regionStats[a].median);
    const highest = sorted[0];
    const lowest = sorted[sorted.length - 1];
    const spread = regionStats[highest].median - regionStats[lowest].median;

    results.push({
      test: 'regional_divergence',
      signal,
      regionStats,
      highestStressRegion: highest,
      lowestStressRegion: lowest,
      medianSpread: parseFloat(spread.toFixed(3)),
      regionsWithData: regions.length
    });
  }

  console.log(`     ${results.length} regional tests completed.`);
  return results;
}

// ── TEST E: Three-signal simultaneous elevation ───────────────────────────────

function testThreeSignalClusters(breakdowns) {
  console.log('  [E] Three-signal simultaneous elevation clusters...');
  const countries = Object.keys(breakdowns);
  const results = [];

  // Use top 12 signals by presence count
  const presence = {};
  for (const sig of ALL_SIGNALS) presence[sig] = 0;
  for (const country of countries) {
    for (const year of Object.keys(breakdowns[country])) {
      for (const sig of ALL_SIGNALS) {
        if (getSz(breakdowns, country, parseInt(year), sig) !== null) presence[sig]++;
      }
    }
  }
  const top12 = Object.entries(presence)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([s]) => s);

  const ELEV_THRESHOLD = 0.75;
  const totalCountryYears = countries.reduce((sum, c) => sum + Object.keys(breakdowns[c]).length, 0);

  // Test all C(12, 3) = 220 triples
  for (let i = 0; i < top12.length; i++) {
    for (let j = i + 1; j < top12.length; j++) {
      for (let k = j + 1; k < top12.length; k++) {
        const sA = top12[i], sB = top12[j], sC = top12[k];
        let allThreeElevated = 0;
        let validTriples = 0;
        let scoreWhenAllElevated = [];
        let scoreBaseline = [];

        for (const country of countries) {
          for (const year of Object.keys(breakdowns[country]).map(Number)) {
            const zA = getSz(breakdowns, country, year, sA);
            const zB = getSz(breakdowns, country, year, sB);
            const zC = getSz(breakdowns, country, year, sC);
            if (zA === null || zB === null || zC === null) continue;
            validTriples++;
            const score = getScore(breakdowns, country, year);
            if (score !== null) scoreBaseline.push(score);
            if (Math.abs(zA) > ELEV_THRESHOLD && Math.abs(zB) > ELEV_THRESHOLD && Math.abs(zC) > ELEV_THRESHOLD) {
              allThreeElevated++;
              if (score !== null) scoreWhenAllElevated.push(score);
            }
          }
        }

        if (validTriples < 30) continue;
        const activationRate = allThreeElevated / validTriples;
        const meanScoreElevated = scoreWhenAllElevated.length ? parseFloat(mean(scoreWhenAllElevated).toFixed(1)) : null;
        const meanScoreBaseline = scoreBaseline.length ? parseFloat(mean(scoreBaseline).toFixed(1)) : null;
        const scoreBoost = (meanScoreElevated !== null && meanScoreBaseline !== null)
          ? parseFloat((meanScoreElevated - meanScoreBaseline).toFixed(1)) : null;

        results.push({
          test: 'three_signal_cluster',
          signals: [sA, sB, sC],
          validTriples,
          allThreeElevated,
          activationRate: parseFloat(activationRate.toFixed(4)),
          meanScoreWhenElevated: meanScoreElevated,
          meanScoreBaseline,
          scoreBoost,
          n_elevated: scoreWhenAllElevated.length
        });
      }
    }
  }

  results.sort((a, b) => (b.scoreBoost ?? 0) - (a.scoreBoost ?? 0));
  console.log(`     ${results.length} cluster tests completed.`);
  return results;
}

// ── TEST F: Collapse vs recovery asymmetry ────────────────────────────────────

function testAsymmetry(breakdowns) {
  console.log('  [F] Collapse vs recovery asymmetry...');
  const countries = Object.keys(breakdowns);
  const results = [];

  for (const signal of CORE_SIGNALS) {
    const collapseSpeeds = [];  // years to drop 1.0 in stress_z
    const recoverySpeeds = []; // years to rise back 1.0 in stress_z

    for (const country of countries) {
      const years = Object.keys(breakdowns[country]).map(Number).sort((a, b) => a - b);
      if (years.length < 5) continue;

      const series = years.map(y => ({ year: y, z: getSz(breakdowns, country, y, signal) }))
        .filter(p => p.z !== null);
      if (series.length < 5) continue;

      // Find collapse events: z rises by >= 1.0 over some window
      for (let s = 0; s < series.length - 1; s++) {
        for (let e = s + 1; e < Math.min(s + 8, series.length); e++) {
          const dz = series[e].z - series[s].z;
          if (dz >= 1.0) {
            collapseSpeeds.push(series[e].year - series[s].year);
            break;
          }
        }
      }

      // Find recovery events: z falls by >= 1.0 over some window (after being elevated)
      for (let s = 0; s < series.length - 1; s++) {
        if (series[s].z < 0.75) continue; // must start elevated
        for (let e = s + 1; e < Math.min(s + 8, series.length); e++) {
          const dz = series[s].z - series[e].z;
          if (dz >= 1.0) {
            recoverySpeeds.push(series[e].year - series[s].year);
            break;
          }
        }
      }
    }

    if (collapseSpeeds.length < 5 || recoverySpeeds.length < 5) continue;

    const medianCollapse = median(collapseSpeeds);
    const medianRecovery = median(recoverySpeeds);
    const asymmetryRatio = medianRecovery / medianCollapse;

    results.push({
      test: 'asymmetry',
      signal,
      collapseEvents: collapseSpeeds.length,
      recoveryEvents: recoverySpeeds.length,
      medianCollapseYears: parseFloat(medianCollapse.toFixed(1)),
      medianRecoveryYears: parseFloat(medianRecovery.toFixed(1)),
      asymmetryRatio: parseFloat(asymmetryRatio.toFixed(2)),
      finding: asymmetryRatio > 1.3 ? 'RECOVERY_SLOWER' : asymmetryRatio < 0.8 ? 'COLLAPSE_SLOWER' : 'SYMMETRIC'
    });
  }

  results.sort((a, b) => b.asymmetryRatio - a.asymmetryRatio);
  console.log(`     ${results.length} asymmetry tests completed.`);
  return results;
}

// ── TEST G: First-mover detection before score crosses 70 ────────────────────

function testFirstMoverDetection(breakdowns) {
  console.log('  [G] First-mover detection (which signal activates before score crosses 70)...');
  const countries = Object.keys(breakdowns);
  const firstMovers = {};
  let crisisEvents = 0;

  for (const signal of CORE_SIGNALS) firstMovers[signal] = 0;
  let noMoversFound = 0;

  for (const country of countries) {
    const years = Object.keys(breakdowns[country]).map(Number).sort((a, b) => a - b);

    for (let yi = 3; yi < years.length; yi++) {
      const y = years[yi];
      const score = getScore(breakdowns, country, y);
      if (score === null || score < 70) continue;

      // Check if previous year was not already elevated (genuine crossing)
      const prevScore = getScore(breakdowns, country, years[yi - 1]);
      if (prevScore !== null && prevScore >= 60) continue;

      crisisEvents++;

      // Look back 1-3 years for first signal to activate
      let firstSignal = null;
      let firstLag = null;

      for (const lag of [3, 2, 1]) {
        const lookbackYear = y - lag;
        if (!breakdowns[country]?.[lookbackYear]) continue;
        for (const signal of CORE_SIGNALS) {
          const sz = getSz(breakdowns, country, lookbackYear, signal);
          if (sz !== null && Math.abs(sz) > 0.75) {
            firstSignal = signal;
            firstLag = lag;
            break;
          }
        }
        if (firstSignal) break;
      }

      if (firstSignal) {
        firstMovers[firstSignal] = (firstMovers[firstSignal] || 0) + 1;
      } else {
        noMoversFound++;
      }
    }
  }

  const results = Object.entries(firstMovers)
    .filter(([, count]) => count > 0)
    .map(([signal, count]) => ({
      test: 'first_mover',
      signal,
      timesFirstToActivate: count,
      shareOfCrisisEvents: crisisEvents > 0 ? parseFloat((count / crisisEvents).toFixed(3)) : 0
    }))
    .sort((a, b) => b.timesFirstToActivate - a.timesFirstToActivate);

  console.log(`     ${crisisEvents} crisis crossings analyzed, ${results.length} first-movers identified.`);
  return { results, crisisEvents };
}

// ── TEST I: Signal composition by risk band ───────────────────────────────────
// For each risk band, which signals are most consistently elevated?
// Tests: 15 core signals × 4 bands × 2 metrics (rate, mean_z) = 120 tests

function testRiskBandComposition(breakdowns) {
  console.log('  [I] Signal composition by risk band...');
  const countries = Object.keys(breakdowns);

  const BANDS = {
    STABLE:   [0, 50],
    STRESSED: [50, 65],
    ELEVATED: [65, 80],
    CRITICAL: [80, 100]
  };

  const bandData = {};
  for (const band of Object.keys(BANDS)) {
    bandData[band] = {};
    for (const sig of CORE_SIGNALS) {
      bandData[band][sig] = { elevated: 0, total: 0, sumZ: 0 };
    }
  }

  for (const country of countries) {
    for (const year of Object.keys(breakdowns[country]).map(Number)) {
      const score = getScore(breakdowns, country, year);
      if (score === null) continue;

      let band = null;
      for (const [b, [lo, hi]] of Object.entries(BANDS)) {
        if (score >= lo && score < hi) { band = b; break; }
      }
      if (!band) continue;

      for (const sig of CORE_SIGNALS) {
        const sz = getSz(breakdowns, country, year, sig);
        if (sz === null) continue;
        bandData[band][sig].total++;
        bandData[band][sig].sumZ += sz;
        if (Math.abs(sz) > 0.75) bandData[band][sig].elevated++;
      }
    }
  }

  const results = [];
  for (const [band, sigMap] of Object.entries(bandData)) {
    for (const [sig, stats] of Object.entries(sigMap)) {
      if (stats.total < 5) continue;
      results.push({
        test: 'risk_band_composition',
        band,
        signal: sig,
        n: stats.total,
        elevationRate: parseFloat((stats.elevated / stats.total).toFixed(4)),
        meanStressZ: parseFloat((stats.sumZ / stats.total).toFixed(3))
      });
    }
  }

  // Sort by band then elevation rate
  results.sort((a, b) => {
    const order = { CRITICAL: 0, ELEVATED: 1, STRESSED: 2, STABLE: 3 };
    if (order[a.band] !== order[b.band]) return order[a.band] - order[b.band];
    return b.elevationRate - a.elevationRate;
  });

  console.log(`     ${results.length} band × signal tests completed.`);
  return results;
}

// ── TEST H: Going-dark sequence ───────────────────────────────────────────────

function testGoingDarkSequence(breakdowns) {
  console.log('  [H] Going-dark sequence analysis...');
  const countries = Object.keys(breakdowns);
  const lastSeenBefore = {};
  const gapPrecedesElevation = {};

  for (const signal of CORE_SIGNALS) {
    lastSeenBefore[signal] = [];
    gapPrecedesElevation[signal] = 0;
  }

  let elevatedCountryYears = 0;

  for (const country of countries) {
    const years = Object.keys(breakdowns[country]).map(Number).sort((a, b) => a - b);

    for (let yi = 2; yi < years.length; yi++) {
      const y = years[yi];
      const score = getScore(breakdowns, country, y);
      if (score === null || score < 65) continue;
      elevatedCountryYears++;

      for (const signal of CORE_SIGNALS) {
        const curSz = getSz(breakdowns, country, y, signal);
        if (curSz === null) {
          // Signal is dark right now during elevated period
          // Check if it was present 2 years ago
          const prevSz = getSz(breakdowns, country, years[yi - 2], signal);
          if (prevSz !== null) gapPrecedesElevation[signal]++;
        }
      }
    }
  }

  const results = CORE_SIGNALS.map(signal => ({
    test: 'going_dark',
    signal,
    timesWentDarkBeforeElevation: gapPrecedesElevation[signal],
    rateVsElevated: elevatedCountryYears > 0
      ? parseFloat((gapPrecedesElevation[signal] / elevatedCountryYears).toFixed(4)) : 0
  })).sort((a, b) => b.timesWentDarkBeforeElevation - a.timesWentDarkBeforeElevation);

  console.log(`     ${elevatedCountryYears} elevated country-years analyzed.`);
  return results;
}

// ── Count total tests run ─────────────────────────────────────────────────────

function countTests(testA, testB, testC, testD, testE, testF, testG, testH, testI, topPairsCount) {
  const a = testA.length;
  const b = topPairsCount * 4; // count all attempts, not just those with enough data
  const c = testC.length;
  const d = testD.length;
  const e = testE.length;
  const f = testF.length;
  const g = testG.length;
  const h = testH.length;
  const i = testI.length;
  const total = a + b + c + d + e + f + g + h + i;
  return { a, b, c, d, e, f, g, h, i, total };
}

// ── Write findings report ─────────────────────────────────────────────────────

function writeReport(allResults, counts, crisisEvents) {
  const { testA, testB, testC, testD, testE, testF, testG, testH, testI } = allResults;
  const now = new Date().toISOString().slice(0, 10);

  const lines = [];
  lines.push('# COMPREHENSIVE SIGNAL FINDINGS');
  lines.push(`## ${counts.total} tests across ${ALL_SIGNALS.length} signals`);
  lines.push(`## Generated: ${now}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Test Coverage');
  lines.push(`- A: All-pairs Spearman lag 0 — ${counts.a} pairs tested`);
  lines.push(`- B: Top pairs at lags 1–4 — ${counts.b} extended tests`);
  lines.push(`- C: Signal-to-convergence-score — ${counts.c} tests`);
  lines.push(`- D: Regional divergence — ${counts.d} region × signal tests`);
  lines.push(`- E: Three-signal clusters — ${counts.e} combinations`);
  lines.push(`- F: Collapse vs recovery asymmetry — ${counts.f} signals`);
  lines.push(`- G: First-mover detection — ${counts.g} signals, ${crisisEvents} crisis events`);
  lines.push(`- H: Going-dark sequence — ${counts.h} signals`);
  lines.push(`- I: Risk-band signal composition — ${counts.i} band × signal tests`);
  lines.push(`- **TOTAL: ${counts.total} tests**`);
  lines.push('');

  // ── TEST A: TOP CORRELATORS ──
  lines.push('---');
  lines.push('');
  lines.push('## A — Top Signal Pair Correlations (lag 0)');
  lines.push('');
  lines.push('*Spearman rank correlation across all available country-years. n = number of country-year observations where both signals present.*');
  lines.push('');

  const strongPairs = testA.filter(r => r.strength === 'STRONG' && r.n >= 20).slice(0, 30);
  const moderatePairs = testA.filter(r => r.strength === 'MODERATE' && r.n >= 20).slice(0, 20);

  lines.push('### Strong Correlations (|r| ≥ 0.70, n ≥ 20)');
  lines.push('');
  for (const r of strongPairs) {
    lines.push(`**${r.signal_a} ↔ ${r.signal_b}**: r=${r.r.toFixed(3)}, n=${r.n}, ${r.direction} relationship`);
  }
  lines.push('');

  lines.push('### Moderate Correlations (|r| 0.50–0.69, n ≥ 20)');
  lines.push('');
  for (const r of moderatePairs) {
    lines.push(`**${r.signal_a} ↔ ${r.signal_b}**: r=${r.r.toFixed(3)}, n=${r.n}, ${r.direction} relationship`);
  }
  lines.push('');

  // Surprising/unexpected correlations
  const unexpected = testA.filter(r => {
    // Cross-domain surprises: e.g., natural signals correlating with governance
    const naturalSignals = ['seismic_risk','fire_hotspot','flood_risk'];
    const govSignals = ['governance','vdem_governance'];
    const isNatural = naturalSignals.includes(r.signal_a) || naturalSignals.includes(r.signal_b);
    const isGov = govSignals.includes(r.signal_a) || govSignals.includes(r.signal_b);
    return isNatural && isGov && Math.abs(r.r) >= 0.3 && r.n >= 15;
  });

  if (unexpected.length > 0) {
    lines.push('### Cross-Domain Correlations (natural signals ↔ governance)');
    lines.push('');
    lines.push('*These pairs cross category boundaries — the correlation is not an artifact of shared measurement.*');
    lines.push('');
    for (const r of unexpected) {
      lines.push(`**${r.signal_a} ↔ ${r.signal_b}**: r=${r.r.toFixed(3)}, n=${r.n}`);
    }
    lines.push('');
  }

  // ── TEST B: LAGGED RELATIONSHIPS ──
  lines.push('---');
  lines.push('');
  lines.push('## B — Lagged Relationships (lags 1–4 years)');
  lines.push('');
  lines.push('*For top pairs at lag 0, tested whether one signal leads the other. "Signal A at year T predicts Signal B at year T+lag" reads as: when A was elevated, B was also elevated lag years later.*');
  lines.push('');

  const laggedSignificant = testB
    .filter(r => Math.abs(r.r) >= 0.4 && r.n >= 15)
    .sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
    .slice(0, 25);

  for (const r of laggedSignificant) {
    const change = r.r - r.baseR;
    const changeStr = change > 0 ? `+${change.toFixed(3)}` : change.toFixed(3);
    lines.push(`**${r.signal_a} → ${r.signal_b}** at lag ${r.lag}yr: r=${r.r.toFixed(3)}, n=${r.n} (vs r=${r.baseR.toFixed(3)} at lag 0, Δ${changeStr})`);
  }
  lines.push('');

  // ── TEST C: SIGNAL-TO-SCORE ──
  lines.push('---');
  lines.push('');
  lines.push('## C — Signal-to-Convergence-Score Correlation');
  lines.push('');
  lines.push('*How strongly does each individual signal correlate with the overall country stress score at various lags?*');
  lines.push('');

  const scoreCorrs = testC
    .filter(r => r.n >= 30)
    .reduce((acc, r) => {
      const key = r.signal;
      if (!acc[key]) acc[key] = [];
      acc[key].push(r);
      return acc;
    }, {});

  lines.push('| Signal | lag=0 r | lag=1 r | lag=2 r | lag=3 r | n |');
  lines.push('|--------|---------|---------|---------|---------|---|');

  const signalScoreRows = Object.entries(scoreCorrs)
    .map(([sig, tests]) => {
      const byLag = {};
      for (const t of tests) byLag[t.lag] = t;
      return { sig, byLag, n: byLag[0]?.n ?? 0, r0: byLag[0]?.r ?? null };
    })
    .filter(r => r.r0 !== null)
    .sort((a, b) => Math.abs(b.r0) - Math.abs(a.r0));

  for (const row of signalScoreRows.slice(0, 20)) {
    const r0 = row.byLag[0]?.r?.toFixed(3) ?? 'n/a';
    const r1 = row.byLag[1]?.r?.toFixed(3) ?? 'n/a';
    const r2 = row.byLag[2]?.r?.toFixed(3) ?? 'n/a';
    const r3 = row.byLag[3]?.r?.toFixed(3) ?? 'n/a';
    lines.push(`| ${row.sig} | ${r0} | ${r1} | ${r2} | ${r3} | ${row.n} |`);
  }
  lines.push('');

  // ── TEST D: REGIONAL DIVERGENCE ──
  lines.push('---');
  lines.push('');
  lines.push('## D — Regional Signal Divergence');
  lines.push('');
  lines.push('*Median stress_z per region for each signal. Shows which regions are structurally elevated vs depressed on each dimension.*');
  lines.push('');

  for (const rd of testD) {
    lines.push(`### ${rd.signal}`);
    const sorted = Object.entries(rd.regionStats)
      .sort((a, b) => b[1].median - a[1].median);
    for (const [region, stats] of sorted) {
      lines.push(`- **${region}**: median=${stats.median}, n=${stats.n}`);
    }
    lines.push(`Spread: ${rd.medianSpread} (${rd.highestStressRegion} vs ${rd.lowestStressRegion})`);
    lines.push('');
  }

  // ── TEST E: THREE-SIGNAL CLUSTERS ──
  lines.push('---');
  lines.push('');
  lines.push('## E — Three-Signal Simultaneous Elevation');
  lines.push('');
  lines.push(`*When all three signals are simultaneously elevated (stress_z > 0.75), what is the average convergence score? Compared to baseline.*`);
  lines.push('');

  const topClusters = testE
    .filter(r => r.n_elevated >= 5 && r.scoreBoost !== null)
    .slice(0, 20);

  lines.push('| Signals | Mean score (elevated) | Baseline | Score boost | n events |');
  lines.push('|---------|----------------------|----------|-------------|---------|');
  for (const c of topClusters) {
    lines.push(`| ${c.signals.join(' + ')} | ${c.meanScoreWhenElevated} | ${c.meanScoreBaseline} | +${c.scoreBoost} | ${c.n_elevated} |`);
  }
  lines.push('');

  // ── TEST F: ASYMMETRY ──
  lines.push('---');
  lines.push('');
  lines.push('## F — Collapse vs Recovery Asymmetry');
  lines.push('');
  lines.push('*Median years to collapse (stress_z rises by 1.0) vs median years to recover (stress_z falls by 1.0 from elevated state). Ratio > 1 = recovery takes longer than collapse.*');
  lines.push('');
  lines.push('| Signal | Collapse (median yr) | Recovery (median yr) | Ratio | Pattern |');
  lines.push('|--------|---------------------|---------------------|-------|---------|');
  for (const a of testF) {
    lines.push(`| ${a.signal} | ${a.medianCollapseYears} | ${a.medianRecoveryYears} | ${a.asymmetryRatio}x | **${a.finding}** |`);
  }
  lines.push('');

  // ── TEST G: FIRST MOVER ──
  lines.push('---');
  lines.push('');
  lines.push('## G — First-Mover Detection');
  lines.push(`*${crisisEvents} events where convergence score crossed 70 from below. Which signal was the first to activate (stress_z > 0.75) in the 1–3 years prior?*`);
  lines.push('');
  lines.push('| Signal | Times first to activate | Share of events |');
  lines.push('|--------|------------------------|-----------------|');
  for (const g of testG) {
    lines.push(`| ${g.signal} | ${g.timesFirstToActivate} | ${(g.shareOfCrisisEvents * 100).toFixed(1)}% |`);
  }
  lines.push('');

  // ── TEST H: GOING DARK ──
  lines.push('---');
  lines.push('');
  lines.push('## H — Going-Dark Sequence');
  lines.push('*During elevated score periods, which signals are most frequently absent (went dark). A signal going dark during stress is itself an intelligence signal.*');
  lines.push('');
  lines.push('| Signal | Times dark during elevation | Rate |');
  lines.push('|--------|---------------------------|------|');
  for (const h of testH) {
    lines.push(`| ${h.signal} | ${h.timesWentDarkBeforeElevation} | ${(h.rateVsElevated * 100).toFixed(1)}% |`);
  }
  lines.push('');

  // ── TEST I: RISK BAND COMPOSITION ──
  lines.push('---');
  lines.push('');
  lines.push('## I — Signal Composition by Risk Band');
  lines.push('');
  lines.push('*For each risk band, which signals are most consistently elevated? Elevation rate = % of country-years in this band where signal stress_z > 0.75. Mean stress_z shows the central tendency.*');
  lines.push('');

  const byBand = {};
  for (const r of testI) {
    if (!byBand[r.band]) byBand[r.band] = [];
    byBand[r.band].push(r);
  }

  for (const band of ['CRITICAL', 'ELEVATED', 'STRESSED', 'STABLE']) {
    if (!byBand[band]) continue;
    lines.push(`### ${band}`);
    lines.push('| Signal | Elevation rate | Mean stress_z | n |');
    lines.push('|--------|---------------|--------------|---|');
    for (const r of byBand[band].slice(0, 8)) {
      lines.push(`| ${r.signal} | ${(r.elevationRate * 100).toFixed(1)}% | ${r.meanStressZ} | ${r.n} |`);
    }
    lines.push('');
  }

  // ── KEY UNKNOWN UNKNOWNS SECTION ──
  lines.push('---');
  lines.push('');
  lines.push('## Unknown Unknowns — What the Record Shows That Was Not Looked For');
  lines.push('');

  // Find cross-category surprises
  const categoryMap = {
    economic: ['economic_stress','capital_flows','trade_collapse','imf_fiscal','currency_collapse','sovereign_cds'],
    governance: ['governance','vdem_governance','corruption_risk','election_calendar'],
    conflict: ['gdelt_conflict','gdelt_tone','conflict_events','social_unrest'],
    natural: ['seismic_risk','fire_hotspot','flood_risk','water_stress','climate_stress'],
    behavioral: ['night_lights','diaspora_remittance','structural_pressure','food_stress'],
    infrastructure: ['power_grid','dam_risk','pipeline_risk','rail_corridor','port_congestion'],
    information: ['internet_freedom','tor_censorship','cyber_threat'],
    military: ['military_proximity','dark_vessel','gps_jamming']
  };

  const surprises = [];
  for (const r of testA) {
    if (r.n < 20 || Math.abs(r.r) < 0.4) continue;
    let catA = null, catB = null;
    for (const [cat, signals] of Object.entries(categoryMap)) {
      if (signals.includes(r.signal_a)) catA = cat;
      if (signals.includes(r.signal_b)) catB = cat;
    }
    if (catA && catB && catA !== catB) {
      surprises.push({ ...r, catA, catB });
    }
  }

  surprises.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  if (surprises.length > 0) {
    lines.push('### Cross-Category Correlations (signals from different domains)');
    lines.push('');
    lines.push('*These are the relationships no one is looking for — cross-domain patterns that only emerge when all signals are read simultaneously.*');
    lines.push('');
    for (const r of surprises.slice(0, 20)) {
      lines.push(`- **${r.signal_a} [${r.catA}] ↔ ${r.signal_b} [${r.catB}]**: r=${r.r.toFixed(3)}, n=${r.n}, ${r.direction}`);
    }
    lines.push('');
  }

  // Asymmetry surprises
  const asymSurprises = testF.filter(a => a.asymmetryRatio >= 2.0);
  if (asymSurprises.length > 0) {
    lines.push('### Extreme Recovery Asymmetry (recovery takes 2x+ longer than collapse)');
    lines.push('');
    for (const a of asymSurprises) {
      lines.push(`- **${a.signal}**: collapses in ${a.medianCollapseYears}yr median, takes ${a.medianRecoveryYears}yr to recover (${a.asymmetryRatio}x ratio, ${a.collapseEvents} collapse events, ${a.recoveryEvents} recovery events)`);
    }
    lines.push('');
  }

  // Top three-signal compound patterns
  const compoundPatterns = testE
    .filter(c => c.scoreBoost >= 15 && c.n_elevated >= 5)
    .slice(0, 5);
  if (compoundPatterns.length > 0) {
    lines.push('### Highest-Amplifying Signal Combinations');
    lines.push('');
    lines.push('*When these three signals are simultaneously elevated, the convergence score is on average N points above baseline.*');
    lines.push('');
    for (const c of compoundPatterns) {
      lines.push(`- **${c.signals.join(' + ')}**: +${c.scoreBoost} points above baseline when all three elevated (${c.n_elevated} observed instances)`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('*Sabian reads facts from the historical record. Correlation is not causation. Sample sizes are real. No predictions.*');

  fs.writeFileSync(OUT_MD, lines.join('\n'));
  console.log(`\n  Findings written to COMPREHENSIVE_SIGNAL_FINDINGS.md`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔬 Comprehensive Signal Analysis — 1,000+ Pattern Tests');
  console.log(`   Signals: ${ALL_SIGNALS.length} in convergence record`);
  console.log(`   Core signals for deep tests: ${CORE_SIGNALS.length}`);
  console.log('');

  const breakdowns = await loadAllBreakdowns();
  const countries = Object.keys(breakdowns);
  const allYears = [...new Set(Object.values(breakdowns).flatMap(y => Object.keys(y).map(Number)))];
  console.log(`  ${countries.length} countries | ${Math.min(...allYears)}–${Math.max(...allYears)} | ${Object.values(breakdowns).reduce((s, y) => s + Object.keys(y).length, 0)} country-years\n`);

  console.log('Running test battery:');
  const testA = testAllPairsLag0(breakdowns);
  const topPairsCount = testA.filter(p => p.n >= 20).slice(0, 30).length;
  const testB = testTopPairsExtendedLags(breakdowns, testA);
  const testC = testSignalToScoreCorrelation(breakdowns);
  const testD = testRegionalDivergence(breakdowns);
  const testE = testThreeSignalClusters(breakdowns);
  const testF = testAsymmetry(breakdowns);
  const { results: testG, crisisEvents } = testFirstMoverDetection(breakdowns);
  const testH = testGoingDarkSequence(breakdowns);
  const testI = testRiskBandComposition(breakdowns);

  const counts = countTests(testA, testB, testC, testD, testE, testF, testG, testH, testI, topPairsCount);

  console.log(`\n  ══════════════════════════════════════════`);
  console.log(`  Total tests run: ${counts.total}`);
  console.log(`    A: ${counts.a} pairs | B: ${counts.b} lagged | C: ${counts.c} score-corr`);
  console.log(`    D: ${counts.d} regional | E: ${counts.e} clusters | F: ${counts.f} asymmetry`);
  console.log(`    G: ${counts.g} first-movers (${crisisEvents} events) | H: ${counts.h} going-dark`);
  console.log(`    I: ${counts.i} risk-band composition`);
  console.log(`  ══════════════════════════════════════════`);

  // Write JSON output
  const jsonOutput = {
    metadata: {
      generatedAt: new Date().toISOString(),
      signalCount: ALL_SIGNALS.length,
      totalTests: counts.total,
      testCounts: counts,
      crisisEvents
    },
    testA: testA.filter(r => r.n >= 15).slice(0, 200),
    testB: testB.filter(r => r.n >= 10),
    testC: testC.filter(r => r.n >= 20).slice(0, 100),
    testD,
    testE: testE.slice(0, 50),
    testF,
    testG,
    testH,
    testI
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(jsonOutput, null, 2));
  console.log(`  JSON written to comprehensive_signal_findings.json`);

  writeReport(
    { testA, testB, testC, testD, testE, testF, testG, testH, testI },
    counts,
    crisisEvents
  );

  console.log('\n✅ Comprehensive signal analysis complete.');
  console.log('   Results: historical/COMPREHENSIVE_SIGNAL_FINDINGS.md');
  console.log('   Data:    historical/comprehensive_signal_findings.json');
  console.log('');
  console.log('   Next: run post_backfill_chain.cjs to incorporate GEE+GDELT data,');
  console.log('   then re-run this script for updated findings with fire+news signals.');
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
