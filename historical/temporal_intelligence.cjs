// historical/temporal_intelligence.cjs
// Temporal Intelligence Layer — Lead times, velocity, decision triggers
// Answers: "How much time does the buyer have to act?"
//
// This is the $100M feature. Without it, Sabian is a warning system.
// With it, Sabian is a planning system.

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const STABLE = 65;
const ELEVATED = 75;
const CRITICAL = 85;

// ── Load all historical scores ────────────────────────────────────────────────

let _scoresCache = null;

async function loadAllScores() {
  if (_scoresCache) return _scoresCache;

  const all = [];
  let page = 0;
  while (true) {
    const { data, error } = await sb
      .from('historical_convergence_scores')
      .select('country,year,score,breakdown')
      .order('country').order('year')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) all.push(r);
    if (data.length < 1000) break;
    page++;
  }
  _scoresCache = all;
  return all;
}

function buildCountryTimelines(scores) {
  const timelines = {};
  for (const r of scores) {
    if (!timelines[r.country]) timelines[r.country] = [];
    timelines[r.country].push({ year: r.year, score: r.score, breakdown: r.breakdown });
  }
  // Sort each timeline by year
  for (const c of Object.keys(timelines)) {
    timelines[c].sort((a, b) => a.year - b.year);
  }
  return timelines;
}

// ── Identify crisis events ────────────────────────────────────────────────────
// A crisis event is when a country crosses into CRITICAL (score >= 85)

function identifyCrisisEvents(timelines) {
  const events = [];

  for (const [country, timeline] of Object.entries(timelines)) {
    let inCrisis = false;
    let crisisStart = null;

    for (let i = 0; i < timeline.length; i++) {
      const { year, score } = timeline[i];
      const wasInCrisis = inCrisis;
      inCrisis = score >= CRITICAL;

      if (inCrisis && !wasInCrisis) {
        // Entered crisis
        crisisStart = year;
        events.push({
          country,
          crisisYear: year,
          scoreAtEntry: score,
          priorYears: timeline.slice(Math.max(0, i - 10), i).map(t => ({ year: t.year, score: t.score }))
        });
      }
    }
  }

  return events;
}

// ── Calculate lead time from pattern to crisis ────────────────────────────────
// For a given pattern (e.g., "economic_stress elevated"), find all historical
// instances and calculate time from pattern appearance to CRITICAL entry.

function calculatePatternLeadTimes(timelines, crisisEvents, patternFn, patternName) {
  const leadTimes = [];

  for (const event of crisisEvents) {
    const timeline = timelines[event.country];
    if (!timeline) continue;

    // Look back from crisis year to find when pattern first appeared
    const crisisIdx = timeline.findIndex(t => t.year === event.crisisYear);
    if (crisisIdx < 0) continue;

    // Find earliest year (up to 10 years before) where pattern was active
    let patternFirstSeen = null;
    for (let i = Math.max(0, crisisIdx - 10); i < crisisIdx; i++) {
      if (patternFn(timeline[i])) {
        patternFirstSeen = timeline[i].year;
        break;
      }
    }

    if (patternFirstSeen !== null) {
      const leadTime = event.crisisYear - patternFirstSeen;
      leadTimes.push({
        country: event.country,
        patternYear: patternFirstSeen,
        crisisYear: event.crisisYear,
        leadTimeYears: leadTime
      });
    }
  }

  if (leadTimes.length === 0) {
    return {
      patternName,
      sampleSize: 0,
      medianLeadTimeYears: null,
      p10: null,
      p90: null,
      min: null,
      max: null,
      instances: []
    };
  }

  // Calculate statistics
  const sorted = leadTimes.map(l => l.leadTimeYears).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const p10 = sorted[Math.floor(sorted.length * 0.1)];
  const p90 = sorted[Math.floor(sorted.length * 0.9)];

  return {
    patternName,
    sampleSize: leadTimes.length,
    medianLeadTimeYears: median,
    medianLeadTimeMonths: median * 12,
    p10Years: p10,
    p10Months: p10 * 12,
    p90Years: p90,
    p90Months: p90 * 12,
    min: Math.min(...sorted),
    max: Math.max(...sorted),
    instances: leadTimes.slice(0, 10) // Top 10 examples
  };
}

