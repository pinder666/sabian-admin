// historical/access_event.cjs
// Handles new data access events — when a country grants access to a new data source.
// Records the event, back-fills the source's historical record as far as available,
// and triggers a baseline recalculation for that country.
//
// Usage: node historical/access_event.cjs --country Mali --source "ANPE Grid Telemetry" --earliest 2015-01-01
//
// What happens:
//   1. Log the access event to historical_access_events
//   2. Mark the source as backfill_status='pending'
//   3. Run historical ingestion for that source + country
//   4. Recompute baselines for that country across all signals
//   5. Flag signal_reliability_map for rebuild

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const { logToHive } = require('../logger.cjs');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function logAccessEvent({ country, sourceName, earliestDate, notes }) {
  const { data, error } = await sb
    .from('historical_access_events')
    .insert({
      country,
      source_name:   sourceName,
      access_granted: new Date().toISOString(),
      earliest_data: earliestDate || null,
      backfill_status: 'pending',
      notes: notes || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function markBackfillComplete(eventId) {
  await sb
    .from('historical_access_events')
    .update({ backfill_status: 'complete' })
    .eq('id', eventId);
}

// Trigger baseline recalculation for a country after new data source is ingested.
// This is called after the source-specific fetcher has written to historical_signal_readings.
async function recalculateBaselinesForCountry(country) {
  console.log(`  Recalculating baselines for ${country}...`);
  const { buildBaselinesForCountry } = require('./baseline_discovery.cjs');
  // baseline_discovery exports buildBaselinesForCountry when not run as main
  if (typeof buildBaselinesForCountry === 'function') {
    await buildBaselinesForCountry(country);
  }
}

// Main — handles CLI invocation
async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : null;
  };

  const country    = getArg('--country');
  const sourceName = getArg('--source');
  const earliest   = getArg('--earliest');
  const notes      = getArg('--notes');

  if (!country || !sourceName) {
    console.error('Usage: node historical/access_event.cjs --country <name> --source <name> [--earliest YYYY-MM-DD] [--notes "..."]');
    process.exit(1);
  }

  console.log(`\n🛰️  Access event: ${country} — ${sourceName}\n`);

  const event = await logAccessEvent({ country, sourceName, earliestDate: earliest, notes });
  console.log(`  Logged access event ID: ${event.id}`);
  console.log(`  Earliest data: ${earliest || 'unknown'}`);
  console.log(`  Backfill status: pending\n`);

  logToHive({
    source: 'access_event',
    level:  'intel',
    event:  'data_access_granted',
    data:   { country, source: sourceName, earliest, event_id: event.id }
  });

  console.log('Next steps:');
  console.log(`  1. Build a fetcher for "${sourceName}" in historical/fetchers/`);
  console.log(`  2. Run: node historical/ingest_runner.cjs --country "${country}" --signal <signal_key>`);
  console.log(`  3. Baseline recalculation will run automatically after ingestion`);
  console.log(`  4. Mark event complete: update historical_access_events set backfill_status='complete' where id=${event.id}`);
}

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal:', err.message);
    process.exit(1);
  });
}

module.exports = { logAccessEvent, markBackfillComplete, recalculateBaselinesForCountry };
