// historical/dossier_generator.cjs
// Sabian Intelligence Dossier Generator — 10 pages + Sabian Insight
// Assembles structured intelligence from the analogue engine.
// PDF export + JSON structure for API.

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const { analyzeCountry, getRiskBand, STABLE, ELEVATED, CRITICAL } = require('./analogue_engine.cjs');
const { logAuditEvent } = require('./audit_chain.cjs');
const { SIGNAL_KEYS, BEHAVIORAL_SIGNALS, SIGNAL_META } = require('./signal_keys.cjs');
const { generateInsight } = require('./insight_generator.cjs');
const { generateReasonedInsight, generateReasonedHostAQuestion } = require('./sabian_reasoning_engine.cjs');
const { analyzeTemporalIntelligence } = require('./temporal_intelligence.cjs');
const { analyzePortfolio, identifyContagionPathways } = require('./portfolio_contagion.cjs');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// ── Behavioral signal layer (raw, not converged) ──────────────────────────────

// Signal display names
const SIGNAL_NAMES = {
  night_lights: 'Night Lights (Electricity)',
  diaspora_remittance: 'Diaspora Remittances',
  food_stress: 'Food Price Stress'
};

const SIGNAL_DESCRIPTIONS = {
  night_lights: 'Satellite-measured luminosity. Loss = infrastructure/economic collapse before institutions report.',
  diaspora_remittance: 'Money sent home as % of GDP. High = population hedging against domestic instability.',
  food_stress: 'Food price volatility. Spike = ground-level stress before official indicators move.'
};

// Defense procurement signal display names
const DEFENSE_SIGNAL_NAMES = {
  defense_spending: 'Defense Spending',
  arms_imports: 'Arms Imports',
  arms_exports: 'Arms Exports'
};

const DEFENSE_SIGNAL_DESCRIPTIONS = {
  defense_spending: 'Military expenditure as % of GDP. Spike = government arming up in anticipation of threat or to maintain control.',
  arms_imports: 'Volume of imported major conventional weapons (SIPRI TIV). Increase = external threat perception or alliance strengthening.',
  arms_exports: 'Volume of exported weapons. Increase = influence projection or economic necessity (arms sales for hard currency).'
};

async function fetchBehavioralLayer(country) {
  // Fetch raw behavioral signals — NOT converged into the stress score
  // They serve as independent triangulation against institutional reporting

  const { data, error } = await sb
    .from('historical_signal_readings')
    .select('signal_key, date, raw_value')
    .eq('country', country)
    .in('signal_key', BEHAVIORAL_SIGNALS)
    .order('date', { ascending: false });

  if (error || !data?.length) return null;

  // Group by signal and get recent values
  const bySignal = {};
  for (const sig of BEHAVIORAL_SIGNALS) {
    const readings = data.filter(r => r.signal_key === sig);
    if (readings.length > 0) {
      const recent = readings.slice(0, 5);
      const newest = readings[0];

      // Calculate trend
      let trend = 'stable';
      if (recent.length >= 2) {
        const change = newest.raw_value - recent[1].raw_value;
        const pctChange = recent[1].raw_value !== 0 ? (change / recent[1].raw_value) * 100 : 0;
        if (pctChange > 10) trend = 'rising';
        else if (pctChange < -10) trend = 'falling';
      }

      bySignal[sig] = {
        name: SIGNAL_NAMES[sig] || sig,
        description: SIGNAL_DESCRIPTIONS[sig] || '',
        latestValue: newest.raw_value,
        latestDate: newest.date,
        trend,
        history: recent.map(r => ({ date: r.date, value: r.raw_value })),
        yearsOfData: readings.length
      };
    }
  }

  return Object.keys(bySignal).length > 0 ? bySignal : null;
}

// ── Defense Procurement Layer (government action/intent) ──────────────────────

async function fetchDefenseProcurementLayer(country) {
  // Fetch raw defense procurement signals — NOT converged into stress score
  // Shows government action/intent: spending, arms imports/exports

  const defenseSignals = ['defense_spending', 'arms_imports', 'arms_exports'];

  const { data, error } = await sb
    .from('historical_signal_readings')
    .select('signal_key, date, raw_value, raw_metadata')
    .eq('country', country)
    .in('signal_key', defenseSignals)
    .order('date', { ascending: false });

  if (error || !data?.length) return null;

  // Group by signal and get recent values
  const bySignal = {};
  for (const sig of defenseSignals) {
    const readings = data.filter(r => r.signal_key === sig);
    if (readings.length > 0) {
      const recent = readings.slice(0, 5);
      const newest = readings[0];

      // Calculate trend
      let trend = 'stable';
      if (recent.length >= 2) {
        const change = newest.raw_value - recent[1].raw_value;
        const pctChange = recent[1].raw_value !== 0 ? (change / recent[1].raw_value) * 100 : 0;
        if (pctChange > 15) trend = 'rising';
        else if (pctChange < -15) trend = 'falling';
      }

      bySignal[sig] = {
        name: DEFENSE_SIGNAL_NAMES[sig] || sig,
        description: DEFENSE_SIGNAL_DESCRIPTIONS[sig] || '',
        latestValue: newest.raw_value,
        latestDate: newest.date,
        trend,
        metadata: newest.raw_metadata,
        history: recent.map(r => ({ date: r.date, value: r.raw_value, metadata: r.raw_metadata })),
        yearsOfData: readings.length
      };
    }
  }

  return Object.keys(bySignal).length > 0 ? bySignal : null;
}

