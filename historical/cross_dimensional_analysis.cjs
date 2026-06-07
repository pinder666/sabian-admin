// historical/cross_dimensional_analysis.cjs
// Seven cross-dimensional intelligence analyses across full historical record.
// Runs against all 8,610 country-year pairs in historical_convergence_scores.
//
// Usage: node historical/cross_dimensional_analysis.cjs

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs   = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const STABLE   = 65;
const ELEVATED = 75;
const CRITICAL = 85;

const FINDINGS_PATH = path.join(__dirname, 'SABIAN_INTELLIGENCE_FINDINGS.md');

// ── Region map ────────────────────────────────────────────────────────────────
const REGION = {
  // Sub-Saharan Africa
  Angola:'Sub-Saharan Africa', Benin:'Sub-Saharan Africa', Botswana:'Sub-Saharan Africa',
  'Burkina Faso':'Sub-Saharan Africa', Burundi:'Sub-Saharan Africa', Cameroon:'Sub-Saharan Africa',
  CAR:'Sub-Saharan Africa', Chad:'Sub-Saharan Africa', Comoros:'Sub-Saharan Africa',
  Congo:'Sub-Saharan Africa', DRC:'Sub-Saharan Africa', Djibouti:'Sub-Saharan Africa',
  Eritrea:'Sub-Saharan Africa', Eswatini:'Sub-Saharan Africa', Ethiopia:'Sub-Saharan Africa',
  Gabon:'Sub-Saharan Africa', Gambia:'Sub-Saharan Africa', Ghana:'Sub-Saharan Africa',
  Guinea:'Sub-Saharan Africa', 'Guinea-Bissau':'Sub-Saharan Africa',
  'Ivory Coast':'Sub-Saharan Africa', Kenya:'Sub-Saharan Africa', Lesotho:'Sub-Saharan Africa',
  Liberia:'Sub-Saharan Africa', Madagascar:'Sub-Saharan Africa', Malawi:'Sub-Saharan Africa',
  Mali:'Sub-Saharan Africa', Mauritania:'Sub-Saharan Africa', Mauritius:'Sub-Saharan Africa',
  Mozambique:'Sub-Saharan Africa', Namibia:'Sub-Saharan Africa', Niger:'Sub-Saharan Africa',
  Nigeria:'Sub-Saharan Africa', Rwanda:'Sub-Saharan Africa', Senegal:'Sub-Saharan Africa',
  'Sierra Leone':'Sub-Saharan Africa', Somalia:'Sub-Saharan Africa',
  'South Africa':'Sub-Saharan Africa', 'South Sudan':'Sub-Saharan Africa',
  Sudan:'Sub-Saharan Africa', Tanzania:'Sub-Saharan Africa', Togo:'Sub-Saharan Africa',
  Uganda:'Sub-Saharan Africa', Zambia:'Sub-Saharan Africa', Zimbabwe:'Sub-Saharan Africa',
  'Sao Tome and Principe':'Sub-Saharan Africa',
  // North Africa / Middle East
  Algeria:'MENA', Egypt:'MENA', Libya:'MENA', Morocco:'MENA', Tunisia:'MENA',
  Bahrain:'MENA', Iran:'MENA', Iraq:'MENA', Israel:'MENA', Jordan:'MENA',
  Kuwait:'MENA', Lebanon:'MENA', Oman:'MENA', Qatar:'MENA',
  'Saudi Arabia':'MENA', Syria:'MENA', UAE:'MENA', Yemen:'MENA',
  Palestine:'MENA', Turkey:'MENA',
  // Europe
  Albania:'Europe', Armenia:'Europe', Austria:'Europe', Azerbaijan:'Europe',
  Belarus:'Europe', Belgium:'Europe', Bosnia:'Europe', Bulgaria:'Europe',
  Croatia:'Europe', 'Czech Republic':'Europe', Denmark:'Europe', Finland:'Europe',
  France:'Europe', Georgia:'Europe', Germany:'Europe', Greece:'Europe',
  Hungary:'Europe', Iceland:'Europe', Ireland:'Europe', Italy:'Europe',
  Kosovo:'Europe', Latvia:'Europe', Lithuania:'Europe', Luxembourg:'Europe',
  Moldova:'Europe', Montenegro:'Europe', Netherlands:'Europe', 'North Macedonia':'Europe',
  Norway:'Europe', Poland:'Europe', Portugal:'Europe', Romania:'Europe',
  Russia:'Europe', Serbia:'Europe', Slovakia:'Europe', Slovenia:'Europe',
  Spain:'Europe', Sweden:'Europe', Switzerland:'Europe', Ukraine:'Europe',
  'United Kingdom':'Europe', UK:'Europe',
  // Central Asia
  Afghanistan:'Central Asia', Kazakhstan:'Central Asia', Kyrgyzstan:'Central Asia',
  Mongolia:'Central Asia', Pakistan:'Central Asia', Tajikistan:'Central Asia',
  Turkmenistan:'Central Asia', Uzbekistan:'Central Asia',
  // South / Southeast Asia
  Bangladesh:'South/SE Asia', Cambodia:'South/SE Asia', India:'South/SE Asia',
  Indonesia:'South/SE Asia', Laos:'South/SE Asia', Malaysia:'South/SE Asia',
  Myanmar:'South/SE Asia', Nepal:'South/SE Asia', Philippines:'South/SE Asia',
  'Sri Lanka':'South/SE Asia', Thailand:'South/SE Asia', 'Timor-Leste':'South/SE Asia',
  Vietnam:'South/SE Asia',
  // East Asia
  China:'East Asia', Japan:'East Asia', 'North Korea':'East Asia',
  'South Korea':'East Asia', Taiwan:'East Asia',
  // Americas
  Argentina:'Americas', Bolivia:'Americas', Brazil:'Americas', Canada:'Americas',
  Chile:'Americas', Colombia:'Americas', Cuba:'Americas', Ecuador:'Americas',
  'El Salvador':'Americas', Guatemala:'Americas', Haiti:'Americas',
  Honduras:'Americas', Jamaica:'Americas', Mexico:'Americas', Nicaragua:'Americas',
  Panama:'Americas', Paraguay:'Americas', Peru:'Americas',
  'Trinidad and Tobago':'Americas', USA:'Americas', Uruguay:'Americas',
  Venezuela:'Americas',
  // Oceania
  Australia:'Oceania', Fiji:'Oceania', 'New Zealand':'Oceania',
  'Papua New Guinea':'Oceania', 'Solomon Islands':'Oceania',
};

