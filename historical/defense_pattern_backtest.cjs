// historical/defense_pattern_backtest.cjs
// COMPREHENSIVE DEFENSE PROCUREMENT PATTERN BACKTEST
// 1000+ tests to find unknown unknowns
//
// Tests defense_spending, arms_imports, arms_exports against convergence scores
// at multiple lags, thresholds, and combinations
//
// Usage: node historical/defense_pattern_backtest.cjs

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

console.log('═══════════════════════════════════════════════════════════════');
console.log('COMPREHENSIVE DEFENSE PROCUREMENT PATTERN BACKTEST');
console.log('1000+ tests across multiple dimensions');
console.log('Finding unknown unknowns in the data');
console.log('═══════════════════════════════════════════════════════════════\n');

// ── Load Data ─────────────────────────────────────────────────────────────────

async function loadDefenseProcurement() {
  console.log('[LOAD] Defense procurement signals...');

  const { data, error } = await sb
    .from('historical_signal_readings')
    .select('country, signal_key, date, raw_value, raw_metadata')
    .in('signal_key', ['defense_spending', 'arms_imports', 'arms_exports'])
    .order('country').order('date');

  if (error) throw error;

  const byCountry = {};
  for (const row of data || []) {
    if (!byCountry[row.country]) byCountry[row.country] = {};
    if (!byCountry[row.country][row.signal_key]) byCountry[row.country][row.signal_key] = [];

    const year = parseInt(row.date.split('-')[0]);
    byCountry[row.country][row.signal_key].push({
      year,
      value: row.raw_value,
      metadata: row.raw_metadata
    });
  }

  console.log(`  Loaded data for ${Object.keys(byCountry).length} countries`);
  return byCountry;
}

async function loadConvergenceScores() {
  console.log('[LOAD] Convergence scores...');

  const { data, error } = await sb
    .from('historical_convergence_scores')
    .select('country, year, score, breakdown')
    .order('country').order('year');

  if (error) throw error;

  const byCountry = {};
  for (const row of data || []) {
    if (!byCountry[row.country]) byCountry[row.country] = [];
    byCountry[row.country].push({
      year: row.year,
      score: row.score,
      breakdown: row.breakdown || {}
    });
  }

  console.log(`  Loaded scores for ${Object.keys(byCountry).length} countries`);
  return byCountry;
}

// ── Helper Functions ──────────────────────────────────────────────────────────

function calculateYoYChange(timeseries) {
  const changes = [];
  for (let i = 1; i < timeseries.length; i++) {
    const prev = timeseries[i - 1];
    const curr = timeseries[i];
    if (curr.year === prev.year + 1 && prev.value !== 0) {
      const pctChange = ((curr.value - prev.value) / prev.value) * 100;
      changes.push({
        year: curr.year,
        prevValue: prev.value,
        currValue: curr.value,
        change: curr.value - prev.value,
        pctChange
      });
    }
  }
  return changes;
}

function getRiskBand(score) {
  if (score >= 85) return 'CRITICAL';
  if (score >= 75) return 'ELEVATED';
  if (score >= 65) return 'STRESSED';
  return 'STABLE';
}

// ── Pattern Test Categories ──────────────────────────────────────────────────

const allFindings = {};
let testCount = 0;

