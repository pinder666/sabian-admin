// test_redundant_cluster.cjs
// Tests the 5 "redundant" signals against each other in isolation.
// Question: do they move together (one blob) or do some carry independent structure?
// If any pair has r < 0.4, there's distinct information inside the cluster.
// If all pairs r > 0.7, the cluster is one fact in five costumes.

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const CLUSTER = [
  'iom_displacement',
  'social_volume',
  'prediction_market',
  'food_security',
  'usda_food',
];

async function loadReadings() {
  const data = {};
  for (const s of CLUSTER) data[s] = {};

  let page = 0;
  while (true) {
    const { data: rows, error } = await sb
      .from('historical_signal_readings')
      .select('country,signal_key,date,raw_value')
      .in('signal_key', CLUSTER)
      .not('raw_value', 'is', null)
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error) throw error;
    if (!rows || rows.length === 0) break;
    for (const r of rows) {
      const year = new Date(r.date).getFullYear();
      const key = `${r.country}|${year}`;
      if (!data[r.signal_key][key]) data[r.signal_key][key] = [];
      data[r.signal_key][key].push(parseFloat(r.raw_value));
    }
    if (rows.length < 1000) break;
    page++;
  }

  // Average to annual
  for (const s of CLUSTER) {
    for (const k of Object.keys(data[s])) {
      const v = data[s][k];
      data[s][k] = v.reduce((a, b) => a + b, 0) / v.length;
    }
  }
  return data;
}

function pearson(x, y) {
  const n = x.length;
  if (n < 10) return { r: NaN, n };
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const a = x[i] - mx, b = y[i] - my;
    num += a * b; dx2 += a * a; dy2 += b * b;
  }
  const den = Math.sqrt(dx2 * dy2);
  return { r: den > 0 ? num / den : 0, n };
}

function stats(values) {
  const n = values.length;
  if (n === 0) return { mean: NaN, std: NaN, min: NaN, max: NaN, n: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const std = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  return { mean: +mean.toFixed(3), std: +std.toFixed(3), min: +Math.min(...values).toFixed(3), max: +Math.max(...values).toFixed(3), n };
}

function temporalLeadLag(dataA, dataB, maxLag = 3) {
  // For each common country, check if A at t-lag correlates with B at t
  const results = [];
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    const x = [], y = [];
    // Collect all countries present in both signals
    const countriesA = new Set(Object.keys(dataA).map(k => k.split('|')[0]));
    const countriesB = new Set(Object.keys(dataB).map(k => k.split('|')[0]));
    const countries = [...countriesA].filter(c => countriesB.has(c));

    for (const country of countries) {
      const yearsA = Object.keys(dataA)
        .filter(k => k.startsWith(country + '|'))
        .map(k => parseInt(k.split('|')[1]));
      for (const yearA of yearsA) {
        const keyA = `${country}|${yearA}`;
        const keyB = `${country}|${yearA + lag}`;
        if (dataA[keyA] !== undefined && dataB[keyB] !== undefined) {
          x.push(dataA[keyA]);
          y.push(dataB[keyB]);
        }
      }
    }
    const { r, n } = pearson(x, y);
    results.push({ lag, r: isNaN(r) ? NaN : +r.toFixed(4), n });
  }
  return results;
}

