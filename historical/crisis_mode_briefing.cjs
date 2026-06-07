// historical/crisis_mode_briefing.cjs
// CRISIS MODE BRIEFING FORMAT
// Activated when weather + communication + power fire simultaneously
// Different format: immediate actions, resources needed, timeline compression

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

function generateCrisisBriefing(country, crisisTriggers, analysis) {
  const briefing = {
    mode: 'CRISIS',
    country,
    triggeredAt: new Date().toISOString(),
    alerts: {
      level: 'CRITICAL',
      triggers: crisisTriggers,
      message: 'Three-signal combination detected: Weather + Communication + Power'
    },

    // Page 0: CRISIS EXECUTIVE SUMMARY
    page0: {
      title: 'CRISIS MODE ACTIVATED',
      status: 'Multiple infrastructure systems failing simultaneously',
      triggers: [
        `Weather: ${crisisTriggers.weather} (${crisisTriggers.weather_value})`,
        `Communication: ${crisisTriggers.communication} (${crisisTriggers.communication_value})`,
        `Power: ${crisisTriggers.power} (${crisisTriggers.power_value})`
      ],
      immediateRisk: {
        score: analysis.currentState?.score || null,
        band: analysis.currentState?.riskBand || 'UNKNOWN',
        trajectory: analysis.trajectory || 'unknown',
        severity: crisisTriggers.severity || 'high'
      },
      timeframe: 'Hours to days (not weeks)',
      criticalGaps: [
        'Communication infrastructure compromised',
        'Power grid instability',
        'Weather/environmental event in progress',
        'Standard reporting may be delayed or unavailable'
      ]
    },

    // Page 1: IMMEDIATE SITUATION
    page1: {
      title: 'Immediate Situation Assessment',
      groundTruth: {
        weather: {
          signal: crisisTriggers.weather,
          value: crisisTriggers.weather_value,
          interpretation: crisisTriggers.weather === 'fire_hotspot'
            ? 'Active fire event or extreme heat'
            : 'Seismic activity or geological instability'
        },
        communication: {
          signal: crisisTriggers.communication,
          value: crisisTriggers.communication_value,
          interpretation: 'News tone collapsed - reporting breakdown or censorship'
        },
        power: {
          signal: crisisTriggers.power,
          value: crisisTriggers.power_value,
          interpretation: 'Power grid under stress - potential cascading failures'
        }
      },
      convergenceScore: analysis.currentState?.score || null,
      historicalContext: 'Crisis combination trigger is RARE. When all three fire simultaneously, historical record shows exceptional events only.'
    },

    // Page 2: RESOURCE REQUIREMENTS
    page2: {
      title: 'Resource Requirements',
      immediate: [
        'Emergency communication infrastructure (satellite)',
        'Power generation capacity (mobile/backup)',
        'Weather monitoring (real-time updates)',
        'Humanitarian assessment teams',
        'Supply chain contingency activation'
      ],
      monitoring: [
        'Copernicus Emergency Management Service (CEMS) - active monitoring',
        'GDACS alerts - disaster coordination',
        'HDX humanitarian datasets - ground truth',
        'Local news sources (if available)',
        'Diaspora networks for independent verification'
      ],
      escalation: {
        condition: 'If score crosses 85 OR additional infrastructure systems fail',
        action: 'Activate full humanitarian response protocols'
      }
    },

    // Page 3: TIMELINE & DECISION TRIGGERS
    page3: {
      title: 'Compressed Timeline',
      now: {
        time: '0-6 hours',
        actions: [
          'Confirm crisis trigger accuracy',
          'Activate emergency communication channels',
          'Brief key stakeholders',
          'Position resources'
        ]
      },
      near: {
        time: '6-24 hours',
        actions: [
          'Assess ground situation via independent sources',
          'Monitor for cascading failures',
          'Track population movement (if data available)',
          'Update resource deployment'
        ]
      },
      extended: {
        time: '24-72 hours',
        actions: [
          'Re-assess convergence score with new data',
          'Evaluate response effectiveness',
          'Adjust resource allocation',
          'Prepare for extended operations if needed'
        ]
      },
      decisionTriggers: [
        'Score increase >10 points = escalate response',
        'Additional infrastructure failure = full activation',
        'Communication restoration = reassess crisis level',
        'Weather event resolution = monitor for secondary effects'
      ]
    },

    // Page 4: HISTORICAL ANALOGS (if any exist)
    page4: {
      title: 'Historical Context',
      note: 'Three-signal crisis combination is RARE in historical record.',
      analogCases: analysis.analogues || [],
      finding: 'When weather, communication, and power fail simultaneously, standard monitoring breaks down. Ground truth becomes primary intelligence source.'
    },

    metadata: {
      generatedAt: new Date().toISOString(),
      mode: 'crisis',
      format: 'compressed',
      sources: ['SIPRI', 'GDELT', 'Historical signals', 'Copernicus (when integrated)', 'GDACS (when integrated)', 'HDX (when integrated)']
    }
  };

  return briefing;
}

