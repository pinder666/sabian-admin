// historical/parse_sipri_milex.cjs
// Parse SIPRI Military Expenditure Database Excel file
// Handles the actual SIPRI format with proper column detection

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

console.log('═══════════════════════════════════════════════════════════════');
console.log('SIPRI MILITARY EXPENDITURE PARSER');
console.log('═══════════════════════════════════════════════════════════════\n');

// Country name mappings (SIPRI → Sabian)
const COUNTRY_MAP = {
  'United States of America': 'United States',
  'United Kingdom': 'UK',
  'Russian Federation': 'Russia',
  'Korea, South': 'South Korea',
  'Korea, North': 'North Korea',
  'Democratic Republic of the Congo': 'DRC',
  'Central African Republic': 'CAR',
  // Add more as needed
};

function normalizeCountryName(name) {
  return COUNTRY_MAP[name] || name;
}

async function parseSIPRIMilex() {
  // Check for file in multiple locations
  const possiblePaths = [
    'C:\\Users\\user\\Desktop\\sabian.ai\\sabian_core\\SIPRI-Milex-data-1949-2025_v1.2.xlsx',
    'C:\\Users\\user\\Downloads\\SIPRI-Milex-data-1949-2025_v1.2.xlsx',
    'C:\\Users\\user\\Desktop\\sabian.ai\\sabian_core\\historical\\data\\SIPRI-Milex-data-1949-2025_v1.2.xlsx',
    'C:\\Users\\user\\Desktop\\sabian.ai\\sabian_core\\historical\\data\\SIPRI_milex.xlsx',
  ];

  let filePath = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      filePath = p;
      console.log('[FOUND] File at:', filePath);
      break;
    }
  }

  if (!filePath) {
    console.log('[ERROR] SIPRI file not found. Checked:');
    possiblePaths.forEach(p => console.log('  -', p));
    console.log('\nPlease download from: https://milex.sipri.org/sipri');
    console.log('Save as: C:\\Users\\user\\Downloads\\SIPRI-Milex-data-1949-2025_v1.2.xlsx');
    return null;
  }

  console.log('[PARSE] Reading Excel file...');
  const workbook = XLSX.readFile(filePath);

  console.log('[INFO] Sheets in workbook:', workbook.SheetNames.join(', '));

  // SIPRI typically has sheets like: "Current USD", "Constant USD", "Share of GDP"
  // We want "Share of GDP" for defense spending as % of GDP
  let sheetName = workbook.SheetNames.find(s =>
    s.includes('GDP') || s.includes('Share') || s.includes('Percent')
  );

  if (!sheetName) {
    // Fallback to first sheet
    sheetName = workbook.SheetNames[0];
    console.log('[WARN] Could not find "Share of GDP" sheet, using:', sheetName);
  } else {
    console.log('[PARSE] Using sheet:', sheetName);
  }

  const sheet = workbook.Sheets[sheetName];

  // SIPRI format has header rows, then: Country | Notes | 1949 | 1950 | ... | 2025
  // Parse as array of arrays first to skip header rows
  const rawData = XLSX.utils.sheet_to_json(sheet, { defval: null, header: 1 });

  console.log('[PARSE] Loaded', rawData.length, 'raw rows');

  // Find the header row (contains "Country" and year numbers)
  let headerRow = null;
  let headerIndex = -1;
  for (let i = 0; i < Math.min(rawData.length, 10); i++) {
    const row = rawData[i];
    if (row[0] === 'Country' || row[0] === 'country') {
      headerRow = row;
      headerIndex = i;
      break;
    }
  }

  if (!headerRow) {
    console.log('[ERROR] Could not find header row with "Country" column');
    return null;
  }

  console.log('[PARSE] Found header at row', headerIndex);
  console.log('[PARSE] Years available:', headerRow.filter(h => typeof h === 'number').length);

  // Parse data rows (skip header and any rows before it)
  const records = [];
  const dataRows = rawData.slice(headerIndex + 1);

  for (const row of dataRows) {
    // Get country name (first column)
    const countryRaw = row[0];

    // Skip empty rows, region headers, and aggregate rows
    if (!countryRaw ||
        countryRaw === '' ||
        countryRaw.toLowerCase() === 'world' ||
        countryRaw.toLowerCase() === 'total' ||
        countryRaw.toLowerCase().includes('africa') ||
        countryRaw.toLowerCase().includes('america') ||
        countryRaw.toLowerCase().includes('asia') ||
        countryRaw.toLowerCase().includes('europe') ||
        countryRaw.toLowerCase().includes('oceania') ||
        countryRaw.toLowerCase().includes('middle east')
    ) {
      continue;
    }

    const country = normalizeCountryName(String(countryRaw).trim());

    // Iterate through columns starting from index 2 (skip Country and Notes columns)
    for (let i = 2; i < headerRow.length; i++) {
      const yearHeader = headerRow[i];
      const value = row[i];

      // Check if header is a year
      const year = typeof yearHeader === 'number' ? yearHeader : parseInt(yearHeader);
      if (isNaN(year) || year < 1949 || year > 2030) continue;

      // Parse value
      let pctGDP = null;
      if (value !== null && value !== '' && value !== '. .' && value !== '...' && value !== 'xxx') {
        pctGDP = parseFloat(value);
        if (isNaN(pctGDP)) pctGDP = null;
      }

      if (pctGDP !== null && pctGDP >= 0) {
        records.push({
          country,
          year,
          pct_gdp: pctGDP
        });
      }
    }
  }

  console.log('[PARSE] Parsed', records.length, 'valid records');
  console.log('[PARSE] Countries:', new Set(records.map(r => r.country)).size);
  console.log('[PARSE] Year range:',
    Math.min(...records.map(r => r.year)),
    '-',
    Math.max(...records.map(r => r.year))
  );

  return records;
}

