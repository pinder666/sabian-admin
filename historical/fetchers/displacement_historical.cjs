// historical/fetchers/displacement_historical.cjs
// Displacement composite signal — combines flow + stock into one number.
//
// Components:
//   displacement_flow  — UNHCR XLSX, annual departures from origin country (leading indicator)
//   displacement_stock — UNHCR API, cumulative refugees+IDPs+asylum seekers (lagging indicator)
//
// Method: z-score each component against its own global distribution, then average.
// Requires ≥1 component present (not ≥2, as many country-years have only one source).
// Writes: signal_key='displacement', source='composite:displacement_flow+displacement_stock'
//
// PRE-RUN CHECKLIST (do these before running):
//   1. Crawl done: displacement_stock has ~6,000+ non-null rows
//   2. Old data deleted via SQL: DELETE FROM historical_signal_readings
//      WHERE signal_key='displacement' AND source='unhcr_population_api'
//   3. Old baselines deleted: DELETE FROM signal_baselines WHERE signal_key='displacement'
//   See historical memory: sabian_displacement_build_state.md steps 1-4

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { sb, upsertReadings } = require('../db.cjs');

const COMPONENTS = ['displacement_flow', 'displacement_stock'];

// Persist the per-component global mean/std the composite is built from,
// so the live displacement path can reproduce the same z-score.
async function persistComponentStats(signalKey, stats) {
  const rows = Object.entries(stats).map(([component, s]) => ({
    signal_key: signalKey,
    component,
    mean: +s.mean.toFixed(8),
    std: +s.std.toFixed(8),
    computed_at: new Date().toISOString()
  }));
  const { error } = await sb
    .from('signal_component_stats')
    .upsert(rows, { onConflict: 'signal_key,component' });
  if (error) console.error('  Component-stats write error:', error.message);
  else console.log(`  Persisted ${rows.length} component stats for ${signalKey}.`);
}

function globalStats(values) {
  if (!values || values.length === 0) return { mean: 0, std: 1 };
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  return { mean, std: std > 0 ? std : 1 };
}

async function loadComponents() {
  const data = {};
  for (const s of COMPONENTS) data[s] = {};

  let page = 0;
  let total = 0;
  process.stdout.write('Loading component signals from DB .');
  while (true) {
    const { data: rows, error } = await sb
      .from('historical_signal_readings')
      .select('country,signal_key,date,raw_value')
      .in('signal_key', COMPONENTS)
      .not('raw_value', 'is', null)
      .eq('gap', false)
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error) throw error;
    if (!rows || rows.length === 0) break;
    for (const r of rows) {
      const year = new Date(r.date).getFullYear();
      const key = `${r.country}|${year}`;
      if (!data[r.signal_key][key]) data[r.signal_key][key] = [];
      data[r.signal_key][key].push(parseFloat(r.raw_value));
    }
    total += rows.length;
    if (rows.length < 1000) break;
    page++;
    if (page % 10 === 0) process.stdout.write('.');
  }
  console.log(` ${total} rows loaded.`);

  // Average sub-annual readings to annual
  for (const s of COMPONENTS) {
    for (const k of Object.keys(data[s])) {
      const vals = data[s][k];
      data[s][k] = vals.reduce((a, b) => a + b, 0) / vals.length;
    }
  }
  return data;
}

