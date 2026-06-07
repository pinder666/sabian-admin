// historical/ingest_runner.cjs
// Phase 1 historical ingestion — parallel, resume-safe, PM2-persistent.
//
// Concurrency model:
//   FAST fetchers (worldbank, imf, fred, vdem): 10 countries in parallel
//   SLOW fetchers (unhcr, gdelt, firms, seismic): 3 countries in parallel
//   Rate limits are per-connection, so parallel countries don't compound.
//
// Usage:
//   node historical/ingest_runner.cjs                         # full run + auto chain
//   node historical/ingest_runner.cjs --country Mali          # single country
//   node historical/ingest_runner.cjs --signal worldbank      # one fetcher, all countries
//   node historical/ingest_runner.cjs --skip-done             # skip countries already ingested
//   node historical/ingest_runner.cjs --no-chain              # skip post-backfill chain
//
// Resume-safe: UNIQUE(country, signal_key, date) — re-runs upsert cleanly.
// Progress: written to historical/ingest_progress.json every 10 countries.
// Auto-chain: on completion, automatically triggers post_backfill_chain.cjs
//   unless --no-chain is passed. Data lands → everything regenerates automatically.

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const path  = require('path');
const fs    = require('fs');
const { spawn } = require('child_process');
const { createClient } = require('@supabase/supabase-js');
const { logToHive } = require('../logger.cjs');
const { SIGNAL_REGISTRY } = require('./signal_registry.cjs');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { upsertReadings } = require('./db.cjs');

const ROOT          = path.join(__dirname, '..');
const PROGRESS_FILE = path.join(__dirname, 'ingest_progress.json');

const ALL_COUNTRIES = [
  'Mali','Burkina Faso','Niger','Sudan','Ethiopia','Myanmar','Venezuela','Somalia',
  'DRC','CAR','Chad','Nigeria','Mozambique','Libya','Haiti','Yemen','Afghanistan',
  'Syria','Iraq','South Sudan','Israel','Palestine','Ukraine','Colombia','Lebanon',
  'Pakistan','Cameroon','Armenia','Georgia','Russia','Philippines','Indonesia','Mexico',
  'Iran','Zimbabwe','Bangladesh','Sri Lanka','Kenya','Uganda','Tanzania','Zambia',
  'Senegal','Guinea','Ecuador','Bolivia','Eritrea','Djibouti','Kosovo','Bosnia',
  'Taiwan','North Korea','Belarus','Moldova','Serbia','Azerbaijan','Kyrgyzstan',
  'Tajikistan','Turkmenistan','Uzbekistan','Kazakhstan','Peru','Brazil','Nicaragua',
  'Honduras','Guatemala','El Salvador','Cuba','Angola','Rwanda','Burundi','Malawi',
  'Guinea-Bissau','Sierra Leone','Liberia','Togo','Benin','Mauritania','Tunisia',
  'Algeria','Morocco','Egypt','Jordan','Saudi Arabia','Oman','Kuwait','Vietnam',
  'Cambodia','Laos','Nepal','India','Timor-Leste','Papua New Guinea','Solomon Islands','Fiji',
  'Turkey','Greece','Bulgaria','Romania','Hungary','Poland','Slovakia','Croatia',
  'North Macedonia','Montenegro','Albania','China','South Korea','Japan','Mongolia',
  'Thailand','Malaysia','Singapore','Australia','New Zealand','South Africa','Ghana',
  'Ivory Coast','Gabon','Congo','Equatorial Guinea','Namibia','Botswana',
  'Argentina','Chile','Paraguay','Uruguay','Guyana','Suriname','Trinidad and Tobago',
  'Panama','Costa Rica','Dominican Republic','Jamaica','Belize',
  'UAE','Qatar','Bahrain','UK','France','Germany','Spain','Italy','Portugal',
  'Sweden','Finland','Norway','Denmark','Netherlands','Belgium','Austria','Switzerland',
  'Cyprus','United States',
];