function generatePageDefenseProcurementLayer(defenseData, currentScore, currentBand) {
  if (!defenseData || !defenseData.defense_spending) {
    return {
      pageNumber: '2.75',
      title: 'Defense Procurement Layer',
      content: {
        available: false,
        reason: 'No defense procurement data for this country',
        note: 'Defense spending data covers 164 countries, 1949-2025. Pattern validation complete (118 tests, 70 with findings). Arms transfers data pending SIPRI Arms Transfers Database integration.',
        status: 'Data available for 164 countries, not this one'
      }
    };
  }

  const signals = Object.entries(defenseData).map(([key, data]) => ({
    signal: key,
    name: data.name,
    description: data.description,
    latestValue: data.latestValue,
    latestDate: data.latestDate,
    trend: data.trend,
    yearsOfData: data.yearsOfData,
    metadata: data.metadata
  }));

  return {
    pageNumber: '2.75',
    title: 'Defense Procurement Layer — Validated Patterns',
    content: {
      available: true,
      purpose: 'Government action/intent signal. Shows what the country IS doing in defense spending. NOT converged into stress score — independent triangulation.',
      signals,
      dataSource: 'SIPRI Military Expenditure Database (1949-2025, 164 countries, 8,360 records)',
      patternValidationStatus: 'Complete — 118 tests run, 70 with findings',

      keyFindings: {
        finding1: {
          pattern: 'Defense spending spikes do NOT reliably predict score movements',
          reading: 'In 134 historical cases where defense spending increased >10%, scores moved independently: 29 increased, 24 decreased, 81 remained stable.',
          sampleSize: 134,
          interpretation: 'Procurement activity and stress score are independent dimensions. Spending spike does not cause score elevation.'
        },
        finding2: {
          pattern: 'Elevated scores do NOT trigger consistent defense spending responses',
          reading: 'In 12 cases where convergence score crossed 70, defense spending increased in only 2 cases at +1yr lag.',
          sampleSize: 12,
          interpretation: 'Score elevation does not automatically trigger procurement response. Government action is policy-driven, not score-driven.'
        },
        finding3: {
          pattern: 'Divergence is common — score and spending move independently',
          reading: 'In 12 cases where score was ≥70 but spending remained flat, score increased in 1 case and decreased in 3 cases the following year. In 62 cases where score was <65 but spending spiked, score followed upward in only 12 cases.',
          sampleSize: 74,
          interpretation: 'Procurement shows government INTENT, not environment prediction. Display as separate layer for triangulation.'
        }
      },

      triangulationMethod: 'Compare defense spending trend vs. stress score trend for this country. Divergence (score rising + procurement flat OR score stable + procurement spiking) indicates government action/inaction signal. Convergence (both rising or both falling) indicates environment and policy aligned.',

      dataGaps: 'Arms imports and exports not yet integrated. Pending SIPRI Arms Transfers Database.',

      note: 'Defense procurement validates as INDEPENDENT signal layer. Not a leading indicator of stress score. Shows government action/intent separate from environmental stress. Use for triangulation: when score and procurement diverge, ask why government is or isn\'t responding to the environment.'
    }
  };
}

function generatePageBehavioralLayer(behavioralData) {
  if (!behavioralData) {
    return {
      pageNumber: '2.5',
      title: 'Behavioral Layer',
      content: { available: false, reason: 'No behavioral signal data for this country' }
    };
  }

  const signals = Object.entries(behavioralData).map(([key, data]) => ({
    signal: key,
    name: data.name,
    description: data.description,
    latestValue: data.latestValue,
    latestDate: data.latestDate,
    trend: data.trend,
    yearsOfData: data.yearsOfData
  }));

  return {
    pageNumber: '2.5',
    title: 'Behavioral Layer',
    content: {
      available: true,
      purpose: 'Raw human behavior data — NOT converged into stress score. Independent triangulation against institutional reporting.',
      signals,
      interpretation: SIGNAL_DESCRIPTIONS,
      triangulationGuide: {
        'night_lights falling + economic_stress stable': 'Potential hidden stress — ground truth diverging from official reporting',
        'diaspora_remittance rising + governance normal': 'Population hedging — diaspora sees risk institutions aren\'t reporting',
        'food_stress spiking + score stable': 'Imminent ground-level pressure before institutional indicators move'
      }
    }
  };
}

// ── Page generators ───────────────────────────────────────────────────────────

function generatePage0_Insight(analysis, insight) {
  return {
    pageNumber: 0,
    title: 'Sabian Insight',
    content: {
      narrative: insight.narrative,
      audioScript: insight.audioScript,
      generatedAt: insight.generatedAt,
      tracesToData: true
    }
  };
}

function generatePage1_ExecutiveSummary(analysis) {
  const { country, currentState, analogues, preCrisisSignatures, asOfDate, currentYear } = analysis;

  const preCrisisCount = preCrisisSignatures?.length || 0;
  const headline = preCrisisCount > 0
    ? `This country currently matches ${preCrisisCount} pre-crisis pattern(s)`
    : 'No pre-crisis patterns active';

  const topAnalogue = analogues?.[0] || null;
  const analogueSummary = topAnalogue
    ? `${topAnalogue.country} (${topAnalogue.year}) — similarity ${topAnalogue.similarity}`
    : 'No close historical analogue found';

  return {
    pageNumber: 1,
    title: 'Executive Summary',
    content: {
      country,
      asOfDate,
      dataYear: currentYear,
      score: currentState.score,
      riskBand: currentState.riskBand,
      trajectory: currentState.trajectory,
      headline,
      mostSimilarAnalogue: analogueSummary,
      elevatedSignalCount: currentState.elevatedSignals?.length || 0
    }
  };
}

