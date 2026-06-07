// historical/three_signal_pattern_analysis.cjs
// THREE-SIGNAL PATTERN ANALYSIS
// Defense spending + Convergence scores + Behavioral signals
// Find: Mobilization, Disconnect, and Inaction signatures in historical record

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

console.log('═══════════════════════════════════════════════════════════════');
console.log('THREE-SIGNAL PATTERN ANALYSIS');
console.log('Defense Spending + Convergence Scores + Behavioral Signals');
console.log('═══════════════════════════════════════════════════════════════\n');

async function loadAllData() {
  console.log('[LOAD] Loading three signal layers...\n');

  // Load defense spending
  console.log('[LOAD] Defense spending...');
  const { data: defenseData, error: defError } = await sb
    .from('historical_signal_readings')
    .select('*')
    .eq('signal_key', 'defense_spending');

  if (defError) {
    console.log('  Error:', defError.message);
    return null;
  }
  console.log(`  ✅ Loaded ${defenseData.length} defense spending records`);

  // Load behavioral signals
  console.log('[LOAD] Behavioral signals...');
  const { data: behavioralData, error: behError } = await sb
    .from('historical_signal_readings')
    .select('*')
    .in('signal_key', ['night_lights', 'diaspora_remittance', 'food_stress']);

  if (behError) {
    console.log('  Error:', behError.message);
    return null;
  }
  console.log(`  ✅ Loaded ${behavioralData.length} behavioral signal records`);

  // Load convergence scores
  console.log('[LOAD] Convergence scores...');
  const { data: scoresData, error: scoreError } = await sb
    .from('historical_convergence_scores')
    .select('*');

  if (scoreError) {
    console.log('  Error:', scoreError.message);
    return null;
  }
  console.log(`  ✅ Loaded ${scoresData.length} convergence score records\n`);

  return { defenseData, behavioralData, scoresData };
}

function organizeByCountryYear(data) {
  const organized = {};

  // Organize defense spending
  if (data.defenseData) {
    data.defenseData.forEach(r => {
      const year = parseInt(r.date.substring(0, 4));
      const key = `${r.country}-${year}`;
      if (!organized[key]) organized[key] = { country: r.country, year };
      organized[key].defense_spending = r.raw_value;
    });
  }

  // Organize behavioral signals
  if (data.behavioralData) {
    data.behavioralData.forEach(r => {
      const year = parseInt(r.date.substring(0, 4));
      const key = `${r.country}-${year}`;
      if (!organized[key]) organized[key] = { country: r.country, year };

      if (r.signal_key === 'night_lights') {
        organized[key].night_lights = r.raw_value;
      } else if (r.signal_key === 'diaspora_remittance') {
        organized[key].diaspora_remittance = r.raw_value;
      } else if (r.signal_key === 'food_stress') {
        organized[key].food_stress = r.raw_value;
      }
    });
  }

  // Organize scores
  if (data.scoresData) {
    data.scoresData.forEach(r => {
      const key = `${r.country}-${r.year}`;
      if (!organized[key]) organized[key] = { country: r.country, year: r.year };
      organized[key].score = r.score;
      organized[key].band = r.risk_band;
    });
  }

  return Object.values(organized);
}