async function ingestToSupabase(records) {
  console.log('\n[INGEST] Uploading to Supabase...');

  // Register signal
  const { error: regError } = await sb.from('signal_registry').upsert({
    signal_key: 'defense_spending',
    signal_name: 'Defense Spending',
    earliest_date: '1949-01-01',
    cadence: 'annual',
    data_type: 'defense_procurement',
    source: 'SIPRI Military Expenditure Database',
    has_history_api: false,
    history_api_notes: 'Military expenditure as % of GDP'
  }, { onConflict: 'signal_key' });

  if (regError) console.log('[WARN] Signal registration:', regError.message);
  else console.log('[INGEST] Signal registered: defense_spending');

  // Transform to signal readings format
  const signalReadings = records.map(r => ({
    country: r.country,
    signal_key: 'defense_spending',
    signal_name: 'Defense Spending',
    date: `${r.year}-01-01`,
    raw_value: r.pct_gdp,
    raw_metadata: { pct_gdp: r.pct_gdp },
    source: 'SIPRI',
    gap: false
  }));

  // Batch upload
  let inserted = 0;
  const batchSize = 100;

  for (let i = 0; i < signalReadings.length; i += batchSize) {
    const batch = signalReadings.slice(i, i + batchSize);
    const { error } = await sb.from('historical_signal_readings').upsert(batch, {
      onConflict: 'country,date,signal_key'
    });

    if (error) {
      console.log(`[ERROR] Batch ${Math.floor(i/batchSize) + 1}:`, error.message);
    } else {
      inserted += batch.length;
    }

    // Progress
    if ((i + batchSize) % 1000 === 0) {
      console.log(`[INGEST] Progress: ${i + batchSize} / ${signalReadings.length}`);
    }
  }

  console.log('[INGEST] ✅ Inserted/updated', inserted, 'records');

  return inserted;
}

async function main() {
  const records = await parseSIPRIMilex();

  if (!records || records.length === 0) {
    console.log('\n❌ No data to ingest');
    process.exit(1);
  }

  // Show sample
  console.log('\n[SAMPLE] First 10 records:');
  records.slice(0, 10).forEach(r => {
    console.log(`  ${r.country} ${r.year}: ${r.pct_gdp}%`);
  });

  await ingestToSupabase(records);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('✅ SIPRI MILITARY EXPENDITURE INGEST COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('\nNext: Run pattern backtest');
  console.log('Command: node historical/defense_pattern_backtest.cjs');
}

if (require.main === module) {
  main().catch(err => {
    console.error('[ERROR]', err);
    process.exit(1);
  });
}

module.exports = { parseSIPRIMilex, ingestToSupabase };