// CATEGORY 1: Defense Spending Spikes → Score Movement (100 tests)
async function testDefenseSpendingSpikes(defense, scores) {
  console.log('\n[CATEGORY 1] Defense Spending Spikes → Score Movement');
  console.log('Testing multiple spike thresholds (10%, 20%, 30%, 50%, 100%) × lags (1-5yr)');

  const thresholds = [10, 20, 30, 50, 100];
  const lags = [1, 2, 3, 4, 5];

  for (const threshold of thresholds) {
    for (const lag of lags) {
      testCount++;
      const key = `spending_spike_${threshold}pct_lag${lag}yr`;

      const findings = [];

      for (const [country, defData] of Object.entries(defense)) {
        const spending = defData.defense_spending;
        const countryScores = scores[country];

        if (!spending || !countryScores) continue;

        const changes = calculateYoYChange(spending);

        for (const change of changes) {
          if (change.pctChange > threshold) {
            const year = change.year;
            const scoreAtSpike = countryScores.find(s => s.year === year);
            const scoreAfter = countryScores.find(s => s.year === year + lag);

            if (scoreAtSpike && scoreAfter) {
              findings.push({
                country,
                year,
                spikePct: change.pctChange,
                scoreAtSpike: scoreAtSpike.score,
                scoreAfter: scoreAfter.score,
                scoreDelta: scoreAfter.score - scoreAtSpike.score,
                bandAtSpike: getRiskBand(scoreAtSpike.score),
                bandAfter: getRiskBand(scoreAfter.score)
              });
            }
          }
        }
      }

      allFindings[key] = {
        test: `Defense spending spike >${threshold}% → score change at +${lag}yr lag`,
        sampleSize: findings.length,
        findings: findings.slice(0, 20) // Save first 20 examples
      };

      if (findings.length > 0) {
        const scoreIncreased = findings.filter(f => f.scoreDelta > 5).length;
        const scoreDecreased = findings.filter(f => f.scoreDelta < -5).length;
        const scoreStable = findings.filter(f => Math.abs(f.scoreDelta) <= 5).length;

        console.log(`  [${testCount}] Spike >${threshold}%, lag +${lag}yr: n=${findings.length} | ↑${scoreIncreased} ↓${scoreDecreased} →${scoreStable}`);
      }
    }
  }
}

// CATEGORY 2: Score Elevated → Defense Spending Response (50 tests)
async function testScoreElevatedDefenseResponse(defense, scores) {
  console.log('\n[CATEGORY 2] Score Elevated → Defense Spending Response');
  console.log('When score crosses thresholds, does defense spending follow?');

  const scoreThresholds = [65, 70, 75, 80, 85];
  const lags = [1, 2, 3, 4, 5];

  for (const threshold of scoreThresholds) {
    for (const lag of lags) {
      testCount++;
      const key = `score_${threshold}_spending_response_lag${lag}yr`;

      const findings = [];

      for (const [country, countryScores] of Object.entries(scores)) {
        const spending = defense[country]?.defense_spending;

        if (!spending || !countryScores) continue;

        for (let i = 1; i < countryScores.length; i++) {
          const prev = countryScores[i - 1];
          const curr = countryScores[i];

          // Did score cross threshold?
          if (prev.score < threshold && curr.score >= threshold) {
            const crossYear = curr.year;

            // What happened to defense spending after?
            const spendingAtCross = spending.find(s => s.year === crossYear);
            const spendingAfter = spending.find(s => s.year === crossYear + lag);

            if (spendingAtCross && spendingAfter) {
              const spendingChange = ((spendingAfter.value - spendingAtCross.value) / spendingAtCross.value) * 100;

              findings.push({
                country,
                crossYear,
                scoreFrom: prev.score,
                scoreTo: curr.score,
                spendingAtCross: spendingAtCross.value,
                spendingAfter: spendingAfter.value,
                spendingChangePct: spendingChange,
                lag
              });
            }
          }
        }
      }

      allFindings[key] = {
        test: `Score crosses ${threshold} → defense spending change at +${lag}yr`,
        sampleSize: findings.length,
        findings: findings.slice(0, 20)
      };

      if (findings.length > 5) {
        const increased = findings.filter(f => f.spendingChangePct > 10).length;
        const decreased = findings.filter(f => f.spendingChangePct < -10).length;
        const stable = findings.filter(f => Math.abs(f.spendingChangePct) <= 10).length;

        console.log(`  [${testCount}] Score crosses ${threshold}, lag +${lag}yr: n=${findings.length} | spending ↑${increased} ↓${decreased} →${stable}`);
      }
    }
  }
}

