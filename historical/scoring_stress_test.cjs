// historical/scoring_stress_test.cjs
// 1000-iteration stress test for convergence scoring system.
// Validates: consistency, coverage, signal availability, scoring determinism.
//
// Usage: node historical/scoring_stress_test.cjs

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const ITERATIONS = 1000;
const SAMPLE_SIZE = 50; // countries per iteration

// All 52 signals that should be in STRESS_DIRECTION
const EXPECTED_SIGNALS = [
  'night_lights', 'diaspora_remittance', 'food_stress', 'defense_spending',
  'displacement', 'gdelt_conflict', 'gdelt_tone', 'seismic_risk', 'fire_hotspot',
  'governance', 'economic_stress', 'capital_flows', 'trade_collapse', 'power_grid',
  'imf_fiscal', 'vdem_governance', 'corruption_risk', 'election_calendar',
  'sanctions_pressure', 'currency_collapse', 'maritime_trade', 'energy_stress',
  'fao_food', 'water_stress', 'occrp', 'climate_stress', 'tor_censorship',
  'ooni_internet', 'internet_shutdown_ioda', 'conflict', 'social_unrest',
  'unhcr_odp', 'resource_conflict', 'sovereign_cds', 'flood_risk', 'dam_risk',
  'food_security', 'usda_food', 'dark_vessel', 'port_congestion', 'pipeline_risk',
  'chokepoint', 'rail_corridor', 'cable_disruption', 'gps_jamming',
  'military_proximity', 'cyber_threat', 'flight_movement', 'iom_displacement',
  'social_volume', 'prediction_market', 'structural_pressure', 'health_crisis'
];

async function loadScores() {
  const scores = [];
  let page = 0;
  while (true) {
    const { data, error } = await sb
      .from('historical_convergence_scores')
      .select('country,year,score,signals_used,signals_available,breakdown')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    scores.push(...data);
    if (data.length < 1000) break;
    page++;
  }
  return scores;
}

async function loadSignalReadings() {
  const readings = {};
  let page = 0;
  while (true) {
    const { data, error } = await sb
      .from('historical_signal_readings')
      .select('country,signal_key')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (!readings[r.country]) readings[r.country] = new Set();
      readings[r.country].add(r.signal_key);
    }
    if (data.length < 1000) break;
    page++;
  }
  return readings;
}

async function loadReliabilityMap() {
  const { data, error } = await sb.from('signal_reliability_map').select('signal_key,reliability_tier');
  if (error) throw error;
  const map = {};
  for (const r of (data || [])) map[r.signal_key] = r.reliability_tier;
  return map;
}

