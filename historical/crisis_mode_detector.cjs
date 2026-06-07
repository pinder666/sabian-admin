// historical/crisis_mode_detector.cjs
// PHASE 5: CRISIS MODE DETECTOR
// Triggers when: weather event + communication collapse + power loss fire simultaneously
// Real-time combination detection across multiple signals

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

console.log('═══════════════════════════════════════════════════════════════');
console.log('PHASE 5: CRISIS MODE DETECTOR');
console.log('Combination trigger: Weather + Communication + Power');
console.log('═══════════════════════════════════════════════════════════════\n');

// Crisis trigger thresholds
const CRISIS_THRESHOLDS = {
  weather: {
    // Fire hotspots or seismic risk
    fire_hotspot: 80, // Elevated fire activity
    seismic_risk: 75  // Elevated seismic stress
  },
  communication: {
    // GDELT tone collapse or going dark
    gdelt_tone: -5,   // Negative tone threshold
    tone_drop: -30    // % drop from baseline
  },
  power: {
    power_grid: 70    // Power grid elevated
  },
  convergence: {
    score: 70,        // Convergence score elevated
    trajectory: 5     // Score increasing >5 points/year
  }
};

async function loadHistoricalSignals() {
  console.log('[LOAD] Loading historical signals for crisis detection...\n');

  // Load all signal readings
  const { data: signals, error } = await sb
    .from('historical_signal_readings')
    .select('*')
    .in('signal_key', [
      'fire_hotspot',
      'seismic_risk',
      'gdelt_tone',
      'power_grid',
      'gdelt_conflict'
    ])
    .order('date', { ascending: true });

  if (error) {
    console.log('[ERROR] Loading signals:', error.message);
    return null;
  }

  console.log(`  ✅ Loaded ${signals.length} signal readings`);

  // Load convergence scores
  const { data: scores, error: scoreError } = await sb
    .from('historical_convergence_scores')
    .select('*')
    .order('year', { ascending: true });

  if (scoreError) {
    console.log('[ERROR] Loading scores:', scoreError.message);
    return null;
  }

  console.log(`  ✅ Loaded ${scores.length} convergence scores\n`);

  return { signals, scores };
}

