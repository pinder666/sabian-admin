// historical/deep_intelligence_mining_2.cjs
// Second pass deep intelligence mining — more granular analysis.
// Tests remaining dimensions: year-over-year acceleration, regional signal profiles,
// stress persistence, threshold crossing patterns, multi-signal combinations.
//
// Usage: node historical/deep_intelligence_mining_2.cjs

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs   = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const STABLE   = 65;
const ELEVATED = 75;
const CRITICAL = 85;

const FINDINGS_PATH = path.join(__dirname, 'SABIAN_INTELLIGENCE_FINDINGS.md');

const ALL_FINDINGS = [];

function addFinding(category, title, details, confirmed = true) {
  ALL_FINDINGS.push({ category, title, details, confirmed, timestamp: Date.now() });
}

const REGION = {
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
  Algeria:'MENA', Egypt:'MENA', Libya:'MENA', Morocco:'MENA', Tunisia:'MENA',
  Bahrain:'MENA', Iran:'MENA', Iraq:'MENA', Israel:'MENA', Jordan:'MENA',
  Kuwait:'MENA', Lebanon:'MENA', Oman:'MENA', Qatar:'MENA',
  'Saudi Arabia':'MENA', Syria:'MENA', UAE:'MENA', Yemen:'MENA',
  Palestine:'MENA', Turkey:'MENA',
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
  Afghanistan:'Central Asia', Kazakhstan:'Central Asia', Kyrgyzstan:'Central Asia',
  Mongolia:'Central Asia', Pakistan:'Central Asia', Tajikistan:'Central Asia',
  Turkmenistan:'Central Asia', Uzbekistan:'Central Asia',
  Bangladesh:'South/SE Asia', Cambodia:'South/SE Asia', India:'South/SE Asia',
  Indonesia:'South/SE Asia', Laos:'South/SE Asia', Malaysia:'South/SE Asia',
  Myanmar:'South/SE Asia', Nepal:'South/SE Asia', Philippines:'South/SE Asia',
  'Sri Lanka':'South/SE Asia', Thailand:'South/SE Asia', 'Timor-Leste':'South/SE Asia',
  Vietnam:'South/SE Asia',
  China:'East Asia', Japan:'East Asia', 'North Korea':'East Asia',
  'South Korea':'East Asia', Taiwan:'East Asia',
  Argentina:'Americas', Bolivia:'Americas', Brazil:'Americas', Canada:'Americas',
  Chile:'Americas', Colombia:'Americas', Cuba:'Americas', Ecuador:'Americas',
  'El Salvador':'Americas', Guatemala:'Americas', Haiti:'Americas',
  Honduras:'Americas', Jamaica:'Americas', Mexico:'Americas', Nicaragua:'Americas',
  Panama:'Americas', Paraguay:'Americas', Peru:'Americas',
  'Trinidad and Tobago':'Americas', USA:'Americas', Uruguay:'Americas',
  Venezuela:'Americas',
  Australia:'Oceania', Fiji:'Oceania', 'New Zealand':'Oceania',
  'Papua New Guinea':'Oceania', 'Solomon Islands':'Oceania',
};

const SIGNAL_KEYS = [
  'displacement', 'gdelt_conflict', 'gdelt_tone', 'seismic_risk', 'fire_hotspot',
  'governance', 'economic_stress', 'capital_flows', 'trade_collapse', 'power_grid',
  'imf_fiscal', 'vdem_governance'
];

async function loadAllScores() {
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
  return all;
}

async function loadClusters() {
  const { data, error } = await sb.from('country_clusters').select('*');
  if (error) throw error;
  const map = {};
  for (const r of (data || [])) map[r.country] = r;
  return map;
}

