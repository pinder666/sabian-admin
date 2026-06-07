// historical/behavioral_ingest.cjs
// Backfill behavioral signals into the historical record
// Then re-run the entire pipeline: correlations → scoring → synthesis → dossiers
//
// Usage: node historical/behavioral_ingest.cjs
//        node historical/behavioral_ingest.cjs --country Turkey
//        node historical/behavioral_ingest.cjs --skip-fetch  (re-run pipeline only)

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const { BEHAVIORAL_SIGNALS, COUNTRY_TO_ISO3, fetchBehavioralSignals } = require('./behavioral_signals.cjs');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// ── Register behavioral signals ───────────────────────────────────────────────

async function registerSignals() {
  console.log('[INGEST] Registering behavioral signals...');

  // signal_registry columns: signal_key, signal_name, earliest_date, cadence, data_type, source, has_history_api, history_api_notes
  for (const [key, sig] of Object.entries(BEHAVIORAL_SIGNALS)) {
    const record = {
      signal_key: sig.key,
      signal_name: sig.name,
      earliest_date: `${sig.available_from}-01-01`,
      cadence: 'annual',
      data_type: 'behavioral',
      source: sig.source,
      has_history_api: true,
      history_api_notes: sig.description
    };

    const { error } = await sb.from('signal_registry').upsert(record, { onConflict: 'signal_key' });
    if (error) {
      console.log(`[INGEST] Warning: Could not register ${sig.key}: ${error.message}`);
    } else {
      console.log(`[INGEST] Registered: ${sig.key}`);
    }
  }
}

// ── Fetch and store behavioral signals ────────────────────────────────────────

async function ingestCountry(country) {
  const signals = await fetchBehavioralSignals(country);

  if (signals.length === 0) {
    console.log(`[INGEST] No behavioral data for ${country}`);
    return 0;
  }

  // Store in historical_signal_readings
  // Table schema: id, country, signal_key, signal_name, date, raw_value, raw_metadata, source, gap, gap_reason, ingested_at
  const records = signals.map(s => ({
    country: s.country,
    signal_key: s.signal_key,
    signal_name: BEHAVIORAL_SIGNALS[s.signal_key]?.name || s.signal_key,
    date: `${s.year}-01-01`, // Convert year to date
    raw_value: s.value,
    source: BEHAVIORAL_SIGNALS[s.signal_key]?.source || 'behavioral',
    gap: false
  }));

  // Batch upsert
  const batchSize = 100;
  let inserted = 0;
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const { error } = await sb.from('historical_signal_readings').upsert(batch, {
      onConflict: 'country,date,signal_key'
    });
    if (error) {
      console.log(`[INGEST] Batch error for ${country}: ${error.message}`);
    } else {
      inserted += batch.length;
    }
  }

  console.log(`[INGEST] ${country}: inserted ${inserted} behavioral readings`);
  return inserted;
}