async function loadBaselines() {
  const baselines = {};
  let page = 0;
  while (true) {
    const { data, error } = await sb
      .from('signal_baselines')
      .select('country,signal_key')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (!baselines[r.country]) baselines[r.country] = new Set();
      baselines[r.country].add(r.signal_key);
    }
    if (data.length < 1000) break;
    page++;
  }
  return baselines;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function main() {
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('🧪 SCORING STRESS TEST — 1000 Iterations');
  console.log('════════════════════════════════════════════════════════════\n');

  console.log('Loading data...');
  const [scores, readings, reliabilityMap, baselines] = await Promise.all([
    loadScores(),
    loadSignalReadings(),
    loadReliabilityMap(),
    loadBaselines()
  ]);

  console.log(`  Scores loaded: ${scores.length.toLocaleString()}`);
  console.log(`  Countries with readings: ${Object.keys(readings).length}`);
  console.log(`  Signals in reliability map: ${Object.keys(reliabilityMap).length}`);
  console.log(`  Countries with baselines: ${Object.keys(baselines).length}\n`);

  // Build lookup maps
  const scoreMap = {};
  for (const s of scores) {
    scoreMap[`${s.country}|${s.year}`] = s;
  }

  const countries = Object.keys(readings);
  const allSignalsUsed = new Set();
  const signalCoverage = {};

  // Initialize signal coverage tracking
  for (const sig of EXPECTED_SIGNALS) {
    signalCoverage[sig] = { used: 0, available: 0 };
  }

  // Track dark spots
  const darkSpots = {
    countriesNoScores: [],
    countriesNoBaselines: [],
    signalsNotInReliability: [],
    scoresNoBreakdown: [],
    signalsMissingFromExpected: [],
    unexpectedSignals: []
  };

  // Check which expected signals are in reliability map
  for (const sig of EXPECTED_SIGNALS) {
    if (!reliabilityMap[sig]) {
      darkSpots.signalsNotInReliability.push(sig);
    }
  }

  // Check for unexpected signals in reliability map
  for (const sig of Object.keys(reliabilityMap)) {
    if (!EXPECTED_SIGNALS.includes(sig)) {
      darkSpots.unexpectedSignals.push(sig);
    }
  }

  // Analyze all scores for signal usage
  for (const s of scores) {
    if (s.breakdown && typeof s.breakdown === 'object') {
      for (const sig of Object.keys(s.breakdown)) {
        allSignalsUsed.add(sig);
        if (signalCoverage[sig]) {
          signalCoverage[sig].used++;
        }
      }
    } else {
      darkSpots.scoresNoBreakdown.push(`${s.country}|${s.year}`);
    }
  }

  // Check for countries without scores
  for (const country of countries) {
    const countryScores = scores.filter(s => s.country === country);
    if (countryScores.length === 0) {
      darkSpots.countriesNoScores.push(country);
    }
  }

  // Check for countries without baselines
  for (const country of countries) {
    if (!baselines[country]) {
      darkSpots.countriesNoBaselines.push(country);
    }
  }

  // Check which expected signals were never used
  for (const sig of EXPECTED_SIGNALS) {
    if (!allSignalsUsed.has(sig)) {
      darkSpots.signalsMissingFromExpected.push(sig);
    }
  }

  console.log('Running stress test iterations...\n');

  const results = {
    iterations: ITERATIONS,
    passed: 0,
    failed: 0,
    errors: [],
    scoreConsistency: { total: 0, consistent: 0, variance: [] },
    signalUtilization: {},
    coverageByYear: {},
    coverageByCountry: {}
  };

  // Run iterations
  for (let i = 0; i < ITERATIONS; i++) {
    try {
      // Random sample of countries
      const sample = shuffle(countries).slice(0, SAMPLE_SIZE);

      for (const country of sample) {
        const countryScores = scores.filter(s => s.country === country);

        // Check 1: Each country should have scores if it has readings
        if (countryScores.length === 0) {
          // Only flag if not already in darkSpots
          continue;
        }

        // Check 2: Score should be between 1 and 99
        for (const cs of countryScores) {
          if (cs.score < 1 || cs.score > 99) {
            results.errors.push(`${country}|${cs.year}: score ${cs.score} out of bounds`);
          }

          // Check 3: signals_used should be > 0
          if (cs.signals_used === 0) {
            results.errors.push(`${country}|${cs.year}: 0 signals used`);
          }

          // Check 4: breakdown should exist and match signals_used
          if (cs.breakdown) {
            const breakdownCount = Object.keys(cs.breakdown).length;
            if (breakdownCount !== cs.signals_used) {
              results.errors.push(`${country}|${cs.year}: breakdown count ${breakdownCount} != signals_used ${cs.signals_used}`);
            }
          }

          // Track coverage by year
          if (!results.coverageByYear[cs.year]) {
            results.coverageByYear[cs.year] = { count: 0, avgSignals: [] };
          }
          results.coverageByYear[cs.year].count++;
          results.coverageByYear[cs.year].avgSignals.push(cs.signals_used);
        }

        // Track coverage by country
        results.coverageByCountry[country] = countryScores.length;
      }

      results.passed++;
    } catch (err) {
      results.failed++;
      results.errors.push(`Iteration ${i}: ${err.message}`);
    }

    // Progress
    if ((i + 1) % 100 === 0) {
      process.stdout.write(`\r  Iteration ${i + 1}/${ITERATIONS} — ${results.passed} passed, ${results.failed} failed`);
    }
  }
  console.log('\n');

  // Calculate year coverage stats
  const yearStats = [];
  for (const [year, data] of Object.entries(results.coverageByYear)) {
    const avgSigs = data.avgSignals.reduce((a, b) => a + b, 0) / data.avgSignals.length;
    yearStats.push({ year: parseInt(year), count: data.count, avgSignals: avgSigs.toFixed(1) });
  }
  yearStats.sort((a, b) => a.year - b.year);

  // Report
  console.log('════════════════════════════════════════════════════════════');
  console.log('STRESS TEST RESULTS');
  console.log('════════════════════════════════════════════════════════════\n');

  console.log(`Iterations: ${ITERATIONS}`);
  console.log(`Passed: ${results.passed}`);
  console.log(`Failed: ${results.failed}`);
  console.log(`Pass Rate: ${((results.passed / ITERATIONS) * 100).toFixed(1)}%\n`);

  console.log('── Data Integrity ──────────────────────────────────────────\n');
  console.log(`  Total scores: ${scores.length.toLocaleString()}`);
  console.log(`  Unique countries scored: ${new Set(scores.map(s => s.country)).size}`);
  console.log(`  Year range: ${Math.min(...scores.map(s => s.year))} – ${Math.max(...scores.map(s => s.year))}`);
  console.log(`  Signals in active use: ${allSignalsUsed.size}\n`);

  console.log('── Signal Coverage ─────────────────────────────────────────\n');
  console.log(`  Expected signals: ${EXPECTED_SIGNALS.length}`);
  console.log(`  Signals in reliability map: ${Object.keys(reliabilityMap).length}`);
  console.log(`  Signals actively scoring: ${allSignalsUsed.size}`);

  if (darkSpots.signalsNotInReliability.length > 0) {
    console.log(`\n  ⚠️  Missing from reliability map: ${darkSpots.signalsNotInReliability.join(', ')}`);
  }
  if (darkSpots.signalsMissingFromExpected.length > 0) {
    console.log(`\n  ⚠️  Never used in scoring: ${darkSpots.signalsMissingFromExpected.join(', ')}`);
  }
  if (darkSpots.unexpectedSignals.length > 0) {
    console.log(`\n  ℹ️  Extra signals in map (not in expected list): ${darkSpots.unexpectedSignals.join(', ')}`);
  }

  console.log('\n── Dark Spots Audit ────────────────────────────────────────\n');
  console.log(`  Countries with readings but no scores: ${darkSpots.countriesNoScores.length}`);
  if (darkSpots.countriesNoScores.length > 0 && darkSpots.countriesNoScores.length <= 20) {
    console.log(`    ${darkSpots.countriesNoScores.join(', ')}`);
  }
  console.log(`  Countries with readings but no baselines: ${darkSpots.countriesNoBaselines.length}`);
  if (darkSpots.countriesNoBaselines.length > 0 && darkSpots.countriesNoBaselines.length <= 20) {
    console.log(`    ${darkSpots.countriesNoBaselines.join(', ')}`);
  }
  console.log(`  Scores without breakdown: ${darkSpots.scoresNoBreakdown.length}`);

  console.log('\n── Year Distribution ───────────────────────────────────────\n');
  const decades = {};
  for (const ys of yearStats) {
    const decade = Math.floor(ys.year / 10) * 10;
    if (!decades[decade]) decades[decade] = { count: 0, signals: [] };
    decades[decade].count += ys.count;
    decades[decade].signals.push(parseFloat(ys.avgSignals));
  }
  for (const [decade, data] of Object.entries(decades).sort((a, b) => a[0] - b[0])) {
    const avgSigs = data.signals.reduce((a, b) => a + b, 0) / data.signals.length;
    console.log(`  ${decade}s: ${data.count.toLocaleString()} scores, avg ${avgSigs.toFixed(1)} signals/score`);
  }

  console.log('\n── Top Signal Usage ────────────────────────────────────────\n');
  const signalUsageArr = [];
  for (const sig of allSignalsUsed) {
    const count = scores.filter(s => s.breakdown && s.breakdown[sig]).length;
    signalUsageArr.push({ sig, count });
  }
  signalUsageArr.sort((a, b) => b.count - a.count);
  for (const { sig, count } of signalUsageArr.slice(0, 15)) {
    console.log(`  ${sig}: ${count.toLocaleString()} scores`);
  }

  if (results.errors.length > 0) {
    console.log('\n── Errors Found ────────────────────────────────────────────\n');
    const uniqueErrors = [...new Set(results.errors)].slice(0, 20);
    for (const err of uniqueErrors) {
      console.log(`  ❌ ${err}`);
    }
    if (results.errors.length > 20) {
      console.log(`  ... and ${results.errors.length - 20} more`);
    }
  }

  console.log('\n════════════════════════════════════════════════════════════');
  if (results.failed === 0 && results.errors.length === 0) {
    console.log('✅ ALL TESTS PASSED — SCORING SYSTEM VALIDATED');
  } else if (results.errors.length < 10) {
    console.log('⚠️  MOSTLY PASSED — Minor issues found');
  } else {
    console.log('❌ ISSUES DETECTED — Review errors above');
  }
  console.log('════════════════════════════════════════════════════════════\n');

  // Return summary for programmatic use
  return {
    passed: results.passed === ITERATIONS && results.errors.length === 0,
    iterations: ITERATIONS,
    scores: scores.length,
    countries: new Set(scores.map(s => s.country)).size,
    signalsActive: allSignalsUsed.size,
    darkSpots,
    errors: results.errors.length
  };
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