function generateStandardBriefing(country, analysis) {
  // Standard 12-page dossier format (existing implementation)
  return {
    mode: 'STANDARD',
    country,
    format: '12-page intelligence dossier',
    note: 'Crisis mode not activated. Standard briefing format.'
  };
}

function selectBriefingMode(country, signals, analysis) {
  // Check if crisis triggers are active
  const crisisTriggers = checkCrisisTriggers(signals);

  if (crisisTriggers) {
    return generateCrisisBriefing(country, crisisTriggers, analysis);
  }

  return generateStandardBriefing(country, analysis);
}

function checkCrisisTriggers(signals) {
  // Check for three-signal combination
  const weatherTrigger = signals.fire_hotspot >= 80 || signals.seismic_risk >= 75;
  const commTrigger = signals.gdelt_tone <= -5;
  const powerTrigger = signals.power_grid >= 70;

  if (weatherTrigger && commTrigger && powerTrigger) {
    return {
      weather: signals.fire_hotspot >= 80 ? 'fire_hotspot' : 'seismic_risk',
      weather_value: signals.fire_hotspot >= 80 ? signals.fire_hotspot : signals.seismic_risk,
      communication: 'gdelt_tone',
      communication_value: signals.gdelt_tone,
      power: 'power_grid',
      power_value: signals.power_grid,
      severity: calculateCrisisSeverity(signals)
    };
  }

  return null;
}

function calculateCrisisSeverity(signals) {
  let severity = 0;

  if (signals.fire_hotspot) severity += Math.max(0, signals.fire_hotspot - 80);
  if (signals.seismic_risk) severity += Math.max(0, signals.seismic_risk - 75);
  if (signals.gdelt_tone) severity += Math.abs(Math.min(0, signals.gdelt_tone + 5));
  if (signals.power_grid) severity += Math.max(0, signals.power_grid - 70);

  return severity;
}

module.exports = {
  generateCrisisBriefing,
  generateStandardBriefing,
  selectBriefingMode,
  checkCrisisTriggers
};

// Test crisis briefing generation
if (require.main === module) {
  const mockTriggers = {
    weather: 'fire_hotspot',
    weather_value: 85,
    communication: 'gdelt_tone',
    communication_value: -8,
    power: 'power_grid',
    power_value: 75,
    severity: 18
  };

  const mockAnalysis = {
    currentState: {
      score: 78,
      riskBand: 'ELEVATED'
    },
    trajectory: 'rising',
    analogues: []
  };

  const briefing = generateCrisisBriefing('Test Country', mockTriggers, mockAnalysis);

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('CRISIS MODE BRIEFING FORMAT - SAMPLE OUTPUT');
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log(JSON.stringify(briefing, null, 2));
  console.log('\n✅ Crisis briefing format generated successfully');
}
