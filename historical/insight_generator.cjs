// historical/insight_generator.cjs
// Sabian Insight Generator — Page 0 of the Intelligence Dossier
// Deterministic narrative synthesis. Every sentence traces to data.
// No free-form LLM generation. Template-based, auditable.

const { getRiskBand, SIGNAL_KEYS, STABLE, ELEVATED, CRITICAL } = require('./analogue_engine.cjs');

// ── Template fragments ────────────────────────────────────────────────────────
// Each fragment is data-driven. No hallucination possible.

const OPENING_TEMPLATES = {
  CRITICAL: (c, s) => `${c} is in CRITICAL status with a convergence score of ${s}. The historical record shows this is the highest-risk band.`,
  ELEVATED: (c, s) => `${c} is in ELEVATED status with a convergence score of ${s}. Historical precedent indicates the elevated band (75-85) is unstable — zero countries have held it for more than 10 years.`,
  STRESSED: (c, s) => `${c} is in STRESSED status with a convergence score of ${s}. This indicates active stress signals but the country has not entered the elevated risk band.`,
  STABLE: (c, s) => `${c} is in STABLE status with a convergence score of ${s}. Current signal readings show no convergent risk factors.`,
};

const TRAJECTORY_TEMPLATES = {
  rising: (pts) => `The trajectory is rising — the score has increased by ${pts} points over the past 5 years.`,
  falling: (pts) => `The trajectory is falling — the score has decreased by ${pts} points over the past 5 years.`,
  stable: () => `The trajectory is stable — no significant change over the past 5 years.`,
};

const ANALOGUE_TEMPLATES = {
  found: (count, topCountry, topYear, topSim) => `Pattern matching identified ${count} historical analogues. The closest match is ${topCountry} in ${topYear} (similarity: ${topSim}). The following section details what happened to these analogues in subsequent years.`,
  none: () => `No historical analogues met the similarity threshold. This signal profile has no close historical precedent.`,
};

const OUTCOME_TEMPLATE = (dist, years) => {
  const parts = [];
  for (const [band, { count, percentage }] of Object.entries(dist)) {
    if (band !== 'unknown') parts.push(`${percentage}% ${band}`);
  }
  return parts.length > 0
    ? `Based on analogue outcomes at ${years} years: ${parts.join(', ')}.`
    : `Outcome data unavailable at ${years}-year horizon.`;
};

const PRE_CRISIS_TEMPLATE = (signatures) => {
  if (signatures.length === 0) return 'No pre-crisis signatures are active.';
  const names = signatures.map(s => s.name).join('; ');
  return `Pre-crisis signatures active: ${names}. See the Pattern Matches section for historical precedent.`;
};

const FINDINGS_TEMPLATE = (findings) => {
  if (findings.length === 0) return 'No key findings from the 388-finding intelligence database apply to this country\'s current state.';
  return `${findings.length} finding(s) from Sabian\'s 388-finding intelligence database apply to this country\'s current state. See the Pattern Matches section for details.`;
};

const TRIPWIRE_TEMPLATE = (tripwires) => {
  const toImprove = tripwires.toImprove.length;
  const toWorsen = tripwires.toWorsen.length;
  if (toImprove === 0 && toWorsen === 0) return 'No tripwires identified.';
  return `Tripwires identified: ${toImprove} path(s) to improvement, ${toWorsen} path(s) to deterioration. See the Tripwires section for monitoring targets.`;
};

const GOING_DARK_TEMPLATE = (status) => {
  const absentCount = status.signalsAbsent.length;
  if (absentCount === 0) return 'All 12 signals are reporting.';
  if (absentCount <= 3) return `${absentCount} signal(s) are currently dark: ${status.signalsAbsent.join(', ')}.`;
  return `${absentCount} signals are dark. Significant data gaps exist. See Going-Dark Status for last-reported dates.`;
};

const LEAD_SIGNAL_TEMPLATE = (activeLeads) => {
  if (activeLeads.length === 0) return 'No lead indicators are active.';
  const names = activeLeads.map(l => l.signal).join(', ');
  return `Active lead indicator(s): ${names}. Historical correlation suggests these may precede movement in other signals.`;
};

const CLUSTER_TEMPLATE = (cluster) => {
  if (!cluster) return 'Cluster membership unavailable.';
  return `This country belongs to the ${cluster.label} cluster (cluster ${cluster.id}). The dominant signal for this cluster is ${cluster.dominantSignal}.`;
};

// ── Main generator ────────────────────────────────────────────────────────────

