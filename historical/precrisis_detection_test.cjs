// historical/precrisis_detection_test.cjs
// PRE-CRISIS DETECTION TEST
// Detect when 2 of 3 signals are elevated and trending toward crisis
// Find lead times, false alarm rates, signal sequences

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

console.log('═══════════════════════════════════════════════════════════════');
console.log('PRE-CRISIS DETECTION TEST');
console.log('Detect build-up: 2 of 3 signals elevated, trending toward crisis');
console.log('═══════════════════════════════════════════════════════════════\n');

const CRISIS_THRESHOLDS = {
  weather_fire: 80,
  weather_seismic: 75,
  communication: -5,
  power: 70
};

const PRECRISIS_RANGE = {
  weather_fire: 64,    // 80% of 80
  weather_seismic: 60, // 80% of 75
  communication: -4,   // 80% of -5
  power: 56            // 80% of 70
};

async function loadData() {
  console.log('[LOAD] Loading ALL historical signals (no limit)...\n');

  // Load in batches
  let allSignals = [];
  let offset = 0;
  const batchSize = 10000;

  while (true) {
    const { data: batch, error } = await sb
      .from('historical_signal_readings')
      .select('*')
      .in('signal_key', ['fire_hotspot', 'seismic_risk', 'gdelt_tone', 'power_grid'])
      .range(offset, offset + batchSize - 1)
      .order('date', { ascending: true });

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

  // Load all scores
  let allScores = [];
  offset = 0;

  while (true) {
    const { data: batch, error: scoreError } = await sb
      .from('historical_convergence_scores')
      .select('*')
      .range(offset, offset + batchSize - 1)
      .order('year', { ascending: true });

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

function organizeByCountryYear(data) {
  const byCountryYear = {};

  data.signals.forEach(s => {
    const year = parseInt(s.date.substring(0, 4));
    const key = `${s.country}-${year}`;
    if (!byCountryYear[key]) {
      byCountryYear[key] = {
        country: s.country,
        year,
        date: s.date
      };
    }
    byCountryYear[key][s.signal_key] = s.raw_value;
  });

  data.scores.forEach(sc => {
    const key = `${sc.country}-${sc.year}`;
    if (!byCountryYear[key]) {
      byCountryYear[key] = {
        country: sc.country,
        year: sc.year,
        date: `${sc.year}-01-01`
      };
    }
    byCountryYear[key].score = sc.score;
    byCountryYear[key].band = sc.risk_band;
  });

  return Object.values(byCountryYear);
}

function checkPreCrisisState(record) {
  // Check which signals are in pre-crisis range (within 20% of threshold)
  const signals = [];

  // Weather (fire or seismic)
  if (record.fire_hotspot && record.fire_hotspot >= PRECRISIS_RANGE.weather_fire &&
      record.fire_hotspot < CRISIS_THRESHOLDS.weather_fire) {
    signals.push('weather_fire');
  }
  if (record.seismic_risk && record.seismic_risk >= PRECRISIS_RANGE.weather_seismic &&
      record.seismic_risk < CRISIS_THRESHOLDS.weather_seismic) {
    signals.push('weather_seismic');
  }

  // Communication
  if (record.gdelt_tone && record.gdelt_tone <= PRECRISIS_RANGE.communication &&
      record.gdelt_tone > CRISIS_THRESHOLDS.communication) {
    signals.push('communication');
  }

  // Power
  if (record.power_grid && record.power_grid >= PRECRISIS_RANGE.power &&
      record.power_grid < CRISIS_THRESHOLDS.power) {
    signals.push('power');
  }

  return signals;
}

function checkCrisisState(record) {
  // Check which signals are at full crisis threshold
  const signals = [];

  if (record.fire_hotspot && record.fire_hotspot >= CRISIS_THRESHOLDS.weather_fire) {
    signals.push('weather_fire');
  }
  if (record.seismic_risk && record.seismic_risk >= CRISIS_THRESHOLDS.weather_seismic) {
    signals.push('weather_seismic');
  }
  if (record.gdelt_tone && record.gdelt_tone <= CRISIS_THRESHOLDS.communication) {
    signals.push('communication');
  }
  if (record.power_grid && record.power_grid >= CRISIS_THRESHOLDS.power) {
    signals.push('power');
  }

  return signals;
}

function detectPreCrisisPatterns(records) {
  console.log('[DETECT] Scanning for pre-crisis patterns...\n');

  // Group by country
  const byCountry = {};
  records.forEach(r => {
    if (!byCountry[r.country]) byCountry[r.country] = [];
    byCountry[r.country].push(r);
  });

  const preCrisisEvents = [];

  for (const [country, countryRecords] of Object.entries(byCountry)) {
    countryRecords.sort((a, b) => a.year - b.year);

    for (let i = 0; i < countryRecords.length; i++) {
      const current = countryRecords[i];
      const preCrisisSignals = checkPreCrisisState(current);

      // Pre-crisis: 2+ signals in elevated range
      if (preCrisisSignals.length >= 2) {
        // Look ahead 1-3 years for full crisis
        let reachedCrisis = false;
        let yearsToFullCrisis = null;

        for (let j = i + 1; j <= i + 3 && j < countryRecords.length; j++) {
          const future = countryRecords[j];
          const crisisSignals = checkCrisisState(future);

          // Full crisis: 2+ signals at crisis threshold (two-signal crisis)
          if (crisisSignals.length >= 2) {
            reachedCrisis = true;
            yearsToFullCrisis = future.year - current.year;
            break;
          }
        }

        preCrisisEvents.push({
          country: current.country,
          year: current.year,
          date: current.date,
          score: current.score,
          band: current.band,
          preCrisisSignals: preCrisisSignals.length,
          signalsList: preCrisisSignals,
          reachedCrisis,
          yearsToFullCrisis
        });
      }
    }
  }

  return preCrisisEvents;
}

async function main() {
  const data = await loadData();
  if (!data) {
    console.log('\n❌ Failed to load data');
    process.exit(1);
  }

  const records = organizeByCountryYear(data);
  console.log('[ORGANIZE] Organized by country-year\n');
  console.log(`  Total records: ${records.length}`);
  console.log(`  Countries: ${new Set(records.map(r => r.country)).size}\n`);

  const preCrisisEvents = detectPreCrisisPatterns(records);

  console.log(`[RESULT] Pre-crisis events detected: ${preCrisisEvents.length}\n`);

  if (preCrisisEvents.length > 0) {
    console.log('  Sample of pre-crisis events:');
    preCrisisEvents.slice(0, 10).forEach(e => {
      console.log(`    ${e.country} ${e.year}: ${e.preCrisisSignals} signals elevated, Reached crisis: ${e.reachedCrisis ? `Yes (${e.yearsToFullCrisis}yr)` : 'No'}`);
    });
  }

  // Analyze outcomes
  console.log('\n[ANALYSIS] Pre-crisis outcomes\n');

  const reachedCrisis = preCrisisEvents.filter(e => e.reachedCrisis).length;
  const didNotReach = preCrisisEvents.filter(e => !e.reachedCrisis).length;

  console.log(`  Total pre-crisis events: ${preCrisisEvents.length}`);
  console.log(`  Reached full crisis: ${reachedCrisis} cases`);
  console.log(`  Did not reach crisis: ${didNotReach} cases\n`);

  if (reachedCrisis > 0) {
    const leadTimes = preCrisisEvents
      .filter(e => e.reachedCrisis)
      .map(e => e.yearsToFullCrisis);

    const oneYear = leadTimes.filter(t => t === 1).length;
    const twoYears = leadTimes.filter(t => t === 2).length;
    const threeYears = leadTimes.filter(t => t === 3).length;

    console.log('  Lead time distribution:');
    console.log(`    1 year: ${oneYear} cases`);
    console.log(`    2 years: ${twoYears} cases`);
    console.log(`    3 years: ${threeYears} cases\n`);
  }

  // Save results
  const results = {
    generatedAt: new Date().toISOString(),
    thresholds: CRISIS_THRESHOLDS,
    preCrisisRange: PRECRISIS_RANGE,
    totalRecords: records.length,
    preCrisisEvents: {
      total: preCrisisEvents.length,
      reachedCrisis,
      didNotReach,
      events: preCrisisEvents
    }
  };

  const outputPath = path.join(__dirname, 'PRECRISIS_DETECTION_RESULTS.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('✅ PRE-CRISIS DETECTION TEST COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('\nResults saved to:', outputPath);
  console.log('');
}

if (require.main === module) {
  main().catch(err => {
    console.error('[ERROR]', err);
    process.exit(1);
  });
}

module.exports = { detectPreCrisisPatterns, checkPreCrisisState, checkCrisisState };