// Fetchers split by speed tier
const FAST_FETCHERS = {
  worldbank: require('./fetchers/worldbank_historical.cjs').fetchWorldBankHistorical,
  imf:       require('./fetchers/imf_historical.cjs').fetchImfHistorical,
  fred:      require('./fetchers/fred_historical.cjs').fetchFredHistorical,
  vdem:      require('./fetchers/vdem_historical.cjs').fetchVdemHistorical,
};

const SLOW_FETCHERS = {
  // unhcr REMOVED 2026-05-31: displacement now uses composite architecture (flow+stock→composite).
  // unhcr_historical.cjs writes signal_key='displacement', source='unhcr_population_api' — all 11,628
  // rows were deleted as part of the displacement rebuild. Re-enabling this would recontaminate.
  // To refresh displacement: run historical/fetchers/displacement_historical.cjs (composite builder).
  gdelt:    require('./fetchers/gdelt_historical.cjs').fetchGdeltHistorical,
  firms:    require('./fetchers/firms_historical.cjs').fetchFirmsHistorical,  // DEPRECATED: country endpoint unavailable
  gee_fire: require('./fetchers/gee_fire_historical.cjs').fetchGeeFireHistorical,  // Google Earth Engine MOD14A1
  seismic:  require('./fetchers/seismic_historical.cjs').fetchSeismicHistorical,
};

// Global fetchers — these handle their own country loops and run once total.
// They cannot be broken into per-country tasks because they fetch bulk/paginated global data.
// Each entry: script path relative to ROOT, human label.
// Add new bulk fetchers here — they will be included in every future ingest run automatically.
const GLOBAL_FETCHER_SCRIPTS = [
  { script: 'historical/fetchers/currency_historical.cjs',     label: 'currency_collapse (World Bank FX)' },
  { script: 'historical/fetchers/food_security_historical.cjs', label: 'fao_food (World Bank undernourishment)' },
  { script: 'historical/fetchers/water_stress_historical.cjs', label: 'water_stress (World Bank freshwater)' },
  { script: 'historical/fetchers/maritime_trade_historical.cjs', label: 'maritime_trade (World Bank trade)' },
  { script: 'historical/fetchers/corruption_historical.cjs',   label: 'occrp (World Bank WGI corruption)' },
  { script: 'historical/fetchers/ooni_historical.cjs',         label: 'ooni_internet (OONI measurements)' },
  { script: 'historical/fetchers/eia_historical.cjs',          label: 'energy_stress (EIA international)' },
  { script: 'historical/fetchers/tor_historical.cjs',          label: 'tor_censorship (Tor Project metrics)' },
  { script: 'historical/fetchers/ucdp_historical.cjs',         label: 'conflict + social_unrest (UCDP GED)' },
  // ── Displacement & humanitarian ──────────────────────────────────────────
  { script: 'historical/fetchers/unhcr_odp_historical.cjs',    label: 'unhcr_odp (UNHCR refugee origins)' },
  { script: 'historical/fetchers/displacement_historical.cjs', label: 'displacement (composite: flow+stock z-score average)' },
  // ── Resource & financial risk ────────────────────────────────────────────
  { script: 'historical/fetchers/resource_conflict_historical.cjs', label: 'resource_conflict (World Bank resource rents)' },
  { script: 'historical/fetchers/sovereign_cds_historical.cjs', label: 'sovereign_cds (Damodaran country risk premium)' },
  // ── Physical risk ────────────────────────────────────────────────────────
  { script: 'historical/fetchers/flood_risk_historical.cjs',   label: 'flood_risk (World Bank disaster displacement)' },
  { script: 'historical/fetchers/dam_risk_historical.cjs',     label: 'dam_risk (World Bank water infrastructure)' },
  // ── Food & supply chain ──────────────────────────────────────────────────
  { script: 'historical/fetchers/fews_food_security_historical.cjs', label: 'food_security (FEWS NET IPC)' },
  { script: 'historical/fetchers/usda_food_historical.cjs',        label: 'usda_food (USDA FAS PSD grain stocks)' },
  // ── Behavioral & predictive ──────────────────────────────────────────────
  { script: 'historical/fetchers/iom_displacement_historical.cjs', label: 'iom_displacement (IOM DTM + IDMC)' },
  { script: 'historical/fetchers/social_volume_historical.cjs',    label: 'social_volume (social media mentions)' },
  { script: 'historical/fetchers/prediction_market_historical.cjs', label: 'prediction_market (Polymarket contracts)' },
  // ── Maritime & logistics ─────────────────────────────────────────────────
  { script: 'historical/fetchers/dark_vessel_historical.cjs',  label: 'dark_vessel (World Bank LPI inverted)' },
  { script: 'historical/fetchers/port_congestion_historical.cjs', label: 'port_congestion (World Bank LPI/LSCI)' },
  { script: 'historical/fetchers/pipeline_risk_historical.cjs', label: 'pipeline_risk (World Bank oil/gas rents)' },
  { script: 'historical/fetchers/chokepoint_historical.cjs',   label: 'chokepoint (World Bank trade × chokepoint weight)' },
  // ── Infrastructure ───────────────────────────────────────────────────────
  { script: 'historical/fetchers/rail_corridor_historical.cjs', label: 'rail_corridor (World Bank rail lines)' },
  { script: 'historical/fetchers/cable_disruption_historical.cjs', label: 'cable_disruption (Cloudflare Radar BGP)' },
  // ── Electronic warfare & cyber ───────────────────────────────────────────
  { script: 'historical/fetchers/gps_jamming_historical.cjs',  label: 'gps_jamming (World Bank military expenditure)' },
  { script: 'historical/fetchers/military_proximity_historical.cjs', label: 'military_proximity (World Bank arms imports)' },
  { script: 'historical/fetchers/cyber_threat_historical.cjs', label: 'cyber_threat (World Bank internet security inverted)' },
  // ── Transport ────────────────────────────────────────────────────────────
  { script: 'historical/fetchers/flight_movement_historical.cjs', label: 'flight_movement (World Bank air transport)' },
  // ── Structural Pressure (MDC composite — run after all components are ingested) ─
  { script: 'historical/fetchers/structural_pressure_historical.cjs', label: 'structural_pressure (MDC composite: 5 signals → 1)' },
  // ── Public health ────────────────────────────────────────────────────────
  { script: 'historical/fetchers/health_crisis_historical.cjs', label: 'health_crisis (WHO GHO + World Bank health)' },
  // climate_historical.cjs runs via checkpoint — run separately: node historical/fetchers/climate_historical.cjs
  // ioda_historical.cjs — blocked pending network access to api.ioda.inetintel.cc.gatech.edu
];