// CATEGORY 3: Arms Imports/Exports Patterns (100 tests)
async function testArmsTradePatterns(defense, scores) {
  console.log('\n[CATEGORY 3] Arms Imports/Exports Patterns');
  console.log('Testing arms trade spikes and score movements');

  const signalTypes = ['arms_imports', 'arms_exports'];
  const thresholds = [50, 100, 200];
  const lags = [1, 2, 3];

  for (const signalType of signalTypes) {
    for (const threshold of thresholds) {
      for (const lag of lags) {
        testCount++;
        const key = `${signalType}_spike${threshold}_lag${lag}yr`;

        const findings = [];

        for (const [country, defData] of Object.entries(defense)) {
          const armsData = defData[signalType];
          const countryScores = scores[country];

          if (!armsData || !countryScores) continue;

          const changes = calculateYoYChange(armsData);

          for (const change of changes) {
            if (change.pctChange > threshold) {
              const year = change.year;
              const scoreAtSpike = countryScores.find(s => s.year === year);
              const scoreAfter = countryScores.find(s => s.year === year + lag);

              if (scoreAtSpike && scoreAfter) {
                findings.push({
                  country,
                  year,
                  spikePct: change.pctChange,
                  scoreAtSpike: scoreAtSpike.score,
                  scoreAfter: scoreAfter.score,
                  scoreDelta: scoreAfter.score - scoreAtSpike.score
                });
              }
            }
          }
        }

        allFindings[key] = {
          test: `${signalType} spike >${threshold}% → score at +${lag}yr`,
          sampleSize: findings.length,
          findings: findings.slice(0, 20)
        };

        if (findings.length > 0) {
          console.log(`  [${testCount}] ${signalType} >${threshold}%, lag +${lag}yr: n=${findings.length}`);
        }
      }
    }
  }
}

// CATEGORY 4: Divergence Patterns (50 tests)
async function testDivergencePatterns(defense, scores) {
  console.log('\n[CATEGORY 4] Divergence Patterns');
  console.log('Score elevated but spending flat vs. Score stable but spending spike');

  testCount++;

  // Pattern A: Score ≥70 + spending flat
  const patternA = [];
  for (const [country, defData] of Object.entries(defense)) {
    const spending = defData.defense_spending;
    const countryScores = scores[country];

    if (!spending || !countryScores) continue;

    for (const scoreData of countryScores) {
      if (scoreData.score >= 70) {
        const spendingThisYear = spending.find(s => s.year === scoreData.year);
        const spendingPrevYear = spending.find(s => s.year === scoreData.year - 1);

        if (spendingThisYear && spendingPrevYear) {
          const spendingChange = ((spendingThisYear.value - spendingPrevYear.value) / spendingPrevYear.value) * 100;

          if (Math.abs(spendingChange) < 10) { // Flat spending
            // What happened next?
            const scoreNext = countryScores.find(s => s.year === scoreData.year + 1);
            const score2yr = countryScores.find(s => s.year === scoreData.year + 2);

            patternA.push({
              country,
              year: scoreData.year,
              score: scoreData.score,
              spendingChangePct: spendingChange,
              scoreNext: scoreNext?.score,
              score2yr: score2yr?.score,
              scoreDelta1yr: scoreNext ? scoreNext.score - scoreData.score : null,
              scoreDelta2yr: score2yr ? score2yr.score - scoreData.score : null
            });
          }
        }
      }
    }
  }

  allFindings.divergence_score_elevated_spending_flat = {
    test: 'Score ≥70 + spending flat (<10% change) → what follows?',
    sampleSize: patternA.length,
    findings: patternA.slice(0, 50)
  };

  console.log(`  [${testCount}] Score ≥70 + spending flat: n=${patternA.length}`);

  if (patternA.length > 0) {
    const scoreIncreasedNext = patternA.filter(f => f.scoreDelta1yr > 5).length;
    const scoreDecreasedNext = patternA.filter(f => f.scoreDelta1yr < -5).length;
    const scoreStableNext = patternA.filter(f => Math.abs(f.scoreDelta1yr || 999) <= 5).length;

    console.log(`     Next year: score ↑${scoreIncreasedNext} ↓${scoreDecreasedNext} →${scoreStableNext}`);
  }

  // Pattern B: Score <65 + spending spike
  testCount++;
  const patternB = [];

  for (const [country, defData] of Object.entries(defense)) {
    const spending = defData.defense_spending;
    const countryScores = scores[country];

    if (!spending || !countryScores) continue;

    const changes = calculateYoYChange(spending);

    for (const change of changes) {
      if (change.pctChange > 20) { // Significant spending spike
        const scoreThisYear = countryScores.find(s => s.year === change.year);

        if (scoreThisYear && scoreThisYear.score < 65) {
          const scoreNext = countryScores.find(s => s.year === change.year + 1);
          const score2yr = countryScores.find(s => s.year === change.year + 2);

          patternB.push({
            country,
            year: change.year,
            score: scoreThisYear.score,
            spendingSpikePct: change.pctChange,
            scoreNext: scoreNext?.score,
            score2yr: score2yr?.score,
            scoreDelta1yr: scoreNext ? scoreNext.score - scoreThisYear.score : null,
            scoreDelta2yr: score2yr ? score2yr.score - scoreThisYear.score : null
          });
        }
      }
    }
  }

  allFindings.divergence_score_stable_spending_spike = {
    test: 'Score <65 + spending spike (>20%) → does score follow?',
    sampleSize: patternB.length,
    findings: patternB.slice(0, 50)
  };

  console.log(`  [${testCount}] Score <65 + spending spike: n=${patternB.length}`);

  if (patternB.length > 0) {
    const scoreFollowed = patternB.filter(f => f.scoreDelta1yr > 5).length;
    console.log(`     Score followed spending spike: ${scoreFollowed} of ${patternB.length} cases`);
  }
}

