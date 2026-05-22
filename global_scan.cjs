// global_scan.cjs
// Sabian Global Intelligence Scan -- all active conflict + high-risk countries
// Runs convergence engine across every monitored country simultaneously
// Output: ranked threat table, sorted by score descending
// Exposes: latent patterns across all theaters that no single analyst can see
//
// Usage:
//   node global_scan.cjs                    -- full scan, all 50 countries
//   node global_scan.cjs 2026-03-01         -- retroactive scan at a specific date
//   node global_scan.cjs --critical-only    -- only show WARNING and CRITICAL
//   node global_scan.cjs --save             -- save results to global_scan_results/

require('dotenv').config({ path: './.env' });
const fs = require('fs');
const path = require('path');
const runConvergence = require('./convergence_engine.cjs');
const { logToHive } = require('./logger.cjs');
const { saveConvergenceScore, saveSignalReadings, saveGlobalScan, getLatestScores } = require('./sabian_persistence.cjs');
const { createObservation } = require('./observation_ledger.cjs');
const { checkAndAlert } = require('./sabian_alert.cjs');
const runBriefing = require('./government_briefing.cjs');

// All monitored countries — active conflicts first, then threshold watch, then global watch
// 90-day autonomous run begins 2026-05-21. By 2026-08-21 Sabian will have seen every pattern.
const ACTIVE_CONFLICTS = [
  // High-intensity active conflict
  'Sudan', 'Myanmar', 'Yemen', 'Syria', 'DRC', 'Somalia', 'Afghanistan',
  'South Sudan', 'CAR', 'Mali', 'Burkina Faso', 'Niger', 'Ethiopia',
  'Nigeria', 'Mozambique', 'Chad', 'Libya', 'Haiti', 'Venezuela',
  'Israel', 'Palestine', 'Ukraine', 'Lebanon', 'Iraq', 'Pakistan',
  'Colombia', 'Cameroon', 'Armenia', 'Georgia', 'Russia', 'Myanmar',
  'Philippines', 'Indonesia', 'Mexico'
];

const THRESHOLD_WATCH = [
  // Elevated risk — watching for crossing
  'Iran', 'Zimbabwe', 'Bangladesh', 'Sri Lanka', 'Kenya', 'Uganda',
  'Tanzania', 'Zambia', 'Senegal', 'Guinea', 'Ecuador', 'Bolivia',
  'Eritrea', 'Djibouti', 'Kosovo', 'Bosnia', 'Taiwan', 'North Korea',
  'Belarus', 'Moldova', 'Serbia', 'Azerbaijan', 'Kyrgyzstan', 'Tajikistan',
  'Turkmenistan', 'Uzbekistan', 'Kazakhstan', 'Peru', 'Brazil', 'Nicaragua',
  'Honduras', 'Guatemala', 'El Salvador', 'Cuba', 'Angola', 'Rwanda',
  'Burundi', 'Malawi', 'Guinea-Bissau', 'Sierra Leone', 'Liberia',
  'Togo', 'Benin', 'Mauritania', 'Tunisia', 'Algeria', 'Morocco',
  'Egypt', 'Jordan', 'Saudi Arabia', 'Yemen', 'Oman', 'Kuwait',
  'Vietnam', 'Cambodia', 'Laos', 'Nepal', 'India', 'Timor-Leste',
  'Papua New Guinea', 'Solomon Islands', 'Fiji'
];

const GLOBAL_WATCH = [
  // Global baseline — all major states, stable now but watched for emergence
  'Turkey', 'Greece', 'Bulgaria', 'Romania', 'Hungary', 'Poland',
  'Slovakia', 'Croatia', 'North Macedonia', 'Montenegro', 'Albania',
  'China', 'South Korea', 'Japan', 'Mongolia', 'Thailand', 'Malaysia',
  'Singapore', 'Vietnam', 'Australia', 'New Zealand', 'India',
  'South Africa', 'Ghana', 'Ivory Coast', 'Gabon', 'Congo',
  'Equatorial Guinea', 'Namibia', 'Botswana', 'Uganda',
  'Argentina', 'Chile', 'Paraguay', 'Uruguay', 'Guyana',
  'Suriname', 'Trinidad and Tobago', 'Panama', 'Costa Rica',
  'Dominican Republic', 'Jamaica', 'Belize',
  'UAE', 'Qatar', 'Bahrain', 'Israel',
  'Ukraine', 'UK', 'France', 'Germany', 'Spain', 'Italy',
  'Portugal', 'Sweden', 'Finland', 'Norway', 'Denmark',
  'Netherlands', 'Belgium', 'Austria', 'Switzerland', 'Cyprus',
  'United States'
];

