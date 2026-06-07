// historical/analogue_engine.cjs
// Historical Analogue Engine — Step 10-Pre-B
// Matches current country state against 237 years of historical data.
// Finds analogues, applies 388 findings, calculates tripwires.
//
// Usage: const engine = require('./analogue_engine.cjs');
//        const result = await engine.analyzeCountry('Turkey');

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Import from central registry — 15 signals including behavioral
const { SIGNAL_KEYS } = require('./signal_keys.cjs');

const STABLE = 65;
const ELEVATED = 75;
const CRITICAL = 85;

// ── Data loading ──────────────────────────────────────────────────────────────

let _scoresCache = null;
let _clustersCache = null;
let _findingsCache = null;

async function loadAllScores() {
  if (_scoresCache) return _scoresCache;

  const all = [];
  let page = 0;
  while (true) {
    const { data, error } = await sb
      .from('historical_convergence_scores')
      .select('country,year,score,breakdown,data_status')
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

async function loadClusters() {
  if (_clustersCache) return _clustersCache;

  const { data, error } = await sb.from('country_clusters').select('*');
  if (error) throw error;
  const map = {};
  for (const r of (data || [])) map[r.country] = r;
  _clustersCache = map;
  return map;
}

async function loadLeadIndicators() {
  const { data, error } = await sb.from('signal_lead_indicators').select('*');
  if (error) throw error;
  return data || [];
}

async function loadGoingDarkPatterns() {
  const { data, error } = await sb.from('going_dark_patterns').select('*');
  if (error) throw error;
  return data || [];
}

function buildCountryMap(scores) {
  const map = {};
  for (const r of scores) {
    if (!map[r.country]) map[r.country] = {};
    map[r.country][r.year] = r;
  }
  return map;
}

// ── Key findings database (structured from 388 findings) ──────────────────────

const KEY_FINDINGS = [
  { id: 1, category: 'Country Pairs', title: 'Armenia-Israel perfect correlation', condition: (c) => c === 'Armenia' || c === 'Israel', text: 'Armenia and Israel have moved identically (r=1.000) for 33 years. When one falls into crisis, the other follows.' },
  { id: 2, category: 'Recovery', title: 'Recovery asymmetry', condition: () => true, text: 'Recovery takes 2x longer than collapse in 83% of historical cases. Average ascent: 2.4 years. Average recovery: 3.4 years.' },
  { id: 3, category: 'Stability', title: 'Elevated band instability', condition: (c, score) => score >= ELEVATED && score < CRITICAL, text: 'The elevated stress band (75-85) is not a stable state. Zero countries in the historical record held it for 10+ years without breaking or recovering.' },
  { id: 4, category: 'Going Dark', title: 'Governance goes dark first', condition: () => true, text: 'In 126 countries, governance was the first signal to stop reporting before other signals went dark. It is the canary in the coal mine.' },
  { id: 5, category: 'Pre-Silence', title: 'IMF fiscal precedes silence', condition: (c, score, signals) => signals.includes('imf_fiscal'), text: 'IMF fiscal stress is elevated in 728 observations before another signal goes dark. Fiscal pressure rises, then data disappears.' },
  { id: 6, category: 'Pre-Crisis', title: 'Economic stress year -1', condition: (c, score, signals) => signals.includes('economic_stress'), text: 'economic_stress appears in 38% of crises in the year before CRITICAL entry. It is the strongest single-year pre-crisis signal.' },
  { id: 7, category: 'Collapse Speed', title: 'Seismic = slow, Economic = fast', condition: (c, score, signals) => signals.includes('seismic_risk') || signals.includes('economic_stress'), text: 'seismic_risk appears in 100% of slow collapses (>10yr) but 0% of fast collapses. economic_stress appears in 36% of fast collapses but 0% of slow.' },
  { id: 8, category: 'Protective', title: 'Protective combination', condition: (c, score, signals) => signals.includes('economic_stress') && signals.includes('governance') && signals.includes('trade_collapse'), text: 'economic_stress + governance + trade_collapse together has NEVER preceded a CRITICAL crossing (n=30). This combination is protective.' },
  { id: 9, category: 'Cluster', title: 'High-fire cluster risk', condition: (c, score, signals, cluster) => cluster?.cluster_label === 'high-fire', text: 'The high-fire cluster has the highest crisis rate (0.38 per country) — 3x higher than high-economic-stress cluster.' },
  { id: 10, category: 'Cluster', title: 'High-economic-stress stability', condition: (c, score, signals, cluster) => cluster?.cluster_label === 'high-economic-stress', text: 'The high-economic-stress cluster has the lowest crisis rate (0.13 per country). Economic stress alone does not break countries.' },
  { id: 11, category: 'Capital Flows', title: 'Capital flows chronic crisis', condition: (c, score, signals) => signals.includes('capital_flows'), text: 'capital_flows is the signal in ALL of Armenia\'s 19 consecutive years at score 99. Chronic capital flight = chronic crisis.' },
  { id: 12, category: 'Transmission', title: 'Brazil transmission node', condition: (c) => c === 'Brazil', text: 'Brazil correlates with 15+ developed economies at r>0.9. It is a transmission node — when Brazil moves, the developed world moves with it.' },
  { id: 13, category: 'Signal Emergence', title: 'Economic stress early warning', condition: (c, score, signals) => signals.includes('economic_stress'), text: 'economic_stress emerges first in country records (year 4.5 on average). It is the earliest warning signal.' },
  { id: 14, category: 'Signal Emergence', title: 'Displacement late signal', condition: (c, score, signals) => signals.includes('displacement'), text: 'displacement emerges late in country records (year 41 on average). By the time it appears, the pattern is well established.' },
  { id: 15, category: 'Repeat Crisis', title: 'Repeat crisis country', condition: (c) => ['Armenia', 'CAR', 'Ethiopia', 'Georgia', 'Guinea-Bissau', 'Israel', 'Mexico'].includes(c), text: 'This country has experienced 2+ separate CRITICAL episodes in the historical record. It is chronically unstable.' },
];

// ── Signal vector operations ──────────────────────────────────────────────────

function extractSignalVector(breakdown) {
  const vec = [];
  for (const sig of SIGNAL_KEYS) {
    vec.push(breakdown?.[sig]?.stress_z || 0);
  }
  return vec;
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function euclideanDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}

// ── Risk band calculation ─────────────────────────────────────────────────────

function getRiskBand(score) {
  if (score >= CRITICAL) return 'CRITICAL';
  if (score >= ELEVATED) return 'ELEVATED';
  if (score >= STABLE) return 'STRESSED';
  return 'STABLE';
}

// ── Find historical analogues ─────────────────────────────────────────────────

function findAnalogues(targetCountry, targetYear, targetBreakdown, countryMap, topN = 5) {
  const targetVec = extractSignalVector(targetBreakdown);
  const analogues = [];

  for (const [country, yearMap] of Object.entries(countryMap)) {
    if (country === targetCountry) continue; // Exclude self

    for (const [year, data] of Object.entries(yearMap)) {
      const yearNum = Number(year);
      if (yearNum >= targetYear - 1) continue; // Only historical data

      const vec = extractSignalVector(data.breakdown);
      const similarity = cosineSimilarity(targetVec, vec);
      const distance = euclideanDistance(targetVec, vec);

      if (similarity > 0.5 || distance < 2.0) {
        // Find what happened in 1, 3, 5 years after
        const outcomes = {};
        for (const lookAhead of [1, 3, 5]) {
          const futureYear = yearNum + lookAhead;
          if (yearMap[futureYear]) {
            outcomes[`year_${lookAhead}`] = {
              score: yearMap[futureYear].score,
              riskBand: getRiskBand(yearMap[futureYear].score)
            };
          }
        }

        analogues.push({
          country,
          year: yearNum,
          score: data.score,
          riskBand: getRiskBand(data.score),
          similarity: similarity.toFixed(3),
          distance: distance.toFixed(2),
          outcomes,
          breakdown: data.breakdown
        });
      }
    }
  }

  // Sort by similarity descending
  analogues.sort((a, b) => parseFloat(b.similarity) - parseFloat(a.similarity));
  return analogues.slice(0, topN);
}

// ── Calculate outcome distribution from analogues ─────────────────────────────

function calculateOutcomeDistribution(analogues, yearsAhead = 3) {
  const key = `year_${yearsAhead}`;
  const outcomes = { STABLE: 0, STRESSED: 0, ELEVATED: 0, CRITICAL: 0, unknown: 0 };

  for (const a of analogues) {
    const outcome = a.outcomes[key];
    if (outcome) {
      outcomes[outcome.riskBand] = (outcomes[outcome.riskBand] || 0) + 1;
    } else {
      outcomes.unknown++;
    }
  }

  const total = analogues.length;
  const distribution = {};
  for (const [band, count] of Object.entries(outcomes)) {
    if (count > 0) {
      distribution[band] = {
        count,
        percentage: ((count / total) * 100).toFixed(0)
      };
    }
  }

  return distribution;
}

// ── Find applicable findings ──────────────────────────────────────────────────

function findApplicableFindings(country, score, breakdown, cluster) {
  const elevatedSignals = Object.entries(breakdown || {})
    .filter(([k, v]) => (v.stress_z || 0) > 0.5)
    .map(([k]) => k);

  const applicable = [];
  for (const finding of KEY_FINDINGS) {
    if (finding.condition(country, score, elevatedSignals, cluster)) {
      applicable.push({
        id: finding.id,
        category: finding.category,
        title: finding.title,
        text: finding.text
      });
    }
  }

  return applicable;
}

// ── Calculate tripwires ───────────────────────────────────────────────────────

function calculateTripwires(score, breakdown, cluster) {
  const tripwires = {
    toImprove: [],
    toWorsen: []
  };

  const currentBand = getRiskBand(score);
  const elevatedSignals = Object.entries(breakdown || {})
    .filter(([k, v]) => (v.stress_z || 0) > 0.5)
    .map(([k]) => k);

  // To improve
  if (currentBand === 'CRITICAL') {
    tripwires.toImprove.push(`Score must drop below ${CRITICAL} to exit CRITICAL band`);
  } else if (currentBand === 'ELEVATED') {
    tripwires.toImprove.push(`Score must drop below ${ELEVATED} to exit ELEVATED band`);
  }

  for (const sig of elevatedSignals) {
    if (sig === 'capital_flows') {
      tripwires.toImprove.push(`capital_flows stress_z must normalize below 0.5 — historically associated with chronic crisis`);
    }
    if (sig === 'economic_stress') {
      tripwires.toImprove.push(`economic_stress must de-escalate — strongest pre-crisis signal in year -1`);
    }
  }

  // To worsen
  if (currentBand === 'STABLE') {
    tripwires.toWorsen.push(`Score crossing ${STABLE} would enter STRESSED band`);
  } else if (currentBand === 'STRESSED') {
    tripwires.toWorsen.push(`Score crossing ${ELEVATED} would enter ELEVATED band`);
  } else if (currentBand === 'ELEVATED') {
    tripwires.toWorsen.push(`Score crossing ${CRITICAL} would enter CRITICAL band`);
    tripwires.toWorsen.push(`Historical record: elevated band is not stable. Resolution within 10 years is 100% in historical data.`);
  }

  // Pre-crisis signature check
  if (elevatedSignals.includes('economic_stress') && !elevatedSignals.includes('governance')) {
    tripwires.toWorsen.push(`If governance reporting drops while economic_stress remains elevated, country enters pre-crisis signature`);
  }

  return tripwires;
}

// ── Check pre-crisis signature ────────────────────────────────────────────────

function checkPreCrisisSignature(breakdown) {
  const elevatedSignals = Object.entries(breakdown || {})
    .filter(([k, v]) => (v.stress_z || 0) > 0.5)
    .map(([k]) => k);

  const signatures = [];

  // Signature 1: economic_stress elevated
  if (elevatedSignals.includes('economic_stress')) {
    signatures.push({
      name: 'Economic stress active',
      description: 'economic_stress is the strongest pre-crisis signal (38% of crises in year -1)',
      severity: 'moderate'
    });
  }

  // Signature 2: capital_flows + any other signal
  if (elevatedSignals.includes('capital_flows') && elevatedSignals.length > 1) {
    signatures.push({
      name: 'Capital flight with compound stress',
      description: 'capital_flows elevated with other signals. Historical precedent: Armenia 1994-2005.',
      severity: 'high'
    });
  }

  // Signature 3: power_grid + economic_stress (fast collapse predictor)
  if (elevatedSignals.includes('power_grid') && elevatedSignals.includes('economic_stress')) {
    signatures.push({
      name: 'Fast collapse pattern',
      description: 'power_grid + economic_stress combination predicts fast collapse (<5yr to CRITICAL)',
      severity: 'high'
    });
  }

  // Check for protective combination
  if (elevatedSignals.includes('economic_stress') &&
      elevatedSignals.includes('governance') &&
      elevatedSignals.includes('trade_collapse')) {
    signatures.push({
      name: 'Protective combination active',
      description: 'economic_stress + governance + trade_collapse has NEVER preceded CRITICAL (n=30)',
      severity: 'protective'
    });
  }

  return signatures;
}

// ── Get going-dark status ─────────────────────────────────────────────────────

function getGoingDarkStatus(country, yearMap, currentYear) {
  const status = {
    signalsPresent: [],
    signalsAbsent: [],
    lastReported: {}
  };

  const currentBd = yearMap[currentYear]?.breakdown || {};
  const presentSignals = new Set(Object.keys(currentBd));

  for (const sig of SIGNAL_KEYS) {
    if (presentSignals.has(sig)) {
      status.signalsPresent.push(sig);
    } else {
      status.signalsAbsent.push(sig);
      // Find when it last reported
      for (let y = currentYear - 1; y >= currentYear - 10; y--) {
        if (yearMap[y]?.breakdown?.[sig]) {
          status.lastReported[sig] = y;
          break;
        }
      }
    }
  }

  return status;
}

// ── Get active lead signals ───────────────────────────────────────────────────

async function getActiveLeadSignals(breakdown, leadIndicators) {
  const active = [];
  const elevatedSignals = Object.entries(breakdown || {})
    .filter(([k, v]) => (v.stress_z || 0) > 0.5)
    .map(([k]) => k);

  for (const indicator of leadIndicators) {
    if (elevatedSignals.includes(indicator.signal_key)) {
      active.push({
        signal: indicator.signal_key,
        leadsTo: indicator.best_lead_target,
        lag: indicator.best_lead_lag,
        correlation: indicator.best_lead_r,
        description: `${indicator.signal_key} historically leads ${indicator.best_lead_target} by ${indicator.best_lead_lag} years (r=${indicator.best_lead_r?.toFixed(2)})`
      });
    }
  }

  return active;
}

// ── Main analysis function ────────────────────────────────────────────────────

async function analyzeCountry(targetCountry) {
  // Load all data
  const [scores, clusters, leadIndicators] = await Promise.all([
    loadAllScores(),
    loadClusters(),
    loadLeadIndicators()
  ]);

  const countryMap = buildCountryMap(scores);
  const targetYearMap = countryMap[targetCountry];

  if (!targetYearMap) {
    throw new Error(`Country not found: ${targetCountry}`);
  }

  // Get most recent year — prefer validated over provisional
  const years = Object.keys(targetYearMap).map(Number).sort((a, b) => b - a);
  const currentYear = years.find(y => {
    const s = targetYearMap[y]?.data_status;
    return !s || s === 'validated' || s === 'backfill';
  }) ?? years[0];
  const currentData = targetYearMap[currentYear];
  const cluster = clusters[targetCountry];

  // Extract current state
  const currentScore = currentData.score || 50;
  const currentBreakdown = currentData.breakdown || {};
  const currentRiskBand = getRiskBand(currentScore);

  // Find historical analogues
  const analogues = findAnalogues(targetCountry, currentYear, currentBreakdown, countryMap, 10);

  // Calculate outcome distributions
  const outcomes1yr = calculateOutcomeDistribution(analogues, 1);
  const outcomes3yr = calculateOutcomeDistribution(analogues, 3);
  const outcomes5yr = calculateOutcomeDistribution(analogues, 5);

  // Find applicable findings
  const applicableFindings = findApplicableFindings(targetCountry, currentScore, currentBreakdown, cluster);

  // Calculate tripwires
  const tripwires = calculateTripwires(currentScore, currentBreakdown, cluster);

  // Check pre-crisis signatures
  const preCrisisSignatures = checkPreCrisisSignature(currentBreakdown);

  // Get going-dark status
  const goingDarkStatus = getGoingDarkStatus(targetCountry, targetYearMap, currentYear);

  // Get active lead signals
  const activeLeadSignals = await getActiveLeadSignals(currentBreakdown, leadIndicators);

  // Get elevated signals
  const elevatedSignals = Object.entries(currentBreakdown)
    .filter(([k, v]) => (v.stress_z || 0) > 0.5)
    .map(([k, v]) => ({ signal: k, stress_z: v.stress_z?.toFixed(2) }))
    .sort((a, b) => parseFloat(b.stress_z) - parseFloat(a.stress_z));

  // Calculate historical trajectory
  const recentYears = years.slice(0, 5);
  const trajectory = recentYears.map(y => ({
    year: y,
    score: targetYearMap[y]?.score?.toFixed(1) || 'n/a'
  }));

  // Build result
  return {
    country: targetCountry,
    asOfDate: new Date().toISOString(),
    currentYear,

    currentState: {
      score: currentScore.toFixed(1),
      riskBand: currentRiskBand,
      elevatedSignals,
      trajectory
    },

    cluster: cluster ? {
      id: cluster.cluster_id,
      label: cluster.cluster_label,
      dominantSignal: cluster.dominant_signal,
      members: cluster.cluster_members
    } : null,

    analogues: analogues.slice(0, 5).map(a => ({
      country: a.country,
      year: a.year,
      score: a.score?.toFixed(1),
      similarity: a.similarity,
      outcomes: a.outcomes
    })),

    outcomeDistribution: {
      '1_year': outcomes1yr,
      '3_year': outcomes3yr,
      '5_year': outcomes5yr
    },

    applicableFindings,
    tripwires,
    preCrisisSignatures,
    goingDarkStatus,
    activeLeadSignals,

    // Raw data for further processing
    _raw: {
      breakdown: currentBreakdown,
      yearMap: targetYearMap,
      allAnalogues: analogues
    }
  };
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  analyzeCountry,
  findAnalogues,
  calculateOutcomeDistribution,
  findApplicableFindings,
  calculateTripwires,
  checkPreCrisisSignature,
  getGoingDarkStatus,
  getRiskBand,
  SIGNAL_KEYS,
  STABLE,
  ELEVATED,
  CRITICAL
};
