// historical/fire_rerun_errored.cjs
// Re-runs the 10 countries that had fetch_error due to wrong LSIB name mapping.
// Run AFTER fire_backfill_targeted.cjs completes.
//
// Root cause fixed in gee_fire_fetcher.py:
//   - Added correct LSIB country_na mappings for CAR, DRC, Myanmar, Bosnia,
//     North Korea, North Macedonia, Palestine, Solomon Islands, South Korea, Fiji
//   - Fixed geometry null check (EE null is truthy in Python)
//
// Usage: node historical/fire_rerun_errored.cjs

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const { execSync } = require('child_process');
const path = require('path');
const fs   = require('fs');
const { logToHive } = require('../logger.cjs');
const { fetchGeeFireHistorical } = require('./fetchers/gee_fire_historical.cjs');

const sb   = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ROOT = path.join(__dirname, '..');
const LOG  = path.join(__dirname, 'fire_rerun_errored.log');

const TARGETS = [
  'CAR','DRC','Myanmar',
  'Bosnia','North Korea','North Macedonia',
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

async function fetchAndWrite(country, idx) {
  try {
    const readings = await fetchGeeFireHistorical(country);
    if (!readings || readings.length === 0) {
      log(`  ⚠️  [${idx}/${TARGETS.length}] ${country}: no readings returned`);
      return 0;
    }
    const stamped = readings.map(r => ({ ...r, country }));
    const written = await writeReadings(stamped);
    const nonNull = stamped.filter(r => r.raw_value !== null && r.raw_value > 0).length;
    const status  = nonNull > 0 ? `✅ ${nonNull} years with fire data` : '⚠️  still no fire data';
    log(`  [${idx}/${TARGETS.length}] ${country}: ${written} rows — ${status}`);
    return written;
  } catch (err) {
    log(`  ❌ [${idx}/${TARGETS.length}] ${country}: ${err.message}`);
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

async function main() {
  log('═══════════════════════════════════════════════');
  log('SABIAN FIRE RE-RUN — 10 ERRORED COUNTRIES');
  log('Fix: correct LSIB name mappings + geometry null check');
  log(`Targets: ${TARGETS.join(', ')}`);
  log('═══════════════════════════════════════════════\n');

  let done = 0;
  const tasks = TARGETS.map(country => async () => {
    done++;
    return fetchAndWrite(country, done);
  });

  await runPool(tasks, 3);

  log('\n══════════════════════════════════════════════');
  log(`✅ All ${TARGETS.length} countries re-processed.`);

  logToHive({
    source: 'fire_rerun_errored',
    level: 'intel',
    event: 'errored_countries_rerun',
    data: { countries: TARGETS.length },
  });

  log('\n  Running post_backfill_chain...');
  try {
    execSync('node historical/post_backfill_chain.cjs --all', { cwd: ROOT, stdio: 'pipe' });
    log('  ✅ post_backfill_chain complete.');
  } catch (err) {
    log('  ⚠️  post_backfill_chain error: ' + err.message.slice(0, 200));
  }

  log('\n✅ ERRORED COUNTRY RE-RUN COMPLETE.');
}

main().catch(err => {
  log('FATAL: ' + err.message);
  process.exit(1);
});