// ── Concurrency pool ──────────────────────────────────────────────────────────

async function runPool(tasks, concurrency) {
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  }
  const workers = Array.from({ length: concurrency }, worker);
  await Promise.all(workers);
  return results;
}

// ── Table check ───────────────────────────────────────────────────────────────

async function checkTables() {
  const required = ['historical_signal_readings','signal_registry','signal_reliability_map','signal_baselines','historical_access_events'];
  const missing = [];
  for (const table of required) {
    const { error } = await sb.from(table).select('*').limit(1);
    if (error) missing.push(table);
  }
  if (missing.length > 0) {
    console.error('\n❌ Missing tables:', missing.join(', '));
    console.error('  Open: https://supabase.com/dashboard/project/qdxgcyawpqxhhjprqyas/sql');
    console.error('  Run: historical/MIGRATION.sql\n');
    process.exit(1);
  }
}

// ── Signal registry seed ─────────────────────────────────────────────────────

async function seedSignalRegistry() {
  for (const sig of SIGNAL_REGISTRY) {
    await sb.from('signal_registry').upsert({
      signal_key: sig.signal_key, signal_name: sig.signal_name,
      earliest_date: sig.earliest_date, cadence: sig.cadence,
      data_type: sig.data_type, source: sig.source,
      has_history_api: sig.has_history_api, history_api_notes: sig.history_api_notes,
      registered_at: new Date().toISOString(),
    }, { onConflict: 'signal_key' });
  }
  console.log(`  ✅ Signal registry seeded (${SIGNAL_REGISTRY.length} signals)`);
}

// ── Write readings ────────────────────────────────────────────────────────────