function testMobilizationSignature(records) {
  console.log('[TEST] MOBILIZATION SIGNATURE');
  console.log('High score + rising spending + stable behavioral signals');
  console.log('= Government mobilizing before population reacts\n');

  const findings = [];

  // Group by country for trend analysis
  const byCountry = {};
  records.forEach(r => {
    if (!byCountry[r.country]) byCountry[r.country] = [];
    byCountry[r.country].push(r);
  });

  for (const [country, countryRecords] of Object.entries(byCountry)) {
    countryRecords.sort((a, b) => a.year - b.year);

    for (let i = 1; i < countryRecords.length; i++) {
      const curr = countryRecords[i];
      const prev = countryRecords[i - 1];

      // Must have all three signals
      if (!curr.score || !curr.defense_spending) continue;
      if (!prev.defense_spending) continue;

      // High score (≥70)
      if (curr.score < 70) continue;

      // Rising spending (>10% increase)
      const spendingChange = ((curr.defense_spending - prev.defense_spending) / prev.defense_spending) * 100;
      if (spendingChange <= 10) continue;

      // Stable behavioral signals (if available, change <10%)
      let behavioralStable = true;

      if (curr.night_lights && prev.night_lights) {
        const lightChange = Math.abs(((curr.night_lights - prev.night_lights) / prev.night_lights) * 100);
        if (lightChange > 10) behavioralStable = false;
      }

      if (curr.diaspora_remittance && prev.diaspora_remittance) {
        const remitChange = Math.abs(((curr.diaspora_remittance - prev.diaspora_remittance) / prev.diaspora_remittance) * 100);
        if (remitChange > 10) behavioralStable = false;
      }

      if (behavioralStable) {
        findings.push({
          country: curr.country,
          year: curr.year,
          score: curr.score,
          band: curr.band,
          spending_pct_change: spendingChange,
          has_behavioral_data: !!(curr.night_lights || curr.diaspora_remittance),
          next_year_score: countryRecords[i + 1]?.score || null
        });
      }
    }
  }

  console.log(`  Sample size: ${findings.length} cases\n`);

  if (findings.length > 0) {
    console.log('  Top 10 cases:');
    findings.slice(0, 10).forEach(f => {
      console.log(`    ${f.country} ${f.year}: Score ${f.score}, Spending +${f.spending_pct_change.toFixed(1)}%`);
    });
  }

  return findings;
}

function testDisconnectSignature(records) {
  console.log('\n[TEST] DISCONNECT SIGNATURE');
  console.log('Stable score + rising spending + behavioral signals deteriorating');
  console.log('= Government sees something institutions don\'t\n');

  const findings = [];

  const byCountry = {};
  records.forEach(r => {
    if (!byCountry[r.country]) byCountry[r.country] = [];
    byCountry[r.country].push(r);
  });

  for (const [country, countryRecords] of Object.entries(byCountry)) {
    countryRecords.sort((a, b) => a.year - b.year);

    for (let i = 1; i < countryRecords.length; i++) {
      const curr = countryRecords[i];
      const prev = countryRecords[i - 1];

      if (!curr.score || !prev.score || !curr.defense_spending || !prev.defense_spending) continue;

      // Stable score (<65, change <5 points)
      if (curr.score >= 65) continue;
      if (Math.abs(curr.score - prev.score) > 5) continue;

      // Rising spending (>20% increase)
      const spendingChange = ((curr.defense_spending - prev.defense_spending) / prev.defense_spending) * 100;
      if (spendingChange <= 20) continue;

      // Behavioral signals deteriorating (if available)
      let behavioralDeteriorating = false;

      if (curr.night_lights && prev.night_lights) {
        const lightChange = ((curr.night_lights - prev.night_lights) / prev.night_lights) * 100;
        if (lightChange < -10) behavioralDeteriorating = true;
      }

      if (curr.diaspora_remittance && prev.diaspora_remittance) {
        const remitChange = ((curr.diaspora_remittance - prev.diaspora_remittance) / prev.diaspora_remittance) * 100;
        if (remitChange > 20) behavioralDeteriorating = true; // Spike = hedging
      }

      if (curr.food_stress && prev.food_stress) {
        const foodChange = ((curr.food_stress - prev.food_stress) / prev.food_stress) * 100;
        if (foodChange > 20) behavioralDeteriorating = true;
      }

      if (behavioralDeteriorating) {
        findings.push({
          country: curr.country,
          year: curr.year,
          score: curr.score,
          score_change: curr.score - prev.score,
          spending_pct_change: spendingChange,
          behavioral_signals: {
            night_lights: curr.night_lights && prev.night_lights ?
              ((curr.night_lights - prev.night_lights) / prev.night_lights * 100).toFixed(1) : null,
            remittance: curr.diaspora_remittance && prev.diaspora_remittance ?
              ((curr.diaspora_remittance - prev.diaspora_remittance) / prev.diaspora_remittance * 100).toFixed(1) : null,
            food_stress: curr.food_stress && prev.food_stress ?
              ((curr.food_stress - prev.food_stress) / prev.food_stress * 100).toFixed(1) : null
          },
          next_year_score: countryRecords[i + 1]?.score || null
        });
      }
    }
  }

  console.log(`  Sample size: ${findings.length} cases\n`);

  if (findings.length > 0) {
    console.log('  Top 10 cases:');
    findings.slice(0, 10).forEach(f => {
      console.log(`    ${f.country} ${f.year}: Score ${f.score} (stable), Spending +${f.spending_pct_change.toFixed(1)}%`);
    });
  }

  return findings;
}

