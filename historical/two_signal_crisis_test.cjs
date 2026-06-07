// historical/two_signal_crisis_test.cjs
// TWO-SIGNAL CRISIS COMBINATIONS TEST
// Weather + Power, Communication + Power, Weather + Communication
// Find real sample sizes in historical record

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

console.log('═══════════════════════════════════════════════════════════════');
console.log('TWO-SIGNAL CRISIS COMBINATIONS TEST');
console.log('Weather+Power | Communication+Power | Weather+Communication');
console.log('═══════════════════════════════════════════════════════════════\n');

const THRESHOLDS = {
  weather_fire: 80,
  weather_seismic: 75,
  communication: -5,
  power: 70
};

async function loadData() {
  console.log('[LOAD] Loading ALL historical signals (no limit)...\n');

  // Load in batches to avoid timeout
  let allSignals = [];
  let offset = 0;
  const batchSize = 10000;

  while (true) {
    const { data: batch, error } = await sb
      .from('historical_signal_readings')
      .select('*')
      .in('signal_key', ['fire_hotspot', 'seismic_risk', 'gdelt_tone', 'power_grid'])
      .range(offset, offset + batchSize - 1);

    if (error) {
      console.log('[ERROR]', error.message);
      return null;
    }

    if (!batch || batch.length === 0) break;

    allSignals = allSignals.concat(batch);
    offset += batchSize;

    console.log(`  Loaded ${allSignals.length} signal readings so far...`);

    if (batch.length < batchSize) break;
  }

  console.log(`  ✅ Total signal readings: ${allSignals.length}`);

  // Load all convergence scores
  let allScores = [];
  offset = 0;

  while (true) {
    const { data: batch, error: scoreError } = await sb
      .from('historical_convergence_scores')
      .select('*')
      .range(offset, offset + batchSize - 1);

    if (scoreError) {
      console.log('[ERROR]', scoreError.message);
      return null;
    }

    if (!batch || batch.length === 0) break;

    allScores = allScores.concat(batch);
    offset += batchSize;

    if (batch.length < batchSize) break;
  }

  console.log(`  ✅ Total convergence scores: ${allScores.length}\n`);

  return { signals: allSignals, scores: allScores };
}

function organizeByCountryDate(data) {
  const organized = {};

  data.signals.forEach(s => {
    const key = `${s.country}-${s.date}`;
    if (!organized[key]) {
      organized[key] = {
        country: s.country,
        date: s.date,
        year: parseInt(s.date.substring(0, 4))
      };
    }
    organized[key][s.signal_key] = s.raw_value;
  });

  data.scores.forEach(sc => {
    const dateStr = `${sc.year}-01-01`;
    const key = `${sc.country}-${dateStr}`;
    if (!organized[key]) {
      organized[key] = {
        country: sc.country,
        date: dateStr,
        year: sc.year
      };
    }
    organized[key].score = sc.score;
    organized[key].band = sc.risk_band;
  });

  return Object.values(organized);
}

function testWeatherPlusPower(records) {
  console.log('[TEST 1] Weather + Power Combination\n');

  const findings = [];

  for (const record of records) {
    const weatherTrigger = (record.fire_hotspot && record.fire_hotspot >= THRESHOLDS.weather_fire) ||
                          (record.seismic_risk && record.seismic_risk >= THRESHOLDS.weather_seismic);
    const powerTrigger = record.power_grid && record.power_grid >= THRESHOLDS.power;

    if (weatherTrigger && powerTrigger) {
      findings.push({
        country: record.country,
        date: record.date,
        year: record.year,
        score: record.score,
        band: record.band,
        fire_hotspot: record.fire_hotspot,
        seismic_risk: record.seismic_risk,
        power_grid: record.power_grid
      });
    }
  }

  console.log(`  Sample size: ${findings.length} cases\n`);

  if (findings.length > 0) {
    console.log('  Cases found:');
    findings.forEach(f => {
      const weatherType = f.fire_hotspot >= THRESHOLDS.weather_fire ? 'Fire' : 'Seismic';
      const weatherVal = f.fire_hotspot >= THRESHOLDS.weather_fire ? f.fire_hotspot : f.seismic_risk;
      console.log(`    ${f.country} ${f.date}: ${weatherType} ${weatherVal}, Power ${f.power_grid}, Score ${f.score || 'N/A'}`);
    });
  }

  return findings;
}

function testCommunicationPlusPower(records) {
  console.log('\n[TEST 2] Communication + Power Combination\n');

  const findings = [];

  for (const record of records) {
    const commTrigger = record.gdelt_tone && record.gdelt_tone <= THRESHOLDS.communication;
    const powerTrigger = record.power_grid && record.power_grid >= THRESHOLDS.power;

    if (commTrigger && powerTrigger) {
      findings.push({
        country: record.country,
        date: record.date,
        year: record.year,
        score: record.score,
        band: record.band,
        gdelt_tone: record.gdelt_tone,
        power_grid: record.power_grid
      });
    }
  }

  console.log(`  Sample size: ${findings.length} cases\n`);

  if (findings.length > 0) {
    console.log('  Cases found:');
    findings.forEach(f => {
      console.log(`    ${f.country} ${f.date}: Tone ${f.gdelt_tone}, Power ${f.power_grid}, Score ${f.score || 'N/A'}`);
    });
  }

  return findings;
}