async function writeReadings(readings) {
  if (!readings || readings.length === 0) return 0;
  const seen = new Set();
  const unique = readings.filter(r => {
    const key = `${r.country}|${r.signal_key}|${r.date}|${r.source}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const { inserted, errors } = await upsertReadings(sb, unique, { batchSize: 500 });
  if (errors.length > 0) errors.forEach(e => console.error(`    ⚠ Upsert error batch ${e.batch}: ${e.error}`));
  return inserted;
}

// ── Single fetcher run ────────────────────────────────────────────────────────

async function runFetcher(name, fn, country) {
  try {
    const readings = await fn(country);
    if (!readings || readings.length === 0) return 0;
    const stamped = readings.map(r => ({ ...r, country }));
    const written = await writeReadings(stamped);
    return written;
  } catch (err) {
    console.error(`    ❌ [${name}] ${country}: ${err.message}`);
    logToHive({ source: 'ingest_runner', level: 'error', event: 'fetcher_error',
      data: { fetcher: name, country, error: err.message } });
    return 0;
  }
}

// ── Country ingestion ─────────────────────────────────────────────────────────

async function ingestCountry(country, fetcherSet, label) {
  let total = 0;
  for (const [name, fn] of Object.entries(fetcherSet)) {
    const n = await runFetcher(name, fn, country);
    total += n;
  }
  return total;
}

// ── Progress tracking ─────────────────────────────────────────────────────────

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); }
  catch { return { done: [], total_written: 0, started_at: new Date().toISOString() }; }
}

function saveProgress(state) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(state, null, 2));
}

// ── Auto-chain trigger ────────────────────────────────────────────────────────

function runPostBackfillChain(signal) {
  return new Promise((resolve) => {
    const chainScript = path.join(__dirname, 'post_backfill_chain.cjs');
    const chainArgs   = signal ? ['--signal', signal] : ['--all'];

    console.log('\n═'.repeat(60));
    console.log('🔗 AUTO-CHAIN: Triggering post_backfill_chain.cjs');
    console.log(`   Signal: ${signal || 'all'}`);
    console.log('   Pass --no-chain to skip this step.');
    console.log('═'.repeat(60) + '\n');

    const proc = spawn(process.execPath, [chainScript, ...chainArgs], {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
    });

    proc.on('close', code => {
      if (code === 0) {
        console.log('\n✅ Post-backfill chain completed successfully.');
      } else {
        console.error(`\n❌ Post-backfill chain exited with code ${code}.`);
        console.error('   Run manually: node historical/post_backfill_chain.cjs --all');
      }
      resolve(code);
    });

    proc.on('error', err => {
      console.error(`\n❌ Failed to spawn post_backfill_chain: ${err.message}`);
      console.error('   Run manually: node historical/post_backfill_chain.cjs --all');
      resolve(1);
    });
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const getArg = f => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
  const skipDone  = args.includes('--skip-done');
  const noChain   = args.includes('--no-chain');
  const targetCountry = getArg('--country');
  const targetSignal  = getArg('--signal');

  let countries = targetCountry ? [targetCountry] : ALL_COUNTRIES;

  // Filter fetchers by target signal if specified
  const fastSet = targetSignal
    ? Object.fromEntries(Object.entries(FAST_FETCHERS).filter(([k]) => k.includes(targetSignal)))
    : FAST_FETCHERS;
  const slowSet = targetSignal
    ? Object.fromEntries(Object.entries(SLOW_FETCHERS).filter(([k]) => k.includes(targetSignal)))
    : SLOW_FETCHERS;

  const progress = loadProgress();

  if (skipDone && progress.done.length > 0) {
    const before = countries.length;
    countries = countries.filter(c => !progress.done.includes(c));
    console.log(`  Skipping ${before - countries.length} already-done countries`);
  }

  console.log('\n🛰️  Sabian Phase 1 — Historical Ingestion');
  console.log(`   Countries:   ${countries.length}`);
  console.log(`   Fast signal groups: ${Object.keys(fastSet).join(', ') || 'none'}`);
  console.log(`   Slow signal groups: ${Object.keys(slowSet).join(', ') || 'none'}`);
  console.log(`   Started:     ${new Date().toISOString()}\n`);

  await checkTables();
  await seedSignalRegistry();
  console.log('');

  let totalWritten = progress.total_written || 0;
  let done = 0;

  // ── Phase A: Fast fetchers — 10 countries in parallel ────────────────────
  if (Object.keys(fastSet).length > 0) {
    console.log(`\n── Phase A: Fast fetchers (concurrency 10) ──`);
    const tasks = countries.map(country => async () => {
      const n = await ingestCountry(country, fastSet, 'fast');
      totalWritten += n;
      done++;
      const pct = ((done / countries.length) * 100).toFixed(1);
      console.log(`  ✅ [fast] ${country}: ${n} rows | ${done}/${countries.length} (${pct}%)`);
      if (done % 10 === 0) {
        progress.done.push(...countries.slice(done - 10, done));
        progress.total_written = totalWritten;
        saveProgress(progress);
      }
      return n;
    });
    await runPool(tasks, 5);
    console.log(`\n  Phase A complete. Total written so far: ${totalWritten}\n`);
  }

  // ── Phase B: Slow fetchers — 3 countries in parallel ─────────────────────
  if (Object.keys(slowSet).length > 0) {
    done = 0;
    console.log(`── Phase B: Slow fetchers (concurrency 3) ──`);
    const tasks = countries.map(country => async () => {
      const n = await ingestCountry(country, slowSet, 'slow');
      totalWritten += n;
      done++;
      const pct = ((done / countries.length) * 100).toFixed(1);
      console.log(`  ✅ [slow] ${country}: ${n} rows | ${done}/${countries.length} (${pct}%)`);
      if (!progress.done.includes(country)) progress.done.push(country);
      progress.total_written = totalWritten;
      if (done % 5 === 0) saveProgress(progress);
      return n;
    });
    await runPool(tasks, 3);
    console.log(`\n  Phase B complete.\n`);
  }

  // Final progress save
  progress.total_written = totalWritten;
  progress.completed_at  = new Date().toISOString();
  saveProgress(progress);

  logToHive({ source: 'ingest_runner', level: 'intel', event: 'ingestion_complete',
    data: { countries: countries.length, total_written: totalWritten } });

  console.log('═'.repeat(60));
  console.log(`✅ Ingestion complete.`);
  console.log(`   Total readings written: ${totalWritten}`);
  console.log(`   Countries:              ${countries.length}`);

  // ── Phase C: Global fetchers — run once, handle their own country loops ──
  if (!targetSignal || GLOBAL_FETCHER_SCRIPTS.some(g => g.label.includes(targetSignal))) {
    console.log(`\n── Phase C: Global fetchers (${GLOBAL_FETCHER_SCRIPTS.length} scripts) ──`);
    for (const { script, label } of GLOBAL_FETCHER_SCRIPTS) {
      console.log(`\n  ▶ ${label}`);
      await new Promise((resolve) => {
        const proc = spawn(process.execPath, [path.join(ROOT, script)], {
          cwd: path.join(ROOT, 'historical', 'fetchers'),
          stdio: 'inherit',
        });
        proc.on('close', code => {
          if (code !== 0) console.error(`  ⚠ ${label} exited ${code} — continuing`);
          resolve();
        });
        proc.on('error', err => {
          console.error(`  ⚠ ${label} spawn error: ${err.message} — continuing`);
          resolve();
        });
      });
    }
    console.log(`\n  Phase C complete.\n`);
  }

  // ── Auto-chain: rebuild baselines + rescore + patterns ───────────────────
  if (noChain) {
    console.log(`\n[--no-chain] Skipping post-backfill chain.`);
    console.log(`  Run manually: node historical/post_backfill_chain.cjs --all`);
  } else if (targetCountry) {
    // Single-country runs: don't chain (incomplete dataset)
    console.log(`\n[single-country] Skipping post-backfill chain for single-country run.`);
    console.log(`  To rescore: node historical/post_backfill_chain.cjs --all`);
  } else {
    await runPostBackfillChain(targetSignal || null);
  }
}

if (require.main === module) {
  main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
}