function testInactionSignature(records) {
  console.log('\n[TEST] INACTION SIGNATURE');
  console.log('High score + flat spending + behavioral signals deteriorating');
  console.log('= Government paralysis\n');

  const findings = [];

  const byCountry = {};
  records.forEach(r => {
    if (!byCountry[r.country]) byCountry[r.country] = [];
    byCountry[r.country].push(r);
  });

  for (const [country, countryRecords] of Object.entries(byCountry)) {
    countryRecords.sort((a, b) => a.year - b.year);

    for (let i = 1; i < countryRecords.length; i++) {
      const curr = countryRecords[i];
      const prev = countryRecords[i - 1];

      if (!curr.score || !curr.defense_spending || !prev.defense_spending) continue;

      // High score (≥70)
      if (curr.score < 70) continue;

      // Flat spending (change <5%)
      const spendingChange = Math.abs(((curr.defense_spending - prev.defense_spending) / prev.defense_spending) * 100);
      if (spendingChange > 5) continue;

      // Behavioral signals deteriorating (if available)
      let behavioralDeteriorating = false;
      const behaviorDetails = {};

      if (curr.night_lights && prev.night_lights) {
        const lightChange = ((curr.night_lights - prev.night_lights) / prev.night_lights) * 100;
        behaviorDetails.night_lights_change = lightChange.toFixed(1);
        if (lightChange < -10) behavioralDeteriorating = true;
      }

      if (curr.diaspora_remittance && prev.diaspora_remittance) {
        const remitChange = ((curr.diaspora_remittance - prev.diaspora_remittance) / prev.diaspora_remittance) * 100;
        behaviorDetails.remittance_change = remitChange.toFixed(1);
        if (remitChange > 20) behavioralDeteriorating = true;
      }

      if (curr.food_stress && prev.food_stress) {
        const foodChange = ((curr.food_stress - prev.food_stress) / prev.food_stress) * 100;
        behaviorDetails.food_stress_change = foodChange.toFixed(1);
        if (foodChange > 20) behavioralDeteriorating = true;
      }

      if (behavioralDeteriorating || Object.keys(behaviorDetails).length === 0) {
        findings.push({
          country: curr.country,
          year: curr.year,
          score: curr.score,
          band: curr.band,
          spending_change: spendingChange,
          has_behavioral_data: Object.keys(behaviorDetails).length > 0,
          behavioral_changes: behaviorDetails,
          next_year_score: countryRecords[i + 1]?.score || null,
          next_year_band: countryRecords[i + 1]?.band || null
        });
      }
    }
  }

  console.log(`  Sample size: ${findings.length} cases\n`);

  if (findings.length > 0) {
    console.log('  Top 10 cases:');
    findings.slice(0, 10).forEach(f => {
      console.log(`    ${f.country} ${f.year}: Score ${f.score}, Spending flat, Next year score ${f.next_year_score || 'N/A'}`);
    });
  }

  return findings;
}

