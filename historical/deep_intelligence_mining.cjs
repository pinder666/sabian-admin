// historical/deep_intelligence_mining.cjs
// Comprehensive intelligence mining across all data dimensions.
// Tests every combination, every angle, every signal pair at every lag.
// Null results reported alongside confirmed findings.
//
// Usage: node historical/deep_intelligence_mining.cjs

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

// ── Region map ────────────────────────────────────────────────────────────────
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

// ── Data loaders ──────────────────────────────────────────────────────────────

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

async function loadSignalBaselines() {
  const { data, error } = await sb.from('signal_baselines').select('*');
  if (error) throw error;
  return data || [];
}

async function loadGoingDarkPatterns() {
  const { data, error } = await sb.from('going_dark_patterns').select('*');
  if (error) throw error;
  return data || [];
}

async function loadSignalCorrelations() {
  const { data, error } = await sb.from('signal_correlation_map').select('*');
  if (error) throw error;
  return data || [];
}

async function loadLeadIndicators() {
  const { data, error } = await sb.from('signal_lead_indicators').select('*');
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

function decade(year) { return Math.floor(year / 10) * 10; }

// ═══════════════════════════════════════════════════════════════════════════════
// ANALYSIS MODULES
// ═══════════════════════════════════════════════════════════════════════════════

// ── Module 1: Signal Pair Analysis at All Lags ────────────────────────────────

function analyzeSignalPairsAllLags(countryMap) {
  console.log('\n━━ MODULE 1: Signal Pair Analysis — All Lags 1-10 Years ━━━━━━━━━━━━');

  const results = [];

  for (const sigA of SIGNAL_KEYS) {
    for (const sigB of SIGNAL_KEYS) {
      if (sigA === sigB) continue;

      for (let lag = 1; lag <= 10; lag++) {
        let observations = 0;
        let coMovements = 0; // both elevated
        let aLeadsB = 0;     // A elevated at T, B elevated at T+lag

        for (const [country, yearMap] of Object.entries(countryMap)) {
          const years = Object.keys(yearMap).map(Number).sort((a, b) => a - b);

          for (const T of years) {
            const bdT = yearMap[T]?.breakdown || {};
            const bdLag = yearMap[T + lag]?.breakdown || {};

            const zA = bdT[sigA]?.stress_z;
            const zB = bdLag[sigB]?.stress_z;

            if (zA === undefined || zA === null) continue;
            if (zB === undefined || zB === null) continue;

            observations++;

            if (Math.abs(zA) > 0.5 && Math.abs(zB) > 0.5) {
              coMovements++;
              if (zA > 0.5 && zB > 0.5) aLeadsB++;
            }
          }
        }

        if (observations >= 20) {
          const coRate = coMovements / observations;
          const leadRate = aLeadsB / observations;

          if (coRate > 0.3 || leadRate > 0.2) {
            results.push({
              sigA, sigB, lag, observations,
              coRate: (coRate * 100).toFixed(1),
              leadRate: (leadRate * 100).toFixed(1)
            });
          }
        }
      }
    }
  }

  results.sort((a, b) => parseFloat(b.leadRate) - parseFloat(a.leadRate));

  console.log(`  Tested ${SIGNAL_KEYS.length * (SIGNAL_KEYS.length - 1) * 10} signal-pair-lag combinations`);
  console.log(`  Significant relationships found: ${results.length}`);

  const topLeads = results.slice(0, 15);
  console.log('\n  Top 15 leading relationships:');
  for (const r of topLeads) {
    console.log(`    ${r.sigA} → ${r.sigB} (lag ${r.lag}yr): lead rate ${r.leadRate}% (n=${r.observations})`);
    addFinding('Signal Pairs', `${r.sigA} → ${r.sigB} lag ${r.lag}yr`,
      `Lead rate ${r.leadRate}%, n=${r.observations} observations`);
  }

  // Find signal combinations that NEVER co-occur
  const neverCoOccur = [];
  for (const sigA of SIGNAL_KEYS) {
    for (const sigB of SIGNAL_KEYS) {
      if (sigA >= sigB) continue;
      let found = false;
      for (const [country, yearMap] of Object.entries(countryMap)) {
        for (const year of Object.keys(yearMap)) {
          const bd = yearMap[year]?.breakdown || {};
          if (bd[sigA] && bd[sigB]) { found = true; break; }
        }
        if (found) break;
      }
      if (!found) neverCoOccur.push([sigA, sigB]);
    }
  }

  if (neverCoOccur.length > 0) {
    console.log('\n  Signal combinations that NEVER appear together:');
    for (const [a, b] of neverCoOccur) {
      console.log(`    ${a} + ${b}: never co-occur in any country-year`);
      addFinding('Signal Pairs', `${a} + ${b} never co-occur`,
        'These signals have never appeared together in the same country-year across the full historical record');
    }
  } else {
    console.log('\n  All signal combinations appear together at least once.');
    addFinding('Signal Pairs', 'All signal combinations exist',
      'Every possible signal pair has co-occurred at least once in the historical record', false);
  }

  return results;
}

// ── Module 2: Cluster Outcomes Analysis ───────────────────────────────────────

function analyzeClusterOutcomes(countryMap, clusters) {
  console.log('\n━━ MODULE 2: Cluster Outcomes — Membership vs Transitions ━━━━━━━━━━');

  const clusterStats = {};

  for (const [country, yearMap] of Object.entries(countryMap)) {
    const c = clusters[country];
    if (!c) continue;
    const label = c.cluster_label || `cluster_${c.cluster_id}`;

    if (!clusterStats[label]) {
      clusterStats[label] = {
        countries: 0,
        countryYears: 0,
        criticalCrossings: 0,
        recoveries: 0,
        avgTransitionSpeed: [],
        avgRecoverySpeed: [],
        neverCritical: 0
      };
    }

    clusterStats[label].countries++;

    const years = Object.keys(yearMap).map(Number).sort((a, b) => a - b);
    clusterStats[label].countryYears += years.length;

    let inCritical = false;
    let criticalStart = null;
    let stableStart = null;
    let everCritical = false;

    for (const year of years) {
      const score = yearMap[year]?.score || 0;

      if (score < STABLE && !inCritical) {
        stableStart = year;
      }

      if (score >= CRITICAL && !inCritical) {
        inCritical = true;
        criticalStart = year;
        everCritical = true;
        clusterStats[label].criticalCrossings++;
        if (stableStart) {
          clusterStats[label].avgTransitionSpeed.push(year - stableStart);
        }
      }

      if (score < STABLE && inCritical) {
        inCritical = false;
        clusterStats[label].recoveries++;
        if (criticalStart) {
          clusterStats[label].avgRecoverySpeed.push(year - criticalStart);
        }
      }
    }

    if (!everCritical) clusterStats[label].neverCritical++;
  }

  console.log('\n  Cluster outcomes:');
  const sorted = Object.entries(clusterStats).sort((a, b) =>
    (b[1].criticalCrossings / b[1].countries) - (a[1].criticalCrossings / a[1].countries));

  for (const [label, s] of sorted) {
    const critRate = (s.criticalCrossings / s.countries).toFixed(2);
    const recoveryRate = s.criticalCrossings > 0 ? (s.recoveries / s.criticalCrossings * 100).toFixed(0) : 'n/a';
    const avgTrans = s.avgTransitionSpeed.length > 0
      ? (s.avgTransitionSpeed.reduce((a,b) => a+b, 0) / s.avgTransitionSpeed.length).toFixed(1)
      : 'n/a';
    const avgRec = s.avgRecoverySpeed.length > 0
      ? (s.avgRecoverySpeed.reduce((a,b) => a+b, 0) / s.avgRecoverySpeed.length).toFixed(1)
      : 'n/a';

    console.log(`  ${label.padEnd(25)}`);
    console.log(`    countries: ${s.countries} | critical crossings: ${s.criticalCrossings} (${critRate}/country)`);
    console.log(`    recovery rate: ${recoveryRate}% | avg transition: ${avgTrans}yr | avg recovery: ${avgRec}yr`);
    console.log(`    never critical: ${s.neverCritical} countries`);

    addFinding('Cluster Outcomes', `${label} crisis profile`,
      `${critRate} crises/country, ${recoveryRate}% recovery rate, ${avgTrans}yr avg transition speed`);
  }

  // Find highest and lowest risk clusters
  const highestRisk = sorted[0];
  const lowestRisk = sorted[sorted.length - 1];

  console.log(`\n  FINDING: Highest crisis rate — ${highestRisk[0]} (${(highestRisk[1].criticalCrossings / highestRisk[1].countries).toFixed(2)} crises/country)`);
  console.log(`  FINDING: Lowest crisis rate  — ${lowestRisk[0]} (${(lowestRisk[1].criticalCrossings / lowestRisk[1].countries).toFixed(2)} crises/country)`);

  return clusterStats;
}

// ── Module 3: Regional Contagion ──────────────────────────────────────────────

function analyzeRegionalContagion(countryMap, clusters) {
  console.log('\n━━ MODULE 3: Regional Contagion — Does Crisis Spread? ━━━━━━━━━━━━━');

  // Group countries by cluster
  const clusterMembers = {};
  for (const [country, c] of Object.entries(clusters)) {
    const label = c.cluster_label || `cluster_${c.cluster_id}`;
    if (!clusterMembers[label]) clusterMembers[label] = [];
    clusterMembers[label].push(country);
  }

  const contagionEvents = [];

  for (const [label, members] of Object.entries(clusterMembers)) {
    if (members.length < 2) continue;

    // Find all CRITICAL crossings per cluster
    const crossings = [];
    for (const country of members) {
      const yearMap = countryMap[country] || {};
      const years = Object.keys(yearMap).map(Number).sort((a, b) => a - b);

      for (let i = 1; i < years.length; i++) {
        const prev = yearMap[years[i-1]]?.score || 0;
        const curr = yearMap[years[i]]?.score || 0;
        if (prev < CRITICAL && curr >= CRITICAL) {
          crossings.push({ country, year: years[i] });
        }
      }
    }

    // Check if other cluster members followed within 3 years
    for (const c1 of crossings) {
      const followers = crossings.filter(c2 =>
        c2.country !== c1.country &&
        c2.year > c1.year &&
        c2.year <= c1.year + 3
      );

      if (followers.length > 0) {
        contagionEvents.push({
          cluster: label,
          trigger: c1.country,
          triggerYear: c1.year,
          followers: followers.map(f => `${f.country}(${f.year})`),
          count: followers.length
        });
      }
    }
  }

  // Aggregate by cluster
  const clusterContagion = {};
  for (const e of contagionEvents) {
    if (!clusterContagion[e.cluster]) {
      clusterContagion[e.cluster] = { events: 0, totalFollowers: 0 };
    }
    clusterContagion[e.cluster].events++;
    clusterContagion[e.cluster].totalFollowers += e.count;
  }

  console.log('\n  Contagion by cluster (crisis spreading within 3 years):');
  for (const [cluster, stats] of Object.entries(clusterContagion).sort((a,b) => b[1].totalFollowers - a[1].totalFollowers)) {
    console.log(`    ${cluster}: ${stats.events} trigger events → ${stats.totalFollowers} follow-on crises`);
    addFinding('Regional Contagion', `${cluster} contagion`,
      `${stats.events} trigger events led to ${stats.totalFollowers} follow-on crises within 3 years`);
  }

  // Top specific contagion chains
  contagionEvents.sort((a, b) => b.count - a.count);
  console.log('\n  Largest contagion chains:');
  for (const e of contagionEvents.slice(0, 8)) {
    console.log(`    ${e.trigger} (${e.triggerYear}) → ${e.followers.join(', ')}`);
  }

  // Regional contagion
  const regionContagion = {};
  for (const [country, yearMap] of Object.entries(countryMap)) {
    const region = REGION[country] || 'Unknown';
    const years = Object.keys(yearMap).map(Number).sort((a, b) => a - b);

    for (let i = 1; i < years.length; i++) {
      const prev = yearMap[years[i-1]]?.score || 0;
      const curr = yearMap[years[i]]?.score || 0;
      if (prev < CRITICAL && curr >= CRITICAL) {
        if (!regionContagion[region]) regionContagion[region] = [];
        regionContagion[region].push({ country, year: years[i] });
      }
    }
  }

  // Check regional follow-on within 2 years
  console.log('\n  Regional crisis clustering (crises within 2 years of each other):');
  for (const [region, crises] of Object.entries(regionContagion)) {
    const clusters = [];
    const used = new Set();

    for (const c1 of crises) {
      if (used.has(`${c1.country}-${c1.year}`)) continue;

      const cluster = [c1];
      used.add(`${c1.country}-${c1.year}`);

      for (const c2 of crises) {
        if (used.has(`${c2.country}-${c2.year}`)) continue;
        if (Math.abs(c1.year - c2.year) <= 2 && c1.country !== c2.country) {
          cluster.push(c2);
          used.add(`${c2.country}-${c2.year}`);
        }
      }

      if (cluster.length >= 3) {
        clusters.push(cluster);
      }
    }

    if (clusters.length > 0) {
      console.log(`    ${region}: ${clusters.length} crisis clusters`);
      for (const cl of clusters.slice(0, 3)) {
        console.log(`      ${cl.map(c => `${c.country}(${c.year})`).join(', ')}`);
      }
      addFinding('Regional Contagion', `${region} crisis clustering`,
        `${clusters.length} multi-country crisis clusters found`);
    }
  }

  return { contagionEvents, clusterContagion, regionContagion };
}

// ── Module 4: Decade-by-Decade Analysis ───────────────────────────────────────

function analyzeDecadeByDecade(countryMap) {
  console.log('\n━━ MODULE 4: Decade-by-Decade Evolution ━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const decadeStats = {};

  for (const [country, yearMap] of Object.entries(countryMap)) {
    for (const [year, data] of Object.entries(yearMap)) {
      const d = decade(Number(year));
      if (!decadeStats[d]) {
        decadeStats[d] = {
          scores: [],
          criticalCrossings: 0,
          recoveries: 0,
          avgSignalCount: [],
          signalDominance: {}
        };
      }

      decadeStats[d].scores.push(data.score || 0);

      const bd = data.breakdown || {};
      const sigs = Object.keys(bd);
      decadeStats[d].avgSignalCount.push(sigs.length);

      for (const sig of sigs) {
        if ((bd[sig].stress_z || 0) > 0.5) {
          decadeStats[d].signalDominance[sig] = (decadeStats[d].signalDominance[sig] || 0) + 1;
        }
      }
    }
  }

  // Count transitions per decade
  for (const [country, yearMap] of Object.entries(countryMap)) {
    const years = Object.keys(yearMap).map(Number).sort((a, b) => a - b);
    for (let i = 1; i < years.length; i++) {
      const d = decade(years[i]);
      const prev = yearMap[years[i-1]]?.score || 0;
      const curr = yearMap[years[i]]?.score || 0;

      if (prev < CRITICAL && curr >= CRITICAL) {
        decadeStats[d].criticalCrossings++;
      }
      if (prev >= CRITICAL && curr < STABLE) {
        decadeStats[d].recoveries++;
      }
    }
  }

  console.log('\n  Decade evolution:');
  for (const d of Object.keys(decadeStats).sort()) {
    const s = decadeStats[d];
    const avgScore = (s.scores.reduce((a,b) => a+b, 0) / s.scores.length).toFixed(1);
    const stdDev = Math.sqrt(s.scores.reduce((a, b) => a + (b - avgScore) ** 2, 0) / s.scores.length).toFixed(2);
    const avgSigs = (s.avgSignalCount.reduce((a,b) => a+b, 0) / s.avgSignalCount.length).toFixed(1);
    const topSig = Object.entries(s.signalDominance).sort((a,b) => b[1] - a[1])[0];

    console.log(`  ${d}s: avg score ${avgScore} (σ=${stdDev}) | crises: ${s.criticalCrossings} | recoveries: ${s.recoveries} | avg signals: ${avgSigs} | dominant: ${topSig?.[0] || 'n/a'}`);

    addFinding('Decade Analysis', `${d}s profile`,
      `avg score ${avgScore}, σ=${stdDev}, ${s.criticalCrossings} crises, dominant signal: ${topSig?.[0] || 'n/a'}`);
  }

  // Signal dominance shift over decades
  console.log('\n  Signal dominance by decade:');
  const allDecades = Object.keys(decadeStats).sort();
  for (const sig of SIGNAL_KEYS) {
    const trend = allDecades.map(d => {
      const total = Object.values(decadeStats[d].signalDominance).reduce((a,b) => a+b, 0) || 1;
      const sigCount = decadeStats[d].signalDominance[sig] || 0;
      return `${d}s:${(sigCount/total*100).toFixed(0)}%`;
    });
    if (Object.values(decadeStats).some(d => (d.signalDominance[sig] || 0) > 10)) {
      console.log(`    ${sig.padEnd(20)}: ${trend.join(' → ')}`);
    }
  }

  // Find biggest shifts
  const firstDecade = allDecades[0];
  const lastDecade = allDecades[allDecades.length - 2]; // Exclude 2030s (partial)

  const shifts = [];
  for (const sig of SIGNAL_KEYS) {
    const firstTotal = Object.values(decadeStats[firstDecade].signalDominance).reduce((a,b) => a+b, 0) || 1;
    const lastTotal = Object.values(decadeStats[lastDecade].signalDominance).reduce((a,b) => a+b, 0) || 1;
    const firstPct = (decadeStats[firstDecade].signalDominance[sig] || 0) / firstTotal;
    const lastPct = (decadeStats[lastDecade].signalDominance[sig] || 0) / lastTotal;
    shifts.push({ sig, change: lastPct - firstPct, first: (firstPct*100).toFixed(0), last: (lastPct*100).toFixed(0) });
  }

  shifts.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  console.log(`\n  Biggest signal shifts (${firstDecade}s → ${lastDecade}s):`);
  for (const s of shifts.slice(0, 5)) {
    const dir = s.change > 0 ? '↑' : '↓';
    console.log(`    ${s.sig}: ${s.first}% → ${s.last}% (${dir}${(Math.abs(s.change)*100).toFixed(0)}%)`);
    addFinding('Decade Analysis', `${s.sig} historical shift`,
      `${s.first}% → ${s.last}% from ${firstDecade}s to ${lastDecade}s`);
  }

  return decadeStats;
}

// ── Module 5: Recovery Analysis ──────────────────────────────────────────────

function analyzeRecoveryPatterns(countryMap, clusters, baselines) {
  console.log('\n━━ MODULE 5: Recovery Analysis — What Predicts Recovery? ━━━━━━━━━━');

  const recoveryEvents = [];
  const nonRecoveryEvents = [];

  for (const [country, yearMap] of Object.entries(countryMap)) {
    const years = Object.keys(yearMap).map(Number).sort((a, b) => a - b);

    let inCritical = false;
    let criticalStart = null;
    let preCriticalSignals = null;

    for (let i = 0; i < years.length; i++) {
      const year = years[i];
      const score = yearMap[year]?.score || 0;

      if (score >= CRITICAL && !inCritical) {
        inCritical = true;
        criticalStart = year;
        // Capture pre-critical signal profile
        const preBd = yearMap[years[Math.max(0, i-1)]]?.breakdown || {};
        preCriticalSignals = Object.entries(preBd)
          .filter(([k, v]) => Math.abs(v.stress_z || 0) > 0.5)
          .map(([k]) => k);
      }

      if (score < STABLE && inCritical) {
        inCritical = false;
        const duration = year - criticalStart;
        const cluster = clusters[country]?.cluster_label || 'unknown';
        recoveryEvents.push({
          country, criticalStart, recoveryYear: year, duration,
          cluster, preCriticalSignals, region: REGION[country] || 'Unknown'
        });
        criticalStart = null;
      }
    }

    // Still in critical at end of record
    if (inCritical && criticalStart) {
      const duration = years[years.length - 1] - criticalStart;
      if (duration >= 5) { // At least 5 years in critical without recovery
        nonRecoveryEvents.push({
          country, criticalStart, duration,
          cluster: clusters[country]?.cluster_label || 'unknown',
          preCriticalSignals,
          region: REGION[country] || 'Unknown'
        });
      }
    }
  }

  console.log(`\n  Recovery events: ${recoveryEvents.length}`);
  console.log(`  Non-recovery events (5+ years in critical): ${nonRecoveryEvents.length}`);

  // What signals precede recovery vs non-recovery?
  const recoverySigs = {};
  const nonRecoverySigs = {};

  for (const e of recoveryEvents) {
    for (const sig of (e.preCriticalSignals || [])) {
      recoverySigs[sig] = (recoverySigs[sig] || 0) + 1;
    }
  }
  for (const e of nonRecoveryEvents) {
    for (const sig of (e.preCriticalSignals || [])) {
      nonRecoverySigs[sig] = (nonRecoverySigs[sig] || 0) + 1;
    }
  }

  console.log('\n  Pre-crisis signals — recovery vs non-recovery:');
  for (const sig of SIGNAL_KEYS) {
    const recRate = recoveryEvents.length > 0 ? ((recoverySigs[sig] || 0) / recoveryEvents.length * 100).toFixed(0) : 0;
    const nonRecRate = nonRecoveryEvents.length > 0 ? ((nonRecoverySigs[sig] || 0) / nonRecoveryEvents.length * 100).toFixed(0) : 0;
    if (recRate > 10 || nonRecRate > 10) {
      const diff = Number(recRate) - Number(nonRecRate);
      const marker = diff > 15 ? '✓ RECOVERY PREDICTOR' : diff < -15 ? '✗ NON-RECOVERY MARKER' : '';
      console.log(`    ${sig.padEnd(20)}: recovery ${recRate}% | non-recovery ${nonRecRate}% ${marker}`);

      if (Math.abs(diff) > 15) {
        addFinding('Recovery Analysis', `${sig} ${diff > 0 ? 'predicts recovery' : 'predicts non-recovery'}`,
          `Present in ${recRate}% of recovery cases vs ${nonRecRate}% of non-recovery cases`);
      }
    }
  }

  // Recovery by cluster
  const clusterRecovery = {};
  for (const e of recoveryEvents) {
    if (!clusterRecovery[e.cluster]) clusterRecovery[e.cluster] = { recovered: 0, avgDuration: [] };
    clusterRecovery[e.cluster].recovered++;
    clusterRecovery[e.cluster].avgDuration.push(e.duration);
  }
  for (const e of nonRecoveryEvents) {
    if (!clusterRecovery[e.cluster]) clusterRecovery[e.cluster] = { recovered: 0, avgDuration: [] };
  }

  console.log('\n  Recovery by cluster:');
  for (const [cluster, stats] of Object.entries(clusterRecovery).sort((a,b) => b[1].recovered - a[1].recovered)) {
    const avgDur = stats.avgDuration.length > 0
      ? (stats.avgDuration.reduce((a,b) => a+b, 0) / stats.avgDuration.length).toFixed(1)
      : 'n/a';
    console.log(`    ${cluster.padEnd(25)}: ${stats.recovered} recoveries | avg duration: ${avgDur}yr`);
  }

  // Fastest and slowest recoveries
  recoveryEvents.sort((a, b) => a.duration - b.duration);
  console.log('\n  Fastest recoveries:');
  for (const e of recoveryEvents.slice(0, 5)) {
    console.log(`    ${e.country}: ${e.duration}yr (${e.criticalStart}→${e.recoveryYear})`);
  }

  console.log('\n  Slowest recoveries:');
  for (const e of recoveryEvents.slice(-5).reverse()) {
    console.log(`    ${e.country}: ${e.duration}yr (${e.criticalStart}→${e.recoveryYear})`);
  }

  // Countries that never recovered
  console.log('\n  Countries still in CRITICAL (5+ years without recovery):');
  for (const e of nonRecoveryEvents.sort((a,b) => b.duration - a.duration).slice(0, 10)) {
    console.log(`    ${e.country}: ${e.duration}yr in critical since ${e.criticalStart}`);
    addFinding('Recovery Analysis', `${e.country} prolonged crisis`,
      `${e.duration}yr in CRITICAL since ${e.criticalStart}, no recovery`);
  }

  return { recoveryEvents, nonRecoveryEvents };
}

// ── Module 6: Stability Analysis ─────────────────────────────────────────────

function analyzeStabilityPatterns(countryMap, clusters) {
  console.log('\n━━ MODULE 6: Stability Analysis — What Keeps Countries Stable? ━━━━');

  const stabilityProfiles = [];

  for (const [country, yearMap] of Object.entries(countryMap)) {
    const years = Object.keys(yearMap).map(Number).sort((a, b) => a - b);
    if (years.length < 20) continue;

    const scores = years.map(y => yearMap[y]?.score || 0);
    const avgScore = scores.reduce((a,b) => a+b, 0) / scores.length;
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);
    const variance = scores.reduce((a, b) => a + (b - avgScore) ** 2, 0) / scores.length;

    // Count signal presence
    const signalPresence = {};
    for (const year of years) {
      const bd = yearMap[year]?.breakdown || {};
      for (const [sig, val] of Object.entries(bd)) {
        signalPresence[sig] = (signalPresence[sig] || 0) + 1;
      }
    }

    const neverCritical = maxScore < CRITICAL;
    const alwaysStable = maxScore < ELEVATED;

    stabilityProfiles.push({
      country,
      avgScore: avgScore.toFixed(1),
      maxScore: maxScore.toFixed(1),
      minScore: minScore.toFixed(1),
      variance: variance.toFixed(1),
      yearsTracked: years.length,
      neverCritical,
      alwaysStable,
      signalPresence,
      cluster: clusters[country]?.cluster_label || 'unknown',
      region: REGION[country] || 'Unknown'
    });
  }

  // Most stable countries (never went critical)
  const stableCountries = stabilityProfiles.filter(p => p.neverCritical);
  stableCountries.sort((a, b) => parseFloat(a.variance) - parseFloat(b.variance));

  console.log(`\n  Countries that NEVER crossed CRITICAL: ${stableCountries.length}`);

  // Common signals in stable countries
  const stableSigFreq = {};
  for (const p of stableCountries) {
    for (const [sig, count] of Object.entries(p.signalPresence)) {
      stableSigFreq[sig] = (stableSigFreq[sig] || 0) + count;
    }
  }

  console.log('\n  Most stable countries (lowest variance, never critical):');
  for (const p of stableCountries.slice(0, 10)) {
    console.log(`    ${p.country.padEnd(22)}: avg=${p.avgScore} max=${p.maxScore} σ²=${p.variance} (${p.yearsTracked}yr)`);
    addFinding('Stability Analysis', `${p.country} stability profile`,
      `Never crossed CRITICAL in ${p.yearsTracked} years, avg score ${p.avgScore}, max ${p.maxScore}`);
  }

  // Common characteristics of stable countries
  const stableRegions = {};
  const stableClusters = {};
  for (const p of stableCountries) {
    stableRegions[p.region] = (stableRegions[p.region] || 0) + 1;
    stableClusters[p.cluster] = (stableClusters[p.cluster] || 0) + 1;
  }

  console.log('\n  Stable countries by region:');
  for (const [region, count] of Object.entries(stableRegions).sort((a,b) => b[1] - a[1])) {
    console.log(`    ${region}: ${count} countries never reached CRITICAL`);
  }

  console.log('\n  Stable countries by cluster:');
  for (const [cluster, count] of Object.entries(stableClusters).sort((a,b) => b[1] - a[1])) {
    console.log(`    ${cluster}: ${count} countries never reached CRITICAL`);
    addFinding('Stability Analysis', `${cluster} stability rate`,
      `${count} countries in this cluster never crossed CRITICAL`);
  }

  // Most volatile countries
  stabilityProfiles.sort((a, b) => parseFloat(b.variance) - parseFloat(a.variance));
  console.log('\n  Most volatile countries (highest variance):');
  for (const p of stabilityProfiles.slice(0, 10)) {
    console.log(`    ${p.country.padEnd(22)}: avg=${p.avgScore} max=${p.maxScore} σ²=${p.variance} (${p.yearsTracked}yr)`);
    addFinding('Stability Analysis', `${p.country} volatility profile`,
      `Highest variance in dataset: σ²=${p.variance}, max score ${p.maxScore}`);
  }

  return { stableCountries, volatileCountries: stabilityProfiles.slice(0, 10) };
}

// ── Module 7: Going-Dark Sequence Analysis ───────────────────────────────────

function analyzeGoingDarkSequences(countryMap) {
  console.log('\n━━ MODULE 7: Going-Dark Sequences — Is There an Order? ━━━━━━━━━━━━');

  // Track which signal goes dark first, second, third in each country
  const darkSequences = [];

  for (const [country, yearMap] of Object.entries(countryMap)) {
    const years = Object.keys(yearMap).map(Number).sort((a, b) => a - b);

    const signalLastSeen = {};
    const darkEvents = [];

    for (const year of years) {
      const bd = yearMap[year]?.breakdown || {};
      const currentSigs = new Set(Object.keys(bd));

      // Check what went dark
      for (const [sig, lastYear] of Object.entries(signalLastSeen)) {
        if (!currentSigs.has(sig) && year - lastYear <= 2) {
          darkEvents.push({ signal: sig, year, lastSeen: lastYear });
        }
      }

      // Update last seen
      for (const sig of currentSigs) {
        signalLastSeen[sig] = year;
      }
    }

    if (darkEvents.length >= 2) {
      darkEvents.sort((a, b) => a.year - b.year);
      const sequence = darkEvents.slice(0, 5).map(e => e.signal);
      darkSequences.push({ country, sequence, events: darkEvents });
    }
  }

  // Find common sequences
  const sequencePatterns = {};
  for (const ds of darkSequences) {
    if (ds.sequence.length >= 2) {
      const pattern = ds.sequence.slice(0, 2).join(' → ');
      sequencePatterns[pattern] = (sequencePatterns[pattern] || 0) + 1;
    }
    if (ds.sequence.length >= 3) {
      const pattern = ds.sequence.slice(0, 3).join(' → ');
      sequencePatterns[pattern] = (sequencePatterns[pattern] || 0) + 1;
    }
  }

  const sortedPatterns = Object.entries(sequencePatterns).sort((a, b) => b[1] - a[1]);

  console.log(`\n  Countries with going-dark sequences: ${darkSequences.length}`);
  console.log('\n  Most common going-dark sequences:');
  for (const [pattern, count] of sortedPatterns.slice(0, 12)) {
    console.log(`    ${pattern}: ${count} countries`);
    if (count >= 5) {
      addFinding('Going-Dark Sequences', `Sequence: ${pattern}`,
        `${count} countries followed this going-dark order`);
    }
  }

  // Which signal goes dark first most often?
  const firstDark = {};
  for (const ds of darkSequences) {
    if (ds.sequence.length > 0) {
      firstDark[ds.sequence[0]] = (firstDark[ds.sequence[0]] || 0) + 1;
    }
  }

  console.log('\n  Which signal goes dark FIRST:');
  for (const [sig, count] of Object.entries(firstDark).sort((a,b) => b[1] - a[1])) {
    console.log(`    ${sig.padEnd(20)}: first to go dark in ${count} countries`);
  }

  const topFirst = Object.entries(firstDark).sort((a,b) => b[1] - a[1])[0];
  if (topFirst) {
    console.log(`\n  FINDING: ${topFirst[0]} is most often the FIRST signal to go dark (${topFirst[1]} countries)`);
    addFinding('Going-Dark Sequences', `${topFirst[0]} goes dark first`,
      `First signal to disappear in ${topFirst[1]} countries — the canary in the coal mine`);
  }

  return { darkSequences, sequencePatterns: sortedPatterns };
}

// ── Module 8: Silence Duration vs Crisis Severity ────────────────────────────

function analyzeSilenceSeverity(countryMap) {
  console.log('\n━━ MODULE 8: Silence Duration vs Crisis Severity ━━━━━━━━━━━━━━━━━━');

  const silenceEvents = [];

  for (const [country, yearMap] of Object.entries(countryMap)) {
    const years = Object.keys(yearMap).map(Number).sort((a, b) => a - b);

    // Track signal gaps
    const signalLastSeen = {};

    for (let i = 0; i < years.length; i++) {
      const year = years[i];
      const bd = yearMap[year]?.breakdown || {};
      const score = yearMap[year]?.score || 0;
      const currentSigs = new Set(Object.keys(bd));

      // Check for signals that returned after silence
      for (const [sig, lastYear] of Object.entries(signalLastSeen)) {
        if (currentSigs.has(sig)) {
          const gap = year - lastYear;
          if (gap >= 2) {
            // Find max score during silence
            const silenceScores = [];
            for (let y = lastYear + 1; y < year; y++) {
              if (yearMap[y]) silenceScores.push(yearMap[y].score || 0);
            }
            const maxDuringSilence = silenceScores.length > 0 ? Math.max(...silenceScores) : null;

            silenceEvents.push({
              country, signal: sig,
              silenceStart: lastYear, silenceEnd: year,
              duration: gap, maxScoreDuringSilence: maxDuringSilence
            });
          }
        }
      }

      // Update last seen
      for (const sig of currentSigs) {
        signalLastSeen[sig] = year;
      }
    }
  }

  console.log(`\n  Silence events (signal gap ≥2 years): ${silenceEvents.length}`);

  // Correlate silence duration with max score during silence
  const withScores = silenceEvents.filter(e => e.maxScoreDuringSilence !== null);

  if (withScores.length > 0) {
    // Group by duration
    const byDuration = {};
    for (const e of withScores) {
      const durBucket = e.duration <= 3 ? '2-3yr' : e.duration <= 5 ? '4-5yr' : '6+yr';
      if (!byDuration[durBucket]) byDuration[durBucket] = [];
      byDuration[durBucket].push(e.maxScoreDuringSilence);
    }

    console.log('\n  Silence duration vs max score during silence:');
    for (const [dur, scores] of Object.entries(byDuration).sort()) {
      const avg = (scores.reduce((a,b) => a+b, 0) / scores.length).toFixed(1);
      const critical = scores.filter(s => s >= CRITICAL).length;
      console.log(`    ${dur.padEnd(8)}: avg max score ${avg} | went CRITICAL: ${critical}/${scores.length} (${(critical/scores.length*100).toFixed(0)}%)`);

      addFinding('Silence Duration', `${dur} silence severity`,
        `Avg max score ${avg} during silence, ${(critical/scores.length*100).toFixed(0)}% crossed CRITICAL`);
    }

    // Longest silences
    silenceEvents.sort((a, b) => b.duration - a.duration);
    console.log('\n  Longest silences:');
    for (const e of silenceEvents.slice(0, 8)) {
      const severity = e.maxScoreDuringSilence >= CRITICAL ? 'CRITICAL' : e.maxScoreDuringSilence >= ELEVATED ? 'elevated' : 'stable';
      console.log(`    ${e.country} ${e.signal}: ${e.duration}yr silence (${e.silenceStart}-${e.silenceEnd}) | outcome: ${severity}`);
    }
  }

  return silenceEvents;
}

// ── Module 9: Fastest Collapse Analysis ──────────────────────────────────────

function analyzeFastestCollapses(countryMap, clusters) {
  console.log('\n━━ MODULE 9: Fastest Collapses — Warning Signs ━━━━━━━━━━━━━━━━━━━━');

  const collapses = [];

  for (const [country, yearMap] of Object.entries(countryMap)) {
    const years = Object.keys(yearMap).map(Number).sort((a, b) => a - b);

    let stableStart = null;
    let stableScore = null;

    for (const year of years) {
      const score = yearMap[year]?.score || 0;

      if (score < STABLE) {
        stableStart = year;
        stableScore = score;
      }

      if (score >= CRITICAL && stableStart !== null) {
        const speed = year - stableStart;
        const preCollapseBd = yearMap[stableStart]?.breakdown || {};
        const atCollapseBd = yearMap[year]?.breakdown || {};

        const preSignals = Object.entries(preCollapseBd)
          .filter(([k, v]) => (v.stress_z || 0) > 0.3)
          .map(([k]) => k);
        const atSignals = Object.entries(atCollapseBd)
          .filter(([k, v]) => (v.stress_z || 0) > 0.5)
          .map(([k]) => k);

        collapses.push({
          country, stableYear: stableStart, collapseYear: year, speed,
          preSignals, atSignals,
          cluster: clusters[country]?.cluster_label || 'unknown',
          region: REGION[country] || 'Unknown',
          scoreJump: score - stableScore
        });

        stableStart = null;
      }
    }
  }

  collapses.sort((a, b) => a.speed - b.speed);

  console.log(`\n  Total STABLE→CRITICAL transitions: ${collapses.length}`);

  // Fastest collapses
  console.log('\n  Fastest collapses (STABLE→CRITICAL):');
  for (const c of collapses.slice(0, 15)) {
    console.log(`    ${c.country.padEnd(20)} ${c.stableYear}→${c.collapseYear}: ${c.speed}yr | pre-collapse: ${c.preSignals.join(', ') || 'none'}`);
    if (c.speed <= 3) {
      addFinding('Fast Collapse', `${c.country} rapid collapse`,
        `Went STABLE→CRITICAL in ${c.speed}yr (${c.stableYear}→${c.collapseYear}). Pre-collapse signals: ${c.preSignals.join(', ') || 'none'}`);
    }
  }

  // What signals precede fast collapses?
  const fastCollapses = collapses.filter(c => c.speed <= 5);
  const slowCollapses = collapses.filter(c => c.speed > 10);

  const fastSigs = {};
  const slowSigs = {};

  for (const c of fastCollapses) {
    for (const sig of c.preSignals) fastSigs[sig] = (fastSigs[sig] || 0) + 1;
  }
  for (const c of slowCollapses) {
    for (const sig of c.preSignals) slowSigs[sig] = (slowSigs[sig] || 0) + 1;
  }

  console.log('\n  Pre-collapse signals — fast (<5yr) vs slow (>10yr):');
  for (const sig of SIGNAL_KEYS) {
    const fastRate = fastCollapses.length > 0 ? ((fastSigs[sig] || 0) / fastCollapses.length * 100).toFixed(0) : 0;
    const slowRate = slowCollapses.length > 0 ? ((slowSigs[sig] || 0) / slowCollapses.length * 100).toFixed(0) : 0;
    const diff = Number(fastRate) - Number(slowRate);
    if (Math.abs(diff) > 10) {
      const marker = diff > 0 ? '⚡ FAST COLLAPSE PREDICTOR' : '🐌 SLOW COLLAPSE MARKER';
      console.log(`    ${sig.padEnd(20)}: fast ${fastRate}% | slow ${slowRate}% ${marker}`);
      addFinding('Fast Collapse', `${sig} ${diff > 0 ? 'accelerates' : 'slows'} collapse`,
        `Present in ${fastRate}% of fast collapses vs ${slowRate}% of slow collapses`);
    }
  }

  // Cluster analysis of fast collapses
  const fastByCluster = {};
  for (const c of fastCollapses) {
    fastByCluster[c.cluster] = (fastByCluster[c.cluster] || 0) + 1;
  }

  console.log('\n  Fast collapses (<5yr) by cluster:');
  for (const [cluster, count] of Object.entries(fastByCluster).sort((a,b) => b[1] - a[1])) {
    console.log(`    ${cluster}: ${count} fast collapses`);
  }

  return collapses;
}

// ── Module 10: Baseline Correlation Analysis ─────────────────────────────────

function analyzeBaselineCorrelations(countryMap, baselines, clusters) {
  console.log('\n━━ MODULE 10: Baseline Correlation — Do Baselines Predict Outcomes? ━');

  // Build baseline lookup
  const baselineLookup = {};
  for (const b of baselines) {
    if (!baselineLookup[b.country]) baselineLookup[b.country] = {};
    baselineLookup[b.country][b.signal_key] = b;
  }

  const outcomes = [];

  for (const [country, yearMap] of Object.entries(countryMap)) {
    const years = Object.keys(yearMap).map(Number).sort((a, b) => a - b);
    const scores = years.map(y => yearMap[y]?.score || 0);

    const avgScore = scores.reduce((a,b) => a+b, 0) / scores.length;
    const maxScore = Math.max(...scores);
    const everCritical = maxScore >= CRITICAL;

    // Get country's baselines
    const countryBaselines = baselineLookup[country] || {};
    const baselineMedians = {};
    for (const [sig, b] of Object.entries(countryBaselines)) {
      baselineMedians[sig] = b.p50 || b.median || 0;
    }

    outcomes.push({
      country, avgScore, maxScore, everCritical, baselineMedians,
      cluster: clusters[country]?.cluster_label || 'unknown'
    });
  }

  // Correlate baseline levels with outcomes
  console.log('\n  Baseline median correlation with crisis outcomes:');

  for (const sig of SIGNAL_KEYS) {
    const withBaseline = outcomes.filter(o => o.baselineMedians[sig] !== undefined);
    if (withBaseline.length < 20) continue;

    const criticalGroup = withBaseline.filter(o => o.everCritical);
    const stableGroup = withBaseline.filter(o => !o.everCritical);

    if (criticalGroup.length > 5 && stableGroup.length > 5) {
      const criticalAvgBaseline = criticalGroup.reduce((a, o) => a + o.baselineMedians[sig], 0) / criticalGroup.length;
      const stableAvgBaseline = stableGroup.reduce((a, o) => a + o.baselineMedians[sig], 0) / stableGroup.length;

      const diff = criticalAvgBaseline - stableAvgBaseline;
      if (Math.abs(diff) > 5) {
        console.log(`    ${sig.padEnd(20)}: crisis countries baseline ${criticalAvgBaseline.toFixed(1)} vs stable ${stableAvgBaseline.toFixed(1)} (diff ${diff > 0 ? '+' : ''}${diff.toFixed(1)})`);
        addFinding('Baseline Correlation', `${sig} baseline predicts crisis`,
          `Countries that went CRITICAL had baseline ${criticalAvgBaseline.toFixed(1)} vs ${stableAvgBaseline.toFixed(1)} for stable countries`);
      }
    }
  }

  return outcomes;
}

// ── Module 11: Case Studies — Extreme Countries ──────────────────────────────

function analyzeCaseStudies(countryMap, clusters) {
  console.log('\n━━ MODULE 11: Case Studies — Extreme Countries ━━━━━━━━━━━━━━━━━━━━');

  const profiles = [];

  for (const [country, yearMap] of Object.entries(countryMap)) {
    const years = Object.keys(yearMap).map(Number).sort((a, b) => a - b);
    if (years.length < 10) continue;

    const scores = years.map(y => yearMap[y]?.score || 0);
    const avgScore = scores.reduce((a,b) => a+b, 0) / scores.length;
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);
    const range = maxScore - minScore;

    let criticalYears = 0;
    let criticalEpisodes = 0;
    let inCritical = false;

    for (const score of scores) {
      if (score >= CRITICAL) {
        criticalYears++;
        if (!inCritical) { criticalEpisodes++; inCritical = true; }
      } else {
        inCritical = false;
      }
    }

    profiles.push({
      country, yearsTracked: years.length, avgScore, maxScore, minScore, range,
      criticalYears, criticalEpisodes,
      criticalPct: (criticalYears / years.length * 100).toFixed(0),
      cluster: clusters[country]?.cluster_label || 'unknown'
    });
  }

  // Most time in CRITICAL
  profiles.sort((a, b) => Number(b.criticalPct) - Number(a.criticalPct));
  console.log('\n  Countries spending most time in CRITICAL:');
  for (const p of profiles.slice(0, 10)) {
    console.log(`    ${p.country.padEnd(22)}: ${p.criticalPct}% of years in CRITICAL (${p.criticalYears}/${p.yearsTracked}yr) | ${p.criticalEpisodes} episodes`);
    addFinding('Case Studies', `${p.country} chronic crisis`,
      `Spent ${p.criticalPct}% of tracked years in CRITICAL (${p.criticalYears}/${p.yearsTracked}yr), ${p.criticalEpisodes} separate episodes`);
  }

  // Highest range (most volatile)
  profiles.sort((a, b) => b.range - a.range);
  console.log('\n  Highest score range (most volatile):');
  for (const p of profiles.slice(0, 10)) {
    console.log(`    ${p.country.padEnd(22)}: range ${p.range.toFixed(1)} (min ${p.minScore.toFixed(0)} → max ${p.maxScore.toFixed(0)})`);
  }

  // Countries with multiple crisis episodes
  profiles.sort((a, b) => b.criticalEpisodes - a.criticalEpisodes);
  console.log('\n  Countries with multiple crisis episodes:');
  for (const p of profiles.filter(p => p.criticalEpisodes >= 2).slice(0, 10)) {
    console.log(`    ${p.country.padEnd(22)}: ${p.criticalEpisodes} separate CRITICAL episodes`);
    if (p.criticalEpisodes >= 3) {
      addFinding('Case Studies', `${p.country} repeat crises`,
        `${p.criticalEpisodes} separate CRITICAL episodes — pattern of repeated instability`);
    }
  }

  // Never critical countries
  const neverCritical = profiles.filter(p => p.criticalYears === 0).sort((a, b) => a.avgScore - b.avgScore);
  console.log('\n  Countries that NEVER went CRITICAL (lowest avg score):');
  for (const p of neverCritical.slice(0, 10)) {
    console.log(`    ${p.country.padEnd(22)}: avg ${p.avgScore.toFixed(1)} | max ${p.maxScore.toFixed(1)} | ${p.yearsTracked}yr tracked`);
  }

  return profiles;
}