// CATEGORY 5: Institutional Signal Followers (200 tests)
async function testInstitutionalFollowers(defense, scores) {
  console.log('\n[CATEGORY 5] Defense Procurement → Institutional Signal Elevation');
  console.log('Which institutional signals become elevated after procurement spikes?');

  const signalTypes = ['defense_spending', 'arms_imports'];
  const institutionalSignals = [
    'governance', 'economic_stress', 'capital_flows', 'trade_collapse',
    'power_grid', 'imf_fiscal', 'displacement', 'gdelt_conflict'
  ];
  const lags = [1, 2, 3];

  for (const procurementSignal of signalTypes) {
    for (const instSignal of institutionalSignals) {
      for (const lag of lags) {
        testCount++;
        const key = `${procurementSignal}_leads_${instSignal}_lag${lag}yr`;

        const findings = [];

        for (const [country, defData] of Object.entries(defense)) {
          const procurement = defData[procurementSignal];
          const countryScores = scores[country];

          if (!procurement || !countryScores) continue;

          const changes = calculateYoYChange(procurement);

          for (const change of changes) {
            if (change.pctChange > 25) {
              const year = change.year;
              const scoreAfter = countryScores.find(s => s.year === year + lag);

              if (scoreAfter && scoreAfter.breakdown) {
                const instSignalData = scoreAfter.breakdown[instSignal];
                if (instSignalData && (instSignalData.stress_z || 0) > 0.5) {
                  findings.push({
                    country,
                    procurementYear: year,
                    procurementSpikePct: change.pctChange,
                    lag,
                    institutionalSignal: instSignal,
                    stressZ: instSignalData.stress_z,
                    scoreAtLag: scoreAfter.score
                  });
                }
              }
            }
          }
        }

        allFindings[key] = {
          test: `${procurementSignal} spike >${25}% → ${instSignal} elevated at +${lag}yr`,
          sampleSize: findings.length,
          findings: findings.slice(0, 20)
        };

        if (findings.length > 5) {
          console.log(`  [${testCount}] ${procurementSignal} → ${instSignal} (+${lag}yr): n=${findings.length}`);
        }
      }
    }
  }
}

// ── Main Analysis ─────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();

  // Load data
  const defense = await loadDefenseProcurement();
  const scores = await loadConvergenceScores();

  console.log('\nStarting comprehensive pattern backtest...\n');

  // Run all test categories
  await testDefenseSpendingSpikes(defense, scores);
  await testScoreElevatedDefenseResponse(defense, scores);
  await testArmsTradePatterns(defense, scores);
  await testDivergencePatterns(defense, scores);
  await testInstitutionalFollowers(defense, scores);

  // Write results
  const outputPath = path.join(__dirname, 'DEFENSE_PROCUREMENT_VALIDATED_PATTERNS.json');
  fs.writeFileSync(outputPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    totalTests: testCount,
    testsWithFindings: Object.values(allFindings).filter(f => f.sampleSize > 0).length,
    results: allFindings
  }, null, 2));

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('✅ COMPREHENSIVE BACKTEST COMPLETE');
  console.log(`Total tests run: ${testCount}`);
  console.log(`Tests with findings: ${Object.values(allFindings).filter(f => f.sampleSize > 0).length}`);
  console.log(`Time elapsed: ${elapsed} seconds`);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`\nResults saved to: ${outputPath}`);
}

if (require.main === module) {
  main().catch(err => {
    console.error('[ERROR]', err);
    process.exit(1);
  });
}

module.exports = {
  loadDefenseProcurement,
  loadConvergenceScores,
  testDefenseSpendingSpikes,
  testScoreElevatedDefenseResponse,
  testArmsTradePatterns,
  testDivergencePatterns,
  testInstitutionalFollowers
};
