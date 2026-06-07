// historical/deep_intelligence_mining_3.cjs
// Third pass deep intelligence mining — most granular analysis.
// Tests: country pairs, historical analogues, decoupling events, signal sequences,
// protective factors, extreme case deep dives, data gaps as signals.
//
// Usage: node historical/deep_intelligence_mining_3.cjs

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
  CAR:'Sub-Saharan Africa', Chad:'Sub-Saharan Africa', DRC:'Sub-Saharan Africa',
  Eritrea:'Sub-Saharan Africa', Ethiopia:'Sub-Saharan Africa',
  Ghana:'Sub-Saharan Africa', Guinea:'Sub-Saharan Africa', 'Guinea-Bissau':'Sub-Saharan Africa',
  Kenya:'Sub-Saharan Africa', Liberia:'Sub-Saharan Africa',
  Mali:'Sub-Saharan Africa', Nigeria:'Sub-Saharan Africa', Rwanda:'Sub-Saharan Africa', Senegal:'Sub-Saharan Africa',
  'Sierra Leone':'Sub-Saharan Africa', Somalia:'Sub-Saharan Africa',
  'South Africa':'Sub-Saharan Africa', 'South Sudan':'Sub-Saharan Africa',
  Sudan:'Sub-Saharan Africa', Tanzania:'Sub-Saharan Africa', Uganda:'Sub-Saharan Africa', Zambia:'Sub-Saharan Africa', Zimbabwe:'Sub-Saharan Africa',
  Algeria:'MENA', Egypt:'MENA', Libya:'MENA', Morocco:'MENA', Tunisia:'MENA',
  Iran:'MENA', Iraq:'MENA', Israel:'MENA', Jordan:'MENA',
  'Saudi Arabia':'MENA', Syria:'MENA', Yemen:'MENA', Turkey:'MENA', Lebanon:'MENA',
  Albania:'Europe', Armenia:'Europe', Azerbaijan:'Europe',
  Belarus:'Europe', Bosnia:'Europe', Bulgaria:'Europe',
  Croatia:'Europe', Georgia:'Europe', Greece:'Europe',
  Hungary:'Europe', Kosovo:'Europe', Moldova:'Europe',
  Russia:'Europe', Serbia:'Europe', Ukraine:'Europe',
  Afghanistan:'Central Asia', Kazakhstan:'Central Asia', Kyrgyzstan:'Central Asia',
  Pakistan:'Central Asia', Tajikistan:'Central Asia', Turkmenistan:'Central Asia', Uzbekistan:'Central Asia',
  Bangladesh:'South/SE Asia', Cambodia:'South/SE Asia', India:'South/SE Asia',
  Indonesia:'South/SE Asia', Myanmar:'South/SE Asia', Nepal:'South/SE Asia', Philippines:'South/SE Asia',
  'Sri Lanka':'South/SE Asia', Thailand:'South/SE Asia', 'Timor-Leste':'South/SE Asia', Vietnam:'South/SE Asia',
  China:'East Asia', Japan:'East Asia', 'North Korea':'East Asia', 'South Korea':'East Asia',
  Argentina:'Americas', Bolivia:'Americas', Brazil:'Americas',
  Chile:'Americas', Colombia:'Americas', Cuba:'Americas', Ecuador:'Americas',
  'El Salvador':'Americas', Guatemala:'Americas', Haiti:'Americas',
  Honduras:'Americas', Mexico:'Americas', Nicaragua:'Americas',
  Peru:'Americas', Venezuela:'Americas',
  Australia:'Oceania', 'Papua New Guinea':'Oceania',
};

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
// MODULE 23: Country Pair Correlation
// ═══════════════════════════════════════════════════════════════════════════════