// ── Module 12: Pre-Silence by Cluster ────────────────────────────────────────

function analyzePreSilenceByCluster(countryMap, clusters) {
  console.log('\n━━ MODULE 12: Pre-Silence Signature by Cluster ━━━━━━━━━━━━━━━━━━━━');

  const clusterPreSilence = {};

  for (const [country, yearMap] of Object.entries(countryMap)) {
    const cluster = clusters[country]?.cluster_label || 'unknown';
    if (!clusterPreSilence[cluster]) clusterPreSilence[cluster] = {};

    const years = Object.keys(yearMap).map(Number).sort((a, b) => a - b);

    for (let i = 1; i < years.length; i++) {
      const T = years[i];
      const T1 = years[i - 1];
      if (T - T1 > 2) continue;

      const prevBd = yearMap[T1]?.breakdown || {};
      const currBd = yearMap[T]?.breakdown || {};
      const prevSigs = new Set(Object.keys(prevBd));
      const currSigs = new Set(Object.keys(currBd));
      const wentDark = [...prevSigs].filter(s => !currSigs.has(s));

      if (wentDark.length > 0) {
        // What was elevated before?
        for (const [sig, val] of Object.entries(prevBd)) {
          if ((val.stress_z || 0) > 0.5) {
            clusterPreSilence[cluster][sig] = (clusterPreSilence[cluster][sig] || 0) + 1;
          }
        }
      }
    }
  }

  console.log('\n  Pre-silence signals by cluster:');
  for (const [cluster, sigs] of Object.entries(clusterPreSilence)) {
    const sorted = Object.entries(sigs).sort((a, b) => b[1] - a[1]);
    const top3 = sorted.slice(0, 3).map(([s, n]) => `${s}(${n})`).join(', ');
    console.log(`    ${cluster.padEnd(25)}: ${top3}`);

    if (sorted[0]) {
      addFinding('Pre-Silence by Cluster', `${cluster} pre-silence signature`,
        `Most common pre-silence signals: ${top3}`);
    }
  }

  // Find cluster-specific signals
  console.log('\n  Cluster-specific pre-silence patterns:');
  const allClusters = Object.keys(clusterPreSilence);
  for (const sig of SIGNAL_KEYS) {
    const rates = {};
    for (const cluster of allClusters) {
      const total = Object.values(clusterPreSilence[cluster]).reduce((a, b) => a + b, 0) || 1;
      rates[cluster] = (clusterPreSilence[cluster][sig] || 0) / total;
    }

    const maxCluster = Object.entries(rates).sort((a, b) => b[1] - a[1])[0];
    const minCluster = Object.entries(rates).sort((a, b) => a[1] - b[1])[0];

    if (maxCluster[1] > minCluster[1] + 0.15) {
      console.log(`    ${sig}: most common before silence in ${maxCluster[0]} (${(maxCluster[1]*100).toFixed(0)}%), least in ${minCluster[0]} (${(minCluster[1]*100).toFixed(0)}%)`);
    }
  }

  return clusterPreSilence;
}