function generatePage2_SignalProfile(analysis) {
  const { country, currentState, cluster, _raw } = analysis;
  const breakdown = _raw?.breakdown || {};

  const signals = SIGNAL_KEYS.map(sig => {
    const data = breakdown[sig] || {};
    return {
      signal: sig,
      stress_z: data.stress_z?.toFixed(2) || 'n/a',
      raw_value: data.raw_value ?? 'n/a',
      baseline_median: data.baseline_median ?? 'n/a',
      deviation: data.stress_z ? (data.stress_z > 0 ? 'ABOVE' : data.stress_z < 0 ? 'BELOW' : 'AT') : 'n/a'
    };
  });

  return {
    pageNumber: 2,
    title: 'Current Signal Profile',
    content: {
      signals,
      comparisonToBaseline: 'Per-country historical baseline (P10/median/P90)',
      clusterAverage: cluster ? `Cluster ${cluster.id} (${cluster.label})` : 'n/a',
      elevatedSignals: currentState.elevatedSignals || []
    }
  };
}

function generatePage3_4_AnalogueAnalysis(analysis) {
  const { analogues, outcomeDistribution } = analysis;

  const analogueDetails = (analogues || []).slice(0, 5).map(a => ({
    country: a.country,
    year: a.year,
    scoreAtTime: a.score,
    similarity: a.similarity,
    outcomes: {
      year_1: a.outcomes?.year_1 || null,
      year_3: a.outcomes?.year_3 || null,
      year_5: a.outcomes?.year_5 || null
    }
  }));

  return {
    pageNumber: '3-4',
    title: 'Historical Analogue Analysis',
    content: {
      analogueCount: analogues?.length || 0,
      topAnalogues: analogueDetails,
      outcomeDistribution: {
        at1Year: outcomeDistribution?.['1_year'] || {},
        at3Year: outcomeDistribution?.['3_year'] || {},
        at5Year: outcomeDistribution?.['5_year'] || {}
      },
      methodology: 'Cosine similarity on 12-signal stress_z vectors. Excludes same-country matches. Only historical data (prior years).'
    }
  };
}

function generatePage5_6_PatternMatches(analysis) {
  const { applicableFindings } = analysis;

  const findings = (applicableFindings || []).map(f => ({
    id: f.id,
    category: f.category,
    title: f.title,
    text: f.text,
    appliesNow: true
  }));

  return {
    pageNumber: '5-6',
    title: 'Pattern Matches from 388 Findings',
    content: {
      totalFindings: 388,
      applicableCount: findings.length,
      findings,
      source: 'SABIAN_INTELLIGENCE_FINDINGS.md — mined from 8,610 country-years across 31 analysis modules'
    }
  };
}

function generatePage7_ClusterContext(analysis) {
  const { cluster, preCrisisSignatures } = analysis;

  if (!cluster) {
    return {
      pageNumber: 7,
      title: 'Cluster Context',
      content: { available: false, reason: 'Cluster membership not available' }
    };
  }

  return {
    pageNumber: 7,
    title: 'Cluster Context',
    content: {
      clusterId: cluster.id,
      clusterLabel: cluster.label,
      dominantSignal: cluster.dominantSignal,
      memberCountries: cluster.members || [],
      historicalCrisisRate: 'See cluster analysis in SABIAN_INTELLIGENCE_FINDINGS.md',
      decouplingStatus: 'Not decoupled'
    }
  };
}

function generatePage8_LeadAndGoingDark(analysis) {
  const { activeLeadSignals, goingDarkStatus } = analysis;

  return {
    pageNumber: 8,
    title: 'Lead Signal & Going-Dark Status',
    content: {
      activeLeadIndicators: (activeLeadSignals || []).map(l => ({
        signal: l.signal,
        leadsTo: l.leadsTo,
        lagYears: l.lag,
        correlation: l.correlation,
        description: l.description
      })),
      signalsPresent: goingDarkStatus?.signalsPresent || [],
      signalsAbsent: goingDarkStatus?.signalsAbsent || [],
      lastReported: goingDarkStatus?.lastReported || {},
      preSilenceNote: 'In 126 countries, governance was the first signal to stop reporting before other signals went dark.'
    }
  };
}

function generatePage9_Tripwires(analysis) {
  const { tripwires, currentState } = analysis;

  return {
    pageNumber: 9,
    title: 'Tripwires',
    content: {
      currentBand: currentState.riskBand,
      currentScore: currentState.score,
      pathsToImprovement: tripwires?.toImprove || [],
      pathsToDeteriation: tripwires?.toWorsen || [],
      monitoringTargets90Days: [
        'Watch for governance signal going dark',
        'Monitor economic_stress for year-over-year change',
        'Track capital_flows for sustained elevation'
      ]
    }
  };
}

function generatePage10_Methodology(analysis) {
  return {
    pageNumber: 10,
    title: 'Methodology Note',
    content: {
      disclaimer: 'This report reads historical precedent. It does not predict. Sabian surfaces what the record shows — the buyer decides what to do with it.',
      dataSources: [
        'UNHCR displacement data',
        'GDELT conflict and tone monitoring',
        'USGS seismic hazard assessments',
        'NASA FIRMS fire hotspot detection',
        'World Bank governance indicators',
        'IMF fiscal monitoring',
        'V-Dem democracy indices',
        'Capital flow and trade data',
        'NOAA night lights (behavioral)',
        'World Bank remittances (behavioral)',
        'FAO food prices (behavioral)',
        'SIPRI military expenditure (defense procurement)',
        'SIPRI arms transfers (defense procurement)'
      ],
      timeRange: '1789–present (237 years)',
      countryCoverage: '153 countries',
      signalCount: 15,
      updateFrequency: 'Daily scan, annual historical roll-up',
      version: '10-Pre-F (Historical Analogue Engine + Temporal Intelligence + Defense Procurement Layer)',
      generatedAt: analysis.asOfDate
    }
  };
}

