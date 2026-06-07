// historical/ingest_comtrade_arms.cjs
// Ingest UN Comtrade arms trade data to Supabase
// Reads COMTRADE_ARMS_RAW_DATA.json and uploads to historical_signal_readings

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

console.log('═══════════════════════════════════════════════════════════════');
console.log('UN COMTRADE ARMS TRADE INGEST');
console.log('Uploading to Supabase historical_signal_readings');
console.log('═══════════════════════════════════════════════════════════════\n');

async function ingestArmsData() {
  // Read raw data
  const dataPath = path.join(__dirname, 'COMTRADE_ARMS_RAW_DATA.json');

  if (!fs.existsSync(dataPath)) {
    console.log('[ERROR] COMTRADE_ARMS_RAW_DATA.json not found');
    console.log('Run: node historical/fetch_comtrade_arms.cjs');
    return null;
  }

  const rawData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  console.log('[LOAD] Loaded', rawData.length, 'records from file\n');

  // Register signals
  console.log('[REGISTER] Registering arms trade signals...');

  const signals = [
    {
      signal_key: 'arms_imports',
      signal_name: 'Arms Imports',
      earliest_date: '1990-01-01',
      cadence: 'annual',
      data_type: 'defense_procurement',
      source: 'UN Comtrade HS Code 93',
      has_history_api: true,
      history_api_notes: 'Arms & ammunition imports (HS Code 93) from UN Comtrade API'
    },
    {
      signal_key: 'arms_exports',
      signal_name: 'Arms Exports',
      earliest_date: '1990-01-01',
      cadence: 'annual',
      data_type: 'defense_procurement',
      source: 'UN Comtrade HS Code 93',
      has_history_api: true,
      history_api_notes: 'Arms & ammunition exports (HS Code 93) from UN Comtrade API'
    }
  ];

  for (const sig of signals) {
    const { error } = await sb.from('signal_registry').upsert(sig, { onConflict: 'signal_key' });
    if (error) console.log('  Warning:', error.message);
    else console.log('  ✅', sig.signal_key);
  }

  // Transform to signal readings format
  console.log('\n[TRANSFORM] Preparing signal readings...');

  const importRecords = rawData
    .filter(r => r.flow === 'import')
    .map(r => ({
      country: r.country,
      signal_key: 'arms_imports',
      signal_name: 'Arms Imports',
      date: `${r.year}-01-01`,
      raw_value: r.value_usd,
      raw_metadata: { hs_code: r.hs_code, flow: 'import' },
      source: 'UN Comtrade',
      gap: false
    }));

  const exportRecords = rawData
    .filter(r => r.flow === 'export')
    .map(r => ({
      country: r.country,
      signal_key: 'arms_exports',
      signal_name: 'Arms Exports',
      date: `${r.year}-01-01`,
      raw_value: r.value_usd,
      raw_metadata: { hs_code: r.hs_code, flow: 'export' },
      source: 'UN Comtrade',
      gap: false
    }));

  console.log(`  Arms imports: ${importRecords.length} records`);
  console.log(`  Arms exports: ${exportRecords.length} records`);

  // Upload imports
  console.log('\n[UPLOAD] Uploading arms imports...');
  let inserted = 0;
  const batchSize = 100;

  for (let i = 0; i < importRecords.length; i += batchSize) {
    const batch = importRecords.slice(i, i + batchSize);
    const { error } = await sb.from('historical_signal_readings').upsert(batch, {
      onConflict: 'country,date,signal_key'
    });

    if (error) {
      console.log(`  Error batch ${Math.floor(i / batchSize) + 1}:`, error.message);
    } else {
      inserted += batch.length;
    }

    if ((i + batchSize) % 1000 === 0) {
      console.log(`  Progress: ${i + batchSize} / ${importRecords.length}`);
    }
  }

  console.log(`  ✅ Inserted ${inserted} arms_imports records`);

  // Upload exports
  console.log('\n[UPLOAD] Uploading arms exports...');
  inserted = 0;

  for (let i = 0; i < exportRecords.length; i += batchSize) {
    const batch = exportRecords.slice(i, i + batchSize);
    const { error } = await sb.from('historical_signal_readings').upsert(batch, {
      onConflict: 'country,date,signal_key'
    });

    if (error) {
      console.log(`  Error batch ${Math.floor(i / batchSize) + 1}:`, error.message);
    } else {
      inserted += batch.length;
    }

    if ((i + batchSize) % 1000 === 0) {
      console.log(`  Progress: ${i + batchSize} / ${exportRecords.length}`);
    }
  }

  console.log(`  ✅ Inserted ${inserted} arms_exports records`);

  console.log('\n[SUMMARY]');
  console.log(`  Total records ingested: ${importRecords.length + exportRecords.length}`);
  console.log(`  Countries: ${new Set(rawData.map(r => r.country)).size}`);
  console.log(`  Year range: ${Math.min(...rawData.map(r => r.year))}-${Math.max(...rawData.map(r => r.year))}`);
}

async function main() {
  await ingestArmsData();

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('✅ INGEST COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('\nNext: Run comprehensive pattern backtest');
  console.log('Command: node historical/defense_pattern_backtest.cjs');
}

if (require.main === module) {
  main().catch(err => {
    console.error('[ERROR]', err);
    process.exit(1);
  });
}

module.exports = { ingestArmsData };