const ALL_COUNTRIES = [
  ...new Set([...ACTIVE_CONFLICTS, ...THRESHOLD_WATCH, ...GLOBAL_WATCH])
];

const RISK_COLORS = {
  CRITICAL: '\x1b[31m',  // red
  WARNING:  '\x1b[33m',  // yellow
  ELEVATED: '\x1b[36m',  // cyan
  STABLE:   '\x1b[32m',  // green
  RESET:    '\x1b[0m'
};

// Run in batches to avoid overwhelming APIs
const BATCH_SIZE = 8;
const BATCH_DELAY_MS = 2000;

async function runGlobalScan(date, options = {}) {
  const scanDate = date || new Date().toISOString().slice(0, 10);
  const startTime = Date.now();

  console.log(`\n${'='.repeat(70)}`);
  console.log(`  SABIAN GLOBAL INTELLIGENCE SCAN`);
  console.log(`  ${scanDate} -- ${ALL_COUNTRIES.length} countries across all theaters`);
  console.log(`${'='.repeat(70)}\n`);

  const results = [];
  const errors = [];

  // Fetch previous scores + levels before this scan runs — used for crossing detection
  let previousScoreMap = {};
  let previousLevelMap = {};
  if (process.env.SUPABASE_URL && !process.env.SUPABASE_SERVICE_ROLE_KEY?.startsWith('PASTE')) {
    const prev = await getLatestScores().catch(() => []);
    if (Array.isArray(prev)) {
      for (const row of prev) {
        previousScoreMap[row.country] = row.convergence_score;
        previousLevelMap[row.country] = row.risk_level;
      }
    }
  }

  // Process in batches
  for (let i = 0; i < ALL_COUNTRIES.length; i += BATCH_SIZE) {
    const batch = ALL_COUNTRIES.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(ALL_COUNTRIES.length / BATCH_SIZE);

    process.stdout.write(`  Scanning batch ${batchNum}/${totalBatches}: ${batch.join(', ')}...\n`);

    const batchResults = await Promise.allSettled(
      batch.map(country => runConvergence(country, date))
    );

    const persistBatch = [];
    for (let j = 0; j < batch.length; j++) {
      const country = batch[j];
      const result = batchResults[j];
      const theater = getTheater(country);

      if (result.status === 'fulfilled' && !result.value.error) {
        const enriched = {
          country,
          ...result.value,
          theater,
          category: ACTIVE_CONFLICTS.includes(country) ? 'ACTIVE_CONFLICT' : 'THRESHOLD_WATCH'
        };
        results.push(enriched);

        // Persist to Supabase (fire-and-forget -- don't block scan for DB writes)
        if (process.env.SUPABASE_URL && !process.env.SUPABASE_SERVICE_ROLE_KEY?.startsWith('PASTE')) {
          persistBatch.push(
            saveConvergenceScore(country, scanDate, result.value, theater)
              .catch(() => {}),
            saveSignalReadings(country, scanDate, result.value.signals || [])
              .catch(() => {})
          );
        }
      } else {
        const msg = result.status === 'rejected' ? result.reason?.message : result.value?.error;
        errors.push({ country, error: msg });
      }
    }
    if (persistBatch.length) await Promise.allSettled(persistBatch);

    // Delay between batches (skip after last batch)
    if (i + BATCH_SIZE < ALL_COUNTRIES.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  // Sort by convergence score descending
  results.sort((a, b) => (b.convergence_score || 0) - (a.convergence_score || 0));

  // ── Threshold crossing detection → observation ledger ─────────────────────
  // Any country that changed risk band since the last scan gets a ledger entry.
  if (process.env.SUPABASE_URL && !process.env.SUPABASE_SERVICE_ROLE_KEY?.startsWith('PASTE')) {
    const crossings = [];
    for (const r of results) {
      const prevLevel = previousLevelMap[r.country] || null;
      const currLevel = r.risk_level;
      if (prevLevel && prevLevel !== currLevel) {
        const direction = bandRank(currLevel) > bandRank(prevLevel) ? 'ASCENDING' : 'DESCENDING';
        crossings.push(
          createObservation({
            country:             r.country,
            scan_date:           scanDate,
            convergence_score:   r.convergence_score,
            risk_level:          currLevel,
            previous_risk_level: prevLevel,
            direction
          }).catch(() => {})
        );
      }
    }
    if (crossings.length) {
      await Promise.allSettled(crossings);
      console.log(`\n  Ledger: ${crossings.length} threshold crossing(s) recorded`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // ── Print ranked threat table ──────────────────────────────────────────────
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  GLOBAL THREAT RANKING -- ${scanDate}`);
  console.log(`${'='.repeat(70)}`);
  console.log(`  ${'RANK'.padEnd(6)}${'COUNTRY'.padEnd(20)}${'SCORE'.padEnd(8)}${'LEVEL'.padEnd(12)}${'THEATER'.padEnd(12)}TOP SIGNAL`);
  console.log(`  ${'-'.repeat(66)}`);

  results.forEach((r, idx) => {
    if (options.criticalOnly && !['CRITICAL', 'WARNING'].includes(r.risk_level)) return;

    const color = RISK_COLORS[r.risk_level] || '';
    const reset = RISK_COLORS.RESET;
    const rank = `${idx + 1}.`.padEnd(6);
    const country = r.country.padEnd(20);
    const score = `${r.convergence_score}`.padEnd(8);
    const level = `${color}${r.risk_level}${reset}`.padEnd(12 + color.length + reset.length);
    const theater = (r.theater || '').padEnd(12);
    const topSignal = r.top_3_signals?.[0]
      ? `${r.top_3_signals[0].name} (${r.top_3_signals[0].score})`
      : 'n/a';

    console.log(`  ${rank}${country}${score}${level}${theater}${topSignal}`);
  });

  // ── Summary statistics ─────────────────────────────────────────────────────
  const critical = results.filter(r => r.risk_level === 'CRITICAL');
  const warning  = results.filter(r => r.risk_level === 'WARNING');
  const elevated = results.filter(r => r.risk_level === 'ELEVATED');
  const stable   = results.filter(r => r.risk_level === 'STABLE');

  console.log(`\n${'='.repeat(70)}`);
  console.log(`  SUMMARY`);
  console.log(`${'='.repeat(70)}`);
  console.log(`  ${RISK_COLORS.CRITICAL}CRITICAL${RISK_COLORS.RESET}  ${critical.length} countries  ${critical.map(r => r.country).join(', ') || 'none'}`);
  console.log(`  ${RISK_COLORS.WARNING}WARNING${RISK_COLORS.RESET}   ${warning.length} countries  ${warning.map(r => r.country).join(', ') || 'none'}`);
  console.log(`  ${RISK_COLORS.ELEVATED}ELEVATED${RISK_COLORS.RESET}  ${elevated.length} countries`);
  console.log(`  ${RISK_COLORS.STABLE}STABLE${RISK_COLORS.RESET}    ${stable.length} countries`);
  console.log(`  Failed:    ${errors.length} countries  ${errors.map(e => e.country).join(', ') || 'none'}`);
  console.log(`  Scan time: ${elapsed}s`);

  // ── Pattern detection ──────────────────────────────────────────────────────
  const patterns = detectPatterns(results);
  if (patterns.length) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`  LATENT PATTERNS DETECTED`);
    console.log(`${'='.repeat(70)}`);
    patterns.forEach(p => console.log(`  >> ${p}`));
  }

  console.log(`\n${'='.repeat(70)}\n`);

  // ── Threshold crossing alerts + auto-briefing ──────────────────────────────
  const alertCandidates = results.filter(r => (r.convergence_score || 0) >= 66);
  if (alertCandidates.length) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`  ALERT CHECK — ${alertCandidates.length} countries at WARNING+`);
    console.log(`${'='.repeat(70)}`);
    const alertResults = await Promise.allSettled(
      alertCandidates.map(r => checkAndAlert(r, previousScoreMap[r.country] ?? null))
    );
    const fired = alertResults.filter(r => r.status === 'fulfilled' && r.value?.alerted).length;
    console.log(`  Alerts fired: ${fired} of ${alertCandidates.length} checked`);

    // Auto-brief every new threshold crossing — fire non-blocking, scan does not wait
    const newCrossings = alertCandidates.filter((r, i) =>
      alertResults[i]?.status === 'fulfilled' && alertResults[i]?.value?.alerted
    );
    if (newCrossings.length) {
      console.log(`\n${'='.repeat(70)}`);
      console.log(`  AUTO-BRIEFING — ${newCrossings.length} new threshold crossing(s)`);
      console.log(`${'='.repeat(70)}`);
      for (const r of newCrossings) {
        console.log(`  >> Queuing briefing: ${r.country} (${r.risk_level} ${r.convergence_score})`);
        runBriefing(r.country, 'forward', scanDate)
          .then(result => {
            if (result.status === 'complete') {
              console.log(`  [BRIEFING DONE] ${r.country} → ${result.audio_path}`);
            } else {
              console.log(`  [BRIEFING FAILED] ${r.country}: ${result.error}`);
            }
          })
          .catch(err => console.log(`  [BRIEFING ERR] ${r.country}: ${err.message}`));
      }
      console.log(`  Briefings generating — audio will appear in audio_sessions/gov/`);
    }
  }

  // ── Persist global scan summary to Supabase ────────────────────────────────
  if (process.env.SUPABASE_URL && !process.env.SUPABASE_SERVICE_ROLE_KEY?.startsWith('PASTE')) {
    await saveGlobalScan(
      scanDate,
      { countries_scored: results.length, critical: critical.length, warning: warning.length, elevated: elevated.length, stable: stable.length, failed: errors.length },
      results,
      patterns,
      parseFloat(elapsed)
    ).catch(() => {});
  }

  // ── Log to hive ────────────────────────────────────────────────────────────
  logToHive({
    source: 'global_scan',
    level: 'intel',
    event: 'global_scan_complete',
    data: {
      scan_date: scanDate,
      countries_scored: results.length,
      critical_count: critical.length,
      warning_count: warning.length,
      elevated_count: elevated.length,
      top_5: results.slice(0, 5).map(r => ({ country: r.country, score: r.convergence_score, level: r.risk_level })),
      elapsed_seconds: parseFloat(elapsed)
    },
    tags: ['global_scan', 'dod', scanDate]
  });

  // ── Save results if requested ──────────────────────────────────────────────
  if (options.save) {
    const dir = path.join(__dirname, 'global_scan_results');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filename = path.join(dir, `scan_${scanDate}.json`);
    const output = {
      scan_date: scanDate,
      generated_at: new Date().toISOString(),
      elapsed_seconds: parseFloat(elapsed),
      summary: { critical: critical.length, warning: warning.length, elevated: elevated.length, stable: stable.length, failed: errors.length },
      patterns,
      results,
      errors
    };
    fs.writeFileSync(filename, JSON.stringify(output, null, 2));
    console.log(`  Results saved to ${filename}\n`);
  }

  return { results, errors, patterns, summary: { critical: critical.length, warning: warning.length, elevated: elevated.length, stable: stable.length } };
}

// Cross-country pattern detection
function detectPatterns(results) {
  const patterns = [];
  const scored = results.filter(r => r.convergence_score !== null && r.convergence_score !== undefined);

  // Pattern: Sahel corridor cluster
  const sahelCountries = ['Mali', 'Burkina Faso', 'Niger', 'Chad', 'Sudan'];
  const sahelResults = scored.filter(r => sahelCountries.includes(r.country));
  const sahelAvg = sahelResults.length
    ? Math.round(sahelResults.reduce((s, r) => s + r.convergence_score, 0) / sahelResults.length)
    : 0;
  if (sahelAvg >= 65) {
    patterns.push(`SAHEL CORRIDOR ALERT: ${sahelCountries.filter(c => sahelResults.find(r => r.country === c && r.convergence_score >= 65)).join(', ')} all at WARNING+ (avg ${sahelAvg}) -- corridor pattern active`);
  }

  // Pattern: food security cluster
  const foodCrisis = scored.filter(r => r.signals?.find(s => s.name === 'Food Security' && s.score >= 75));
  if (foodCrisis.length >= 5) {
    patterns.push(`FOOD SYSTEM FRACTURE: ${foodCrisis.length} countries simultaneously at IPC Phase 4+ -- global food shock pattern`);
  }

  // Pattern: governance collapse cluster
  const govCollapse = scored.filter(r => r.signals?.find(s => s.name === 'Governance' && s.score >= 70));
  if (govCollapse.length >= 8) {
    patterns.push(`GOVERNANCE DECAY WAVE: ${govCollapse.length} countries with Political Stability <30/100 -- systemic legitimacy crisis`);
  }

  // Pattern: displacement acceleration cluster
  const dispAccel = scored.filter(r => {
    const dispSignal = r.signals?.find(s => s.name === 'Displacement');
    return dispSignal && dispSignal.score >= 60 && dispSignal.trend === 'accelerating';
  });
  if (dispAccel.length >= 4) {
    patterns.push(`DISPLACEMENT CASCADE: ${dispAccel.length} countries showing accelerating displacement -- contagion risk elevated`);
  }

  // Pattern: high CRITICAL count
  const criticalCount = scored.filter(r => r.risk_level === 'CRITICAL').length;
  if (criticalCount >= 5) {
    patterns.push(`MULTI-THEATER CRITICAL: ${criticalCount} countries simultaneously at CRITICAL -- global instability period, not isolated events`);
  }

  // Pattern: satellite fire cluster (regional burning pattern)
  const fireCluster = scored.filter(r => r.signals?.find(s => s.name === 'Satellite Fire' && s.score >= 80));
  if (fireCluster.length >= 4) {
    const fireCountries = fireCluster.map(r => r.country);
    patterns.push(`SATELLITE FIRE CLUSTER: Anomalous burning detected in ${fireCountries.join(', ')} -- cross-border activity or coordinated conflict signal`);
  }

  return patterns;
}

function bandRank(level) {
  return { STABLE: 0, ELEVATED: 1, WARNING: 2, CRITICAL: 3 }[level] ?? -1;
}

function getTheater(country) {
  const theaters = {
    AFRICOM: [
      'Mali', 'Burkina Faso', 'Niger', 'Sudan', 'Ethiopia', 'Somalia', 'DRC', 'CAR', 'Chad',
      'Nigeria', 'Mozambique', 'Libya', 'South Sudan', 'Cameroon', 'Zimbabwe', 'Zambia',
      'Tanzania', 'Senegal', 'Guinea', 'Kenya', 'Uganda', 'Eritrea', 'Djibouti',
      'Angola', 'Rwanda', 'Burundi', 'Malawi', 'Guinea-Bissau', 'Sierra Leone', 'Liberia',
      'Togo', 'Benin', 'Mauritania', 'Tunisia', 'Algeria', 'Morocco', 'Egypt',
      'Ghana', 'Ivory Coast', 'Gabon', 'Congo', 'Equatorial Guinea', 'Namibia', 'Botswana',
      'South Africa', 'Lesotho', 'Eswatini', 'Madagascar', 'Comoros', 'Cabo Verde',
      'Gambia', 'Sao Tome and Principe'
    ],
    CENTCOM: [
      'Yemen', 'Syria', 'Iraq', 'Afghanistan', 'Pakistan', 'Iran', 'Lebanon', 'Israel', 'Palestine',
      'Jordan', 'Saudi Arabia', 'UAE', 'Qatar', 'Bahrain', 'Kuwait', 'Oman',
      'Kazakhstan', 'Kyrgyzstan', 'Tajikistan', 'Turkmenistan', 'Uzbekistan', 'Azerbaijan'
    ],
    EUCOM: [
      'Ukraine', 'Armenia', 'Georgia', 'Kosovo', 'Bosnia', 'Russia', 'Belarus', 'Moldova',
      'Serbia', 'Albania', 'North Macedonia', 'Montenegro', 'Bulgaria', 'Romania',
      'Hungary', 'Poland', 'Slovakia', 'Croatia', 'Turkey', 'Greece', 'Cyprus',
      'UK', 'France', 'Germany', 'Spain', 'Italy', 'Portugal', 'Sweden', 'Finland',
      'Norway', 'Denmark', 'Netherlands', 'Belgium', 'Austria', 'Switzerland'
    ],
    INDOPACOM: [
      'Myanmar', 'Bangladesh', 'Sri Lanka', 'Taiwan', 'North Korea', 'South Korea',
      'China', 'Japan', 'Mongolia', 'Philippines', 'Indonesia', 'Vietnam', 'Cambodia',
      'Laos', 'Thailand', 'Malaysia', 'Singapore', 'Nepal', 'India', 'Timor-Leste',
      'Papua New Guinea', 'Solomon Islands', 'Fiji', 'Australia', 'New Zealand',
      'Brunei', 'Tonga', 'Vanuatu', 'Samoa', 'Marshall Islands'
    ],
    SOUTHCOM: [
      'Venezuela', 'Colombia', 'Haiti', 'Ecuador', 'Bolivia', 'Peru', 'Brazil',
      'Argentina', 'Chile', 'Paraguay', 'Uruguay', 'Guyana', 'Suriname',
      'Trinidad and Tobago', 'Panama', 'Costa Rica', 'Nicaragua', 'Honduras',
      'Guatemala', 'El Salvador', 'Cuba', 'Dominican Republic', 'Jamaica', 'Belize', 'Mexico'
    ]
  };
  for (const [theater, countries] of Object.entries(theaters)) {
    if (countries.includes(country)) return theater;
  }
  return 'GLOBAL';
}

// ── CLI entry point ────────────────────────────────────────────────────────────
if (require.main === module) {
  const args = process.argv.slice(2);
  const date = args.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a)) || null;
  const criticalOnly = args.includes('--critical-only');
  const save = args.includes('--save');

  runGlobalScan(date, { criticalOnly, save }).catch(err => {
    console.error('Global scan failed:', err.message);
    process.exit(1);
  });
}

module.exports = runGlobalScan;