function organizeByCountryDate(data) {
  const organized = {};

  // Organize signals
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

  // Add scores
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

function detectCrisisEvents(records) {
  console.log('[DETECT] Scanning for crisis combination triggers...\n');

  const crisisEvents = [];

  for (const record of records) {
    let weatherTrigger = false;
    let communicationTrigger = false;
    let powerTrigger = false;

    // Check weather trigger (fire or seismic)
    if (record.fire_hotspot && record.fire_hotspot >= CRISIS_THRESHOLDS.weather.fire_hotspot) {
      weatherTrigger = 'fire_hotspot';
    } else if (record.seismic_risk && record.seismic_risk >= CRISIS_THRESHOLDS.weather.seismic_risk) {
      weatherTrigger = 'seismic_risk';
    }

    // Check communication trigger (GDELT tone collapse)
    if (record.gdelt_tone && record.gdelt_tone <= CRISIS_THRESHOLDS.communication.gdelt_tone) {
      communicationTrigger = 'gdelt_tone';
    }

    // Check power trigger
    if (record.power_grid && record.power_grid >= CRISIS_THRESHOLDS.power.power_grid) {
      powerTrigger = 'power_grid';
    }

    // Crisis fires when ALL THREE triggers activate
    if (weatherTrigger && communicationTrigger && powerTrigger) {
      crisisEvents.push({
        country: record.country,
        date: record.date,
        year: record.year,
        score: record.score,
        band: record.band,
        triggers: {
          weather: weatherTrigger,
          weather_value: record[weatherTrigger],
          communication: communicationTrigger,
          communication_value: record.gdelt_tone,
          power: powerTrigger,
          power_value: record.power_grid
        },
        severity: calculateSeverity(record)
      });
    }
  }

  return crisisEvents;
}

function calculateSeverity(record) {
  // Severity score based on how far above thresholds
  let severity = 0;

  if (record.fire_hotspot) {
    severity += Math.max(0, record.fire_hotspot - CRISIS_THRESHOLDS.weather.fire_hotspot);
  }
  if (record.seismic_risk) {
    severity += Math.max(0, record.seismic_risk - CRISIS_THRESHOLDS.weather.seismic_risk);
  }
  if (record.gdelt_tone) {
    severity += Math.abs(Math.min(0, record.gdelt_tone - CRISIS_THRESHOLDS.communication.gdelt_tone));
  }
  if (record.power_grid) {
    severity += Math.max(0, record.power_grid - CRISIS_THRESHOLDS.power.power_grid);
  }
  if (record.score) {
    severity += Math.max(0, record.score - CRISIS_THRESHOLDS.convergence.score);
  }

  return severity;
}

function analyzeCrisisOutcomes(crisisEvents, allRecords) {
  console.log('[ANALYZE] What happened after crisis triggers?\n');

  const withOutcomes = [];

  for (const crisis of crisisEvents) {
    // Find records 1 year later
    const nextYear = crisis.year + 1;
    const nextRecord = allRecords.find(r =>
      r.country === crisis.country && r.year === nextYear
    );

    if (nextRecord) {
      withOutcomes.push({
        ...crisis,
        outcome: {
          next_year_score: nextRecord.score,
          score_change: nextRecord.score ? (nextRecord.score - (crisis.score || 50)) : null,
          next_year_band: nextRecord.band
        }
      });
    }
  }

  return withOutcomes;
}

async function testCrisisDetection() {
  const data = await loadHistoricalSignals();

  if (!data) {
    console.log('\n❌ Failed to load data');
    return null;
  }

  console.log('[ORGANIZE] Combining signals by country-date...\n');
  const records = organizeByCountryDate(data);

  console.log(`  Combined: ${records.length} country-date records`);
  console.log(`  Countries: ${new Set(records.map(r => r.country)).size}`);
  console.log(`  Date range: ${records[0]?.date} to ${records[records.length - 1]?.date}\n`);

  // Detect crisis events
  const crisisEvents = detectCrisisEvents(records);

  console.log(`[RESULT] Crisis events detected: ${crisisEvents.length}\n`);

  if (crisisEvents.length > 0) {
    console.log('  Top 10 crisis events:');
    crisisEvents.slice(0, 10).forEach(c => {
      console.log(`    ${c.country} ${c.date}: Score ${c.score || 'N/A'}, Severity ${c.severity.toFixed(1)}`);
      console.log(`      Weather: ${c.triggers.weather} (${c.triggers.weather_value})`);
      console.log(`      Communication: ${c.triggers.communication} (${c.triggers.communication_value})`);
      console.log(`      Power: ${c.triggers.power} (${c.triggers.power_value})`);
    });
  } else {
    console.log('  No crisis combination triggers found in historical data');
    console.log('  This means the three-signal combination (weather + communication + power) is RARE');
  }

  // Analyze outcomes
  const withOutcomes = analyzeCrisisOutcomes(crisisEvents, records);

  console.log(`\n[OUTCOME] Follow-up data available: ${withOutcomes.length} cases\n`);

  if (withOutcomes.length > 0) {
    const scoreIncreased = withOutcomes.filter(c => c.outcome.score_change > 3).length;
    const scoreDecreased = withOutcomes.filter(c => c.outcome.score_change < -3).length;
    const scoreStable = withOutcomes.filter(c => Math.abs(c.outcome.score_change) <= 3).length;

    console.log(`  Next year score increased: ${scoreIncreased} cases`);
    console.log(`  Next year score decreased: ${scoreDecreased} cases`);
    console.log(`  Next year score stable: ${scoreStable} cases\n`);
  }

  // Save results
  const results = {
    generatedAt: new Date().toISOString(),
    totalRecords: records.length,
    crisisThresholds: CRISIS_THRESHOLDS,
    crisisEventsDetected: crisisEvents.length,
    crisisEvents: crisisEvents,
    withOutcomes: withOutcomes,
    finding: crisisEvents.length === 0
      ? 'Three-signal crisis combination (weather + communication + power) is RARE in historical data. When all three fire simultaneously, it represents an exceptional event.'
      : `Found ${crisisEvents.length} historical crisis events where weather, communication, and power all triggered simultaneously.`
  };

  const outputPath = path.join(__dirname, 'CRISIS_MODE_DETECTION_RESULTS.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('✅ CRISIS MODE DETECTION COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('\nResults saved to:', outputPath);
  console.log(`\nKey Finding: ${results.finding}`);
  console.log('');

  return results;
}

if (require.main === module) {
  testCrisisDetection().catch(err => {
    console.error('[ERROR]', err);
    process.exit(1);
  });
}

module.exports = { detectCrisisEvents, CRISIS_THRESHOLDS, testCrisisDetection };