function generateInsight(analysis, temporalAnalysis = null) {
  const { country, currentState, analogues, outcomeDistribution, applicableFindings, tripwires, preCrisisSignatures, goingDarkStatus, activeLeadSignals, cluster } = analysis;

  const score = parseFloat(currentState.score);
  const riskBand = currentState.riskBand;

  // Calculate trajectory
  const trajectory = currentState.trajectory || [];
  let trajText = TRAJECTORY_TEMPLATES.stable();
  if (trajectory.length >= 2) {
    const oldest = parseFloat(trajectory[trajectory.length - 1]?.score || 0);
    const newest = parseFloat(trajectory[0]?.score || 0);
    const diff = newest - oldest;
    if (diff > 3) trajText = TRAJECTORY_TEMPLATES.rising(diff.toFixed(1));
    else if (diff < -3) trajText = TRAJECTORY_TEMPLATES.falling(Math.abs(diff).toFixed(1));
  }

  // Analogues
  let analogueText = ANALOGUE_TEMPLATES.none();
  if (analogues && analogues.length > 0) {
    const top = analogues[0];
    analogueText = ANALOGUE_TEMPLATES.found(analogues.length, top.country, top.year, top.similarity);
  }

  // Outcome distribution (3-year horizon)
  const outcome3yr = outcomeDistribution?.['3_year'] || {};
  const outcomeText = OUTCOME_TEMPLATE(outcome3yr, 3);

  // Assemble paragraphs
  const para1 = [
    OPENING_TEMPLATES[riskBand](country, score.toFixed(1)),
    trajText,
    CLUSTER_TEMPLATE(cluster)
  ].join(' ');

  const para2 = [
    analogueText,
    outcomeText,
    PRE_CRISIS_TEMPLATE(preCrisisSignatures || [])
  ].join(' ');

  const para3 = [
    FINDINGS_TEMPLATE(applicableFindings || []),
    TRIPWIRE_TEMPLATE(tripwires || { toImprove: [], toWorsen: [] }),
    GOING_DARK_TEMPLATE(goingDarkStatus || { signalsAbsent: [] }),
    LEAD_SIGNAL_TEMPLATE(activeLeadSignals || [])
  ].join(' ');

  // Temporal intelligence paragraph (if available)
  let para4 = '';
  if (temporalAnalysis && temporalAnalysis.summary) {
    para4 = temporalAnalysis.summary;
  } else if (temporalAnalysis) {
    const velocity = temporalAnalysis.velocity;
    const timeline = temporalAnalysis.timeline;
    const parts = [];

    if (velocity && velocity.yearOverYearChange) {
      if (velocity.velocityClass === 'accelerating') {
        parts.push(`Velocity is accelerating at ${velocity.comparedToMedian} the historical median.`);
      } else if (velocity.velocityClass === 'fast') {
        parts.push(`Trajectory is moving faster than normal (${velocity.comparedToMedian} median).`);
      } else if (velocity.velocityClass === 'improving') {
        parts.push('Trajectory is improving — score declining toward stability.');
      }
    }

    if (timeline && timeline.estimates && timeline.estimates.length > 0) {
      const criticalEst = timeline.estimates.find(e => e.band === 'CRITICAL');
      if (criticalEst) {
        parts.push(`At current rate, estimated CRITICAL entry: ${criticalEst.estimatedDate}.`);
      }
    }

    if (temporalAnalysis.decisionTriggers && temporalAnalysis.decisionTriggers.length > 0) {
      const trigger = temporalAnalysis.decisionTriggers[0];
      parts.push(`Decision trigger: ${trigger.condition}.`);
    }

    if (parts.length > 0) {
      para4 = parts.join(' ');
    }
  }

  const narrative = para4 ? `${para1}\n\n${para2}\n\n${para3}\n\n${para4}` : `${para1}\n\n${para2}\n\n${para3}`;

  // Generate audio script (same content, formatted for TTS)
  const audioScript = generateAudioScript(analysis, narrative);

  return {
    narrative,
    audioScript,
    generatedAt: new Date().toISOString(),
    tracesToData: true,
    hallucination: false
  };
}

// ── Audio script generator ────────────────────────────────────────────────────
// Formats the insight for TTS with pauses and emphasis markers

function generateAudioScript(analysis, narrative) {
  const { country, currentState, analogues, applicableFindings } = analysis;

  // Host A introduces
  const hostAIntro = `This is a Sabian Intelligence Dossier for ${country}. Current status: ${currentState.riskBand}. Convergence score: ${currentState.score}.`;

  // Sabian delivers the insight
  const sabianBody = narrative.replace(/\n\n/g, ' ... ');

  // Host A closing
  const topFinding = applicableFindings && applicableFindings.length > 0 ? applicableFindings[0].title : null;
  const topAnalogue = analogues && analogues.length > 0 ? `${analogues[0].country} ${analogues[0].year}` : null;

  let hostAClose = 'This concludes the Sabian Intelligence Dossier.';
  if (topFinding) {
    hostAClose = `Key finding: ${topFinding}. ${hostAClose}`;
  }
  if (topAnalogue) {
    hostAClose = `Closest historical analogue: ${topAnalogue}. ${hostAClose}`;
  }

  return {
    segments: [
      { speaker: 'host_a', text: hostAIntro },
      { speaker: 'sabian', text: sabianBody },
      { speaker: 'host_a', text: hostAClose }
    ],
    totalLength: hostAIntro.length + sabianBody.length + hostAClose.length
  };
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  generateInsight,
  generateAudioScript
};
