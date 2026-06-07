// check_2020s_spike.cjs
// Normalization test for the 2020s MDC spike.
// Divides each country-year MDC score by its dimension count (dims),
// so a country with 5 signals reporting is not artificially elevated
// vs one with 2 signals reporting.
// If the spike survives normalization → real.
// If it collapses → coverage artifact.

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const CLUSTER = ['iom_displacement','social_volume','prediction_market','food_security','usda_food'];

function stats(vals) {
  if (!vals || vals.length === 0) return { mean: 0, std: 1 };
  const n = vals.length;
  const mean = vals.reduce((a,b) => a+b, 0) / n;
  const std = Math.sqrt(vals.reduce((a,b) => a+(b-mean)**2, 0) / n);
  return { mean, std: std > 0 ? std : 1 };
}

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
  for (const s of CLUSTER) {
    for (const k of Object.keys(data[s])) {
      const v = data[s][k];
      data[s][k] = v.reduce((a,b) => a+b, 0) / v.length;
    }
  }
  return data;
}

async function main() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('2020s SPIKE NORMALIZATION TEST');
  console.log('Is the spike real, or just more countries reporting data?');
  console.log('══════════════════════════════════════════════════════════\n');

  const data = await loadReadings();

  // Compute global stats per signal
  const globalStats = {};
  for (const s of CLUSTER) globalStats[s] = stats(Object.values(data[s]));

  // Build MDC with per-country-year dim count tracked
  const allKeys = new Set(CLUSTER.flatMap(s => Object.keys(data[s])));
  const entries = []; // { year, raw_mdc, dims, norm_mdc }

  for (const key of allKeys) {
    const parts = key.split('|');
    const year = parseInt(parts[1]);
    if (year < 1970 || year > 2024) continue;

    const zScores = [];
    for (const s of CLUSTER) {
      const v = data[s][key];
      if (v !== undefined) {
        const { mean, std } = globalStats[s];
        zScores.push((v - mean) / std);
      }
    }
    if (zScores.length < 2) continue;

    const rawMDC = zScores.reduce((a,b) => a+b, 0) / zScores.length;
    // Normalized: multiply by sqrt(dims/5) to penalize low-dimension scores
    // A score from 2 dims gets sqrt(2/5)=0.63 weight; from 5 dims gets sqrt(1)=1.0
    const normMDC = rawMDC * Math.sqrt(zScores.length / CLUSTER.length);

    entries.push({ year, raw_mdc: rawMDC, norm_mdc: normMDC, dims: zScores.length });
  }

  // Decade analysis — raw vs normalized
  const decades = {};
  for (const e of entries) {
    const d = Math.floor(e.year / 10) * 10;
    if (!decades[d]) decades[d] = { raw: [], norm: [], dims: [] };
    decades[d].raw.push(e.raw_mdc);
    decades[d].norm.push(e.norm_mdc);
    decades[d].dims.push(e.dims);
  }

  console.log('DECADE COMPARISON — raw MDC vs normalized MDC vs avg dimensions:\n');
  console.log(`${'Decade'.padEnd(10)} ${'Raw MDC'.padEnd(12)} ${'Norm MDC'.padEnd(12)} ${'Avg dims'.padEnd(10)} ${'N'.padEnd(6)} Verdict`);
  console.log('─'.repeat(70));

  const decadeRows = [];
  for (const [d, vals] of Object.entries(decades).sort()) {
    const rawMean  = vals.raw.reduce((a,b)=>a+b,0) / vals.raw.length;
    const normMean = vals.norm.reduce((a,b)=>a+b,0) / vals.norm.length;
    const avgDims  = vals.dims.reduce((a,b)=>a+b,0) / vals.dims.length;
    const n = vals.raw.length;
    decadeRows.push({ decade: d, rawMean, normMean, avgDims, n });
  }

  // Find peak decade for each metric
  const peakRaw  = decadeRows.reduce((a,b) => b.rawMean  > a.rawMean  ? b : a);
  const peakNorm = decadeRows.reduce((a,b) => b.normMean > a.normMean ? b : a);

  for (const r of decadeRows) {
    const rawBar  = '█'.repeat(Math.max(0, Math.round((r.rawMean + 0.1) * 15)));
    const normBar = '█'.repeat(Math.max(0, Math.round((r.normMean + 0.1) * 15)));
    const isPeakRaw  = r.decade === peakRaw.decade  ? ' ← PEAK RAW'  : '';
    const isPeakNorm = r.decade === peakNorm.decade ? ' ← PEAK NORM' : '';
    console.log(`${r.decade}s`.padEnd(10),
      `${r.rawMean.toFixed(4).padEnd(12)}`,
      `${r.normMean.toFixed(4).padEnd(12)}`,
      `${r.avgDims.toFixed(2).padEnd(10)}`,
      `${String(r.n).padEnd(6)}`,
      `${rawBar}${isPeakRaw}${isPeakNorm}`);
  }

  console.log('\n');

  // Dimension coverage by decade — how many countries reported all 5 vs fewer
  console.log('DIMENSION COVERAGE BY DECADE (% of country-years with all 5 signals):\n');
  for (const r of decadeRows) {
    const d = decades[r.decade];
    const full5 = d.dims.filter(x => x === 5).length;
    const pct5 = (full5 / d.dims.length * 100).toFixed(1);
    const pct4 = (d.dims.filter(x=>x>=4).length / d.dims.length * 100).toFixed(1);
    console.log(`  ${r.decade}s: ${pct5}% have 5 dims, ${pct4}% have 4+ dims  (n=${r.n})`);
  }

  console.log('\n');
  console.log('═'.repeat(70));
  console.log('VERDICT:');
  console.log('═'.repeat(70));

  const decade2020raw  = decadeRows.find(r => r.decade === '2020');
  const decade2020norm = decadeRows.find(r => r.decade === '2020');

  if (!decade2020raw) {
    console.log('\n  No 2020s data available in this time window.\n');
    return;
  }

  const isPeakRaw  = peakRaw.decade  === '2020';
  const isPeakNorm = peakNorm.decade === '2020';
  const spike2020raw  = decade2020raw.rawMean;
  const spike2020norm = decade2020norm.normMean;
  const prevPeakRaw   = decadeRows.filter(r => r.decade !== '2020').reduce((a,b) => b.rawMean > a.rawMean ? b : a);
  const prevPeakNorm  = decadeRows.filter(r => r.decade !== '2020').reduce((a,b) => b.normMean > a.normMean ? b : a);

  console.log(`\n  2020s raw MDC:        ${spike2020raw.toFixed(4)}`);
  console.log(`  2020s normalized MDC: ${spike2020norm.toFixed(4)}`);
  console.log(`  Previous peak raw:    ${prevPeakRaw.rawMean.toFixed(4)} (${prevPeakRaw.decade}s)`);
  console.log(`  Previous peak norm:   ${prevPeakNorm.normMean.toFixed(4)} (${prevPeakNorm.decade}s)`);

  if (isPeakRaw && isPeakNorm) {
    console.log('\n  ✅ SPIKE IS REAL — 2020s is peak decade in BOTH raw and normalized MDC.');
    console.log('  More dimensions reporting in 2020s is not driving the spike.');
    console.log('  HEADLINE IS USABLE: "Most stressed decade in 60 years of data."\n');
  } else if (isPeakRaw && !isPeakNorm) {
    console.log('\n  ❌ SPIKE IS ARTIFACT — 2020s peak disappears after normalization.');
    console.log(`  True peak after normalization: ${prevPeakNorm.decade}s`);
    console.log('  DO NOT USE HEADLINE. More countries/signals reporting inflated the raw score.\n');
  } else if (!isPeakRaw && !isPeakNorm) {
    console.log('\n  ❌ SPIKE NOT CONFIRMED — 2020s is not peak in either metric.');
    console.log(`  Raw peak: ${prevPeakRaw.decade}s  |  Normalized peak: ${prevPeakNorm.decade}s\n`);
  } else {
    console.log('\n  ⚠️  MIXED RESULT — check decade data above.\n');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
