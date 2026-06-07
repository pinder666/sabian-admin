// historical/behavioral_pattern_analysis.cjs
// Deep pattern mining: behavioral signals vs. convergence scores
// Phase 4.5 validation — find what the data ACTUALLY shows
//
// Tests behavioral signals (night_lights, diaspora_remittance, food_stress)
// against convergence scores to identify lead/lag relationships and divergence patterns.
//
// NO PLACEHOLDERS. NO PREDICTIONS. Real sample sizes only.
//
// Usage: node historical/behavioral_pattern_analysis.cjs

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// ── Load Data ─────────────────────────────────────────────────────────────────

async function loadBehavioralSignals() {
  console.log('[ANALYSIS] Loading behavioral signals...');

  const { data, error } = await sb
    .from('historical_signal_readings')
    .select('country, signal_key, date, raw_value')
    .in('signal_key', ['night_lights', 'diaspora_remittance', 'food_stress'])
    .order('country').order('date');

  if (error) throw error;

  // Group by country and signal
  const byCountry = {};
  for (const row of data || []) {
    if (!byCountry[row.country]) byCountry[row.country] = {};
    if (!byCountry[row.country][row.signal_key]) byCountry[row.country][row.signal_key] = [];

    const year = parseInt(row.date.split('-')[0]);
    byCountry[row.country][row.signal_key].push({
      year,
      value: row.raw_value
    });
  }

  console.log(`[ANALYSIS] Loaded behavioral data for ${Object.keys(byCountry).length} countries`);
  return byCountry;
}

async function loadConvergenceScores() {
  console.log('[ANALYSIS] Loading convergence scores...');

  const { data, error } = await sb
    .from('historical_convergence_scores')
    .select('country, year, score, breakdown')
    .order('country').order('year');

  if (error) throw error;

  // Group by country
  const byCountry = {};
  for (const row of data || []) {
    if (!byCountry[row.country]) byCountry[row.country] = [];
    byCountry[row.country].push({
      year: row.year,
      score: row.score,
      breakdown: row.breakdown || {}
    });
  }

  console.log(`[ANALYSIS] Loaded convergence scores for ${Object.keys(byCountry).length} countries`);
  return byCountry;
}

// ── Pattern Analysis Functions ────────────────────────────────────────────────

// Calculate year-over-year change
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

// Test Pattern 1: Night lights drop → score follows?
function testNightLightsDropLeadsScore(behavioral, scores) {
  const findings = [];

  for (const [country, behavData] of Object.entries(behavioral)) {
    const nightLights = behavData.night_lights;
    const countryScores = scores[country];

    if (!nightLights || !countryScores) continue;

    const changes = calculateYoYChange(nightLights);

    // Find significant drops (>20%)
    for (const change of changes) {
      if (change.pctChange < -20) {
        // Look ahead 1-5 years to see if score moved
        const dropYear = change.year;
        const scoreAtDrop = countryScores.find(s => s.year === dropYear);

        for (let lag = 1; lag <= 5; lag++) {
          const scoreAfter = countryScores.find(s => s.year === dropYear + lag);
          if (scoreAtDrop && scoreAfter) {
            const scoreDelta = scoreAfter.score - scoreAtDrop.score;
            findings.push({
              country,
              dropYear,
              nightLightsDropPct: change.pctChange,
              scoreAtDrop: scoreAtDrop.score,
              lag,
              scoreAfter: scoreAfter.score,
              scoreDelta
            });
          }
        }
      }
    }
  }

  return findings;
}

// Test Pattern 2: Remittance spike → score follows?
function testRemittanceSpikeLeadsScore(behavioral, scores) {
  const findings = [];

  for (const [country, behavData] of Object.entries(behavioral)) {
    const remittances = behavData.diaspora_remittance;
    const countryScores = scores[country];

    if (!remittances || !countryScores) continue;

    const changes = calculateYoYChange(remittances);

    // Find significant spikes (>30%)
    for (const change of changes) {
      if (change.pctChange > 30) {
        const spikeYear = change.year;
        const scoreAtSpike = countryScores.find(s => s.year === spikeYear);

        for (let lag = 1; lag <= 5; lag++) {
          const scoreAfter = countryScores.find(s => s.year === spikeYear + lag);
          if (scoreAtSpike && scoreAfter) {
            const scoreDelta = scoreAfter.score - scoreAtSpike.score;
            findings.push({
              country,
              spikeYear,
              remittanceSpikePct: change.pctChange,
              scoreAtSpike: scoreAtSpike.score,
              lag,
              scoreAfter: scoreAfter.score,
              scoreDelta
            });
          }
        }
      }
    }
  }

  return findings;
}