// ── Pre-defined patterns for lead time analysis ───────────────────────────────

const PATTERNS = {
  economic_stress_elevated: {
    name: 'Economic stress elevated',
    fn: (t) => (t.breakdown?.economic_stress?.stress_z || 0) > 0.5
  },
  capital_flows_elevated: {
    name: 'Capital flows elevated',
    fn: (t) => (t.breakdown?.capital_flows?.stress_z || 0) > 0.5
  },
  governance_declining: {
    name: 'Governance declining',
    fn: (t) => (t.breakdown?.governance?.stress_z || 0) > 0.3
  },
  elevated_band: {
    name: 'In elevated band (75-85)',
    fn: (t) => t.score >= ELEVATED && t.score < CRITICAL
  },
  stressed_band: {
    name: 'In stressed band (65-75)',
    fn: (t) => t.score >= STABLE && t.score < ELEVATED
  },
  food_stress_elevated: {
    name: 'Food stress elevated',
    fn: (t) => (t.breakdown?.food_stress?.stress_z || 0) > 0.5
  },
  night_lights_declining: {
    name: 'Night lights declining',
    fn: (t) => (t.breakdown?.night_lights?.stress_z || 0) > 0.5 // Inverted: high stress_z = declining
  },
  diaspora_spike: {
    name: 'Diaspora remittance spike',
    fn: (t) => (t.breakdown?.diaspora_remittance?.stress_z || 0) > 1.0
  }
};

// ── Calculate velocity ────────────────────────────────────────────────────────
// How fast is a country moving? Compare to historical median trajectory.

function calculateVelocity(countryTimeline, historicalMedianChange = 3.5) {
  if (!countryTimeline || countryTimeline.length < 2) {
    return {
      yearOverYearChange: null,
      velocityClass: 'unknown',
      accelerating: false
    };
  }

  const recent = countryTimeline.slice(-5);
  if (recent.length < 2) {
    return {
      yearOverYearChange: null,
      velocityClass: 'unknown',
      accelerating: false
    };
  }

  // Calculate average year-over-year change
  let totalChange = 0;
  let changes = [];
  for (let i = 1; i < recent.length; i++) {
    const change = recent[i].score - recent[i - 1].score;
    totalChange += change;
    changes.push(change);
  }
  const avgChange = totalChange / (recent.length - 1);

  // Classify velocity
  let velocityClass;
  if (avgChange < -3) velocityClass = 'improving';
  else if (avgChange < 0) velocityClass = 'stable_improving';
  else if (avgChange < historicalMedianChange * 0.5) velocityClass = 'slow';
  else if (avgChange < historicalMedianChange * 1.5) velocityClass = 'normal';
  else if (avgChange < historicalMedianChange * 2) velocityClass = 'fast';
  else velocityClass = 'accelerating';

  // Check if accelerating (each year's change bigger than last)
  let accelerating = false;
  if (changes.length >= 3) {
    accelerating = changes[changes.length - 1] > changes[changes.length - 2] &&
                   changes[changes.length - 2] > changes[changes.length - 3] &&
                   changes[changes.length - 1] > 0;
  }

  return {
    yearOverYearChange: avgChange.toFixed(1),
    velocityClass,
    accelerating,
    recentChanges: changes.map(c => c.toFixed(1)),
    comparedToMedian: (avgChange / historicalMedianChange).toFixed(2) + 'x'
  };
}

// ── Estimate timeline to crisis ───────────────────────────────────────────────
// Based on current state, velocity, and historical analogues

