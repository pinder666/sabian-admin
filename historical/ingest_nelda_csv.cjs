// historical/ingest_nelda_csv.cjs
// Ingests NELDA 6.0 (National Elections across Democracy and Autocracy) into historical_signal_readings.
// Source: NELDA 6.0/NELDA.csv
// Coverage: 1945–present, ~3,500 elections across 160+ countries
// Signal key: election_calendar (0-100 risk score, higher = worse election quality)
//
// Scoring (violence-weighted, confirmed 2026-05-28):
//   nelda11 (pre-election violence) = +20
//   nelda13 (opposition prevented) = +15
//   nelda14 (fraud concerns before) = +10
//   nelda15 (widespread fraud) = +15
//   nelda16 (protestors killed) = +25
//   nelda17 (govt changed via violence) = +30
//   Max 100, no election = null
//
// Usage: node historical/ingest_nelda_csv.cjs

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { createClient } = require('@supabase/supabase-js');
const { guardClient, upsertReadings } = require('./db_guard.cjs');

const sb = guardClient(createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY));

const CSV_PATH = path.join(__dirname, '../NELDA 6.0/NELDA.csv');
const BATCH_SIZE = 500;
const SIGNAL_KEY = 'election_calendar';
const SIGNAL_NAME = 'Election Calendar';

// NELDA scoring weights (violence-weighted)
const WEIGHTS = {
  nelda11: 20,  // pre-election violence
  nelda13: 15,  // opposition prevented from running
  nelda14: 10,  // concerns about fraud before
  nelda15: 15,  // widespread fraud
  nelda16: 25,  // protestors killed after
  nelda17: 30,  // govt changed via violence
};

// NELDA country name → Sabian canonical name
const COUNTRY_MAP = {
  'United States of America': 'United States',
  'United States': 'United States',
  'USA': 'United States',
  'United Kingdom': 'UK',
  'Great Britain': 'UK',
  'Russian Federation': 'Russia',
  'Russian Fed.': 'Russia',
  'Korea, South': 'South Korea',
  'Korea, North': 'North Korea',
  'Korea South': 'South Korea',
  'Korea North': 'North Korea',
  'Republic of Korea': 'South Korea',
  'Democratic Republic of Congo': 'DRC',
  'Congo, Democratic Republic': 'DRC',
  'Congo, Dem. Rep.': 'DRC',
  'Congo-Kinshasa': 'DRC',
  'Zaire': 'DRC',
  'Congo-Brazzaville': 'Congo',
  'Central African Republic': 'CAR',
  'Czech Republic': 'Czech Republic',
  'Czechia': 'Czech Republic',
  'Bosnia-Herzegovina': 'Bosnia and Herzegovina',
  'Bosnia': 'Bosnia and Herzegovina',
  'UAE': 'UAE',
  'United Arab Emirates': 'UAE',
  'Taiwan': 'Taiwan',
  'Republic of China': 'Taiwan',
  'China (Taiwan)': 'Taiwan',
  'Burma': 'Myanmar',
  'Burma/Myanmar': 'Myanmar',
  'Ivory Coast': 'Ivory Coast',
  "Cote d'Ivoire": 'Ivory Coast',
  'Côte d\'Ivoire': 'Ivory Coast',
  'East Timor': 'Timor-Leste',
  'Timor Leste': 'Timor-Leste',
  'Gambia, The': 'Gambia',
  'The Gambia': 'Gambia',
  'Macedonia': 'North Macedonia',
  'Macedonia, FYR': 'North Macedonia',
  'FYROM': 'North Macedonia',
  'Swaziland': 'Eswatini',
  'Cape Verde': 'Cabo Verde',
};

function normalizeCountry(name) {
  if (!name) return null;
  const trimmed = name.trim();
  return COUNTRY_MAP[trimmed] || trimmed;
}

function parseYesNo(val) {
  if (!val) return 0;
  const v = val.toString().toLowerCase().trim();
  if (v === 'yes' || v === '1' || v === 'true') return 1;
  return 0;
}

function computeElectionRisk(row, colIndices) {
  let score = 0;
  for (const [indicator, weight] of Object.entries(WEIGHTS)) {
    const idx = colIndices[indicator];
    if (idx !== undefined && idx >= 0) {
      score += parseYesNo(row[idx]) * weight;
    }
  }
  return Math.min(score, 100);
}