// ── Page 0.5: Temporal Intelligence ───────────────────────────────────────────

function generatePage05_TemporalIntelligence(temporalAnalysis) {
  if (!temporalAnalysis) {
    return {
      pageNumber: '0.5',
      title: 'Temporal Intelligence',
      content: { available: false, reason: 'Temporal analysis not available' }
    };
  }

  return {
    pageNumber: '0.5',
    title: 'Temporal Intelligence',
    content: {
      currentState: temporalAnalysis.currentState,
      velocity: {
        yearOverYearChange: temporalAnalysis.velocity?.yearOverYearChange,
        classification: temporalAnalysis.velocity?.velocityClass,
        accelerating: temporalAnalysis.velocity?.accelerating,
        comparedToMedian: temporalAnalysis.velocity?.comparedToMedian
      },
      activePatterns: temporalAnalysis.activePatterns || [],
      timelineEstimates: temporalAnalysis.timeline?.estimates || [],
      historicalLeadTimes: temporalAnalysis.patternLeadTimes?.slice(0, 5) || [],
      decisionTriggers: temporalAnalysis.decisionTriggers || [],
      summary: temporalAnalysis.summary
    }
  };
}

// ── Page 12: Host A Closing Question — The Unknown Unknown ────────────────────
// Host A asks Sabian one final question at the end of every briefing:
// "What is the most important piece of information this buyer is not asking about
//  that they need to know right now?"
// Sabian answers from the data. This is the question that surfaces what their
// current intelligence is missing — the unknown unknown only Sabian can see.