async function main() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('REDUNDANT CLUSTER INTERNAL TEST');
  console.log('Signals: iom_displacement, social_volume, prediction_market,');
  console.log('         food_security, usda_food');
  console.log('Question: do they move together or carry distinct structure?');
  console.log('══════════════════════════════════════════════════════════════\n');

  console.log('Loading cluster readings from DB...');
  const data = await loadReadings();

  console.log('\nDATA COVERAGE:');
  for (const s of CLUSTER) {
    const keys = Object.keys(data[s]);
    const countries = new Set(keys.map(k => k.split('|')[0])).size;
    const years = keys.map(k => parseInt(k.split('|')[1]));
    const minY = Math.min(...years), maxY = Math.max(...years);
    const vals = Object.values(data[s]);
    const st = stats(vals);
    console.log(`  ${s.padEnd(20)} country-years=${String(keys.length).padStart(5)}  countries=${String(countries).padStart(3)}  years=${minY}–${maxY}  mean=${st.mean}  std=${st.std}`);
  }

  console.log('\nPAIRWISE CORRELATIONS (Pearson r across shared country-years):');
  console.log('─────────────────────────────────────────────────────────────────');
  console.log('Threshold: r>0.7 = same thing, r<0.4 = independent information\n');

  const matrix = {};
  for (const s of CLUSTER) matrix[s] = {};

  let anyIndependent = false;
  let allHighCorr = true;
  const pairResults = [];

  for (let i = 0; i < CLUSTER.length; i++) {
    for (let j = i + 1; j < CLUSTER.length; j++) {
      const sA = CLUSTER[i], sB = CLUSTER[j];
      const keysA = new Set(Object.keys(data[sA]));
      const keysB = new Set(Object.keys(data[sB]));
      const common = [...keysA].filter(k => keysB.has(k));

      const x = common.map(k => data[sA][k]);
      const y = common.map(k => data[sB][k]);
      const { r, n } = pearson(x, y);

      matrix[sA][sB] = r;
      matrix[sB][sA] = r;

      let tag;
      if (isNaN(r) || n < 10) {
        tag = 'INSUFFICIENT DATA';
      } else if (Math.abs(r) > 0.7) {
        tag = 'HIGH — same underlying fact';
      } else if (Math.abs(r) > 0.5) {
        tag = 'MODERATE — substantial overlap';
        allHighCorr = false;
      } else if (Math.abs(r) > 0.3) {
        tag = 'LOW — some shared driver';
        allHighCorr = false;
        anyIndependent = true;
      } else {
        tag = 'INDEPENDENT — distinct information';
        allHighCorr = false;
        anyIndependent = true;
      }

      const rStr = isNaN(r) ? ' n/a ' : r.toFixed(3);
      console.log(`  ${sA.padEnd(20)} ↔ ${sB.padEnd(20)}  r=${rStr}  n=${String(n).padStart(5)}  ${tag}`);
      pairResults.push({ sA, sB, r, n, tag });
    }
  }

  // Lead/lag analysis — does any signal lead the others?
  console.log('\nLEAD/LAG ANALYSIS (does any signal anticipate the others?):');
  console.log('─────────────────────────────────────────────────────────────────');
  const leadPairs = [
    ['prediction_market', 'food_security'],
    ['social_volume', 'iom_displacement'],
    ['prediction_market', 'social_volume'],
    ['food_security', 'usda_food'],
  ];

  for (const [sA, sB] of leadPairs) {
    const lagResults = temporalLeadLag(data[sA], data[sB], 3);
    const best = lagResults.reduce((a, b) => (isNaN(b.r) ? a : Math.abs(b.r) > Math.abs(a.r || 0) ? b : a), { r: 0 });
    const lagLine = lagResults.map(l => `${l.lag > 0 ? '+' : ''}${l.lag}yr:${isNaN(l.r) ? 'n/a' : l.r.toFixed(2)}`).join('  ');
    console.log(`  ${sA} → ${sB}:`);
    console.log(`    ${lagLine}`);
    if (!isNaN(best.r) && Math.abs(best.r) > 0.3 && best.lag !== 0) {
      console.log(`    ⚡ Best at lag ${best.lag > 0 ? '+' : ''}${best.lag}yr (r=${best.r.toFixed(3)}) — possible lead indicator`);
    }
  }

  // Pattern mining within cluster — co-movement events
  console.log('\nCO-MOVEMENT EVENTS (years where 4+ cluster signals spike together):');
  console.log('─────────────────────────────────────────────────────────────────');

  // Compute per-signal z-scores using global mean/std
  const zData = {};
  for (const s of CLUSTER) {
    const vals = Object.values(data[s]);
    const st = stats(vals);
    zData[s] = {};
    for (const [k, v] of Object.entries(data[s])) {
      zData[s][k] = st.std > 0 ? (v - st.mean) / st.std : 0;
    }
  }

  // Find country-years where all available cluster signals are elevated (z > 0.5)
  const allKeys = new Set(CLUSTER.flatMap(s => Object.keys(data[s])));
  const spikes = [];
  for (const key of allKeys) {
    const [country, yearStr] = key.split('|');
    const year = parseInt(yearStr);
    let spikeCount = 0, total = 0;
    const spiking = [];
    for (const s of CLUSTER) {
      if (data[s][key] !== undefined) {
        total++;
        if (zData[s][key] > 0.5) { spikeCount++; spiking.push(s); }
      }
    }
    if (total >= 3 && spikeCount >= 3) {
      spikes.push({ country, year, spikeCount, total, spiking });
    }
  }

  spikes.sort((a, b) => b.spikeCount - a.spikeCount || b.year - a.year);
  if (spikes.length === 0) {
    console.log('  No country-years found where 3+ cluster signals co-spike.');
    console.log('  This means the signals rarely agree — they are NOT a coherent cluster.');
  } else {
    console.log(`  Found ${spikes.length} country-years with 3+ cluster signals elevated:\n`);
    for (const s of spikes.slice(0, 15)) {
      console.log(`  ${s.country.padEnd(25)} ${s.year}  ${s.spikeCount}/${s.total} signals elevated  [${s.spiking.join(', ')}]`);
    }
  }

  // Internal structure — do signals form sub-clusters?
  console.log('\nSUB-CLUSTER ANALYSIS:');
  console.log('─────────────────────────────────────────────────────────────────');
  const foodPair = pairResults.find(p => (p.sA === 'food_security' && p.sB === 'usda_food') || (p.sA === 'usda_food' && p.sB === 'food_security'));
  const econPair = pairResults.find(p => (p.sA === 'prediction_market' && p.sB === 'social_volume') || (p.sA === 'social_volume' && p.sB === 'prediction_market'));
  const dispFoodPair = pairResults.find(p => (p.sA === 'iom_displacement' && p.sB === 'food_security') || (p.sA === 'food_security' && p.sB === 'iom_displacement'));

  if (foodPair && !isNaN(foodPair.r)) {
    console.log(`  FOOD sub-cluster  (food_security ↔ usda_food):      r=${foodPair.r.toFixed(3)}  ${Math.abs(foodPair.r) > 0.6 ? '→ ONE THING' : '→ still distinct'}`);
  }
  if (econPair && !isNaN(econPair.r)) {
    console.log(`  ECON sub-cluster  (prediction_market ↔ social_vol):  r=${econPair.r.toFixed(3)}  ${Math.abs(econPair.r) > 0.6 ? '→ ONE THING' : '→ still distinct'}`);
  }
  if (dispFoodPair && !isNaN(dispFoodPair.r)) {
    console.log(`  CROSS-DOMAIN      (iom_displacement ↔ food_security): r=${dispFoodPair.r.toFixed(3)}  ${Math.abs(dispFoodPair.r) > 0.5 ? '→ correlated' : '→ independent'}`);
  }

  // Final verdict
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('FINAL VERDICT:');
  console.log('══════════════════════════════════════════════════════════════\n');

  const validPairs = pairResults.filter(p => !isNaN(p.r) && p.n >= 10);
  const avgR = validPairs.length > 0
    ? validPairs.reduce((a, b) => a + Math.abs(b.r), 0) / validPairs.length
    : NaN;

  console.log(`  Valid pairs tested:     ${validPairs.length} of ${pairResults.length}`);
  if (!isNaN(avgR)) console.log(`  Mean |r| across pairs:  ${avgR.toFixed(3)}`);

  const highPairs = validPairs.filter(p => Math.abs(p.r) > 0.7);
  const indPairs  = validPairs.filter(p => Math.abs(p.r) < 0.4);

  console.log(`  High-correlation pairs: ${highPairs.length}  (same underlying fact)`);
  console.log(`  Independent pairs:      ${indPairs.length}  (distinct information)`);

  console.log('');
  if (validPairs.length === 0) {
    console.log('  ⚠️  No valid pairs — signals cover different countries/years entirely.');
    console.log('  They cannot be correlated. Each stands alone or not at all.');
  } else if (highPairs.length === validPairs.length) {
    console.log('  ❌ ALL PAIRS HIGH CORRELATION — the cluster is one blob.');
    console.log('  No signal in this cluster adds anything the others don\'t.');
    console.log('  → DELETE ALL FIVE. None survive.');
  } else if (indPairs.length > 0 && highPairs.length === 0) {
    console.log('  ✅ CLUSTER HAS INTERNAL STRUCTURE — signals move independently.');
    console.log('  Some distinct information exists within the cluster.');
    console.log('  → Identify which signal is the pivot and keep it, delete the rest.');
  } else {
    console.log('  ⚠️  MIXED RESULT — cluster is partially coherent.');
    console.log('  Some pairs share information, some don\'t. Sub-clusters exist.');
    console.log('  → See sub-cluster analysis above for the split.');
  }

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