function analyzeOutcomes(findings, patternName) {
  console.log(`\n[OUTCOME] ${patternName} - What happened next?\n`);

  const withNextYear = findings.filter(f => f.next_year_score !== null);

  if (withNextYear.length === 0) {
    console.log('  No follow-up data available\n');
    return null;
  }

  const scoreIncreased = withNextYear.filter(f => f.next_year_score > (f.score || f.score)).length;
  const scoreDecreased = withNextYear.filter(f => f.next_year_score < (f.score || f.score)).length;
  const scoreStable = withNextYear.filter(f => Math.abs(f.next_year_score - (f.score || f.score)) < 3).length;

  console.log(`  Follow-up data available: ${withNextYear.length} cases`);
  console.log(`  Next year score increased: ${scoreIncreased} cases (${(scoreIncreased/withNextYear.length*100).toFixed(1)}%)`);
  console.log(`  Next year score decreased: ${scoreDecreased} cases (${(scoreDecreased/withNextYear.length*100).toFixed(1)}%)`);
  console.log(`  Next year score stable: ${scoreStable} cases (${(scoreStable/withNextYear.length*100).toFixed(1)}%)\n`);

  return { withNextYear: withNextYear.length, scoreIncreased, scoreDecreased, scoreStable };
}

async function main() {
  const allData = await loadAllData();

  if (!allData) {
    console.log('\n❌ Failed to load data');
    process.exit(1);
  }

  console.log('[ORGANIZE] Combining signals by country-year...\n');
  const records = organizeByCountryYear(allData);
  console.log(`  Combined: ${records.length} country-year records`);
  console.log(`  Countries: ${new Set(records.map(r => r.country)).size}`);
  console.log(`  Year range: ${Math.min(...records.map(r => r.year))}-${Math.max(...records.map(r => r.year))}\n`);

  // Test three signatures
  const mobilizationFindings = testMobilizationSignature(records);
  const mobilizationOutcome = analyzeOutcomes(mobilizationFindings, 'MOBILIZATION');

  const disconnectFindings = testDisconnectSignature(records);
  const disconnectOutcome = analyzeOutcomes(disconnectFindings, 'DISCONNECT');

  const inactionFindings = testInactionSignature(records);
  const inactionOutcome = analyzeOutcomes(inactionFindings, 'INACTION');

  // Save results
  const results = {
    generatedAt: new Date().toISOString(),
    totalRecords: records.length,
    patterns: {
      mobilization: {
        definition: 'High score (≥70) + rising spending (>10%) + stable behavioral signals',
        sampleSize: mobilizationFindings.length,
        outcomes: mobilizationOutcome,
        findings: mobilizationFindings
      },
      disconnect: {
        definition: 'Stable score (<65) + rising spending (>20%) + behavioral signals deteriorating',
        sampleSize: disconnectFindings.length,
        outcomes: disconnectOutcome,
        findings: disconnectFindings
      },
      inaction: {
        definition: 'High score (≥70) + flat spending (<5% change) + behavioral signals deteriorating',
        sampleSize: inactionFindings.length,
        outcomes: inactionOutcome,
        findings: inactionFindings
      }
    }
  };

  const outputPath = path.join(__dirname, 'THREE_SIGNAL_PATTERNS.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('✅ THREE-SIGNAL PATTERN ANALYSIS COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('\nResults saved to:', outputPath);
  console.log('\nPattern Summary:');
  console.log(`  Mobilization: ${mobilizationFindings.length} cases`);
  console.log(`  Disconnect: ${disconnectFindings.length} cases`);
  console.log(`  Inaction: ${inactionFindings.length} cases`);
  console.log('');
}

if (require.main === module) {
  main().catch(err => {
    console.error('[ERROR]', err);
    process.exit(1);
  });
}

module.exports = { loadAllData, organizeByCountryYear, testMobilizationSignature, testDisconnectSignature, testInactionSignature };