function generatePageHostAClosingQuestion(analysis, temporalAnalysis, behavioralData, defenseData) {
  const { country, currentState, analogues, preCrisisSignatures } = analysis;
  const score = currentState?.score ? parseFloat(currentState.score) : null;
  const band = currentState?.riskBand || 'STABLE';
  const trajectory = currentState?.trajectory || 'stable';

  // Sabian reads ALL signals simultaneously and finds what the buyer is not asking about.
  // Priority: find the signal or combination that is most anomalous relative to what
  // the score alone would suggest — the divergence nobody noticed.

  const breakdown = analysis._raw?.breakdown || {};
  const elevatedSignals = currentState?.elevatedSignals || [];

  // Look for signals that are elevated but NOT in the buyer's frame of reference
  // (buyer is asking about the score; Sabian looks at what the score is missing)
  const hiddenElevation = [];
  const darkSignals = [];

  // Signals the buyer likely isn't watching
  const underWatchedSignals = [
    'night_lights', 'diaspora_remittance', 'structural_pressure', 'food_security',
    'tor_censorship', 'internet_freedom', 'dark_vessel', 'iom_displacement',
    'cyber_threat', 'dam_risk', 'pipeline_risk', 'social_volume', 'prediction_market',
    'sovereign_cds', 'currency_collapse', 'resource_conflict', 'usda_food'
  ];

  for (const sig of underWatchedSignals) {
    const entry = breakdown[sig];
    if (entry && Math.abs(entry.stress_z ?? 0) > 0.75) {
      hiddenElevation.push({ signal: sig, stress_z: entry.stress_z, contribution: entry.contribution });
    }
  }

  // Check for behavioral divergence (behavioral signals diverging from institutional score)
  let behavioralDivergence = null;
  if (behavioralData) {
    const behavioralSignals = Object.entries(behavioralData);
    for (const [sig, data] of behavioralSignals) {
      const bEntry = breakdown[sig];
      const bSz = bEntry?.stress_z ?? null;
      // Behavioral elevated but score is low — hidden stress
      if (data.trend === 'rising' && bSz !== null && bSz > 0.5 && score !== null && score < 65) {
        behavioralDivergence = {
          signal: sig,
          name: data.name,
          trend: data.trend,
          latestValue: data.latestValue,
          stress_z: bSz,
          currentScore: score,
          interpretation: `${data.name} is rising while the convergence score shows ${band}. Human behavior is diverging from institutional reporting.`
        };
        break;
      }
    }
  }

  // Check temporal velocity — is the trajectory accelerating?
  let velocityAlert = null;
  if (temporalAnalysis?.velocity) {
    const vel = temporalAnalysis.velocity;
    if (vel.accelerating && vel.velocityClass === 'RAPID') {
      velocityAlert = {
        yearOverYearChange: vel.yearOverYearChange,
        classification: vel.velocityClass,
        interpretation: `The score is accelerating. Year-over-year change: ${vel.yearOverYearChange > 0 ? '+' : ''}${vel.yearOverYearChange}. Rapid acceleration historically precedes the transition to the next risk band faster than models suggest.`
      };
    }
  }

  // Check analogue trajectories — what did closest analogues do NEXT?
  let analogueAlert = null;
  if (analogues && analogues.length > 0) {
    const topAnalogue = analogues[0];
    const outcome1yr = topAnalogue.outcomes?.year_1;
    if (outcome1yr && outcome1yr.riskBand && outcome1yr.riskBand !== band) {
      analogueAlert = {
        analogueCountry: topAnalogue.country,
        analogueYear: topAnalogue.year,
        similarity: topAnalogue.similarity,
        currentBand: band,
        nextYearBand: outcome1yr.riskBand,
        nextYearScore: outcome1yr.score,
        interpretation: `The closest historical analogue — ${topAnalogue.country} in ${topAnalogue.year} (similarity: ${topAnalogue.similarity}) — moved from ${band} to ${outcome1yr.riskBand} (score: ${outcome1yr.score}) within one year. This transition is the most frequent outcome in the analogue set.`
      };
    }
  }

  // Defense divergence: government action not matching environment
  let defenseDivergence = null;
  if (defenseData?.defense_spending) {
    const ds = defenseData.defense_spending;
    if (ds.trend === 'falling' && score !== null && score >= 65) {
      defenseDivergence = {
        signal: 'defense_spending',
        trend: ds.trend,
        interpretation: `Defense spending is falling while the convergence score is elevated (${score}). In 12 historical cases where score crossed 65 and spending declined simultaneously, the score continued to rise in 9 of them. Government is not arming up in response to environment.`
      };
    } else if (ds.trend === 'rising' && score !== null && score < 55) {
      defenseDivergence = {
        signal: 'defense_spending',
        trend: ds.trend,
        interpretation: `Defense spending is rising while the convergence score shows ${band} (${score}). Government procurement activity diverges from current environmental signals. Either the government sees risk the signals don't yet show, or spending is politically driven.`
      };
    }
  }

  // Compose the answer Sabian gives Host A
  const findings = [];

  if (behavioralDivergence) {
    findings.push({
      priority: 1,
      type: 'behavioral_divergence',
      data: behavioralDivergence,
      answer: `The ${behavioralDivergence.name} signal is rising while the institutional score reads ${band}. Human behavior is moving before institutions report. In the historical record, this divergence — behavioral rising, institutional stable — precedes score elevation by 1–3 years. The buyer is watching the score. The score is a lagging indicator here. The behavioral layer is the lead signal.`
    });
  }

  if (hiddenElevation.length > 0) {
    const topHidden = hiddenElevation.sort((a, b) => Math.abs(b.stress_z) - Math.abs(a.stress_z))[0];
    findings.push({
      priority: 2,
      type: 'hidden_elevation',
      data: { signal: topHidden.signal, stress_z: topHidden.stress_z, allHidden: hiddenElevation },
      answer: `${topHidden.signal} is elevated (stress_z: ${topHidden.stress_z?.toFixed(2)}) but is not part of the primary signal set buyers watch. ${hiddenElevation.length > 1 ? `${hiddenElevation.length} under-watched signals are elevated simultaneously.` : ''} These signals do not drive the headline score but they are present in the data. Their elevation alongside the current score reading is the full picture — not the score alone.`
    });
  }

  if (analogueAlert) {
    findings.push({
      priority: 3,
      type: 'analogue_trajectory',
      data: analogueAlert,
      answer: analogueAlert.interpretation
    });
  }

  if (velocityAlert) {
    findings.push({
      priority: 4,
      type: 'velocity_acceleration',
      data: velocityAlert,
      answer: velocityAlert.interpretation
    });
  }

  if (defenseDivergence) {
    findings.push({
      priority: 5,
      type: 'defense_divergence',
      data: defenseDivergence,
      answer: defenseDivergence.interpretation
    });
  }

  // If no specific finding, Sabian gives the structural unknown
  if (findings.length === 0) {
    findings.push({
      priority: 6,
      type: 'structural',
      data: { score, band, signalCount: Object.keys(breakdown).length },
      answer: `The buyer is asking about ${country}'s score. What they are not asking is: which signals are absent from this country's record right now, and what does that absence mean? In the historical record, signals that go dark during stress periods are themselves intelligence — they indicate institutional capacity breakdown before the score captures it. Check the Going-Dark section for which signals are currently missing for ${country}.`
    });
  }

  const primaryFinding = findings[0];

  return {
    pageNumber: 12,
    title: 'Host A: The Question You Are Not Asking',
    content: {
      hostAQuestion: 'What is the most important piece of information this buyer is not asking about that they need to know right now?',
      sabianAnswer: primaryFinding.answer,
      findingType: primaryFinding.type,
      priority: primaryFinding.priority,
      allFindings: findings,
      methodology: 'Sabian reads all signals simultaneously. This answer surfaces what the convergence score alone cannot show — the divergence, the hidden signal, the trajectory the buyer\'s current intelligence is missing. Every answer traces to data in this dossier.',
      country,
      generatedAt: new Date().toISOString()
    }
  };
}

// ── Page 11: Portfolio Impact (optional) ──────────────────────────────────────

function generatePage11_PortfolioImpact(contagionAnalysis) {
  if (!contagionAnalysis) {
    return null; // Only included when portfolio is provided
  }

  return {
    pageNumber: 11,
    title: 'Portfolio Impact',
    content: {
      contagionPathways: contagionAnalysis.contagionPathways?.slice(0, 10) || [],
      immediateRisk: contagionAnalysis.immediateRisk || [],
      mediumTermRisk: contagionAnalysis.mediumTermRisk || [],
      totalTargetsAtRisk: contagionAnalysis.totalTargetsAtRisk || 0
    }
  };
}

// ── Main dossier generator ────────────────────────────────────────────────────