// Test Pattern 3: Divergence (night lights drop but score stable)
function testDivergenceNightLightsVsScore(behavioral, scores) {
  const findings = [];

  for (const [country, behavData] of Object.entries(behavioral)) {
    const nightLights = behavData.night_lights;
    const countryScores = scores[country];

    if (!nightLights || !countryScores) continue;

    const changes = calculateYoYChange(nightLights);

    for (const change of changes) {
      if (change.pctChange < -15) { // Significant drop
        const year = change.year;
        const scoreThisYear = countryScores.find(s => s.year === year);
        const scorePrevYear = countryScores.find(s => s.year === year - 1);

        if (scoreThisYear && scorePrevYear) {
          const scoreDelta = scoreThisYear.score - scorePrevYear.score;

          // Divergence: lights dropped but score stable or dropped less
          if (Math.abs(scoreDelta) < 5) { // Score relatively stable
            // What happened next?
            const scoreNextYear = countryScores.find(s => s.year === year + 1);
            const score2YearsOut = countryScores.find(s => s.year === year + 2);

            findings.push({
              country,
              year,
              nightLightsDropPct: change.pctChange,
              scoreChange: scoreDelta,
              scoreNextYear: scoreNextYear?.score,
              score2YearsOut: score2YearsOut?.score,
              scoreDelta1Yr: scoreNextYear ? scoreNextYear.score - scoreThisYear.score : null,
              scoreDelta2Yr: score2YearsOut ? score2YearsOut.score - scoreThisYear.score : null
            });
          }
        }
      }
    }
  }

  return findings;
}

// Test Pattern 4: Convergence (both drop together)
function testConvergenceNightLightsAndScore(behavioral, scores) {
  const findings = [];

  for (const [country, behavData] of Object.entries(behavioral)) {
    const nightLights = behavData.night_lights;
    const countryScores = scores[country];

    if (!nightLights || !countryScores) continue;

    const changes = calculateYoYChange(nightLights);

    for (const change of changes) {
      if (change.pctChange < -15) {
        const year = change.year;
        const scoreThisYear = countryScores.find(s => s.year === year);
        const scorePrevYear = countryScores.find(s => s.year === year - 1);

        if (scoreThisYear && scorePrevYear) {
          const scoreDelta = scoreThisYear.score - scorePrevYear.score;

          // Convergence: both dropping
          if (scoreDelta > 5) { // Score also rose (more stress)
            findings.push({
              country,
              year,
              nightLightsDropPct: change.pctChange,
              scoreIncrease: scoreDelta,
              scoreFrom: scorePrevYear.score,
              scoreTo: scoreThisYear.score
            });
          }
        }
      }
    }
  }

  return findings;
}

// Test Pattern 5: Remittance as leading indicator for specific signals
function testRemittanceLeadsInstitutionalSignals(behavioral, scores) {
  const findings = [];

  for (const [country, behavData] of Object.entries(behavioral)) {
    const remittances = behavData.diaspora_remittance;
    const countryScores = scores[country];

    if (!remittances || !countryScores) continue;

    const changes = calculateYoYChange(remittances);

    for (const change of changes) {
      if (change.pctChange > 25) { // Significant spike
        const year = change.year;

        // Check if institutional signals followed
        for (let lag = 1; lag <= 3; lag++) {
          const scoreData = countryScores.find(s => s.year === year + lag);
          if (scoreData && scoreData.breakdown) {
            const elevatedSignals = Object.entries(scoreData.breakdown)
              .filter(([k, v]) => (v.stress_z || 0) > 0.5)
              .map(([k]) => k);

            if (elevatedSignals.length > 0) {
              findings.push({
                country,
                remittanceSpikeYear: year,
                remittanceSpikePct: change.pctChange,
                lag,
                elevatedSignals,
                scoreAtLag: scoreData.score
              });
            }
          }
        }
      }
    }
  }

  return findings;
}

// Test Pattern 6: High-remittance baseline (chronic stress indicator)
function testHighRemittanceBaseline(behavioral, scores) {
  const findings = [];

  for (const [country, behavData] of Object.entries(behavioral)) {
    const remittances = behavData.diaspora_remittance;
    const countryScores = scores[country];

    if (!remittances || remittances.length < 5 || !countryScores) continue;

    // Calculate median remittance
    const values = remittances.map(r => r.value).sort((a, b) => a - b);
    const median = values[Math.floor(values.length / 2)];

    // High baseline = >10% of GDP consistently
    if (median > 10) {
      // Get average score for this country
      const avgScore = countryScores.reduce((sum, s) => sum + s.score, 0) / countryScores.length;
      const maxScore = Math.max(...countryScores.map(s => s.score));

      findings.push({
        country,
        medianRemittance: median,
        yearsOfData: remittances.length,
        avgScore,
        maxScore,
        pattern: 'chronic_high_remittance'
      });
    }
  }

  return findings;
}