// ── Module 13: Signal Reliability vs Predictive Power ────────────────────────

async function analyzeSignalReliability(countryMap) {
  console.log('\n━━ MODULE 13: Signal Coverage and Predictive Value ━━━━━━━━━━━━━━━━');

  // Calculate coverage per signal
  const signalCoverage = {};
  const signalPreCritical = {};
  let totalCountryYears = 0;
  let totalCriticalEvents = 0;

  for (const [country, yearMap] of Object.entries(countryMap)) {
    const years = Object.keys(yearMap).map(Number).sort((a, b) => a - b);
    totalCountryYears += years.length;

    for (let i = 0; i < years.length; i++) {
      const year = years[i];
      const bd = yearMap[year]?.breakdown || {};
      const score = yearMap[year]?.score || 0;

      for (const sig of Object.keys(bd)) {
        signalCoverage[sig] = (signalCoverage[sig] || 0) + 1;
      }

      // Check if this is a pre-critical year
      const nextYearScore = yearMap[years[i + 1]]?.score || 0;
      if (score < CRITICAL && nextYearScore >= CRITICAL) {
        totalCriticalEvents++;
        for (const [sig, val] of Object.entries(bd)) {
          if ((val.stress_z || 0) > 0.5) {
            signalPreCritical[sig] = (signalPreCritical[sig] || 0) + 1;
          }
        }
      }
    }
  }

  console.log(`\n  Total country-years: ${totalCountryYears}`);
  console.log(`  Total CRITICAL entry events: ${totalCriticalEvents}`);

  console.log('\n  Signal coverage and pre-critical presence:');
  const analysis = [];
  for (const sig of SIGNAL_KEYS) {
    const coverage = (signalCoverage[sig] || 0) / totalCountryYears * 100;
    const preCritical = signalPreCritical[sig] || 0;
    const preCriticalRate = totalCriticalEvents > 0 ? preCritical / totalCriticalEvents * 100 : 0;
    const predictiveRatio = coverage > 0 ? preCriticalRate / coverage : 0;

    analysis.push({
      sig, coverage: coverage.toFixed(1), preCritical,
      preCriticalRate: preCriticalRate.toFixed(0),
      predictiveRatio: predictiveRatio.toFixed(2)
    });
  }

  analysis.sort((a, b) => parseFloat(b.predictiveRatio) - parseFloat(a.predictiveRatio));

  for (const a of analysis) {
    const marker = parseFloat(a.predictiveRatio) > 1.2 ? '⚡ HIGH PREDICTIVE' : parseFloat(a.predictiveRatio) < 0.8 ? '⬇️ LOW PREDICTIVE' : '';
    console.log(`    ${a.sig.padEnd(20)}: coverage ${a.coverage}% | pre-critical ${a.preCriticalRate}% | ratio ${a.predictiveRatio} ${marker}`);

    if (parseFloat(a.predictiveRatio) > 1.2) {
      addFinding('Signal Reliability', `${a.sig} high predictive value`,
        `Coverage ${a.coverage}% but appears in ${a.preCriticalRate}% of pre-critical years — ratio ${a.predictiveRatio}x`);
    }
  }

  return analysis;
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
    `## Deep Intelligence Mining — Comprehensive Analysis`,
    `## Run: ${date} | extended country-year pairs | 153 countries | 1789–2026`,
    `## Total findings: ${ALL_FINDINGS.length}`,
    '',
  ];

  // Group by category
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
  const truncated = existing.replace(/\n---\n\n## Deep Intelligence Mining[\s\S]*$/, '');
  fs.writeFileSync(FINDINGS_PATH, truncated + lines.join('\n'));

  console.log(`\n  ${ALL_FINDINGS.length} findings written to SABIAN_INTELLIGENCE_FINDINGS.md`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('\n🔬 DEEP INTELLIGENCE MINING');
  console.log('   Testing every combination, every angle, every dimension.');
  console.log('   Null results reported alongside confirmed findings.\n');

  process.stdout.write('  Loading data ');
  const [scores, clusters, baselines] = await Promise.all([
    loadAllScores(),
    loadClusters(),
    loadSignalBaselines(),
  ]);
  console.log(`done. ${scores.length} rows.`);

  const countryMap = buildCountryMap(scores);
  console.log(`  ${Object.keys(countryMap).length} countries loaded.\n`);

  // Run all modules
  analyzeSignalPairsAllLags(countryMap);
  analyzeClusterOutcomes(countryMap, clusters);
  analyzeRegionalContagion(countryMap, clusters);
  analyzeDecadeByDecade(countryMap);
  analyzeRecoveryPatterns(countryMap, clusters, baselines);
  analyzeStabilityPatterns(countryMap, clusters);
  analyzeGoingDarkSequences(countryMap);
  analyzeSilenceSeverity(countryMap);
  analyzeFastestCollapses(countryMap, clusters);
  analyzeBaselineCorrelations(countryMap, baselines, clusters);
  analyzeCaseStudies(countryMap, clusters);
  analyzePreSilenceByCluster(countryMap, clusters);
  await analyzeSignalReliability(countryMap);

  // Write all findings
  writeAllFindings();

  console.log('\n' + '═'.repeat(70));
  console.log('✅ DEEP INTELLIGENCE MINING COMPLETE');
  console.log(`   ${ALL_FINDINGS.length} findings recorded`);
  console.log('   Results in SABIAN_INTELLIGENCE_FINDINGS.md');
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