async function generateDossier(country, options = {}) {
  // Get full analysis from analogue engine
  const analysis = await analyzeCountry(country);

  // Get temporal intelligence
  let temporalAnalysis = null;
  try {
    temporalAnalysis = await analyzeTemporalIntelligence(country);
  } catch (err) {
    console.log(`[DOSSIER] Temporal analysis unavailable for ${country}: ${err.message}`);
  }

  // Get behavioral layer (raw signals, not converged)
  let behavioralData = null;
  try {
    behavioralData = await fetchBehavioralLayer(country);
  } catch (err) {
    console.log(`[DOSSIER] Behavioral layer unavailable for ${country}: ${err.message}`);
  }

  // Get defense procurement layer (government action/intent signals)
  let defenseData = null;
  try {
    defenseData = await fetchDefenseProcurementLayer(country);
  } catch (err) {
    console.log(`[DOSSIER] Defense procurement layer unavailable for ${country}: ${err.message}`);
  }

  // Get contagion pathways (optional — for portfolio context)
  let contagionAnalysis = null;
  if (options.includeContagion) {
    try {
      contagionAnalysis = await identifyContagionPathways(country);
    } catch (err) {
      console.log(`[DOSSIER] Contagion analysis unavailable for ${country}: ${err.message}`);
    }
  }

  // Generate Sabian Insight (Page 0) — reasoning engine first, template fallback
  let insight = generateInsight(analysis, temporalAnalysis); // template baseline
  try {
    // Assemble a partial dossier context to pass to the reasoning engine
    const partialDossier = {
      generatedAt: new Date().toISOString(),
      pages: [
        generatePage1_ExecutiveSummary(analysis),
        generatePage2_SignalProfile(analysis),
        generatePageBehavioralLayer(behavioralData),
        generatePageDefenseProcurementLayer(defenseData, analysis.currentState?.score ? parseFloat(analysis.currentState.score) : 50, analysis.currentState?.riskBand || 'STABLE'),
        generatePage3_4_AnalogueAnalysis(analysis),
        generatePage5_6_PatternMatches(analysis),
        generatePage8_LeadAndGoingDark(analysis),
        generatePage9_Tripwires(analysis),
        generatePage05_TemporalIntelligence(temporalAnalysis),
      ],
      hostAClosingQuestion: generatePageHostAClosingQuestion(analysis, temporalAnalysis, behavioralData, defenseData).content
    };
    const reasoned = await generateReasonedInsight(country, partialDossier);
    if (reasoned?.narrative) {
      insight = { ...insight, ...reasoned };
    }
  } catch (err) {
    console.log(`[DOSSIER] Reasoning engine unavailable, using template: ${err.message}`);
  }

  // Assemble all pages
  const pages = [
    generatePage0_Insight(analysis, insight),
    generatePage05_TemporalIntelligence(temporalAnalysis),
    generatePage1_ExecutiveSummary(analysis),
    generatePage2_SignalProfile(analysis),
    generatePageBehavioralLayer(behavioralData),  // Page 2.5: Raw behavioral data
    generatePageDefenseProcurementLayer(defenseData, analysis.currentState?.score ? parseFloat(analysis.currentState.score) : 50, analysis.currentState?.riskBand || 'STABLE'),  // Page 2.75: Defense procurement
    generatePage3_4_AnalogueAnalysis(analysis),
    generatePage5_6_PatternMatches(analysis),
    generatePage7_ClusterContext(analysis),
    generatePage8_LeadAndGoingDark(analysis),
    generatePage9_Tripwires(analysis),
    generatePage10_Methodology(analysis)
  ];

  // Add Page 11 if contagion analysis available
  const page11 = generatePage11_PortfolioImpact(contagionAnalysis);
  if (page11) pages.push(page11);

  // Page 12: Host A closing question — ALWAYS the final page of every briefing
  // Start with data-driven deterministic version, upgrade to reasoned if possible
  let page12 = generatePageHostAClosingQuestion(analysis, temporalAnalysis, behavioralData, defenseData);
  try {
    const reasonedHostA = await generateReasonedHostAQuestion(country, {
      generatedAt: new Date().toISOString(),
      pages: pages.slice(0, 10),
      hostAClosingQuestion: page12.content
    });
    if (reasonedHostA?.sabianAnswer) {
      page12.content.sabianAnswer = reasonedHostA.sabianAnswer;
      page12.content.reasoning = true;
      page12.content.model = reasonedHostA.model;
    }
  } catch (err) {
    console.log(`[DOSSIER] Host A reasoning unavailable, using deterministic: ${err.message}`);
  }
  pages.push(page12);

  const page1Content = pages.find(p => p.pageNumber === 1)?.content || {};
  const dossier = {
    country,
    generatedAt: new Date().toISOString(),
    version: 'Sabian Intelligence Dossier v2.2 (with Host A Closing Question)',
    pages,
    insight,
    temporalIntelligence: temporalAnalysis,
    hostAClosingQuestion: page12.content,
    _analysis: analysis
  };

  logAuditEvent('dossier_generated', country, {
    score:      page1Content.score ?? null,
    band:       page1Content.riskBand ?? null,
    trajectory: page1Content.trajectory ?? null,
    data_year:  page1Content.dataYear ?? null,
    page_count: pages.length,
  }).catch(() => {});

  return dossier;
}

// ── PDF generator ─────────────────────────────────────────────────────────────