async function main() {
  console.log('\nDisplacement Composite Builder');
  console.log('═'.repeat(63));
  console.log('Components: displacement_flow + displacement_stock → displacement\n');

  // Safety check: old displacement data must be gone before running
  const { count: oldCount } = await sb
    .from('historical_signal_readings')
    .select('*', { count: 'exact', head: true })
    .eq('signal_key', 'displacement')
    .eq('source', 'unhcr_population_api');

  if (oldCount > 0) {
    console.error(`\n❌ ABORT: ${oldCount} old displacement rows still exist (source=unhcr_population_api).`);
    console.error('   Delete them first via Supabase SQL editor:');
    console.error("   DELETE FROM historical_signal_readings WHERE signal_key='displacement' AND source='unhcr_population_api';");
    process.exit(1);
  }
  console.log('✓ Old displacement data cleared (source=unhcr_population_api not present)');

  // Check crawl progress
  const { count: stockRows } = await sb
    .from('historical_signal_readings')
    .select('*', { count: 'exact', head: true })
    .eq('signal_key', 'displacement_stock')
    .not('raw_value', 'is', null);
  console.log(`✓ displacement_stock: ${stockRows} non-null rows`);
  if (stockRows < 1000) {
    console.error('\n⚠ WARNING: displacement_stock has very few rows. Is the crawl complete?');
    console.error('  Run: node historical/run_displacement_stock_slow.cjs --resume');
    console.error('  Proceeding anyway — composite will use whatever stock data exists.');
  }

  const { count: flowRows } = await sb
    .from('historical_signal_readings')
    .select('*', { count: 'exact', head: true })
    .eq('signal_key', 'displacement_flow');
  console.log(`✓ displacement_flow: ${flowRows} rows`);

  const data = await loadComponents();

  for (const s of COMPONENTS) {
    const n = Object.keys(data[s]).length;
    const countries = new Set(Object.keys(data[s]).map(k => k.split('|')[0])).size;
    console.log(`  ${s.padEnd(24)}: ${n} country-years (${countries} countries)`);
  }

  // Compute global stats per component
  console.log('\nComputing global statistics per component...');
  const stats = {};
  for (const s of COMPONENTS) {
    stats[s] = globalStats(Object.values(data[s]));
    console.log(`  ${s.padEnd(24)}: mean=${stats[s].mean.toFixed(3)}  std=${stats[s].std.toFixed(3)}`);
  }
  await persistComponentStats('displacement', stats);

  // Build composite — all country-years with ≥1 component
  console.log('\nBuilding displacement composite...');
  const allKeys = new Set(COMPONENTS.flatMap(s => Object.keys(data[s])));
  const rows = [];
  let flowOnly = 0, stockOnly = 0, both = 0;

  for (const key of allKeys) {
    const [country, yearStr] = key.split('|');
    const year = parseInt(yearStr);

    const zScores = [];
    const dimBreakdown = {};
    for (const s of COMPONENTS) {
      const v = data[s][key];
      if (v !== undefined) {
        const z = (v - stats[s].mean) / stats[s].std;
        zScores.push(z);
        dimBreakdown[s] = +z.toFixed(4);
      }
    }

    if (zScores.length === 0) continue;

    const hasFlow = dimBreakdown.displacement_flow !== undefined;
    const hasStock = dimBreakdown.displacement_stock !== undefined;
    if (hasFlow && hasStock) both++;
    else if (hasFlow) flowOnly++;
    else stockOnly++;

    const compositeZ = zScores.reduce((a, b) => a + b, 0) / zScores.length;

    rows.push({
      country,
      signal_key:   'displacement',
      signal_name:  'Displacement',
      date:         `${year}-01-01`,
      raw_value:    +compositeZ.toFixed(6),
      gap:          false,
      source:       'composite:displacement_flow+displacement_stock',
      raw_metadata: {
        dims:        zScores.length,
        components:  dimBreakdown,
        has_flow:    hasFlow,
        has_stock:   hasStock,
        method:      'mean_z_score',
        computed_at: new Date().toISOString(),
      },
      ingested_at: new Date().toISOString(),
    });
  }

  const countries = new Set(rows.map(r => r.country)).size;
  const years = rows.map(r => new Date(r.date).getFullYear());
  const minY = Math.min(...years), maxY = Math.max(...years);

  console.log(`\n  Built ${rows.length} displacement composite rows`);
  console.log(`  Countries: ${countries}  |  Years: ${minY}–${maxY}`);
  console.log(`  Coverage: flow+stock: ${both}  |  flow only: ${flowOnly}  |  stock only: ${stockOnly}`);

  // Score distribution check
  const scores = rows.map(r => r.raw_value);
  const gStats = globalStats(scores);
  const elevated = rows.filter(r => r.raw_value > gStats.mean + 0.5 * gStats.std).length;
  console.log(`\n  Score distribution: mean=${gStats.mean.toFixed(3)}  std=${gStats.std.toFixed(3)}`);
  console.log(`  Elevated (z>0.5σ): ${elevated} country-years (${(elevated/rows.length*100).toFixed(1)}%)`);

  // Top 15 — spot check: Rwanda 1994, Ukraine 2022, Syria 2013 should be near top
  const top15 = [...rows].sort((a, b) => b.raw_value - a.raw_value).slice(0, 15);
  console.log('\n  Top 15 displacement country-years (expect Rwanda 1994, Ukraine 2022, Syria 2013 near top):');
  for (const r of top15) {
    const meta = r.raw_metadata;
    const src = [meta.has_flow ? 'flow' : '', meta.has_stock ? 'stock' : ''].filter(Boolean).join('+');
    console.log(`    ${r.country.padEnd(28)} ${new Date(r.date).getFullYear()}  z=${r.raw_value.toFixed(3)}  src=${src}`);
  }

  console.log('\nWriting to historical_signal_readings...');
  const { inserted, errors } = await upsertReadings(sb, rows, { batchSize: 500 });
  if (errors.length > 0) errors.forEach(e => console.error(`  Batch ${e.batch} error: ${e.error}`));
  console.log(`  Done. ${inserted} rows upserted.\n`);

  // Final verification
  const { data: top5 } = await sb
    .from('historical_signal_readings')
    .select('country,date,raw_value')
    .eq('signal_key', 'displacement')
    .eq('source', 'composite:displacement_flow+displacement_stock')
    .order('raw_value', { ascending: false })
    .limit(5);
  console.log('  Verification (top 5 in DB):');
  for (const r of (top5 || [])) {
    console.log(`    ${r.country.padEnd(28)} ${r.date.slice(0, 4)}  z=${parseFloat(r.raw_value).toFixed(3)}`);
  }

  const { count: finalCount } = await sb
    .from('historical_signal_readings')
    .select('*', { count: 'exact', head: true })
    .eq('signal_key', 'displacement')
    .eq('source', 'composite:displacement_flow+displacement_stock');
  console.log(`\n  Total displacement composite rows in DB: ${finalCount}`);
}

if (require.main === module) {
  main().catch(err => { console.error('\n❌', err.message); process.exit(1); });
}
module.exports = { main };