// ── Data loaders ──────────────────────────────────────────────────────────────

async function loadAllScores() {
  process.stdout.write('  Loading scores .');
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
    if (page % 3 === 0) process.stdout.write('.');
  }
  console.log(` ${all.length} rows.`);
  return all;
}

async function loadClusters() {
  const { data, error } = await sb.from('country_clusters').select('country,cluster_id,cluster_label,dominant_signal');
  if (error) throw error;
  const map = {};
  for (const r of (data || [])) map[r.country] = r;
  return map;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function decade(year) { return Math.floor(year / 10) * 10; }

function trajectoryLabel(score) {
  if (score >= CRITICAL)  return 'CRITICAL';
  if (score >= ELEVATED)  return 'ELEVATED';
  if (score >= STABLE)    return 'STRESSED';
  return 'STABLE';
}

// Build by-country time series
function buildCountryMap(scores) {
  const map = {};
  for (const r of scores) {
    if (!map[r.country]) map[r.country] = {};
    map[r.country][r.year] = r;
  }
  return map;
}

// ── Analysis 1: Cluster trajectory variance ───────────────────────────────────

function analysis1_clusterVariance(scores, clusters) {
  console.log('\n━━ ANALYSIS 1: Cluster Trajectory Variance ━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Group scores by cluster and decade
  const clusterDecadeScores = {};
  for (const r of scores) {
    const c = clusters[r.country];
    if (!c) continue;
    const label = c.cluster_label || `cluster_${c.cluster_id}`;
    const d = decade(r.year);
    if (!clusterDecadeScores[label]) clusterDecadeScores[label] = {};
    if (!clusterDecadeScores[label][d]) clusterDecadeScores[label][d] = [];
    clusterDecadeScores[label][d].push(r.score);
  }

  const results = [];
  for (const [clLabel, decadeMap] of Object.entries(clusterDecadeScores)) {
    const allScores = Object.values(decadeMap).flat();
    const mean = allScores.reduce((a, b) => a + b, 0) / allScores.length;
    const variance = allScores.reduce((a, b) => a + (b - mean) ** 2, 0) / allScores.length;
    const stdDev = Math.sqrt(variance);

    // Decade-by-decade mean
    const decadeMeans = {};
    for (const [d, arr] of Object.entries(decadeMap)) {
      decadeMeans[d] = arr.reduce((a, b) => a + b, 0) / arr.length;
    }

    results.push({ label: clLabel, mean: mean.toFixed(1), stdDev: stdDev.toFixed(2), variance: variance.toFixed(1), decadeMeans, n: allScores.length });
  }

  results.sort((a, b) => parseFloat(b.stdDev) - parseFloat(a.stdDev));

  const findings = [];
  for (const r of results) {
    const decades = Object.entries(r.decadeMeans).sort((a, b) => a[0] - b[0]);
    const decStr = decades.map(([d, m]) => `${d}s:${m.toFixed(0)}`).join(' → ');
    console.log(`  ${r.label}`);
    console.log(`    mean=${r.mean} stdDev=${r.stdDev} n=${r.n}`);
    console.log(`    trajectory: ${decStr}`);
    findings.push({ label: r.label, mean: r.mean, stdDev: r.stdDev, trajectory: decStr, n: r.n });
  }

  const mostVolatile = results[0];
  const mostStable   = results[results.length - 1];

  console.log(`\n  FINDING: Most volatile cluster — ${mostVolatile.label} (σ=${mostVolatile.stdDev})`);
  console.log(`  FINDING: Most stable cluster   — ${mostStable.label} (σ=${mostStable.stdDev})`);

  return { findings, mostVolatile: mostVolatile.label, mostStable: mostStable.label };
}

// ── Analysis 2: Regional silence patterns ─────────────────────────────────────

function analysis2_regionalSilence(countryMap, clusters) {
  console.log('\n━━ ANALYSIS 2: Regional Silence Patterns ━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const regionStats = {};

  for (const [country, yearMap] of Object.entries(countryMap)) {
    const region = REGION[country] || 'Unknown';
    if (!regionStats[region]) regionStats[region] = { silenceEvents: 0, silenceBeforeCritical: 0, totalCountries: 0, criticalCrossings: 0 };
    regionStats[region].totalCountries++;

    const years = Object.keys(yearMap).map(Number).sort((a, b) => a - b);

    for (let i = 1; i < years.length; i++) {
      const T  = years[i];
      const T1 = years[i - 1];
      if (T - T1 > 2) continue; // skip gap years

      const prevBd = yearMap[T1]?.breakdown || {};
      const currBd = yearMap[T]?.breakdown  || {};
      const prevSigs = new Set(Object.keys(prevBd));
      const currSigs = new Set(Object.keys(currBd));

      // Going dark: signal present at T-1, absent at T
      const wentDark = [...prevSigs].filter(s => !currSigs.has(s));
      if (wentDark.length > 0) {
        regionStats[region].silenceEvents += wentDark.length;
        // Did country cross CRITICAL within 5 years?
        const crossed = years.filter(y => y > T && y <= T + 5 && (yearMap[y]?.score || 0) >= CRITICAL).length > 0;
        if (crossed) regionStats[region].silenceBeforeCritical += wentDark.length;
      }

      // Track critical crossings
      if ((yearMap[T1]?.score || 0) < CRITICAL && (yearMap[T]?.score || 0) >= CRITICAL) {
        regionStats[region].criticalCrossings++;
      }
    }
  }

  const findings = [];
  for (const [region, s] of Object.entries(regionStats)) {
    const rate = s.silenceEvents > 0 ? (s.silenceBeforeCritical / s.silenceEvents * 100).toFixed(0) : 'n/a';
    console.log(`  ${region.padEnd(20)} silence events: ${String(s.silenceEvents).padStart(4)} | pre-critical: ${String(s.silenceBeforeCritical).padStart(4)} | rate: ${rate}% | critical crossings: ${s.criticalCrossings}`);
    findings.push({ region, ...s, preCriticalRate: rate });
  }

  const sorted = findings.filter(f => f.silenceEvents > 0).sort((a, b) => parseFloat(b.preCriticalRate) - parseFloat(a.preCriticalRate));
  if (sorted.length > 0) {
    console.log(`\n  FINDING: Highest pre-critical silence rate — ${sorted[0].region} (${sorted[0].preCriticalRate}%)`);
    console.log(`  FINDING: Most total silence events     — ${[...findings].sort((a,b) => b.silenceEvents - a.silenceEvents)[0].region}`);
  }

  return findings;
}

// ── Analysis 3: Convergence speed ────────────────────────────────────────────

function analysis3_convergenceSpeed(countryMap) {
  console.log('\n━━ ANALYSIS 3: Convergence Speed — STABLE to CRITICAL ━━━━━━━━━━━━━━');

  const transitions = [];

  for (const [country, yearMap] of Object.entries(countryMap)) {
    const years = Object.keys(yearMap).map(Number).sort((a, b) => a - b);
    let stableStart = null;

    for (const year of years) {
      const score = yearMap[year]?.score || 0;
      if (score < STABLE && stableStart === null) {
        stableStart = year;
      } else if (score >= CRITICAL && stableStart !== null) {
        const speed = year - stableStart;
        if (speed > 0 && speed <= 30) { // sanity: can't take more than 30 years
          const epoch = year < 1990 ? 'pre-1990' : year < 2005 ? '1990-2005' : '2005-2025';
          transitions.push({ country, stableStart, criticalYear: year, speed, epoch });
        }
        stableStart = null;
      } else if (score >= CRITICAL) {
        stableStart = null;
      }
    }
  }

  const byEpoch = {};
  for (const t of transitions) {
    if (!byEpoch[t.epoch]) byEpoch[t.epoch] = [];
    byEpoch[t.epoch].push(t.speed);
  }

  const findings = [];
  for (const [epoch, speeds] of Object.entries(byEpoch).sort()) {
    const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    const min  = Math.min(...speeds);
    const max  = Math.max(...speeds);
    console.log(`  ${epoch}: n=${speeds.length} | mean=${mean.toFixed(1)}yr | fastest=${min}yr | slowest=${max}yr`);
    findings.push({ epoch, n: speeds.length, mean: mean.toFixed(1), min, max });
  }

  // Fastest transitions
  const top5 = transitions.sort((a, b) => a.speed - b.speed).slice(0, 5);
  console.log('\n  Fastest STABLE→CRITICAL transitions:');
  for (const t of top5) {
    console.log(`    ${t.country} ${t.stableStart}→${t.criticalYear}: ${t.speed}yr`);
  }

  const epochs = Object.entries(byEpoch).sort();
  if (epochs.length >= 2) {
    const first = epochs[0][1].reduce((a, b) => a + b, 0) / epochs[0][1].length;
    const last  = epochs[epochs.length - 1][1].reduce((a, b) => a + b, 0) / epochs[epochs.length - 1][1].length;
    const direction = last < first ? 'ACCELERATING' : 'DECELERATING';
    console.log(`\n  FINDING: Convergence is ${direction} — ${epochs[0][0]} avg ${first.toFixed(1)}yr → ${epochs[epochs.length-1][0]} avg ${last.toFixed(1)}yr`);
    findings.push({ direction, firstEpoch: first.toFixed(1), lastEpoch: last.toFixed(1) });
  }

  return { transitions, findings };
}

// ── Analysis 4: Recovery asymmetry ───────────────────────────────────────────

function analysis4_recoveryAsymmetry(countryMap) {
  console.log('\n━━ ANALYSIS 4: Recovery Asymmetry — Ascent vs Recovery ━━━━━━━━━━━━━');

  const events = [];

  for (const [country, yearMap] of Object.entries(countryMap)) {
    const years = Object.keys(yearMap).map(Number).sort((a, b) => a - b);

    let stableStart = null;
    let criticalEntry = null;

    for (const year of years) {
      const score = yearMap[year]?.score || 0;

      if (score < STABLE) {
        if (criticalEntry !== null) {
          // Recovery complete
          const recoveryYears = year - criticalEntry;
          const ascentYears   = criticalEntry - (stableStart || criticalEntry - 5);
          if (ascentYears > 0 && recoveryYears > 0) {
            events.push({ country, criticalEntry, recoveryYear: year, ascentYears, recoveryYears, ratio: (recoveryYears / ascentYears).toFixed(2) });
          }
          criticalEntry = null;
        }
        stableStart = year;
      } else if (score >= CRITICAL && criticalEntry === null) {
        criticalEntry = year;
      }
    }
  }

  if (events.length === 0) {
    console.log('  No complete CRITICAL→STABLE recovery events found in historical record.');
    return { events, finding: 'insufficient recovery events' };
  }

  const avgAscent   = events.reduce((a, b) => a + b.ascentYears, 0) / events.length;
  const avgRecovery = events.reduce((a, b) => a + b.recoveryYears, 0) / events.length;
  const avgRatio    = events.reduce((a, b) => a + parseFloat(b.ratio), 0) / events.length;

  console.log(`  Recovery events found: ${events.length}`);
  console.log(`  Avg ascent (stable→critical):  ${avgAscent.toFixed(1)} yr`);
  console.log(`  Avg recovery (critical→stable): ${avgRecovery.toFixed(1)} yr`);
  console.log(`  Recovery/Ascent ratio: ${avgRatio.toFixed(2)}x`);

  events.sort((a, b) => parseFloat(b.ratio) - parseFloat(a.ratio));
  console.log('\n  Hardest recoveries (highest ratio):');
  for (const e of events.slice(0, 5)) {
    console.log(`    ${e.country}: ascent=${e.ascentYears}yr / recovery=${e.recoveryYears}yr (ratio=${e.ratio}x)`);
  }

  const faster = events.filter(e => parseFloat(e.ratio) < 1.0).length;
  const slower = events.length - faster;
  console.log(`\n  FINDING: ${slower}/${events.length} countries took LONGER to recover than to fall.`);
  console.log(`  FINDING: Recovery averages ${avgRatio.toFixed(1)}x longer than ascent.`);

  return { events, avgAscent: avgAscent.toFixed(1), avgRecovery: avgRecovery.toFixed(1), avgRatio: avgRatio.toFixed(2) };
}

// ── Analysis 5: Stress absorption (elevated but never breaking) ───────────────

function analysis5_stressAbsorbers(countryMap, clusters) {
  console.log('\n━━ ANALYSIS 5: Stress Absorbers — Elevated Without Breaking ━━━━━━━━━');

  const absorbers = [];

  for (const [country, yearMap] of Object.entries(countryMap)) {
    const years = Object.keys(yearMap).map(Number).sort((a, b) => a - b);

    let runStart = null;
    let runLen   = 0;
    let maxScore = 0;

    for (const year of years) {
      const score = yearMap[year]?.score || 0;
      if (score >= ELEVATED && score < CRITICAL) {
        if (runStart === null) runStart = year;
        runLen++;
        maxScore = Math.max(maxScore, score);
      } else {
        if (runLen >= 10) {
          // Collect dominant signals during this run
          const sigFreq = {};
          for (let y = runStart; y < runStart + runLen; y++) {
            const bd = yearMap[y]?.breakdown || {};
            for (const [sig, val] of Object.entries(bd)) {
              if ((val.stress_z || 0) > 0.5) {
                sigFreq[sig] = (sigFreq[sig] || 0) + 1;
              }
            }
          }
          const topSig = Object.entries(sigFreq).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
          absorbers.push({ country, runStart, runLen, maxScore: maxScore.toFixed(1), topSignals: topSig, cluster: clusters[country]?.cluster_label || 'unknown' });
        }
        if (score >= CRITICAL) {
          runStart = null; runLen = 0; maxScore = 0;
        } else {
          runStart = null; runLen = 0; maxScore = 0;
        }
      }
    }
    // Close open run
    if (runLen >= 10) {
      const sigFreq = {};
      for (let y = runStart; y < runStart + runLen; y++) {
        const bd = yearMap[y]?.breakdown || {};
        for (const [sig, val] of Object.entries(bd)) {
          if ((val.stress_z || 0) > 0.5) {
            sigFreq[sig] = (sigFreq[sig] || 0) + 1;
          }
        }
      }
      const topSig = Object.entries(sigFreq).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
      absorbers.push({ country, runStart, runLen, maxScore: maxScore.toFixed(1), topSignals: topSig, cluster: clusters[country]?.cluster_label || 'unknown' });
    }
  }

  absorbers.sort((a, b) => b.runLen - a.runLen);
  console.log(`  Countries with 10+ years elevated without going CRITICAL: ${absorbers.length}`);

  for (const a of absorbers.slice(0, 12)) {
    console.log(`  ${a.country.padEnd(22)} ${a.runLen}yr elevated | max=${a.maxScore} | signals: ${a.topSignals.join(', ')} | cluster: ${a.cluster}`);
  }

  // Most common absorber signals
  const sigCount = {};
  for (const a of absorbers) {
    for (const s of a.topSignals) sigCount[s] = (sigCount[s] || 0) + 1;
  }
  const topAbsorberSigs = Object.entries(sigCount).sort((a, b) => b[1] - a[1]).slice(0, 4);
  console.log('\n  Most common signals in absorber countries:');
  for (const [s, n] of topAbsorberSigs) console.log(`    ${s}: ${n} countries`);
  console.log(`\n  FINDING: ${absorbers.length} countries held elevated stress for 10+ years without breaking. Dominant signals: ${topAbsorberSigs.map(([s]) => s).join(', ')}.`);

  return { absorbers, topAbsorberSigs };
}

// ── Analysis 6: Pre-silence signature ────────────────────────────────────────

function analysis6_preSilenceSignature(countryMap) {
  console.log('\n━━ ANALYSIS 6: Pre-Silence Signature — What Moves Before Going Dark ━');

  const signalElevationBeforeDark = {}; // signal → how often it was elevated in 1-3 yrs before another signal went dark
  const signalDarkEvents = {};          // signal → how many times it went dark

  for (const [country, yearMap] of Object.entries(countryMap)) {
    const years = Object.keys(yearMap).map(Number).sort((a, b) => a - b);

    for (let i = 1; i < years.length; i++) {
      const T  = years[i];
      const T1 = years[i - 1];
      if (T - T1 > 2) continue;

      const prevBd = yearMap[T1]?.breakdown || {};
      const currBd = yearMap[T]?.breakdown  || {};
      const prevSigs = new Set(Object.keys(prevBd));
      const currSigs = new Set(Object.keys(currBd));
      const wentDark = [...prevSigs].filter(s => !currSigs.has(s));

      for (const darkSig of wentDark) {
        signalDarkEvents[darkSig] = (signalDarkEvents[darkSig] || 0) + 1;

        // Look at other signals in 1-3 years before going dark
        for (let lookback = 1; lookback <= 3; lookback++) {
          const preBd = yearMap[T1 - lookback]?.breakdown || {};
          for (const [sig, val] of Object.entries(preBd)) {
            if (sig === darkSig) continue;
            if (Math.abs(val.stress_z || 0) > 0.5) {
              if (!signalElevationBeforeDark[sig]) signalElevationBeforeDark[sig] = {};
              if (!signalElevationBeforeDark[sig][darkSig]) signalElevationBeforeDark[sig][darkSig] = 0;
              signalElevationBeforeDark[sig][darkSig]++;
            }
          }
        }
      }
    }
  }

  console.log('\n  Signals that most frequently go dark:');
  const darkRanked = Object.entries(signalDarkEvents).sort((a, b) => b[1] - a[1]);
  for (const [sig, n] of darkRanked.slice(0, 6)) {
    console.log(`    ${sig.padEnd(20)}: ${n} going-dark events`);
  }

  // Which signals are elevated most often before ANY going-dark event?
  const preDarkTotal = {};
  for (const [sig, targets] of Object.entries(signalElevationBeforeDark)) {
    preDarkTotal[sig] = Object.values(targets).reduce((a, b) => a + b, 0);
  }
  const preDarkRanked = Object.entries(preDarkTotal).sort((a, b) => b[1] - a[1]);

  console.log('\n  Signals most often elevated BEFORE another signal goes dark (pre-silence signature):');
  const preSilenceFindings = [];
  for (const [sig, count] of preDarkRanked.slice(0, 6)) {
    console.log(`    ${sig.padEnd(20)}: elevated in ${count} pre-dark observations`);
    preSilenceFindings.push({ signal: sig, count });
  }

  // Which specific signal precedes the most going-dark events?
  const top = preDarkRanked[0];
  if (top) {
    const topTargets = signalElevationBeforeDark[top[0]];
    const topTarget = Object.entries(topTargets || {}).sort((a, b) => b[1] - a[1])[0];
    console.log(`\n  FINDING: ${top[0]} is the most common pre-silence signal. Most often precedes ${topTarget?.[0] || 'unknown'} going dark.`);
  }

  return { preSilenceFindings, signalDarkEvents };
}

// ── Analysis 7: Cluster migration ────────────────────────────────────────────

function analysis7_clusterMigration(countryMap, clusters) {
  console.log('\n━━ ANALYSIS 7: Cluster Migration — Dominant Signal Shift ━━━━━━━━━━━');

  // For each country, find dominant signal in early (pre-1990) vs late (2010-2025) decades
  // Migration = dominant signal changed
  const migrations = [];
  const migrationMatrix = {}; // from_cluster → to_cluster → count

  for (const [country, yearMap] of Object.entries(countryMap)) {
    const earlyYears = Object.keys(yearMap).map(Number).filter(y => y < 1990);
    const lateYears  = Object.keys(yearMap).map(Number).filter(y => y >= 2010);
    if (earlyYears.length < 3 || lateYears.length < 3) continue;

    const dominantSignal = (years) => {
      const sigAcc = {};
      for (const y of years) {
        const bd = yearMap[y]?.breakdown || {};
        for (const [sig, val] of Object.entries(bd)) {
          sigAcc[sig] = (sigAcc[sig] || 0) + Math.abs(val.stress_z || 0);
        }
      }
      const top = Object.entries(sigAcc).sort((a, b) => b[1] - a[1])[0];
      return top ? top[0] : null;
    };

    const earlyDom = dominantSignal(earlyYears);
    const lateDom  = dominantSignal(lateYears);
    const currentCluster = clusters[country]?.cluster_label || 'unknown';

    if (earlyDom && lateDom && earlyDom !== lateDom) {
      migrations.push({ country, earlyDom, lateDom, currentCluster });
      if (!migrationMatrix[earlyDom]) migrationMatrix[earlyDom] = {};
      migrationMatrix[earlyDom][lateDom] = (migrationMatrix[earlyDom][lateDom] || 0) + 1;
    }
  }

  console.log(`  Countries with dominant signal shift (pre-1990 → 2010+): ${migrations.length}`);

  // Most common migration paths
  const paths = [];
  for (const [from, targets] of Object.entries(migrationMatrix)) {
    for (const [to, n] of Object.entries(targets)) {
      paths.push({ from, to, n });
    }
  }
  paths.sort((a, b) => b.n - a.n);

  console.log('\n  Most common migration paths (dominant signal shift):');
  for (const p of paths.slice(0, 8)) {
    console.log(`    ${p.from.padEnd(20)} → ${p.to.padEnd(20)}: ${p.n} countries`);
  }

  // Countries that migrated the most dramatically (economic → conflict, etc.)
  const dramaticMigs = migrations.filter(m =>
    (m.earlyDom.includes('econ') || m.earlyDom.includes('trade') || m.earlyDom.includes('capital')) &&
    (m.lateDom.includes('conflict') || m.lateDom.includes('fire') || m.lateDom.includes('displacement'))
  );

  if (dramaticMigs.length > 0) {
    console.log('\n  Countries shifting from economic stress to conflict/displacement signals:');
    for (const m of dramaticMigs) {
      console.log(`    ${m.country}: ${m.earlyDom} → ${m.lateDom}`);
    }
  }

  // Net flows: which signals gain vs lose countries
  const gainLoss = {};
  for (const m of migrations) {
    gainLoss[m.earlyDom] = (gainLoss[m.earlyDom] || 0) - 1;
    gainLoss[m.lateDom]  = (gainLoss[m.lateDom]  || 0) + 1;
  }
  const glRanked = Object.entries(gainLoss).sort((a, b) => b[1] - a[1]);
  console.log('\n  Net signal migration (+ gaining countries, - losing):');
  for (const [sig, n] of glRanked) {
    const dir = n >= 0 ? `+${n}` : `${n}`;
    console.log(`    ${sig.padEnd(22)}: ${dir}`);
  }

  const topGainer = glRanked[0];
  const topLoser  = glRanked[glRanked.length - 1];
  if (topGainer && topLoser) {
    console.log(`\n  FINDING: ${topGainer[0]} is gaining countries (net +${topGainer[1]}). ${topLoser[0]} is losing countries (net ${topLoser[1]}).`);
  }

  return { migrations, paths: paths.slice(0, 8), gainLoss };
}

// ── Write findings to disk ────────────────────────────────────────────────────

function appendCrossDimensionalFindings(r1, r2, r3, r4, r5, r6, r7) {
  const date = new Date().toISOString().slice(0, 10);

  const lines = [
    '',
    '---',
    '',
    `## Cross-Dimensional Intelligence Analysis`,
    `## Run: ${date} | extended country-year pairs | 153 countries | 1789–2026`,
    '',
    '### 1. Cluster Trajectory Variance',
    `Most volatile cluster: **${r1.mostVolatile}**`,
    `Most stable cluster: **${r1.mostStable}**`,
    '',
  ];

  for (const f of r1.findings) {
    lines.push(`- **${f.label}**: mean score ${f.mean}, σ=${f.stdDev}, n=${f.n} country-years`);
    lines.push(`  Trajectory: ${f.trajectory}`);
  }

  lines.push('', '### 2. Regional Silence Patterns');
  const sortedR2 = [...r2].filter(f => f.silenceEvents > 0).sort((a, b) => parseFloat(b.preCriticalRate) - parseFloat(a.preCriticalRate));
  for (const f of sortedR2) {
    lines.push(`- **${f.region}**: ${f.silenceEvents} going-dark events, ${f.preCriticalRate}% preceded a CRITICAL crossing within 5 years`);
  }

  lines.push('', '### 3. Convergence Speed');
  for (const f of r3.findings) {
    if (f.epoch) lines.push(`- **${f.epoch}**: n=${f.n} transitions | mean ${f.mean}yr | fastest ${f.min}yr | slowest ${f.max}yr`);
    if (f.direction) lines.push(`- **${f.direction}**: convergence speed is changing. First epoch avg ${f.firstEpoch}yr → most recent epoch avg ${f.lastEpoch}yr.`);
  }

  lines.push('', '### 4. Recovery Asymmetry');
  if (r4.avgRatio) {
    lines.push(`- Recovery events found: **${r4.events.length}**`);
    lines.push(`- Average ascent (STABLE→CRITICAL): **${r4.avgAscent} years**`);
    lines.push(`- Average recovery (CRITICAL→STABLE): **${r4.avgRecovery} years**`);
    lines.push(`- Recovery takes **${r4.avgRatio}x longer** than the ascent on average.`);
    lines.push(`- Hardest recoveries (descent/ascent ratio highest):`);
    for (const e of r4.events.slice(0, 5)) {
      lines.push(`  - ${e.country}: fell in ${e.ascentYears}yr, recovered in ${e.recoveryYears}yr (${e.ratio}x)`);
    }
  } else {
    lines.push(`- ${r4.finding}`);
  }

  lines.push('', '### 5. Stress Absorbers');
  lines.push(`- **${r5.absorbers.length} countries** held elevated stress (score 75–85) for 10+ consecutive years without crossing into CRITICAL.`);
  lines.push(`- Dominant absorber signals: **${r5.topAbsorberSigs.map(([s]) => s).join(', ')}**`);
  lines.push('- Top absorbers:');
  for (const a of r5.absorbers.slice(0, 10)) {
    lines.push(`  - ${a.country}: ${a.runLen}yr elevated (max ${a.maxScore}), signals: ${a.topSignals.join(', ')}`);
  }

  lines.push('', '### 6. Pre-Silence Signature');
  lines.push('Signals most often elevated in 1–3 years BEFORE another signal goes dark:');
  for (const f of r6.preSilenceFindings) {
    lines.push(`- **${f.signal}**: elevated in ${f.count} pre-dark observations`);
  }
  lines.push('Most frequent going-dark signals:');
  const darkTop = Object.entries(r6.signalDarkEvents).sort((a, b) => b[1] - a[1]).slice(0, 6);
  for (const [sig, n] of darkTop) {
    lines.push(`- **${sig}**: ${n} going-dark events`);
  }

  lines.push('', '### 7. Cluster Migration');
  lines.push(`- **${r7.migrations.length} countries** shifted dominant signal from pre-1990 to 2010+.`);
  lines.push('- Most common migration paths:');
  for (const p of r7.paths.slice(0, 6)) {
    lines.push(`  - ${p.from} → ${p.to}: ${p.n} countries`);
  }
  lines.push('- Net signal flows (+ gaining, - losing countries):');
  for (const [sig, n] of Object.entries(r7.gainLoss).sort((a, b) => b[1] - a[1])) {
    lines.push(`  - ${sig}: ${n >= 0 ? '+' : ''}${n}`);
  }

  lines.push('');

  const existing = fs.readFileSync(FINDINGS_PATH, 'utf8');
  const truncated = existing.replace(/\n---\n\n## Cross-Dimensional[\s\S]*$/, '');
  fs.writeFileSync(FINDINGS_PATH, truncated + lines.join('\n'));
  console.log('\n  Findings appended to SABIAN_INTELLIGENCE_FINDINGS.md');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔭 Cross-Dimensional Intelligence Analysis');
  console.log('   Extended signal rows | extended country-year pairs | 153 countries | 1789–2026\n');

  const [scores, clusters] = await Promise.all([
    loadAllScores(),
    loadClusters(),
  ]);

  const countryMap = buildCountryMap(scores);
  const countries  = Object.keys(countryMap).length;
  console.log(`  ${countries} countries loaded into memory.\n`);

  const r1 = analysis1_clusterVariance(scores, clusters);
  const r2 = analysis2_regionalSilence(countryMap, clusters);
  const r3 = analysis3_convergenceSpeed(countryMap);
  const r4 = analysis4_recoveryAsymmetry(countryMap);
  const r5 = analysis5_stressAbsorbers(countryMap, clusters);
  const r6 = analysis6_preSilenceSignature(countryMap);
  const r7 = analysis7_clusterMigration(countryMap, clusters);

  appendCrossDimensionalFindings(r1, r2, r3, r4, r5, r6, r7);

  console.log('\n' + '═'.repeat(60));
  console.log('✅ Cross-dimensional analysis complete.');
  console.log('   Results in SABIAN_INTELLIGENCE_FINDINGS.md');
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