function analyzeCountryPairs(countryMap) {
  console.log('\n━━ MODULE 23: Country Pair Correlation ━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const pairs = [];
  const countries = Object.keys(countryMap);

  for (let i = 0; i < countries.length; i++) {
    for (let j = i + 1; j < countries.length; j++) {
      const c1 = countries[i];
      const c2 = countries[j];

      const y1 = countryMap[c1];
      const y2 = countryMap[c2];

      // Find overlapping years
      const overlap = Object.keys(y1).filter(y => y2[y]);
      if (overlap.length < 20) continue;

      const s1 = overlap.map(y => y1[y]?.score || 0);
      const s2 = overlap.map(y => y2[y]?.score || 0);

      // Calculate correlation
      const mean1 = s1.reduce((a,b) => a+b, 0) / s1.length;
      const mean2 = s2.reduce((a,b) => a+b, 0) / s2.length;

      let num = 0, denom1 = 0, denom2 = 0;
      for (let k = 0; k < s1.length; k++) {
        const d1 = s1[k] - mean1;
        const d2 = s2[k] - mean2;
        num += d1 * d2;
        denom1 += d1 * d1;
        denom2 += d2 * d2;
      }

      const r = (denom1 > 0 && denom2 > 0) ? num / Math.sqrt(denom1 * denom2) : 0;

      if (Math.abs(r) > 0.5) {
        pairs.push({ c1, c2, r: r.toFixed(3), n: overlap.length });
      }
    }
  }

  pairs.sort((a, b) => parseFloat(b.r) - parseFloat(a.r));

  console.log('\n  Most correlated country pairs (r > 0.5):');
  for (const p of pairs.slice(0, 20)) {
    console.log(`    ${p.c1.padEnd(20)} ↔ ${p.c2.padEnd(20)}: r=${p.r} (n=${p.n})`);
    addFinding('Country Pairs', `${p.c1} ↔ ${p.c2} correlation`,
      `r=${p.r} over ${p.n} years — these countries move together`);
  }

  // Anti-correlated pairs
  pairs.sort((a, b) => parseFloat(a.r) - parseFloat(b.r));
  console.log('\n  Most anti-correlated country pairs (r < -0.5):');
  for (const p of pairs.filter(p => parseFloat(p.r) < -0.3).slice(0, 15)) {
    console.log(`    ${p.c1.padEnd(20)} ↔ ${p.c2.padEnd(20)}: r=${p.r} (n=${p.n})`);
    addFinding('Country Pairs', `${p.c1} ↔ ${p.c2} anti-correlation`,
      `r=${p.r} over ${p.n} years — these countries move inversely`);
  }

  return pairs;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 24: Historical Analogues
// ═══════════════════════════════════════════════════════════════════════════════

function analyzeHistoricalAnalogues(countryMap) {
  console.log('\n━━ MODULE 24: Historical Analogues — Similar Trajectories ━━━━━━━━━');

  // Find countries with similar 5-year trajectory patterns
  const trajectories = {};

  for (const [country, yearMap] of Object.entries(countryMap)) {
    const years = Object.keys(yearMap).map(Number).sort((a, b) => a - b);

    for (let i = 0; i <= years.length - 5; i++) {
      const window = years.slice(i, i + 5);
      if (window[4] - window[0] > 6) continue; // Skip gaps

      const scores = window.map(y => yearMap[y]?.score || 0);
      const pattern = scores.map((s, idx) => {
        if (idx === 0) return 'S';
        const delta = s - scores[idx - 1];
        if (delta > 10) return 'U'; // Up
        if (delta < -10) return 'D'; // Down
        return 'S'; // Stable
      }).join('');

      if (!trajectories[pattern]) trajectories[pattern] = [];
      trajectories[pattern].push({
        country, start: window[0], end: window[4],
        startScore: scores[0].toFixed(0), endScore: scores[4].toFixed(0)
      });
    }
  }

  // Find most common patterns
  const sortedPatterns = Object.entries(trajectories)
    .filter(([k, v]) => v.length >= 5)
    .sort((a, b) => b[1].length - a[1].length);

  console.log('\n  Most common 5-year trajectory patterns:');
  for (const [pattern, cases] of sortedPatterns.slice(0, 15)) {
    const desc = pattern.split('').map(c =>
      c === 'U' ? '↑' : c === 'D' ? '↓' : '→'
    ).join('');
    console.log(`    ${desc}: ${cases.length} cases — e.g. ${cases.slice(0, 3).map(c => `${c.country}(${c.start})`).join(', ')}`);

    if (cases.length >= 10) {
      addFinding('Historical Analogues', `Pattern ${desc}`,
        `${cases.length} cases of this trajectory — countries include ${cases.slice(0, 5).map(c => c.country).join(', ')}`);
    }
  }

  // Find deterioration patterns (4+ consecutive increases)
  const deteriorating = trajectories['SUUUU'] || [];
  console.log(`\n  Sustained deterioration (4+ consecutive increases): ${deteriorating.length} cases`);
  for (const d of deteriorating.slice(0, 10)) {
    console.log(`    ${d.country} ${d.start}-${d.end}: ${d.startScore} → ${d.endScore}`);
    addFinding('Historical Analogues', `${d.country} sustained deterioration ${d.start}`,
      `Score went from ${d.startScore} to ${d.endScore} over 5 years — early warning pattern`);
  }

  return trajectories;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 25: Decoupling Events
// ═══════════════════════════════════════════════════════════════════════════════

function analyzeDecouplingEvents(countryMap, clusters) {
  console.log('\n━━ MODULE 25: Decoupling Events — When Countries Break from Cluster ━');

  // For each country in a cluster, find years where they diverged significantly
  const decouplings = [];

  const clusterMembers = {};
  for (const [country, c] of Object.entries(clusters)) {
    const label = c.cluster_label || `cluster_${c.cluster_id}`;
    if (!clusterMembers[label]) clusterMembers[label] = [];
    clusterMembers[label].push(country);
  }

  for (const [cluster, members] of Object.entries(clusterMembers)) {
    if (members.length < 3) continue;

    // Get cluster-wide average per year
    const clusterAvg = {};
    for (const country of members) {
      const yearMap = countryMap[country] || {};
      for (const [year, data] of Object.entries(yearMap)) {
        if (!clusterAvg[year]) clusterAvg[year] = [];
        clusterAvg[year].push(data.score || 0);
      }
    }

    for (const [year, scores] of Object.entries(clusterAvg)) {
      clusterAvg[year] = scores.reduce((a,b) => a+b, 0) / scores.length;
    }

    // Find individual country divergences
    for (const country of members) {
      const yearMap = countryMap[country] || {};
      for (const [year, data] of Object.entries(yearMap)) {
        const avg = clusterAvg[year];
        if (avg === undefined) continue;

        const divergence = (data.score || 0) - avg;
        if (Math.abs(divergence) > 25) {
          decouplings.push({
            country, cluster, year: Number(year),
            score: (data.score || 0).toFixed(0),
            clusterAvg: avg.toFixed(0),
            divergence: divergence.toFixed(0)
          });
        }
      }
    }
  }

  decouplings.sort((a, b) => Math.abs(parseFloat(b.divergence)) - Math.abs(parseFloat(a.divergence)));

  console.log('\n  Largest cluster decouplings (divergence > 25 points):');
  for (const d of decouplings.slice(0, 20)) {
    const dir = parseFloat(d.divergence) > 0 ? 'WORSE' : 'BETTER';
    console.log(`    ${d.country.padEnd(20)} ${d.year}: score ${d.score} vs cluster avg ${d.clusterAvg} (${dir} by ${Math.abs(parseFloat(d.divergence))})`);
    addFinding('Decoupling Events', `${d.country} decoupled ${d.year}`,
      `Score ${d.score} vs ${d.cluster} cluster avg ${d.clusterAvg} — diverged ${d.divergence} points`);
  }

  // Which clusters have most decouplings?
  const clusterDecouplingCount = {};
  for (const d of decouplings) {
    clusterDecouplingCount[d.cluster] = (clusterDecouplingCount[d.cluster] || 0) + 1;
  }

  console.log('\n  Decouplings by cluster:');
  for (const [cluster, count] of Object.entries(clusterDecouplingCount).sort((a,b) => b[1] - a[1])) {
    console.log(`    ${cluster}: ${count} decoupling events`);
  }

  return decouplings;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 26: Signal Sequences Before Major Events
// ═══════════════════════════════════════════════════════════════════════════════

function analyzeSignalSequencesBeforeEvents(countryMap) {
  console.log('\n━━ MODULE 26: Signal Sequences Before Major Events ━━━━━━━━━━━━━━━━');

  const sequences = [];

  for (const [country, yearMap] of Object.entries(countryMap)) {
    const years = Object.keys(yearMap).map(Number).sort((a, b) => a - b);

    for (let i = 4; i < years.length; i++) {
      const score = yearMap[years[i]]?.score || 0;

      // Look for CRITICAL entries
      if (score >= CRITICAL && (yearMap[years[i-1]]?.score || 0) < CRITICAL) {
        // Capture signal sequence in 4 years before
        const signalSeq = [];
        for (let j = i - 4; j < i; j++) {
          if (j < 0) continue;
          const bd = yearMap[years[j]]?.breakdown || {};
          const elevated = Object.entries(bd)
            .filter(([k, v]) => (v.stress_z || 0) > 0.5)
            .map(([k]) => k);
          signalSeq.push({ year: years[j], signals: elevated });
        }

        sequences.push({ country, crisisYear: years[i], sequence: signalSeq });
      }
    }
  }

  console.log(`\n  Pre-crisis signal sequences found: ${sequences.length}`);

  // Find common signal progressions
  const progressions = {};
  for (const s of sequences) {
    const flatSeq = s.sequence.flatMap(y => y.signals);
    const unique = [...new Set(flatSeq)].sort().join('→');
    if (unique.length > 0) {
      if (!progressions[unique]) progressions[unique] = [];
      progressions[unique].push(s);
    }
  }

  console.log('\n  Most common pre-crisis signal combinations (4 years before):');
  const sorted = Object.entries(progressions).sort((a,b) => b[1].length - a[1].length);
  for (const [seq, cases] of sorted.slice(0, 15)) {
    console.log(`    ${seq}: ${cases.length} crises preceded by this combination`);
    if (cases.length >= 3) {
      addFinding('Signal Sequences', `Pre-crisis pattern: ${seq}`,
        `${cases.length} CRITICAL entries were preceded by this signal combination in the 4 years before`);
    }
  }

  // Find signals that appear consistently in year -1, -2, -3, -4
  console.log('\n  Signal timing before crisis:');
  const byYearBefore = {};
  for (const s of sequences) {
    for (let j = 0; j < s.sequence.length; j++) {
      const yearsBefore = s.sequence.length - j;
      if (!byYearBefore[yearsBefore]) byYearBefore[yearsBefore] = {};
      for (const sig of s.sequence[j].signals) {
        byYearBefore[yearsBefore][sig] = (byYearBefore[yearsBefore][sig] || 0) + 1;
      }
    }
  }

  for (const yb of [4, 3, 2, 1]) {
    const sigs = byYearBefore[yb] || {};
    const top = Object.entries(sigs).sort((a,b) => b[1] - a[1]).slice(0, 3);
    console.log(`    Year -${yb}: ${top.map(([s, n]) => `${s}(${n})`).join(', ')}`);
  }

  return sequences;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 27: Data Gaps as Signals
// ═══════════════════════════════════════════════════════════════════════════════

function analyzeDataGapsAsSignals(countryMap) {
  console.log('\n━━ MODULE 27: Data Gaps as Signals ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const gaps = [];

  for (const [country, yearMap] of Object.entries(countryMap)) {
    const years = Object.keys(yearMap).map(Number).sort((a, b) => a - b);

    for (let i = 1; i < years.length; i++) {
      const gap = years[i] - years[i-1];
      if (gap >= 3) {
        // Check what happened after the gap
        const beforeScore = yearMap[years[i-1]]?.score || 0;
        const afterScore = yearMap[years[i]]?.score || 0;
        const change = afterScore - beforeScore;

        gaps.push({
          country, start: years[i-1], end: years[i], gap,
          beforeScore: beforeScore.toFixed(0), afterScore: afterScore.toFixed(0),
          change: change.toFixed(0)
        });
      }
    }
  }

  console.log(`\n  Data gaps (3+ years): ${gaps.length}`);

  // Gaps followed by deterioration
  const deteriorated = gaps.filter(g => parseFloat(g.change) > 15);
  console.log(`\n  Gaps followed by significant deterioration (>15 points): ${deteriorated.length}`);
  for (const g of deteriorated.sort((a,b) => parseFloat(b.change) - parseFloat(a.change)).slice(0, 10)) {
    console.log(`    ${g.country}: ${g.gap}yr gap (${g.start}-${g.end}) → score ${g.beforeScore} → ${g.afterScore} (+${g.change})`);
    addFinding('Data Gaps', `${g.country} gap-to-crisis ${g.start}-${g.end}`,
      `${g.gap}-year data gap followed by ${g.change}-point deterioration`);
  }

  // Gaps followed by improvement
  const improved = gaps.filter(g => parseFloat(g.change) < -15);
  console.log(`\n  Gaps followed by significant improvement (>15 points): ${improved.length}`);
  for (const g of improved.sort((a,b) => parseFloat(a.change) - parseFloat(b.change)).slice(0, 10)) {
    console.log(`    ${g.country}: ${g.gap}yr gap (${g.start}-${g.end}) → score ${g.beforeScore} → ${g.afterScore} (${g.change})`);
    addFinding('Data Gaps', `${g.country} gap-to-recovery ${g.start}-${g.end}`,
      `${g.gap}-year data gap followed by ${Math.abs(parseFloat(g.change))}-point improvement`);
  }

  // Gap duration vs outcome
  const shortGaps = gaps.filter(g => g.gap <= 5);
  const longGaps = gaps.filter(g => g.gap > 5);

  const shortAvgChange = shortGaps.length > 0
    ? shortGaps.reduce((a, g) => a + parseFloat(g.change), 0) / shortGaps.length
    : 0;
  const longAvgChange = longGaps.length > 0
    ? longGaps.reduce((a, g) => a + parseFloat(g.change), 0) / longGaps.length
    : 0;

  console.log(`\n  Short gaps (3-5yr) avg change: ${shortAvgChange.toFixed(1)}`);
  console.log(`  Long gaps (6+yr) avg change: ${longAvgChange.toFixed(1)}`);

  addFinding('Data Gaps', 'Gap duration vs outcome',
    `Short gaps (3-5yr): avg ${shortAvgChange.toFixed(1)} change. Long gaps (6+yr): avg ${longAvgChange.toFixed(1)} change.`);

  return gaps;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 28: Never-Crisis Countries Deep Dive
// ═══════════════════════════════════════════════════════════════════════════════

function analyzeNeverCrisisCountries(countryMap, clusters) {
  console.log('\n━━ MODULE 28: Never-Crisis Countries — What Makes Them Stable? ━━━━');

  const neverCritical = [];

  for (const [country, yearMap] of Object.entries(countryMap)) {
    const years = Object.keys(yearMap).map(Number);
    if (years.length < 20) continue;

    const scores = years.map(y => yearMap[y]?.score || 0);
    const maxScore = Math.max(...scores);

    if (maxScore < CRITICAL) {
      const avgScore = scores.reduce((a,b) => a+b, 0) / scores.length;
      const variance = scores.reduce((a, b) => a + (b - avgScore) ** 2, 0) / scores.length;

      // Signal profile
      const signalFreq = {};
      for (const year of years) {
        const bd = yearMap[year]?.breakdown || {};
        for (const [sig, val] of Object.entries(bd)) {
          signalFreq[sig] = (signalFreq[sig] || 0) + 1;
        }
      }
      const topSignals = Object.entries(signalFreq).sort((a,b) => b[1] - a[1]).slice(0, 3).map(([s]) => s);

      neverCritical.push({
        country, years: years.length, avgScore: avgScore.toFixed(1),
        maxScore: maxScore.toFixed(1), variance: variance.toFixed(1),
        topSignals, cluster: clusters[country]?.cluster_label || 'unknown'
      });
    }
  }

  neverCritical.sort((a, b) => parseFloat(a.variance) - parseFloat(b.variance));

  console.log(`\n  Countries that NEVER went CRITICAL (20+ years tracked): ${neverCritical.length}`);

  console.log('\n  Most stable never-crisis countries:');
  for (const nc of neverCritical.slice(0, 15)) {
    console.log(`    ${nc.country.padEnd(20)}: avg ${nc.avgScore}, max ${nc.maxScore}, σ²=${nc.variance} (${nc.years}yr) | ${nc.topSignals.join(', ')}`);
    addFinding('Never-Crisis', `${nc.country} stability profile`,
      `Never crossed CRITICAL in ${nc.years} years. Avg ${nc.avgScore}, max ${nc.maxScore}, variance ${nc.variance}. Signals: ${nc.topSignals.join(', ')}`);
  }

  // Common signals in never-crisis countries
  const allSigs = {};
  for (const nc of neverCritical) {
    for (const sig of nc.topSignals) {
      allSigs[sig] = (allSigs[sig] || 0) + 1;
    }
  }

  console.log('\n  Most common signals in never-crisis countries:');
  for (const [sig, count] of Object.entries(allSigs).sort((a,b) => b[1] - a[1])) {
    console.log(`    ${sig.padEnd(20)}: ${count} countries`);
  }

  // Cluster distribution of never-crisis
  const clusterDist = {};
  for (const nc of neverCritical) {
    clusterDist[nc.cluster] = (clusterDist[nc.cluster] || 0) + 1;
  }

  console.log('\n  Never-crisis countries by cluster:');
  for (const [cluster, count] of Object.entries(clusterDist).sort((a,b) => b[1] - a[1])) {
    console.log(`    ${cluster}: ${count} never-crisis countries`);
    addFinding('Never-Crisis', `${cluster} stability`,
      `${count} countries in this cluster never reached CRITICAL`);
  }

  return neverCritical;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 29: Repeat Crisis Countries
// ═══════════════════════════════════════════════════════════════════════════════

function analyzeRepeatCrisisCountries(countryMap, clusters) {
  console.log('\n━━ MODULE 29: Repeat Crisis Countries — Chronic Instability ━━━━━━━');

  const repeatCrisis = [];

  for (const [country, yearMap] of Object.entries(countryMap)) {
    const years = Object.keys(yearMap).map(Number).sort((a, b) => a - b);

    let episodes = 0;
    let inCritical = false;
    const episodeYears = [];

    for (const year of years) {
      const score = yearMap[year]?.score || 0;

      if (score >= CRITICAL && !inCritical) {
        inCritical = true;
        episodes++;
        episodeYears.push(year);
      } else if (score < STABLE) {
        inCritical = false;
      }
    }

    if (episodes >= 2) {
      const totalCriticalYears = years.filter(y => (yearMap[y]?.score || 0) >= CRITICAL).length;

      repeatCrisis.push({
        country, episodes, episodeYears, totalCriticalYears,
        yearsTracked: years.length,
        criticalPct: (totalCriticalYears / years.length * 100).toFixed(0),
        cluster: clusters[country]?.cluster_label || 'unknown',
        region: REGION[country] || 'Unknown'
      });
    }
  }

  repeatCrisis.sort((a, b) => b.episodes - a.episodes);

  console.log(`\n  Countries with 2+ separate crisis episodes: ${repeatCrisis.length}`);

  for (const rc of repeatCrisis) {
    console.log(`    ${rc.country.padEnd(20)}: ${rc.episodes} episodes (${rc.episodeYears.join(', ')}) | ${rc.criticalPct}% of years in crisis`);
    addFinding('Repeat Crisis', `${rc.country} chronic instability`,
      `${rc.episodes} separate crisis episodes at years ${rc.episodeYears.join(', ')}. ${rc.criticalPct}% of ${rc.yearsTracked} tracked years spent in CRITICAL.`);
  }

  // What do repeat crisis countries have in common?
  const regionDist = {};
  const clusterDist = {};
  for (const rc of repeatCrisis) {
    regionDist[rc.region] = (regionDist[rc.region] || 0) + 1;
    clusterDist[rc.cluster] = (clusterDist[rc.cluster] || 0) + 1;
  }

  console.log('\n  Repeat crisis by region:');
  for (const [region, count] of Object.entries(regionDist).sort((a,b) => b[1] - a[1])) {
    console.log(`    ${region}: ${count} repeat-crisis countries`);
  }

  console.log('\n  Repeat crisis by cluster:');
  for (const [cluster, count] of Object.entries(clusterDist).sort((a,b) => b[1] - a[1])) {
    console.log(`    ${cluster}: ${count} repeat-crisis countries`);
  }

  return repeatCrisis;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 30: Signal Reliability Across Time
// ═══════════════════════════════════════════════════════════════════════════════

function analyzeSignalReliabilityAcrossTime(countryMap) {
  console.log('\n━━ MODULE 30: Signal Reliability Across Time ━━━━━━━━━━━━━━━━━━━━━━');

  // Track how often each signal appears by decade
  const signalByDecade = {};
  const totalByDecade = {};

  for (const [country, yearMap] of Object.entries(countryMap)) {
    for (const [year, data] of Object.entries(yearMap)) {
      const d = Math.floor(Number(year) / 10) * 10;
      totalByDecade[d] = (totalByDecade[d] || 0) + 1;

      const bd = data.breakdown || {};
      for (const sig of Object.keys(bd)) {
        if (!signalByDecade[sig]) signalByDecade[sig] = {};
        signalByDecade[sig][d] = (signalByDecade[sig][d] || 0) + 1;
      }
    }
  }

  console.log('\n  Signal coverage by decade (% of country-years with signal):');
  const decades = Object.keys(totalByDecade).map(Number).sort();

  for (const sig of ['economic_stress', 'trade_collapse', 'governance', 'power_grid', 'capital_flows', 'displacement', 'seismic_risk', 'imf_fiscal']) {
    const trend = decades.map(d => {
      const coverage = ((signalByDecade[sig]?.[d] || 0) / (totalByDecade[d] || 1) * 100).toFixed(0);
      return `${d}s:${coverage}%`;
    });
    console.log(`    ${sig.padEnd(20)}: ${trend.join(' → ')}`);
    addFinding('Signal Reliability', `${sig} coverage trend`,
      `Coverage by decade: ${trend.join(' → ')}`);
  }

  // Find signals that disappeared or emerged
  console.log('\n  Signal emergence/disappearance:');
  for (const [sig, byD] of Object.entries(signalByDecade)) {
    const firstDecade = Math.min(...Object.keys(byD).map(Number));
    const lastDecade = Math.max(...Object.keys(byD).map(Number));
    const firstCoverage = (byD[firstDecade] / totalByDecade[firstDecade] * 100).toFixed(0);
    const lastCoverage = (byD[lastDecade] / totalByDecade[lastDecade] * 100).toFixed(0);

    if (parseFloat(firstCoverage) < 5 && parseFloat(lastCoverage) > 30) {
      console.log(`    ${sig}: emerged — ${firstDecade}s ${firstCoverage}% → ${lastDecade}s ${lastCoverage}%`);
      addFinding('Signal Reliability', `${sig} emerged`,
        `Coverage went from ${firstCoverage}% in ${firstDecade}s to ${lastCoverage}% in ${lastDecade}s`);
    } else if (parseFloat(firstCoverage) > 30 && parseFloat(lastCoverage) < 5) {
      console.log(`    ${sig}: disappeared — ${firstDecade}s ${firstCoverage}% → ${lastDecade}s ${lastCoverage}%`);
      addFinding('Signal Reliability', `${sig} disappeared`,
        `Coverage dropped from ${firstCoverage}% in ${firstDecade}s to ${lastCoverage}% in ${lastDecade}s`);
    }
  }

  return { signalByDecade, totalByDecade };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 31: Extreme Score Analysis
// ═══════════════════════════════════════════════════════════════════════════════

function analyzeExtremeScores(countryMap) {
  console.log('\n━━ MODULE 31: Extreme Score Analysis ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const extremeHigh = [];
  const extremeLow = [];

  for (const [country, yearMap] of Object.entries(countryMap)) {
    for (const [year, data] of Object.entries(yearMap)) {
      const score = data.score || 0;

      if (score >= 95) {
        const bd = data.breakdown || {};
        const topSigs = Object.entries(bd)
          .filter(([k, v]) => (v.stress_z || 0) > 0.5)
          .sort((a, b) => Math.abs(b[1].stress_z || 0) - Math.abs(a[1].stress_z || 0))
          .slice(0, 3)
          .map(([k]) => k);

        extremeHigh.push({ country, year: Number(year), score: score.toFixed(0), signals: topSigs });
      }

      if (score <= 5) {
        extremeLow.push({ country, year: Number(year), score: score.toFixed(0) });
      }
    }
  }

  console.log(`\n  Extreme high scores (95+): ${extremeHigh.length}`);
  for (const e of extremeHigh.sort((a, b) => parseFloat(b.score) - parseFloat(a.score)).slice(0, 20)) {
    console.log(`    ${e.country.padEnd(20)} ${e.year}: ${e.score} | ${e.signals.join(', ')}`);
    addFinding('Extreme Scores', `${e.country} ${e.year} extreme high`,
      `Score ${e.score} — one of highest in dataset. Signals: ${e.signals.join(', ')}`);
  }

  console.log(`\n  Extreme low scores (≤5): ${extremeLow.length}`);
  for (const e of extremeLow.sort((a, b) => parseFloat(a.score) - parseFloat(b.score)).slice(0, 15)) {
    console.log(`    ${e.country.padEnd(20)} ${e.year}: ${e.score}`);
    addFinding('Extreme Scores', `${e.country} ${e.year} extreme low`,
      `Score ${e.score} — near minimum possible. Exceptionally stable state.`);
  }

  return { extremeHigh, extremeLow };
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
    `## Deep Intelligence Mining — Pass 3`,
    `## Run: ${date} | Modules 23-31 | Additional ${ALL_FINDINGS.length} findings`,
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
  console.log('\n🔬 DEEP INTELLIGENCE MINING — PASS 3');
  console.log('   Modules 23-31: Granular pattern analysis\n');

  process.stdout.write('  Loading data ');
  const [scores, clusters] = await Promise.all([
    loadAllScores(),
    loadClusters(),
  ]);
  console.log(`done. ${scores.length} rows.`);

  const countryMap = buildCountryMap(scores);
  console.log(`  ${Object.keys(countryMap).length} countries loaded.\n`);

  analyzeCountryPairs(countryMap);
  analyzeHistoricalAnalogues(countryMap);
  analyzeDecouplingEvents(countryMap, clusters);
  analyzeSignalSequencesBeforeEvents(countryMap);
  analyzeDataGapsAsSignals(countryMap);
  analyzeNeverCrisisCountries(countryMap, clusters);
  analyzeRepeatCrisisCountries(countryMap, clusters);
  analyzeSignalReliabilityAcrossTime(countryMap);
  analyzeExtremeScores(countryMap);

  writeAllFindings();

  console.log('\n' + '═'.repeat(70));
  console.log('✅ DEEP INTELLIGENCE MINING PASS 3 COMPLETE');
  console.log(`   ${ALL_FINDINGS.length} additional findings recorded`);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