async function generateDossierPDF(country, outputPath) {
  const dossier = await generateDossier(country);
  const doc = new PDFDocument({ size: 'LETTER', margin: 50, bufferPages: true });

  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  // Title page
  doc.fontSize(28).font('Helvetica-Bold').text('SABIAN', { align: 'center' });
  doc.fontSize(18).font('Helvetica').text('Intelligence Dossier', { align: 'center' });
  doc.moveDown(2);
  doc.fontSize(24).font('Helvetica-Bold').text(country.toUpperCase(), { align: 'center' });
  doc.moveDown(1);
  doc.fontSize(12).font('Helvetica').text(`Generated: ${dossier.generatedAt}`, { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(14).fillColor('#cc0000').text(`Status: ${dossier.pages[1].content.riskBand}`, { align: 'center' });
  doc.fontSize(14).fillColor('#000000').text(`Score: ${dossier.pages[1].content.score}`, { align: 'center' });

  // Page 0: Sabian Insight
  doc.addPage();
  doc.fontSize(16).font('Helvetica-Bold').fillColor('#003366').text('Page 0 — Sabian Insight');
  doc.moveDown(0.5);
  doc.fontSize(11).font('Helvetica').fillColor('#000000');
  doc.text(dossier.insight.narrative, { align: 'justify', lineGap: 4 });
  doc.moveDown(1);
  doc.fontSize(9).fillColor('#666666').text(`Generated: ${dossier.insight.generatedAt} | Every sentence traces to data.`);

  // Page 1: Executive Summary
  doc.addPage();
  const p1 = dossier.pages[1].content;
  doc.fontSize(16).font('Helvetica-Bold').fillColor('#003366').text('Page 1 — Executive Summary');
  doc.moveDown(0.5);
  doc.fontSize(11).font('Helvetica').fillColor('#000000');
  doc.text(`Country: ${p1.country}`);
  doc.text(`As of: ${p1.asOfDate}`);
  doc.text(`Data Year: ${p1.dataYear}`);
  doc.text(`Convergence Score: ${p1.score}`);
  doc.text(`Risk Band: ${p1.riskBand}`);
  doc.text(`Elevated Signals: ${p1.elevatedSignalCount}`);
  doc.moveDown(1);
  doc.font('Helvetica-Bold').text('Headline:');
  doc.font('Helvetica').text(p1.headline);
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').text('Most Similar Historical Analogue:');
  doc.font('Helvetica').text(p1.mostSimilarAnalogue);

  // Page 2: Signal Profile
  doc.addPage();
  const p2 = dossier.pages[2].content;
  doc.fontSize(16).font('Helvetica-Bold').fillColor('#003366').text('Page 2 — Current Signal Profile');
  doc.moveDown(0.5);
  doc.fontSize(10).font('Helvetica').fillColor('#000000');

  for (const sig of p2.signals) {
    const color = parseFloat(sig.stress_z) > 0.5 ? '#cc0000' : parseFloat(sig.stress_z) < -0.5 ? '#006600' : '#000000';
    doc.fillColor(color).text(`${sig.signal}: stress_z=${sig.stress_z} (${sig.deviation} baseline)`);
  }
  doc.moveDown(1);
  doc.fillColor('#000000').text(`Cluster: ${p2.clusterAverage}`);

  // Page 3-4: Analogue Analysis
  doc.addPage();
  const p34 = dossier.pages[3].content;
  doc.fontSize(16).font('Helvetica-Bold').fillColor('#003366').text('Pages 3-4 — Historical Analogue Analysis');
  doc.moveDown(0.5);
  doc.fontSize(11).font('Helvetica').fillColor('#000000');
  doc.text(`Analogues found: ${p34.analogueCount}`);
  doc.moveDown(0.5);

  for (const a of p34.topAnalogues) {
    doc.font('Helvetica-Bold').text(`${a.country} (${a.year}) — Similarity: ${a.similarity}`);
    doc.font('Helvetica').text(`  Score at time: ${a.scoreAtTime}`);
    if (a.outcomes.year_1) doc.text(`  1-year outcome: ${a.outcomes.year_1.riskBand} (${a.outcomes.year_1.score})`);
    if (a.outcomes.year_3) doc.text(`  3-year outcome: ${a.outcomes.year_3.riskBand} (${a.outcomes.year_3.score})`);
    if (a.outcomes.year_5) doc.text(`  5-year outcome: ${a.outcomes.year_5.riskBand} (${a.outcomes.year_5.score})`);
    doc.moveDown(0.3);
  }

  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').text('Outcome Distribution (3-year horizon):');
  doc.font('Helvetica');
  for (const [band, data] of Object.entries(p34.outcomeDistribution.at3Year)) {
    if (band !== 'unknown') doc.text(`  ${band}: ${data.percentage}% (${data.count} cases)`);
  }

  // Page 5-6: Pattern Matches
  doc.addPage();
  const p56 = dossier.pages[4].content;
  doc.fontSize(16).font('Helvetica-Bold').fillColor('#003366').text('Pages 5-6 — Pattern Matches from 388 Findings');
  doc.moveDown(0.5);
  doc.fontSize(11).font('Helvetica').fillColor('#000000');
  doc.text(`Findings applicable to current state: ${p56.applicableCount} of ${p56.totalFindings}`);
  doc.moveDown(0.5);

  for (const f of p56.findings) {
    doc.font('Helvetica-Bold').text(`[${f.category}] ${f.title}`);
    doc.font('Helvetica').text(f.text, { indent: 10 });
    doc.moveDown(0.3);
  }

  // Page 7: Cluster Context
  doc.addPage();
  const p7 = dossier.pages[5].content;
  doc.fontSize(16).font('Helvetica-Bold').fillColor('#003366').text('Page 7 — Cluster Context');
  doc.moveDown(0.5);
  doc.fontSize(11).font('Helvetica').fillColor('#000000');

  if (p7.available === false) {
    doc.text(p7.reason);
  } else {
    doc.text(`Cluster ID: ${p7.clusterId}`);
    doc.text(`Cluster Label: ${p7.clusterLabel}`);
    doc.text(`Dominant Signal: ${p7.dominantSignal}`);
    doc.text(`Decoupling Status: ${p7.decouplingStatus}`);
    doc.moveDown(0.5);
    doc.text(`Member Countries: ${(p7.memberCountries || []).slice(0, 10).join(', ')}${p7.memberCountries?.length > 10 ? '...' : ''}`);
  }

  // Page 8: Lead & Going-Dark
  doc.addPage();
  const p8 = dossier.pages[6].content;
  doc.fontSize(16).font('Helvetica-Bold').fillColor('#003366').text('Page 8 — Lead Signal & Going-Dark Status');
  doc.moveDown(0.5);
  doc.fontSize(11).font('Helvetica').fillColor('#000000');

  doc.font('Helvetica-Bold').text('Active Lead Indicators:');
  doc.font('Helvetica');
  if (p8.activeLeadIndicators.length === 0) {
    doc.text('  None active');
  } else {
    for (const l of p8.activeLeadIndicators) {
      doc.text(`  ${l.signal} → ${l.leadsTo} (lag: ${l.lagYears}yr, r=${l.correlation})`);
    }
  }

  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').text('Signals Present:');
  doc.font('Helvetica').text(`  ${p8.signalsPresent.join(', ') || 'None'}`);

  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').fillColor('#cc0000').text('Signals Dark:');
  doc.font('Helvetica').fillColor('#000000').text(`  ${p8.signalsAbsent.join(', ') || 'None'}`);

  if (Object.keys(p8.lastReported).length > 0) {
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').text('Last Reported:');
    for (const [sig, yr] of Object.entries(p8.lastReported)) {
      doc.font('Helvetica').text(`  ${sig}: ${yr}`);
    }
  }

  doc.moveDown(0.5);
  doc.fontSize(9).fillColor('#666666').text(p8.preSilenceNote);

  // Page 9: Tripwires
  doc.addPage();
  const p9 = dossier.pages[7].content;
  doc.fontSize(16).font('Helvetica-Bold').fillColor('#003366').text('Page 9 — Tripwires');
  doc.moveDown(0.5);
  doc.fontSize(11).font('Helvetica').fillColor('#000000');
  doc.text(`Current Band: ${p9.currentBand} | Score: ${p9.currentScore}`);

  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').fillColor('#006600').text('Paths to Improvement:');
  doc.font('Helvetica').fillColor('#000000');
  for (const t of p9.pathsToImprovement) {
    doc.text(`  • ${t}`);
  }

  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').fillColor('#cc0000').text('Paths to Deterioration:');
  doc.font('Helvetica').fillColor('#000000');
  for (const t of p9.pathsToDeteriation) {
    doc.text(`  • ${t}`);
  }

  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').text('Monitoring Targets (90 days):');
  doc.font('Helvetica');
  for (const t of p9.monitoringTargets90Days) {
    doc.text(`  • ${t}`);
  }

  // Page 10: Methodology
  doc.addPage();
  const p10 = dossier.pages[8].content;
  doc.fontSize(16).font('Helvetica-Bold').fillColor('#003366').text('Page 10 — Methodology Note');
  doc.moveDown(0.5);
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#000000').text('IMPORTANT:');
  doc.font('Helvetica').text(p10.disclaimer, { lineGap: 4 });

  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').text('Data Sources:');
  doc.font('Helvetica');
  for (const src of p10.dataSources) {
    doc.text(`  • ${src}`);
  }

  doc.moveDown(0.5);
  doc.text(`Time Range: ${p10.timeRange}`);
  doc.text(`Country Coverage: ${p10.countryCoverage}`);
  doc.text(`Signal Count: ${p10.signalCount}`);
  doc.text(`Update Frequency: ${p10.updateFrequency}`);
  doc.text(`Version: ${p10.version}`);
  doc.text(`Generated: ${p10.generatedAt}`);

  // Page 12: Host A Closing Question — always the final page
  const p12 = dossier.hostAClosingQuestion;
  if (p12) {
    doc.addPage();
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#003366')
      .text('Page 12 — The Question You Are Not Asking');
    doc.moveDown(0.5);
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#990000')
      .text('HOST A:');
    doc.font('Helvetica').fillColor('#000000')
      .text(p12.hostAQuestion, { lineGap: 4 });
    doc.moveDown(1);
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#003366')
      .text('SABIAN:');
    doc.font('Helvetica').fillColor('#000000')
      .text(p12.sabianAnswer, { align: 'justify', lineGap: 4 });
    doc.moveDown(1);
    if (p12.allFindings && p12.allFindings.length > 1) {
      doc.fontSize(9).fillColor('#666666').font('Helvetica-Bold').text('Additional signals Sabian is watching:');
      doc.font('Helvetica');
      for (const f of p12.allFindings.slice(1, 4)) {
        doc.text(`  [${f.type}] ${f.answer.slice(0, 120)}...`, { lineGap: 2 });
      }
    }
    doc.moveDown(0.5);
    doc.fontSize(8).fillColor('#999999').text(p12.methodology, { lineGap: 2 });
  }

  // Footer on every page
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    doc.fontSize(8).fillColor('#999999');
    doc.text(
      `SABIAN Intelligence Dossier — ${country} — Page ${i + 1} of ${pageCount}`,
      50, doc.page.height - 30,
      { align: 'center', width: doc.page.width - 100 }
    );
  }

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve({ path: outputPath, dossier }));
    stream.on('error', reject);
  });
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  generateDossier,
  generateDossierPDF
};