function buildCountryMap(scores) {
  const map = {};
  for (const r of scores) {
    if (!map[r.country]) map[r.country] = {};
    map[r.country][r.year] = r;
  }
  return map;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 14: Year-over-Year Acceleration
// ═══════════════════════════════════════════════════════════════════════════════

function analyzeYearOverYearAcceleration(countryMap) {
  console.log('\n━━ MODULE 14: Year-over-Year Acceleration ━━━━━━━━━━━━━━━━━━━━━━━━━');

  const accelerations = [];

  for (const [country, yearMap] of Object.entries(countryMap)) {
    const years = Object.keys(yearMap).map(Number).sort((a, b) => a - b);

    for (let i = 1; i < years.length; i++) {
      const prev = yearMap[years[i - 1]]?.score || 0;
      const curr = yearMap[years[i]]?.score || 0;
      const delta = curr - prev;

      if (Math.abs(delta) > 10) {
        accelerations.push({
          country, year: years[i], prevYear: years[i-1],
          prevScore: prev.toFixed(1), currScore: curr.toFixed(1),
          delta: delta.toFixed(1), region: REGION[country] || 'Unknown'
        });
      }
    }
  }

  // Largest positive jumps (deterioration)
  accelerations.sort((a, b) => parseFloat(b.delta) - parseFloat(a.delta));
  console.log('\n  Largest single-year deteriorations (score increase):');
  for (const a of accelerations.slice(0, 15)) {
    console.log(`    ${a.country.padEnd(20)} ${a.prevYear}→${a.year}: ${a.prevScore} → ${a.currScore} (+${a.delta})`);
    if (parseFloat(a.delta) >= 30) {
      addFinding('Year Acceleration', `${a.country} rapid deterioration ${a.year}`,
        `Score jumped from ${a.prevScore} to ${a.currScore} (+${a.delta}) in one year`);
    }
  }

  // Largest negative jumps (improvement)
  accelerations.sort((a, b) => parseFloat(a.delta) - parseFloat(b.delta));
  console.log('\n  Largest single-year improvements (score decrease):');
  for (const a of accelerations.slice(0, 15)) {
    console.log(`    ${a.country.padEnd(20)} ${a.prevYear}→${a.year}: ${a.prevScore} → ${a.currScore} (${a.delta})`);
    if (parseFloat(a.delta) <= -30) {
      addFinding('Year Acceleration', `${a.country} rapid improvement ${a.year}`,
        `Score dropped from ${a.prevScore} to ${a.currScore} (${a.delta}) in one year`);
    }
  }

  // Most volatile years globally
  const byYear = {};
  for (const a of accelerations) {
    if (!byYear[a.year]) byYear[a.year] = [];
    byYear[a.year].push(Math.abs(parseFloat(a.delta)));
  }

  console.log('\n  Most volatile years globally (avg absolute change > 10):');
  const yearVolatility = [];
  for (const [year, deltas] of Object.entries(byYear)) {
    if (deltas.length >= 5) {
      const avg = deltas.reduce((a,b) => a+b, 0) / deltas.length;
      yearVolatility.push({ year, avg, count: deltas.length });
    }
  }
  yearVolatility.sort((a, b) => b.avg - a.avg);
  for (const y of yearVolatility.slice(0, 10)) {
    console.log(`    ${y.year}: avg change ${y.avg.toFixed(1)} across ${y.count} countries`);
    if (y.avg >= 20) {
      addFinding('Year Acceleration', `Global volatility spike ${y.year}`,
        `Average score change of ${y.avg.toFixed(1)} across ${y.count} countries — global shock year`);
    }
  }

  return accelerations;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 15: Regional Signal Profiles
// ═══════════════════════════════════════════════════════════════════════════════

function analyzeRegionalSignalProfiles(countryMap) {
  console.log('\n━━ MODULE 15: Regional Signal Profiles ━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const regionProfiles = {};

  for (const [country, yearMap] of Object.entries(countryMap)) {
    const region = REGION[country] || 'Unknown';
    if (!regionProfiles[region]) {
      regionProfiles[region] = { signalFreq: {}, avgScore: [], countries: new Set() };
    }
    regionProfiles[region].countries.add(country);

    for (const [year, data] of Object.entries(yearMap)) {
      regionProfiles[region].avgScore.push(data.score || 0);
      const bd = data.breakdown || {};
      for (const [sig, val] of Object.entries(bd)) {
        if ((val.stress_z || 0) > 0.5) {
          regionProfiles[region].signalFreq[sig] = (regionProfiles[region].signalFreq[sig] || 0) + 1;
        }
      }
    }
  }

  console.log('\n  Regional profiles:');
  for (const [region, profile] of Object.entries(regionProfiles)) {
    const avgScore = profile.avgScore.reduce((a,b) => a+b, 0) / profile.avgScore.length;
    const topSigs = Object.entries(profile.signalFreq).sort((a,b) => b[1] - a[1]).slice(0, 3);
    const sigStr = topSigs.map(([s, n]) => `${s}(${n})`).join(', ');

    console.log(`  ${region.padEnd(20)}: ${profile.countries.size} countries | avg score ${avgScore.toFixed(1)} | top signals: ${sigStr}`);

    addFinding('Regional Profiles', `${region} signature`,
      `${profile.countries.size} countries, avg score ${avgScore.toFixed(1)}, dominant signals: ${topSigs.map(([s]) => s).join(', ')}`);
  }

  // Which signals are region-specific?
  console.log('\n  Region-specific signals (appear 2x more in one region vs others):');
  const allRegions = Object.keys(regionProfiles);

  for (const sig of SIGNAL_KEYS) {
    const rates = {};
    for (const region of allRegions) {
      const total = Object.values(regionProfiles[region].signalFreq).reduce((a,b) => a+b, 0) || 1;
      rates[region] = (regionProfiles[region].signalFreq[sig] || 0) / total;
    }

    const sortedRates = Object.entries(rates).sort((a,b) => b[1] - a[1]);
    if (sortedRates[0][1] > sortedRates[sortedRates.length - 1][1] * 2 && sortedRates[0][1] > 0.05) {
      console.log(`    ${sig.padEnd(20)}: dominant in ${sortedRates[0][0]} (${(sortedRates[0][1]*100).toFixed(0)}%), rare in ${sortedRates[sortedRates.length-1][0]} (${(sortedRates[sortedRates.length-1][1]*100).toFixed(0)}%)`);
      addFinding('Regional Profiles', `${sig} regional specificity`,
        `Dominant in ${sortedRates[0][0]} (${(sortedRates[0][1]*100).toFixed(0)}%), rare in ${sortedRates[sortedRates.length-1][0]}`);
    }
  }

  return regionProfiles;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 16: Stress Persistence Patterns
// ═══════════════════════════════════════════════════════════════════════════════

function analyzeStressPersistence(countryMap, clusters) {
  console.log('\n━━ MODULE 16: Stress Persistence Patterns ━━━━━━━━━━━━━━━━━━━━━━━━━');

  const persistenceEvents = [];

  for (const [country, yearMap] of Object.entries(countryMap)) {
    const years = Object.keys(yearMap).map(Number).sort((a, b) => a - b);

    let runStart = null;
    let runThreshold = null;

    for (const year of years) {
      const score = yearMap[year]?.score || 0;

      // Track elevated runs (score > 70)
      if (score >= 70) {
        if (runStart === null) {
          runStart = year;
          runThreshold = score >= CRITICAL ? 'CRITICAL' : 'ELEVATED';
        } else if (score >= CRITICAL) {
          runThreshold = 'CRITICAL';
        }
      } else {
        if (runStart !== null && year - runStart >= 5) {
          const bd = yearMap[runStart]?.breakdown || {};
          const dominantSigs = Object.entries(bd)
            .filter(([k, v]) => (v.stress_z || 0) > 0.5)
            .map(([k]) => k);

          persistenceEvents.push({
            country, start: runStart, end: year - 1, duration: year - runStart,
            peakThreshold: runThreshold, dominantSigs,
            cluster: clusters[country]?.cluster_label || 'unknown'
          });
        }
        runStart = null;
        runThreshold = null;
      }
    }

    // Handle ongoing runs
    if (runStart !== null && years[years.length - 1] - runStart >= 5) {
      const bd = yearMap[runStart]?.breakdown || {};
      const dominantSigs = Object.entries(bd)
        .filter(([k, v]) => (v.stress_z || 0) > 0.5)
        .map(([k]) => k);

      persistenceEvents.push({
        country, start: runStart, end: years[years.length - 1], duration: years[years.length - 1] - runStart + 1,
        peakThreshold: runThreshold, dominantSigs,
        cluster: clusters[country]?.cluster_label || 'unknown', ongoing: true
      });
    }
  }

  persistenceEvents.sort((a, b) => b.duration - a.duration);

  console.log(`\n  Prolonged elevated stress periods (5+ years): ${persistenceEvents.length}`);
  console.log('\n  Longest stress periods:');
  for (const e of persistenceEvents.slice(0, 15)) {
    const ongoing = e.ongoing ? ' (ongoing)' : '';
    console.log(`    ${e.country.padEnd(20)}: ${e.duration}yr (${e.start}-${e.end})${ongoing} | peak: ${e.peakThreshold} | signals: ${e.dominantSigs.join(', ') || 'unknown'}`);
    if (e.duration >= 10) {
      addFinding('Stress Persistence', `${e.country} prolonged stress`,
        `${e.duration} years at elevated/critical (${e.start}-${e.end}), peak ${e.peakThreshold}, signals: ${e.dominantSigs.join(', ')}`);
    }
  }

  // Signals associated with prolonged stress
  const longRunSigs = {};
  for (const e of persistenceEvents.filter(p => p.duration >= 8)) {
    for (const sig of e.dominantSigs) {
      longRunSigs[sig] = (longRunSigs[sig] || 0) + 1;
    }
  }

  console.log('\n  Signals associated with 8+ year stress periods:');
  for (const [sig, count] of Object.entries(longRunSigs).sort((a,b) => b[1] - a[1])) {
    console.log(`    ${sig.padEnd(20)}: ${count} cases`);
    addFinding('Stress Persistence', `${sig} prolonged stress association`,
      `Present in ${count} cases of 8+ year elevated stress periods`);
  }

  return persistenceEvents;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 17: Threshold Crossing Analysis
// ═══════════════════════════════════════════════════════════════════════════════

function analyzeThresholdCrossings(countryMap) {
  console.log('\n━━ MODULE 17: Threshold Crossing Patterns ━━━━━━━━━━━━━━━━━━━━━━━━━');

  const crossings = {
    stableToElevated: [],
    elevatedToStressed: [],
    stressedToCritical: [],
    criticalToStressed: [],
    stressedToElevated: [],
    elevatedToStable: []
  };

  function scoreToZone(score) {
    if (score >= CRITICAL) return 'CRITICAL';
    if (score >= ELEVATED) return 'STRESSED';
    if (score >= STABLE) return 'ELEVATED';
    return 'STABLE';
  }

  for (const [country, yearMap] of Object.entries(countryMap)) {
    const years = Object.keys(yearMap).map(Number).sort((a, b) => a - b);

    for (let i = 1; i < years.length; i++) {
      const prevScore = yearMap[years[i-1]]?.score || 0;
      const currScore = yearMap[years[i]]?.score || 0;
      const prevZone = scoreToZone(prevScore);
      const currZone = scoreToZone(currScore);

      if (prevZone !== currZone) {
        const bd = yearMap[years[i-1]]?.breakdown || {};
        const signals = Object.entries(bd)
          .filter(([k, v]) => Math.abs(v.stress_z || 0) > 0.3)
          .map(([k, v]) => ({ sig: k, z: v.stress_z }))
          .sort((a, b) => Math.abs(b.z) - Math.abs(a.z));

        const event = {
          country, year: years[i], prevScore: prevScore.toFixed(1), currScore: currScore.toFixed(1),
          from: prevZone, to: currZone, signals, region: REGION[country] || 'Unknown'
        };

        if (prevZone === 'STABLE' && currZone === 'ELEVATED') crossings.stableToElevated.push(event);
        else if (prevZone === 'ELEVATED' && currZone === 'STRESSED') crossings.elevatedToStressed.push(event);
        else if (prevZone === 'STRESSED' && currZone === 'CRITICAL') crossings.stressedToCritical.push(event);
        else if (prevZone === 'CRITICAL' && currZone === 'STRESSED') crossings.criticalToStressed.push(event);
        else if (prevZone === 'STRESSED' && currZone === 'ELEVATED') crossings.stressedToElevated.push(event);
        else if (prevZone === 'ELEVATED' && currZone === 'STABLE') crossings.elevatedToStable.push(event);
      }
    }
  }

  console.log('\n  Threshold crossing counts:');
  for (const [type, events] of Object.entries(crossings)) {
    console.log(`    ${type.padEnd(24)}: ${events.length} events`);
  }

  // What signals are present at each crossing type?
  console.log('\n  Pre-crossing signal profiles:');
  for (const [type, events] of Object.entries(crossings)) {
    if (events.length < 5) continue;

    const sigFreq = {};
    for (const e of events) {
      for (const s of e.signals.slice(0, 3)) {
        sigFreq[s.sig] = (sigFreq[s.sig] || 0) + 1;
      }
    }

    const topSigs = Object.entries(sigFreq).sort((a,b) => b[1] - a[1]).slice(0, 3);
    console.log(`    ${type}: ${topSigs.map(([s, n]) => `${s}(${(n/events.length*100).toFixed(0)}%)`).join(', ')}`);

    addFinding('Threshold Crossings', `${type} signal profile`,
      `Top pre-crossing signals: ${topSigs.map(([s, n]) => `${s}(${(n/events.length*100).toFixed(0)}%)`).join(', ')}`);
  }

  // Direct STABLE→CRITICAL jumps (skipping zones)
  const directJumps = [];
  for (const [country, yearMap] of Object.entries(countryMap)) {
    const years = Object.keys(yearMap).map(Number).sort((a, b) => a - b);
    for (let i = 1; i < years.length; i++) {
      const prev = yearMap[years[i-1]]?.score || 0;
      const curr = yearMap[years[i]]?.score || 0;
      if (prev < STABLE && curr >= CRITICAL) {
        directJumps.push({ country, year: years[i], prev: prev.toFixed(1), curr: curr.toFixed(1) });
      }
    }
  }

  console.log(`\n  Direct STABLE→CRITICAL jumps (skipping zones): ${directJumps.length}`);
  for (const j of directJumps.slice(0, 10)) {
    console.log(`    ${j.country} ${j.year}: ${j.prev} → ${j.curr}`);
    addFinding('Threshold Crossings', `${j.country} direct jump ${j.year}`,
      `Score jumped from ${j.prev} directly to ${j.curr} in one year — no warning zone`);
  }

  return crossings;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 18: Multi-Signal Combination Analysis
// ═══════════════════════════════════════════════════════════════════════════════

function analyzeMultiSignalCombinations(countryMap) {
  console.log('\n━━ MODULE 18: Multi-Signal Combinations ━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Find signal combinations and their outcomes
  const combinations = {};

  for (const [country, yearMap] of Object.entries(countryMap)) {
    const years = Object.keys(yearMap).map(Number).sort((a, b) => a - b);

    for (let i = 0; i < years.length; i++) {
      const year = years[i];
      const bd = yearMap[year]?.breakdown || {};
      const score = yearMap[year]?.score || 0;

      // Get elevated signals (z > 0.5)
      const elevated = Object.entries(bd)
        .filter(([k, v]) => (v.stress_z || 0) > 0.5)
        .map(([k]) => k)
        .sort();

      if (elevated.length >= 2 && elevated.length <= 4) {
        const combo = elevated.join('+');
        if (!combinations[combo]) {
          combinations[combo] = { scores: [], wentCritical: 0, total: 0 };
        }
        combinations[combo].scores.push(score);
        combinations[combo].total++;

        // Check if went CRITICAL within 3 years
        const future = years.filter(y => y > year && y <= year + 3);
        if (future.some(y => (yearMap[y]?.score || 0) >= CRITICAL)) {
          combinations[combo].wentCritical++;
        }
      }
    }
  }

  // Find dangerous combinations (high crisis rate)
  const dangerous = [];
  for (const [combo, stats] of Object.entries(combinations)) {
    if (stats.total >= 10) {
      const crisisRate = stats.wentCritical / stats.total;
      const avgScore = stats.scores.reduce((a,b) => a+b, 0) / stats.scores.length;
      dangerous.push({ combo, crisisRate, avgScore: avgScore.toFixed(1), n: stats.total });
    }
  }

  dangerous.sort((a, b) => b.crisisRate - a.crisisRate);

  console.log('\n  Most dangerous signal combinations (highest 3-year crisis rate):');
  for (const d of dangerous.slice(0, 15)) {
    const status = d.crisisRate >= 0.3 ? '🔴 HIGH RISK' : d.crisisRate >= 0.15 ? '🟡 ELEVATED' : '';
    console.log(`    ${d.combo}: ${(d.crisisRate*100).toFixed(0)}% crisis rate | avg score ${d.avgScore} | n=${d.n} ${status}`);
    if (d.crisisRate >= 0.2) {
      addFinding('Signal Combinations', `${d.combo} dangerous combination`,
        `${(d.crisisRate*100).toFixed(0)}% went CRITICAL within 3 years (n=${d.n})`);
    }
  }

  // Find protective combinations (low crisis rate)
  dangerous.sort((a, b) => a.crisisRate - b.crisisRate);
  console.log('\n  Protective signal combinations (lowest crisis rate):');
  for (const d of dangerous.slice(0, 10)) {
    console.log(`    ${d.combo}: ${(d.crisisRate*100).toFixed(0)}% crisis rate | avg score ${d.avgScore} | n=${d.n}`);
    if (d.crisisRate < 0.05 && d.n >= 15) {
      addFinding('Signal Combinations', `${d.combo} protective combination`,
        `Only ${(d.crisisRate*100).toFixed(0)}% went CRITICAL within 3 years despite elevated signals (n=${d.n})`);
    }
  }

  return combinations;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 19: Oscillation Patterns
// ═══════════════════════════════════════════════════════════════════════════════

function analyzeOscillationPatterns(countryMap) {
  console.log('\n━━ MODULE 19: Oscillation Patterns — Countries That Bounce ━━━━━━━━');

  const oscillators = [];

  for (const [country, yearMap] of Object.entries(countryMap)) {
    const years = Object.keys(yearMap).map(Number).sort((a, b) => a - b);
    if (years.length < 10) continue;

    let directionChanges = 0;
    let lastDirection = null;

    for (let i = 1; i < years.length; i++) {
      const prev = yearMap[years[i-1]]?.score || 0;
      const curr = yearMap[years[i]]?.score || 0;
      const delta = curr - prev;

      if (Math.abs(delta) > 5) {
        const direction = delta > 0 ? 'up' : 'down';
        if (lastDirection && direction !== lastDirection) {
          directionChanges++;
        }
        lastDirection = direction;
      }
    }

    if (directionChanges >= 5) {
      const scores = years.map(y => yearMap[y]?.score || 0);
      oscillators.push({
        country, oscillations: directionChanges, years: years.length,
        avgScore: (scores.reduce((a,b) => a+b, 0) / scores.length).toFixed(1),
        scoreRange: (Math.max(...scores) - Math.min(...scores)).toFixed(1)
      });
    }
  }

  oscillators.sort((a, b) => b.oscillations - a.oscillations);

  console.log(`\n  Countries with high oscillation (5+ direction changes): ${oscillators.length}`);
  console.log('\n  Top oscillators:');
  for (const o of oscillators.slice(0, 15)) {
    console.log(`    ${o.country.padEnd(20)}: ${o.oscillations} reversals in ${o.years}yr | avg ${o.avgScore} | range ${o.scoreRange}`);
    if (o.oscillations >= 8) {
      addFinding('Oscillation Patterns', `${o.country} high oscillation`,
        `${o.oscillations} direction reversals in ${o.years} years — chronically unstable trajectory`);
    }
  }

  // Are oscillators more likely to eventually go CRITICAL?
  const oscillatorCountries = new Set(oscillators.map(o => o.country));
  let oscillatorsCritical = 0;
  let nonOscillatorsCritical = 0;
  let totalOscillators = oscillators.length;
  let totalNonOscillators = 0;

  for (const [country, yearMap] of Object.entries(countryMap)) {
    const maxScore = Math.max(...Object.values(yearMap).map(d => d.score || 0));
    if (oscillatorCountries.has(country)) {
      if (maxScore >= CRITICAL) oscillatorsCritical++;
    } else {
      totalNonOscillators++;
      if (maxScore >= CRITICAL) nonOscillatorsCritical++;
    }
  }

  const oscillatorCrisisRate = (oscillatorsCritical / totalOscillators * 100).toFixed(0);
  const nonOscillatorCrisisRate = (nonOscillatorsCritical / totalNonOscillators * 100).toFixed(0);

  console.log(`\n  Oscillators crisis rate: ${oscillatorCrisisRate}% (${oscillatorsCritical}/${totalOscillators})`);
  console.log(`  Non-oscillators crisis rate: ${nonOscillatorCrisisRate}% (${nonOscillatorsCritical}/${totalNonOscillators})`);

  addFinding('Oscillation Patterns', 'Oscillation vs crisis correlation',
    `Oscillators: ${oscillatorCrisisRate}% went CRITICAL. Non-oscillators: ${nonOscillatorCrisisRate}%`);

  return oscillators;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 20: Signal Emergence Timing
// ═══════════════════════════════════════════════════════════════════════════════

function analyzeSignalEmergenceTiming(countryMap) {
  console.log('\n━━ MODULE 20: Signal Emergence Timing ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // When does each signal typically first appear in a country's record?
  const firstAppearance = {};

  for (const [country, yearMap] of Object.entries(countryMap)) {
    const years = Object.keys(yearMap).map(Number).sort((a, b) => a - b);
    if (years.length < 10) continue;

    const countryFirst = {};
    for (const year of years) {
      const bd = yearMap[year]?.breakdown || {};
      for (const sig of Object.keys(bd)) {
        if (!countryFirst[sig]) countryFirst[sig] = year;
      }
    }

    // Convert to years from start of record
    const startYear = years[0];
    for (const [sig, year] of Object.entries(countryFirst)) {
      if (!firstAppearance[sig]) firstAppearance[sig] = [];
      firstAppearance[sig].push(year - startYear);
    }
  }

  console.log('\n  Average years until signal first appears (from start of country record):');
  const emergence = [];
  for (const [sig, years] of Object.entries(firstAppearance)) {
    if (years.length >= 20) {
      const avg = years.reduce((a,b) => a+b, 0) / years.length;
      emergence.push({ sig, avgYears: avg, n: years.length });
    }
  }

  emergence.sort((a, b) => a.avgYears - b.avgYears);
  for (const e of emergence) {
    const label = e.avgYears < 5 ? '⚡ EARLY WARNING' : e.avgYears > 15 ? '🐌 LATE SIGNAL' : '';
    console.log(`    ${e.sig.padEnd(20)}: appears at year ${e.avgYears.toFixed(1)} on average (n=${e.n}) ${label}`);
    addFinding('Signal Emergence', `${e.sig} emergence timing`,
      `Appears on average ${e.avgYears.toFixed(1)} years into a country's record (n=${e.n})`);
  }

  return emergence;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 21: Crisis Clustering in Time
// ═══════════════════════════════════════════════════════════════════════════════

function analyzeCrisisClusteringInTime(countryMap) {
  console.log('\n━━ MODULE 21: Crisis Clustering in Time — Global Waves ━━━━━━━━━━━━');

  // Count CRITICAL entries per year globally
  const crisesByYear = {};

  for (const [country, yearMap] of Object.entries(countryMap)) {
    const years = Object.keys(yearMap).map(Number).sort((a, b) => a - b);

    for (let i = 1; i < years.length; i++) {
      const prev = yearMap[years[i-1]]?.score || 0;
      const curr = yearMap[years[i]]?.score || 0;

      if (prev < CRITICAL && curr >= CRITICAL) {
        if (!crisesByYear[years[i]]) crisesByYear[years[i]] = [];
        crisesByYear[years[i]].push(country);
      }
    }
  }

  // Find crisis waves (3+ countries in same year)
  console.log('\n  Crisis waves (3+ countries entering CRITICAL in same year):');
  const waves = [];
  for (const [year, countries] of Object.entries(crisesByYear).sort((a,b) => Number(a[0]) - Number(b[0]))) {
    if (countries.length >= 3) {
      waves.push({ year: Number(year), countries, count: countries.length });
      console.log(`    ${year}: ${countries.length} countries — ${countries.join(', ')}`);
      addFinding('Crisis Waves', `${year} global crisis wave`,
        `${countries.length} countries entered CRITICAL simultaneously: ${countries.join(', ')}`);
    }
  }

  // Find crisis clusters (multiple crises within 2-year window)
  const clusters = [];
  const allYears = Object.keys(crisesByYear).map(Number).sort((a,b) => a - b);

  for (let i = 0; i < allYears.length; i++) {
    const windowStart = allYears[i];
    const windowCountries = [];

    for (const y of allYears.filter(y => y >= windowStart && y <= windowStart + 2)) {
      windowCountries.push(...(crisesByYear[y] || []));
    }

    if (windowCountries.length >= 5 && !clusters.some(c => Math.abs(c.start - windowStart) < 3)) {
      clusters.push({ start: windowStart, end: windowStart + 2, countries: [...new Set(windowCountries)], count: windowCountries.length });
    }
  }

  console.log('\n  Crisis clusters (5+ countries within 2-year window):');
  for (const c of clusters) {
    console.log(`    ${c.start}-${c.end}: ${c.count} crisis entries — ${c.countries.slice(0, 8).join(', ')}${c.countries.length > 8 ? '...' : ''}`);
    addFinding('Crisis Waves', `${c.start}-${c.end} crisis cluster`,
      `${c.count} crisis entries across ${c.countries.length} countries in 2-year window`);
  }

  // Longest crisis-free periods
  const sortedYears = allYears.sort((a, b) => a - b);
  let maxGap = 0;
  let maxGapStart = null;

  for (let i = 1; i < sortedYears.length; i++) {
    const gap = sortedYears[i] - sortedYears[i-1];
    if (gap > maxGap) {
      maxGap = gap;
      maxGapStart = sortedYears[i-1];
    }
  }

  if (maxGapStart) {
    console.log(`\n  Longest crisis-free period: ${maxGap} years (${maxGapStart}-${maxGapStart + maxGap})`);
    addFinding('Crisis Waves', `Longest crisis-free period`,
      `${maxGap} years without new CRITICAL entries (${maxGapStart}-${maxGapStart + maxGap})`);
  }

  return { crisesByYear, waves, clusters };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 22: Predecessor Country Analysis
// ═══════════════════════════════════════════════════════════════════════════════

function analyzePredecessorCountries(countryMap, clusters) {
  console.log('\n━━ MODULE 22: Predecessor Countries — Who Falls First in a Cluster ━');

  // For each cluster, find which country typically enters crisis first
  const clusterCrises = {};

  for (const [country, yearMap] of Object.entries(countryMap)) {
    const cluster = clusters[country]?.cluster_label || 'unknown';
    if (!clusterCrises[cluster]) clusterCrises[cluster] = [];

    const years = Object.keys(yearMap).map(Number).sort((a, b) => a - b);
    for (let i = 1; i < years.length; i++) {
      const prev = yearMap[years[i-1]]?.score || 0;
      const curr = yearMap[years[i]]?.score || 0;
      if (prev < CRITICAL && curr >= CRITICAL) {
        clusterCrises[cluster].push({ country, year: years[i] });
      }
    }
  }

  console.log('\n  First-to-fall countries by cluster:');
  for (const [cluster, crises] of Object.entries(clusterCrises)) {
    if (crises.length < 3) continue;

    crises.sort((a, b) => a.year - b.year);
    const countryOrder = {};
    const usedYears = new Set();

    for (const c of crises) {
      if (!usedYears.has(c.year)) {
        countryOrder[c.country] = (countryOrder[c.country] || 0) + 1;
        usedYears.add(c.year);
      }
    }

    const ranked = Object.entries(countryOrder).sort((a,b) => b[1] - a[1]);
    console.log(`  ${cluster}:`);
    for (const [country, count] of ranked.slice(0, 3)) {
      console.log(`    ${country.padEnd(20)}: first to crisis ${count} times`);
      if (count >= 2) {
        addFinding('Predecessor Countries', `${country} canary in ${cluster}`,
          `First to enter CRITICAL in cluster ${count} times — early warning indicator for peer countries`);
      }
    }
  }

  return clusterCrises;
}

// ═══════════════════════════════════════════════════════════════════════════════
// WRITE ALL FINDINGS
// ═══════════════════════════════════════════════════════════════════════════════

function writeAllFindings() {
  const date = new Date().toISOString().slice(0, 10);

  const lines = [
    '',
    '---',
    '',
    `## Deep Intelligence Mining — Pass 2`,
    `## Run: ${date} | Modules 14-22 | Additional ${ALL_FINDINGS.length} findings`,
    '',
  ];

  const byCategory = {};
  for (const f of ALL_FINDINGS) {
    if (!byCategory[f.category]) byCategory[f.category] = [];
    byCategory[f.category].push(f);
  }

  for (const [category, findings] of Object.entries(byCategory)) {
    lines.push(`### ${category}`);
    lines.push('');
    for (const f of findings) {
      const status = f.confirmed ? '✓' : '✗';
      lines.push(`- **${f.title}** ${status}`);
      lines.push(`  ${f.details}`);
    }
    lines.push('');
  }

  const existing = fs.readFileSync(FINDINGS_PATH, 'utf8');
  fs.writeFileSync(FINDINGS_PATH, existing + lines.join('\n'));

  console.log(`\n  ${ALL_FINDINGS.length} additional findings appended to SABIAN_INTELLIGENCE_FINDINGS.md`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('\n🔬 DEEP INTELLIGENCE MINING — PASS 2');
  console.log('   Modules 14-22: Additional analysis dimensions\n');

  process.stdout.write('  Loading data ');
  const [scores, clusters] = await Promise.all([
    loadAllScores(),
    loadClusters(),
  ]);
  console.log(`done. ${scores.length} rows.`);

  const countryMap = buildCountryMap(scores);
  console.log(`  ${Object.keys(countryMap).length} countries loaded.\n`);

  analyzeYearOverYearAcceleration(countryMap);
  analyzeRegionalSignalProfiles(countryMap);
  analyzeStressPersistence(countryMap, clusters);
  analyzeThresholdCrossings(countryMap);
  analyzeMultiSignalCombinations(countryMap);
  analyzeOscillationPatterns(countryMap);
  analyzeSignalEmergenceTiming(countryMap);
  analyzeCrisisClusteringInTime(countryMap);
  analyzePredecessorCountries(countryMap, clusters);

  writeAllFindings();

  console.log('\n' + '═'.repeat(70));
  console.log('✅ DEEP INTELLIGENCE MINING PASS 2 COMPLETE');
  console.log(`   ${ALL_FINDINGS.length} additional findings recorded`);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