function estimateTimeline(currentScore, currentBand, velocity, patternLeadTimes) {
  const estimates = [];

  if (currentBand === 'CRITICAL') {
    return {
      alreadyInCrisis: true,
      estimates: [],
      decisionTriggers: ['Already in CRITICAL band — crisis active']
    };
  }

  // Distance to next band
  const distanceToElevated = ELEVATED - currentScore;
  const distanceToCritical = CRITICAL - currentScore;

  const avgChange = parseFloat(velocity.yearOverYearChange) || 0;

  if (avgChange > 0) {
    // Moving toward crisis
    const yearsToElevated = distanceToElevated > 0 ? (distanceToElevated / avgChange) : 0;
    const yearsToCritical = distanceToCritical / avgChange;

    if (currentBand === 'STABLE' && distanceToElevated > 0) {
      estimates.push({
        band: 'ELEVATED',
        yearsAtCurrentRate: yearsToElevated.toFixed(1),
        estimatedDate: `Q${Math.ceil((yearsToElevated % 1) * 4) || 4} ${new Date().getFullYear() + Math.floor(yearsToElevated)}`
      });
    }

    estimates.push({
      band: 'CRITICAL',
      yearsAtCurrentRate: yearsToCritical.toFixed(1),
      estimatedDate: `Q${Math.ceil((yearsToCritical % 1) * 4) || 4} ${new Date().getFullYear() + Math.floor(yearsToCritical)}`
    });
  }

  // Add historical lead time context
  const relevantLeadTimes = [];
  for (const plt of patternLeadTimes) {
    if (plt.sampleSize > 0) {
      relevantLeadTimes.push({
        pattern: plt.patternName,
        medianMonths: plt.medianLeadTimeMonths,
        range: `${plt.p10Months}-${plt.p90Months} months`,
        sampleSize: plt.sampleSize
      });
    }
  }

  // Generate decision triggers
  const decisionTriggers = generateDecisionTriggers(currentScore, currentBand, velocity, estimates);

  return {
    alreadyInCrisis: false,
    currentScore,
    currentBand,
    velocity: velocity.velocityClass,
    estimates,
    historicalLeadTimes: relevantLeadTimes,
    decisionTriggers
  };
}

// ── Generate decision triggers ────────────────────────────────────────────────
// Key dates when buyer should re-evaluate

function generateDecisionTriggers(currentScore, currentBand, velocity, estimates) {
  const triggers = [];
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  // Trigger 1: If no improvement by X date
  if (velocity.velocityClass !== 'improving' && velocity.velocityClass !== 'stable_improving') {
    const checkDate = currentMonth <= 6 ? `Q3 ${currentYear}` : `Q1 ${currentYear + 1}`;
    triggers.push({
      condition: `If no improvement by ${checkDate}`,
      action: 'Lead time estimate compresses by 30%',
      urgency: 'medium'
    });
  }

  // Trigger 2: If velocity accelerates
  if (!velocity.accelerating) {
    triggers.push({
      condition: 'If year-over-year change exceeds 2x historical median',
      action: 'Revise timeline estimates down by 50%',
      urgency: 'high'
    });
  }

  // Trigger 3: Band crossing imminent
  if (currentBand === 'ELEVATED') {
    triggers.push({
      condition: `If score crosses ${CRITICAL}`,
      action: 'Country enters CRITICAL — crisis mode active',
      urgency: 'critical'
    });
  } else if (currentBand === 'STRESSED') {
    triggers.push({
      condition: `If score crosses ${ELEVATED}`,
      action: 'Country enters ELEVATED — historical precedent shows this band is unstable',
      urgency: 'high'
    });
  }

  // Trigger 4: Behavioral signal deterioration
  triggers.push({
    condition: 'If night_lights or diaspora_remittance shows sudden change',
    action: 'Re-run analysis — behavioral signals precede institutional reporting',
    urgency: 'medium'
  });

  return triggers;
}

// ── Main analysis function ────────────────────────────────────────────────────

