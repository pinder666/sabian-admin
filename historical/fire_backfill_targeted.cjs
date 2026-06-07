// historical/fire_backfill_targeted.cjs
// Targeted GEE fire backfill for countries that were missed or errored.
//
// Two groups:
//   MISSING  — 43 countries never reached before process was killed at country 110
//   ERRORED  — 10 countries that ran but returned fetch_error (GEE compute timeout)
//              Fixed by adding bestEffort=True + tileScale=4 to reduceRegion
//
// After all fetches complete, runs post_backfill_chain (baseline → convergence → patterns).
//
// Usage: node historical/fire_backfill_targeted.cjs
//        node historical/fire_backfill_targeted.cjs --dry-run  (list targets, no fetch)

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const { execSync } = require('child_process');
const path = require('path');
const fs   = require('fs');
const { logToHive } = require('../logger.cjs');
const { fetchGeeFireHistorical } = require('./fetchers/gee_fire_historical.cjs');

const sb   = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ROOT = path.join(__dirname, '..');
const LOG  = path.join(__dirname, 'fire_backfill_targeted.log');

const MISSING_COUNTRIES = [
  'Japan','Mongolia','Thailand','Malaysia','Singapore','New Zealand',
  'South Africa','Ghana','Ivory Coast','Gabon','Congo','Equatorial Guinea','Namibia','Botswana',
  'Chile','Uruguay','Guyana','Suriname','Trinidad and Tobago',
  'Panama','Costa Rica','Dominican Republic','Jamaica','Belize',
  'UAE','Qatar','Bahrain','UK','France','Germany','Spain','Italy','Portugal',
  'Sweden','Finland','Norway','Denmark','Netherlands','Belgium','Austria','Switzerland',
  'Cyprus','United States',
];

const ERRORED_COUNTRIES = [
  'CAR','DRC','Myanmar','Bosnia','North Korea','North Macedonia',
  'Palestine','Solomon Islands','South Korea','Fiji',
];

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG, line + '\n');
}

async function writeReadings(readings) {
  if (!readings || readings.length === 0) return 0;
  for (let i = 0; i < readings.length; i += 500) {
    const { error } = await sb
      .from('historical_signal_readings')
      .upsert(readings.slice(i, i + 500), { onConflict: 'country,signal_key,date' });
    if (error) throw error;
  }
  return readings.length;
}

async function fetchAndWrite(country, label) {
  try {
    const readings = await fetchGeeFireHistorical(country);
    if (!readings || readings.length === 0) {
      log(`  ⚠️  [${label}] ${country}: no readings returned`);
      return 0;
    }
    const stamped = readings.map(r => ({ ...r, country }));
    const written = await writeReadings(stamped);
    const nonNull = stamped.filter(r => r.raw_value !== null && r.raw_value > 0).length;
    log(`  ✅ [${label}] ${country}: ${written} rows written (${nonNull} with fire data)`);
    return written;
  } catch (err) {
    log(`  ❌ [${label}] ${country}: ${err.message}`);
    return 0;
  }
}

async function runPool(tasks, concurrency) {
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

async function runPostBackfillChain() {
  log('\n  Running post_backfill_chain (baseline → convergence → holdout → patterns)...');
  try {
    execSync('node historical/post_backfill_chain.cjs --all', { cwd: ROOT, stdio: 'pipe' });
    log('  ✅ post_backfill_chain complete.');
  } catch (err) {
    log('  ⚠️  post_backfill_chain error: ' + err.message.slice(0, 200));
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  log('═══════════════════════════════════════════════');
  log('SABIAN TARGETED FIRE BACKFILL');
  log(`Missing countries: ${MISSING_COUNTRIES.length}`);
  log(`Errored countries: ${ERRORED_COUNTRIES.length}`);
  log(`Total targets:     ${MISSING_COUNTRIES.length + ERRORED_COUNTRIES.length}`);
  log(`Fix applied:       bestEffort=True + tileScale=4 on reduceRegion`);
  log('═══════════════════════════════════════════════\n');

  if (dryRun) {
    log('DRY RUN — targets only, no fetch');
    log('Missing: ' + MISSING_COUNTRIES.join(', '));
    log('Errored: ' + ERRORED_COUNTRIES.join(', '));
    return;
  }

  // Phase 1 — errored countries (most critical: CAR, DRC, Myanmar)
  log(`\n── Phase 1: Re-running ${ERRORED_COUNTRIES.length} errored countries ──`);
  let done = 0;
  const erroredTasks = ERRORED_COUNTRIES.map(country => async () => {
    const n = await fetchAndWrite(country, `errored ${++done}/${ERRORED_COUNTRIES.length}`);
    return n;
  });
  await runPool(erroredTasks, 3);

  // Phase 2 — missing countries
  log(`\n── Phase 2: Fetching ${MISSING_COUNTRIES.length} missing countries ──`);
  done = 0;
  const missingTasks = MISSING_COUNTRIES.map(country => async () => {
    const n = await fetchAndWrite(country, `missing ${++done}/${MISSING_COUNTRIES.length}`);
    return n;
  });
  await runPool(missingTasks, 3);

  log('\n══════════════════════════════════════════════');
  log(`✅ All ${MISSING_COUNTRIES.length + ERRORED_COUNTRIES.length} countries processed.`);

  logToHive({
    source: 'fire_backfill_targeted',
    level: 'intel',
    event: 'targeted_backfill_complete',
    data: { missing: MISSING_COUNTRIES.length, errored: ERRORED_COUNTRIES.length },
  });

  await runPostBackfillChain();

  log('\n✅ TARGETED FIRE BACKFILL COMPLETE.');
  log('   Scores, baselines, and pattern reports refreshed.');
  log('   Check fire_backfill_targeted.log for per-country results.');
}

main().catch(err => {
  log('FATAL: ' + err.message);
  process.exit(1);
});