// ── Aggregate Analysis ────────────────────────────────────────────────────────

function aggregateFindings(findings, patternName) {
  const report = {
    pattern: patternName,
    sampleSize: findings.length,
    summary: null,
    distribution: {},
    examples: findings.slice(0, 10)
  };

  if (findings.length === 0) {
    report.summary = 'No instances found in historical record';
    return report;
  }

  return report;
}

// ── Main Analysis ─────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('BEHAVIORAL SIGNAL PATTERN ANALYSIS');
  console.log('Deep mining: behavioral signals vs. convergence scores');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Load data
  const behavioral = await loadBehavioralSignals();
  const scores = await loadConvergenceScores();

  console.log('\n[ANALYSIS] Running pattern tests...\n');

  const results = {};

  // Test 1: Night lights drop → score follows?
  console.log('[TEST 1] Night lights drop (>20%) → does score follow?');
  const test1 = testNightLightsDropLeadsScore(behavioral, scores);
  results.nightLightsDropLeadsScore = aggregateFindings(test1, 'Night Lights Drop → Score Movement');
  console.log(`  Sample size: ${test1.length} instances`);

  // Test 2: Remittance spike → score follows?
  console.log('[TEST 2] Remittance spike (>30%) → does score follow?');
  const test2 = testRemittanceSpikeLeadsScore(behavioral, scores);
  results.remittanceSpikeLeadsScore = aggregateFindings(test2, 'Remittance Spike → Score Movement');
  console.log(`  Sample size: ${test2.length} instances`);

  // Test 3: Divergence (lights drop, score stable)
  console.log('[TEST 3] Divergence: night lights drop but score stable');
  const test3 = testDivergenceNightLightsVsScore(behavioral, scores);
  results.divergenceNightLightsVsScore = aggregateFindings(test3, 'Night Lights Drop + Score Stable → What Follows');
  console.log(`  Sample size: ${test3.length} instances`);

  // Test 4: Convergence (both drop)
  console.log('[TEST 4] Convergence: night lights drop AND score rises together');
  const test4 = testConvergenceNightLightsAndScore(behavioral, scores);
  results.convergenceNightLightsAndScore = aggregateFindings(test4, 'Night Lights Drop + Score Rise (Simultaneous)');
  console.log(`  Sample size: ${test4.length} instances`);

  // Test 5: Remittance leads institutional signals
  console.log('[TEST 5] Remittance spike → institutional signals follow?');
  const test5 = testRemittanceLeadsInstitutionalSignals(behavioral, scores);
  results.remittanceLeadsInstitutional = aggregateFindings(test5, 'Remittance Spike → Institutional Signal Elevation');
  console.log(`  Sample size: ${test5.length} instances`);

  // Test 6: High remittance baseline
  console.log('[TEST 6] Chronic high remittance (>10% GDP median)');
  const test6 = testHighRemittanceBaseline(behavioral, scores);
  results.highRemittanceBaseline = aggregateFindings(test6, 'Chronic High Remittance Countries');
  console.log(`  Sample size: ${test6.length} countries`);

  // Write detailed results
  const outputPath = path.join(__dirname, 'BEHAVIORAL_PATTERN_FINDINGS.json');
  fs.writeFileSync(outputPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    totalTests: 6,
    results: {
      test1_nightLightsDropLeadsScore: test1,
      test2_remittanceSpikeLeadsScore: test2,
      test3_divergenceNightLightsVsScore: test3,
      test4_convergenceNightLightsAndScore: test4,
      test5_remittanceLeadsInstitutional: test5,
      test6_highRemittanceBaseline: test6
    },
    summary: results
  }, null, 2));

  console.log(`\n[ANALYSIS] Detailed findings written to: ${outputPath}`);
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('PATTERN ANALYSIS COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════');
}

if (require.main === module) {
  main().catch(err => {
    console.error('[ANALYSIS] ERROR:', err);
    process.exit(1);
  });
}

module.exports = {
  loadBehavioralSignals,
  loadConvergenceScores,
  testNightLightsDropLeadsScore,
  testRemittanceSpikeLeadsScore,
  testDivergenceNightLightsVsScore,
  testConvergenceNightLightsAndScore,
  testRemittanceLeadsInstitutionalSignals,
  testHighRemittanceBaseline
};