function testWeatherPlusCommunication(records) {
  console.log('\n[TEST 3] Weather + Communication Combination\n');

  const findings = [];

  for (const record of records) {
    const weatherTrigger = (record.fire_hotspot && record.fire_hotspot >= THRESHOLDS.weather_fire) ||
                          (record.seismic_risk && record.seismic_risk >= THRESHOLDS.weather_seismic);
    const commTrigger = record.gdelt_tone && record.gdelt_tone <= THRESHOLDS.communication;

    if (weatherTrigger && commTrigger) {
      findings.push({
        country: record.country,
        date: record.date,
        year: record.year,
        score: record.score,
        band: record.band,
        fire_hotspot: record.fire_hotspot,
        seismic_risk: record.seismic_risk,
        gdelt_tone: record.gdelt_tone
      });
    }
  }

  console.log(`  Sample size: ${findings.length} cases\n`);

  if (findings.length > 0) {
    console.log('  Cases found:');
    findings.forEach(f => {
      const weatherType = f.fire_hotspot >= THRESHOLDS.weather_fire ? 'Fire' : 'Seismic';
      const weatherVal = f.fire_hotspot >= THRESHOLDS.weather_fire ? f.fire_hotspot : f.seismic_risk;
      console.log(`    ${f.country} ${f.date}: ${weatherType} ${weatherVal}, Tone ${f.gdelt_tone}, Score ${f.score || 'N/A'}`);
    });
  }

  return findings;
}

function analyzeOutcomes(findings, allRecords, combinationName) {
  if (findings.length === 0) return null;

  console.log(`\n[OUTCOME] ${combinationName} - What happened next?\n`);

  const withNextYear = [];

  for (const finding of findings) {
    const nextYear = finding.year + 1;
    const nextRecord = allRecords.find(r =>
      r.country === finding.country && r.year === nextYear
    );

    if (nextRecord && nextRecord.score && finding.score) {
      const scoreChange = nextRecord.score - finding.score;
      withNextYear.push({
        ...finding,
        next_year_score: nextRecord.score,
        score_change: scoreChange
      });
    }
  }

  if (withNextYear.length === 0) {
    console.log('  No follow-up score data available\n');
    return null;
  }

  const scoreIncreased = withNextYear.filter(f => f.score_change > 3).length;
  const scoreDecreased = withNextYear.filter(f => f.score_change < -3).length;
  const scoreStable = withNextYear.filter(f => Math.abs(f.score_change) <= 3).length;

  console.log(`  Follow-up data: ${withNextYear.length} cases`);
  console.log(`  Next year score increased: ${scoreIncreased} cases`);
  console.log(`  Next year score decreased: ${scoreDecreased} cases`);
  console.log(`  Next year score stable: ${scoreStable} cases\n`);

  return {
    total: withNextYear.length,
    increased: scoreIncreased,
    decreased: scoreDecreased,
    stable: scoreStable,
    cases: withNextYear
  };
}

async function main() {
  const data = await loadData();
  if (!data) {
    console.log('\n❌ Failed to load data');
    process.exit(1);
  }

  const records = organizeByCountryDate(data);
  console.log('[ORGANIZE] Combined signals by country-date\n');
  console.log(`  Total records: ${records.length}`);
  console.log(`  Countries: ${new Set(records.map(r => r.country)).size}\n`);

  // Test three combinations
  const weatherPower = testWeatherPlusPower(records);
  const weatherPowerOutcome = analyzeOutcomes(weatherPower, records, 'Weather + Power');

  const commPower = testCommunicationPlusPower(records);
  const commPowerOutcome = analyzeOutcomes(commPower, records, 'Communication + Power');

  const weatherComm = testWeatherPlusCommunication(records);
  const weatherCommOutcome = analyzeOutcomes(weatherComm, records, 'Weather + Communication');

  // Save results
  const results = {
    generatedAt: new Date().toISOString(),
    thresholds: THRESHOLDS,
    totalRecords: records.length,
    combinations: {
      weather_plus_power: {
        sampleSize: weatherPower.length,
        outcomes: weatherPowerOutcome,
        findings: weatherPower
      },
      communication_plus_power: {
        sampleSize: commPower.length,
        outcomes: commPowerOutcome,
        findings: commPower
      },
      weather_plus_communication: {
        sampleSize: weatherComm.length,
        outcomes: weatherCommOutcome,
        findings: weatherComm
      }
    }
  };

  const outputPath = path.join(__dirname, 'TWO_SIGNAL_CRISIS_RESULTS.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('✅ TWO-SIGNAL CRISIS TEST COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('\nResults saved to:', outputPath);
  console.log('\nSummary:');
  console.log(`  Weather + Power: ${weatherPower.length} cases`);
  console.log(`  Communication + Power: ${commPower.length} cases`);
  console.log(`  Weather + Communication: ${weatherComm.length} cases`);
  console.log('');
}

if (require.main === module) {
  main().catch(err => {
    console.error('[ERROR]', err);
    process.exit(1);
  });
}

module.exports = { testWeatherPlusPower, testCommunicationPlusPower, testWeatherPlusCommunication };