async function checkExisting() {
  const { count } = await sb.from('historical_signal_readings')
    .select('*', { count: 'exact', head: true })
    .eq('signal_key', SIGNAL_KEY);
  console.log(`  Existing ${SIGNAL_KEY} rows: ${count || 0} (will upsert, not delete)`);
  return count || 0;
}

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`CSV not found: ${CSV_PATH}`);
    console.error('Download NELDA 6.0 from: https://nelda.co/');
    process.exit(1);
  }

  const stat = fs.statSync(CSV_PATH);
  console.log(`\n🗳️  NELDA 6.0 Election Data Ingestion`);
  console.log(`   File: ${path.basename(CSV_PATH)} (${(stat.size / 1024).toFixed(0)} KB)`);
  console.log(`   Signal: ${SIGNAL_KEY}`);
  console.log(`   Scoring: Violence-weighted (nelda16=+25, nelda17=+30)`);
  console.log('');

  await checkExisting();

  const rl = readline.createInterface({
    input: fs.createReadStream(CSV_PATH),
    crlfDelay: Infinity
  });

  let headerCols = [];
  let colIndices = {};
  let lineNum = 0;
  let batch = [];
  let totalInserted = 0;
  let totalSkipped = 0;
  let countriesSeen = new Set();
  let yearMin = 9999, yearMax = 0;

  // Track worst elections per country-year (multiple elections possible)
  const countryYearWorst = new Map();

  for await (const line of rl) {
    lineNum++;

    if (lineNum === 1) {
      headerCols = line.split('\t').length > 5
        ? line.split('\t')
        : line.split(',');
      headerCols = headerCols.map(c => c.replace(/^"|"$/g, '').trim().toLowerCase());

      // Find column indices
      colIndices.country = headerCols.indexOf('country');
      colIndices.year = headerCols.indexOf('year');
      colIndices.nelda11 = headerCols.indexOf('nelda11');
      colIndices.nelda13 = headerCols.indexOf('nelda13');
      colIndices.nelda14 = headerCols.indexOf('nelda14');
      colIndices.nelda15 = headerCols.indexOf('nelda15');
      colIndices.nelda16 = headerCols.indexOf('nelda16');
      colIndices.nelda17 = headerCols.indexOf('nelda17');
      colIndices.types = headerCols.indexOf('types');

      console.log(`  Header parsed. Country at col ${colIndices.country}, year at col ${colIndices.year}`);
      continue;
    }

    // Parse data row
    const cols = line.split('\t').length > 5
      ? line.split('\t')
      : line.split(',');

    const countryRaw = (cols[colIndices.country] || '').replace(/^"|"$/g, '').trim();
    const year = parseInt((cols[colIndices.year] || '').replace(/^"|"$/g, '').trim());

    if (!countryRaw || isNaN(year) || year < 1945) {
      totalSkipped++;
      continue;
    }

    const country = normalizeCountry(countryRaw);
    if (!country) {
      totalSkipped++;
      continue;
    }

    const score = computeElectionRisk(cols, colIndices);
    const electionType = (cols[colIndices.types] || '').replace(/^"|"$/g, '').trim();

    // Track worst election per country-year
    const key = `${country}|${year}`;
    const existing = countryYearWorst.get(key);
    if (!existing || score > existing.score) {
      countryYearWorst.set(key, {
        country,
        year,
        score,
        electionType,
        indicators: {
          nelda11: parseYesNo(cols[colIndices.nelda11]),
          nelda13: parseYesNo(cols[colIndices.nelda13]),
          nelda14: parseYesNo(cols[colIndices.nelda14]),
          nelda15: parseYesNo(cols[colIndices.nelda15]),
          nelda16: parseYesNo(cols[colIndices.nelda16]),
          nelda17: parseYesNo(cols[colIndices.nelda17]),
        }
      });
    }

    countriesSeen.add(country);
    if (year < yearMin) yearMin = year;
    if (year > yearMax) yearMax = year;
  }

  console.log(`  Parsed ${countryYearWorst.size} country-year pairs from ${lineNum - 1} election records`);

  // Convert to rows for upsert
  const allRows = [];
  for (const [key, data] of countryYearWorst) {
    allRows.push({
      country: data.country,
      signal_key: SIGNAL_KEY,
      signal_name: SIGNAL_NAME,
      date: `${data.year}-01-01`,
      raw_value: data.score / 100, // Normalize to 0-1 for consistency
      raw_metadata: {
        score_0_100: data.score,
        election_type: data.electionType,
        indicators: data.indicators,
        source: 'NELDA 6.0',
        weights: WEIGHTS
      },
      source: 'NELDA 6.0',
      gap: false
    });
  }

  // Upsert (insert or update, never delete)
  const result = await upsertReadings(sb, allRows, {
    batchSize: BATCH_SIZE,
    onProgress: ({ processed, total }) => {
      process.stdout.write(`\r  Upserted: ${processed.toLocaleString()}/${total.toLocaleString()} rows   `);
    }
  });
  totalInserted = result.inserted;
  if (result.errors.length > 0) {
    console.log(`\n  Errors: ${result.errors.length}`);
  }

  console.log(`\n\n  ✅ NELDA ingest complete`);
  console.log(`     Rows inserted: ${totalInserted.toLocaleString()}`);
  console.log(`     Rows skipped:  ${totalSkipped.toLocaleString()} (pre-1945, missing data, or unmapped country)`);
  console.log(`     Countries:     ${countriesSeen.size}`);
  console.log(`     Year range:    ${yearMin}–${yearMax}`);
  console.log('');
  console.log('  Next: run post_backfill_chain.cjs to rebuild baselines and re-score all country-years.');
}

main().catch(err => { console.error('\nFatal:', err.message); process.exit(1); });