async function ingestAllCountries() {
  const countries = Object.keys(COUNTRY_TO_ISO3);
  console.log(`[INGEST] Ingesting behavioral signals for ${countries.length} countries...`);

  let total = 0;
  for (let i = 0; i < countries.length; i++) {
    const country = countries[i];
    console.log(`[INGEST] [${i + 1}/${countries.length}] ${country}`);

    try {
      const count = await ingestCountry(country);
      total += count;
    } catch (err) {
      console.log(`[INGEST] Error for ${country}: ${err.message}`);
    }

    // Rate limit: 500ms between countries
    if (i < countries.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`[INGEST] Complete. Total readings inserted: ${total}`);
  return total;
}

// ── Re-run baseline discovery for behavioral signals ──────────────────────────

async function runBaselineDiscovery() {
  console.log('[INGEST] Re-running baseline discovery for behavioral signals...');
  const { execSync } = require('child_process');

  try {
    execSync('node historical/baseline_discovery.cjs', { cwd: require('path').join(__dirname, '..'), stdio: 'inherit' });
    console.log('[INGEST] Baseline discovery complete.');
  } catch (err) {
    console.log('[INGEST] Baseline discovery failed:', err.message);
  }
}

// ── Re-run correlation map ────────────────────────────────────────────────────

async function runCorrelationMap() {
  console.log('[INGEST] Re-running correlation map with 15 signals...');
  const { execSync } = require('child_process');

  try {
    execSync('node historical/relationship_map.cjs', { cwd: require('path').join(__dirname, '..'), stdio: 'inherit' });
    console.log('[INGEST] Correlation map complete.');
  } catch (err) {
    console.log('[INGEST] Correlation map failed:', err.message);
  }
}

// ── Re-run convergence scoring ────────────────────────────────────────────────

async function runConvergenceScoring() {
  console.log('[INGEST] Re-running convergence scoring with 15 signals...');
  const { execSync } = require('child_process');

  try {
    execSync('node historical/convergence_history.cjs', { cwd: require('path').join(__dirname, '..'), stdio: 'inherit' });
    console.log('[INGEST] Convergence scoring complete.');
  } catch (err) {
    console.log('[INGEST] Convergence scoring failed:', err.message);
  }
}

// ── Re-run downstream pipeline ────────────────────────────────────────────────

async function runDownstreamPipeline() {
  console.log('[INGEST] Re-running synthesizer → script_cache → paperclip...');
  const { execSync } = require('child_process');

  try {
    execSync('node historical/synthesizer.cjs', { cwd: require('path').join(__dirname, '..'), stdio: 'inherit' });
    console.log('[INGEST] Synthesizer complete.');
  } catch (err) {
    console.log('[INGEST] Synthesizer failed:', err.message);
  }

  try {
    execSync('node historical/script_cache.cjs', { cwd: require('path').join(__dirname, '..'), stdio: 'inherit' });
    console.log('[INGEST] Script cache complete.');
  } catch (err) {
    console.log('[INGEST] Script cache failed:', err.message);
  }

  try {
    execSync('node historical/paperclip.cjs', { cwd: require('path').join(__dirname, '..'), stdio: 'inherit' });
    console.log('[INGEST] Paperclip complete.');
  } catch (err) {
    console.log('[INGEST] Paperclip failed:', err.message);
  }
}

// ── Re-run clustering ─────────────────────────────────────────────────────────

async function runClustering() {
  console.log('[INGEST] Re-running clustering with 15 signals...');
  const { execSync } = require('child_process');

  try {
    execSync('node historical/clustering.cjs', { cwd: require('path').join(__dirname, '..'), stdio: 'inherit' });
    console.log('[INGEST] Clustering complete.');
  } catch (err) {
    console.log('[INGEST] Clustering failed:', err.message);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const skipFetch = args.includes('--skip-fetch');
  const singleCountry = args.find(a => a.startsWith('--country='))?.split('=')[1] ||
                        (args.includes('--country') ? args[args.indexOf('--country') + 1] : null);

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('SABIAN BEHAVIORAL SIGNAL INGEST');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Mode: ${skipFetch ? 'Pipeline only' : singleCountry ? `Single country: ${singleCountry}` : 'Full ingest'}`);
  console.log('');

  if (!skipFetch) {
    // Step 1: Register signals
    await registerSignals();

    // Step 2: Fetch and store behavioral data
    if (singleCountry) {
      await ingestCountry(singleCountry);
    } else {
      await ingestAllCountries();
    }
  }

  // Step 3: Re-run pipeline
  console.log('\n[INGEST] Re-running full pipeline with expanded signal set...\n');

  await runBaselineDiscovery();
  await runCorrelationMap();
  await runConvergenceScoring();
  await runClustering();
  await runDownstreamPipeline();

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('BEHAVIORAL SIGNAL INGEST COMPLETE');
  console.log('Signal count: 12 → 15');
  console.log('New signals: night_lights, diaspora_remittance, food_stress');
  console.log('═══════════════════════════════════════════════════════════════');
}

if (require.main === module) {
  main().catch(err => {
    console.error('[INGEST] FATAL:', err);
    process.exit(1);
  });
}

module.exports = {
  registerSignals,
  ingestCountry,
  ingestAllCountries,
  runBaselineDiscovery,
  runCorrelationMap,
  runConvergenceScoring,
  runDownstreamPipeline
};