async function analyzeTemporalIntelligence(country) {
  const scores = await loadAllScores();
  const timelines = buildCountryTimelines(scores);
  const crisisEvents = identifyCrisisEvents(timelines);

  const countryTimeline = timelines[country];
  if (!countryTimeline || countryTimeline.length === 0) {
    throw new Error(`No timeline data for ${country}`);
  }

  const currentYear = countryTimeline[countryTimeline.length - 1];
  const currentScore = currentYear.score || 50;
  const currentBand = currentScore >= CRITICAL ? 'CRITICAL' :
                      currentScore >= ELEVATED ? 'ELEVATED' :
                      currentScore >= STABLE ? 'STRESSED' : 'STABLE';

  // Calculate lead times for each pattern
  const patternLeadTimes = [];
  for (const [key, pattern] of Object.entries(PATTERNS)) {
    const leadTime = calculatePatternLeadTimes(timelines, crisisEvents, pattern.fn, pattern.name);
    patternLeadTimes.push(leadTime);
  }

  // Calculate velocity
  const velocity = calculateVelocity(countryTimeline);

  // Identify which patterns are currently active
  const activePatterns = [];
  for (const [key, pattern] of Object.entries(PATTERNS)) {
    if (pattern.fn(currentYear)) {
      const leadTimeData = patternLeadTimes.find(p => p.patternName === pattern.name);
      activePatterns.push({
        pattern: pattern.name,
        active: true,
        historicalLeadTime: leadTimeData?.medianLeadTimeMonths ?
          `${leadTimeData.medianLeadTimeMonths} months (n=${leadTimeData.sampleSize})` : 'insufficient data'
      });
    }
  }

  // Estimate timeline
  const timeline = estimateTimeline(currentScore, currentBand, velocity, patternLeadTimes);

  return {
    country,
    asOfDate: new Date().toISOString(),
    currentState: {
      year: currentYear.year,
      score: currentScore.toFixed(1),
      band: currentBand
    },
    velocity,
    activePatterns,
    patternLeadTimes: patternLeadTimes.filter(p => p.sampleSize > 0),
    timeline,
    decisionTriggers: timeline.decisionTriggers,

    // Summary for dossier
    summary: generateTemporalSummary(country, currentScore, currentBand, velocity, activePatterns, timeline)
  };
}

function generateTemporalSummary(country, score, band, velocity, activePatterns, timeline) {
  const lines = [];

  // Opening
  lines.push(`${country} is currently in the ${band} band with a score of ${score.toFixed(1)}.`);

  // Velocity
  if (velocity.velocityClass === 'accelerating') {
    lines.push(`The trajectory is accelerating — each year's change is larger than the last. This is ${velocity.comparedToMedian} the historical median pace.`);
  } else if (velocity.velocityClass === 'fast') {
    lines.push(`The trajectory is moving faster than normal — ${velocity.comparedToMedian} the historical median pace.`);
  } else if (velocity.velocityClass === 'improving') {
    lines.push(`The trajectory is improving — score is declining toward stability.`);
  } else {
    lines.push(`The trajectory is ${velocity.velocityClass}.`);
  }

  // Active patterns with lead times
  if (activePatterns.length > 0) {
    const withData = activePatterns.filter(p => !p.historicalLeadTime.includes('insufficient'));
    if (withData.length > 0) {
      const example = withData[0];
      lines.push(`Currently matches "${example.pattern}" — historical lead time: ${example.historicalLeadTime}.`);
    }
  }

  // Timeline estimate
  if (timeline.estimates && timeline.estimates.length > 0) {
    const criticalEst = timeline.estimates.find(e => e.band === 'CRITICAL');
    if (criticalEst) {
      lines.push(`At current rate, estimated CRITICAL entry: ${criticalEst.estimatedDate} (${criticalEst.yearsAtCurrentRate} years).`);
    }
  }

  // Key decision trigger
  if (timeline.decisionTriggers && timeline.decisionTriggers.length > 0) {
    const highPriority = timeline.decisionTriggers.find(t => t.urgency === 'high' || t.urgency === 'critical');
    if (highPriority) {
      lines.push(`Key trigger: ${highPriority.condition} → ${highPriority.action}.`);
    }
  }

  return lines.join(' ');
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  analyzeTemporalIntelligence,
  calculatePatternLeadTimes,
  calculateVelocity,
  estimateTimeline,
  identifyCrisisEvents,
  PATTERNS
};

// ── CLI ───────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const country = process.argv[2] || 'Turkey';
  analyzeTemporalIntelligence(country)
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch(err => {
      console.error('ERROR:', err.message);
      process.exit(1);
    });
}
