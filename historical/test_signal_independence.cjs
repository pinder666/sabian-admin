// Test signal independence: does unhcr_odp move independently of displacement/conflict signals?
// Output: correlation matrix + independence verdict

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const TEST_SIGNALS = ['unhcr_odp', 'displacement', 'conflict', 'social_unrest', 'gdelt_conflict'];

async function loadSignalReadings() {
  const data = {};
  for (const signal of TEST_SIGNALS) {
    data[signal] = {};
  }

  let page = 0;
  while (true) {
    const { data: rows, error } = await sb
      .from('historical_signal_readings')
      .select('country,signal_key,date,raw_value')
      .in('signal_key', TEST_SIGNALS)
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
  for (const signal of TEST_SIGNALS) {
    for (const key of Object.keys(data[signal])) {
      const vals = data[signal][key];
      data[signal][key] = vals.reduce((a, b) => a + b, 0) / vals.length;
    }
  }

  return data;
}

function pearsonCorrelation(x, y) {
  const n = x.length;
  if (n < 10) return { r: NaN, n: n };

  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const den = Math.sqrt(denX * denY);
  return { r: den > 0 ? num / den : 0, n: n };
}

function computeCorrelations(data) {
  const results = [];

  for (let i = 0; i < TEST_SIGNALS.length; i++) {
    for (let j = i + 1; j < TEST_SIGNALS.length; j++) {
      const sigA = TEST_SIGNALS[i];
      const sigB = TEST_SIGNALS[j];

      // Find common country-years
      const keysA = new Set(Object.keys(data[sigA]));
      const keysB = new Set(Object.keys(data[sigB]));
      const common = [...keysA].filter(k => keysB.has(k));

      if (common.length < 10) {
        results.push({ sigA, sigB, r: NaN, n: common.length, verdict: 'INSUFFICIENT DATA' });
        continue;
      }

      const x = common.map(k => data[sigA][k]);
      const y = common.map(k => data[sigB][k]);

      const { r, n } = pearsonCorrelation(x, y);

      let verdict;
      if (isNaN(r)) verdict = 'INSUFFICIENT DATA';
      else if (Math.abs(r) > 0.7) verdict = 'HIGH CORRELATION — mirrors existing';
      else if (Math.abs(r) > 0.5) verdict = 'MODERATE CORRELATION — partial overlap';
      else if (Math.abs(r) > 0.3) verdict = 'LOW CORRELATION — some overlap';
      else verdict = 'INDEPENDENT — adds new information';

      results.push({ sigA, sigB, r: parseFloat(r.toFixed(4)), n, verdict });
    }
  }

  return results;
}

async function main() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('SIGNAL INDEPENDENCE TEST');
  console.log('Question: Does unhcr_odp move independently of displacement/conflict?');
  console.log('══════════════════════════════════════════════════════════════\n');

  console.log('Loading signal readings...');
  const data = await loadSignalReadings();

  for (const sig of TEST_SIGNALS) {
    const n = Object.keys(data[sig]).length;
    console.log(`  ${sig}: ${n} country-years`);
  }

  console.log('\nComputing correlations...\n');
  const results = computeCorrelations(data);

  console.log('CORRELATION MATRIX (Pearson r):');
  console.log('─────────────────────────────────────────────────────────────────');

  // Focus on unhcr_odp correlations
  const unhcrResults = results.filter(r => r.sigA === 'unhcr_odp' || r.sigB === 'unhcr_odp');

  for (const r of unhcrResults) {
    const other = r.sigA === 'unhcr_odp' ? r.sigB : r.sigA;
    const rStr = isNaN(r.r) ? 'n/a' : r.r.toFixed(3);
    console.log(`  unhcr_odp ↔ ${other.padEnd(15)} r=${rStr.padStart(7)}  n=${String(r.n).padStart(5)}  ${r.verdict}`);
  }

  console.log('\nALL PAIRWISE CORRELATIONS:');
  console.log('─────────────────────────────────────────────────────────────────');
  for (const r of results) {
    const rStr = isNaN(r.r) ? 'n/a' : r.r.toFixed(3);
    console.log(`  ${r.sigA.padEnd(15)} ↔ ${r.sigB.padEnd(15)}  r=${rStr.padStart(7)}  n=${String(r.n).padStart(5)}  ${r.verdict}`);
  }

  // Final verdict
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('VERDICT:');
  console.log('══════════════════════════════════════════════════════════════');

  const maxCorr = Math.max(...unhcrResults.map(r => Math.abs(r.r) || 0));

  if (maxCorr > 0.7) {
    console.log(`\n❌ unhcr_odp is HIGHLY CORRELATED (max r=${maxCorr.toFixed(2)}) with existing signals.`);
    console.log('   It mirrors what displacement/conflict already capture.');
    console.log('   RECOMMENDATION: DELETE — no information gain.\n');
  } else if (maxCorr > 0.5) {
    console.log(`\n⚠️  unhcr_odp has MODERATE CORRELATION (max r=${maxCorr.toFixed(2)}) with existing signals.`);
    console.log('   Partial overlap exists. Value is marginal.');
    console.log('   RECOMMENDATION: BORDERLINE — consider domain utility before deciding.\n');
  } else if (maxCorr > 0.3) {
    console.log(`\n✅ unhcr_odp has LOW CORRELATION (max r=${maxCorr.toFixed(2)}) with existing signals.`);
    console.log('   Captures something different. Adds independent information.');
    console.log('   RECOMMENDATION: KEEP — distinct signal.\n');
  } else {
    console.log(`\n✅ unhcr_odp is INDEPENDENT (max r=${maxCorr.toFixed(2)}) from existing signals.`);
    console.log('   Net migration + homicide captures a distinct phenomenon.');
    console.log('   RECOMMENDATION: KEEP — strong information gain.\n');
  }

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
