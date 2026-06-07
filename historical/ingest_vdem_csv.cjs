// historical/ingest_vdem_csv.cjs
// Ingests V-Dem v16 full CSV into historical_signal_readings for vdem_governance signal.
// Source: V-Dem-CY-Core-v16.csv (drop in sabian_core directory)
// Column: v2x_libdem (Liberal Democracy Index, 0-1, higher = better)
// Coverage: 202 countries, 1789–2025 (full range ingested)
//
// Usage: node historical/ingest_vdem_csv.cjs

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs   = require('fs');
const path = require('path');
const readline = require('readline');
const { createClient } = require('@supabase/supabase-js');
const { guardClient, upsertReadings } = require('./db_guard.cjs');

const sb = guardClient(createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY));

const CSV_PATH = path.join(__dirname, '../V-Dem-CY-Core-v16.csv');
const START_YEAR = 1789;
const BATCH_SIZE = 500;
const SIGNAL_KEY = 'vdem_governance';
const SIGNAL_NAME = 'VDem Governance';

// ISO3 → country name mapping (Sabian canonical names)
const ISO3_TO_COUNTRY = {
  'AFG': 'Afghanistan', 'ALB': 'Albania', 'DZA': 'Algeria', 'AGO': 'Angola',
  'ARG': 'Argentina', 'ARM': 'Armenia', 'AUS': 'Australia', 'AUT': 'Austria',
  'AZE': 'Azerbaijan', 'BGD': 'Bangladesh', 'BLR': 'Belarus', 'BEL': 'Belgium',
  'BEN': 'Benin', 'BOL': 'Bolivia', 'BIH': 'Bosnia and Herzegovina',
  'BWA': 'Botswana', 'BRA': 'Brazil', 'BGR': 'Bulgaria', 'BFA': 'Burkina Faso',
  'BDI': 'Burundi', 'KHM': 'Cambodia', 'CMR': 'Cameroon', 'CAN': 'Canada',
  'CAF': 'CAR', 'TCD': 'Chad', 'CHL': 'Chile',
  'CHN': 'China', 'COL': 'Colombia', 'COG': 'Congo', 'COD': 'DRC',
  'CRI': 'Costa Rica', 'HRV': 'Croatia', 'CUB': 'Cuba', 'CZE': 'Czech Republic',
  'DNK': 'Denmark', 'DOM': 'Dominican Republic', 'ECU': 'Ecuador', 'EGY': 'Egypt',
  'SLV': 'El Salvador', 'ERI': 'Eritrea', 'EST': 'Estonia', 'ETH': 'Ethiopia',
  'FIN': 'Finland', 'FRA': 'France', 'GAB': 'Gabon', 'GMB': 'Gambia',
  'GEO': 'Georgia', 'DEU': 'Germany', 'GHA': 'Ghana', 'GRC': 'Greece',
  'GTM': 'Guatemala', 'GIN': 'Guinea', 'GNB': 'Guinea-Bissau', 'HTI': 'Haiti',
  'HND': 'Honduras', 'HUN': 'Hungary', 'IND': 'India', 'IDN': 'Indonesia',
  'IRN': 'Iran', 'IRQ': 'Iraq', 'IRL': 'Ireland', 'ISR': 'Israel',
  'ITA': 'Italy', 'JAM': 'Jamaica', 'JPN': 'Japan', 'JOR': 'Jordan',
  'KAZ': 'Kazakhstan', 'KEN': 'Kenya', 'KWT': 'Kuwait', 'KGZ': 'Kyrgyzstan',
  'LAO': 'Laos', 'LVA': 'Latvia', 'LBN': 'Lebanon', 'LBR': 'Liberia',
  'LBY': 'Libya', 'LTU': 'Lithuania', 'MDG': 'Madagascar', 'MWI': 'Malawi',
  'MYS': 'Malaysia', 'MLI': 'Mali', 'MRT': 'Mauritania', 'MEX': 'Mexico',
  'MDA': 'Moldova', 'MNG': 'Mongolia', 'MNE': 'Montenegro', 'MAR': 'Morocco',
  'MOZ': 'Mozambique', 'MMR': 'Myanmar', 'NAM': 'Namibia', 'NPL': 'Nepal',
  'NLD': 'Netherlands', 'NZL': 'New Zealand', 'NIC': 'Nicaragua', 'NER': 'Niger',
  'NGA': 'Nigeria', 'PRK': 'North Korea', 'MKD': 'North Macedonia', 'NOR': 'Norway',
  'OMN': 'Oman', 'PAK': 'Pakistan', 'PSE': 'Palestine', 'PAN': 'Panama',
  'PNG': 'Papua New Guinea', 'PRY': 'Paraguay', 'PER': 'Peru', 'PHL': 'Philippines',
  'POL': 'Poland', 'PRT': 'Portugal', 'QAT': 'Qatar', 'ROU': 'Romania',
  'RUS': 'Russia', 'RWA': 'Rwanda', 'SAU': 'Saudi Arabia', 'SEN': 'Senegal',
  'SRB': 'Serbia', 'SLE': 'Sierra Leone', 'SGP': 'Singapore', 'SVK': 'Slovakia',
  'SVN': 'Slovenia', 'SLB': 'Solomon Islands', 'SOM': 'Somalia', 'ZAF': 'South Africa',
  'KOR': 'South Korea', 'SSD': 'South Sudan', 'ESP': 'Spain', 'LKA': 'Sri Lanka',
  'SDN': 'Sudan', 'SUR': 'Suriname', 'SWE': 'Sweden', 'CHE': 'Switzerland',
  'SYR': 'Syria', 'TWN': 'Taiwan', 'TJK': 'Tajikistan', 'TZA': 'Tanzania',
  'THA': 'Thailand', 'TLS': 'Timor-Leste', 'TGO': 'Togo', 'TTO': 'Trinidad and Tobago',
  'TUN': 'Tunisia', 'TUR': 'Turkey', 'TKM': 'Turkmenistan', 'ARE': 'UAE',
  'UGA': 'Uganda', 'GBR': 'UK', 'UKR': 'Ukraine', 'USA': 'United States',
  'URY': 'Uruguay', 'UZB': 'Uzbekistan', 'VEN': 'Venezuela', 'VNM': 'Vietnam',
  'YEM': 'Yemen', 'ZMB': 'Zambia', 'ZWE': 'Zimbabwe'
};

async function checkExistingVdem() {
  const { count } = await sb.from('historical_signal_readings')
    .select('*', { count: 'exact', head: true })
    .eq('signal_key', SIGNAL_KEY);
  console.log(`  Existing ${SIGNAL_KEY} rows: ${count || 0} (will upsert, not delete)`);
  return count || 0;
}

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`CSV not found: ${CSV_PATH}`);
    process.exit(1);
  }

  const stat = fs.statSync(CSV_PATH);
  console.log(`\n📊 V-Dem v16 CSV Ingestion`);
  console.log(`   File: ${path.basename(CSV_PATH)} (${(stat.size / 1024 / 1024).toFixed(0)} MB)`);
  console.log(`   Signal: ${SIGNAL_KEY}`);
  console.log(`   Years: ${START_YEAR}–2025`);
  console.log('');

  await checkExistingVdem();

  const rl = readline.createInterface({
    input: fs.createReadStream(CSV_PATH),
    crlfDelay: Infinity
  });

  let headerCols = [];
  let lineNum = 0;
  let batch = [];
  let totalInserted = 0;
  let totalSkipped = 0;
  let countriesSeen = new Set();

  // Column indices (set after parsing header)
  let colCountryIso3 = -1;
  let colYear = -1;
  let colLibdem = -1;

  for await (const line of rl) {
    lineNum++;

    if (lineNum === 1) {
      // Parse header
      headerCols = line.split(',').map(c => c.replace(/^"|"$/g, '').trim());
      colCountryIso3 = headerCols.indexOf('country_text_id');
      colYear = headerCols.indexOf('year');
      colLibdem = headerCols.indexOf('v2x_libdem');

      console.log(`  Header parsed. v2x_libdem at col ${colLibdem}, country_text_id at col ${colCountryIso3}, year at col ${colYear}`);
      continue;
    }

    // Parse data row — handle CSV quoting
    const cols = line.split(',');

    const iso3 = (cols[colCountryIso3] || '').replace(/^"|"$/g, '').trim().toUpperCase();
    const year = parseInt((cols[colYear] || '').replace(/^"|"$/g, '').trim());
    const libdemStr = (cols[colLibdem] || '').replace(/^"|"$/g, '').trim();
    const libdem = parseFloat(libdemStr);

    // Filter
    if (!iso3 || isNaN(year) || year < START_YEAR) { totalSkipped++; continue; }
    if (isNaN(libdem) || libdemStr === '' || libdemStr === 'NA') { totalSkipped++; continue; }

    const country = ISO3_TO_COUNTRY[iso3];
    if (!country) { totalSkipped++; continue; }

    countriesSeen.add(country);

    batch.push({
      country,
      signal_key: SIGNAL_KEY,
      signal_name: SIGNAL_NAME,
      date: `${year}-01-01`,
      raw_value: libdem,
      raw_metadata: { iso3, source: 'V-Dem v16', indicator: 'v2x_libdem' },
      source: 'V-Dem v16',
      gap: false
    });

    if (batch.length % 10000 === 0) {
      process.stdout.write(`\r  Parsed: ${batch.length.toLocaleString()} rows | Countries: ${countriesSeen.size}   `);
    }
  }

  console.log(`\n  Parsed ${batch.length.toLocaleString()} rows total`);

  // Upsert (insert or update, never delete)
  const result = await upsertReadings(sb, batch, {
    batchSize: BATCH_SIZE,
    onProgress: ({ processed, total }) => {
      process.stdout.write(`\r  Upserted: ${processed.toLocaleString()}/${total.toLocaleString()} rows   `);
    }
  });
  totalInserted = result.inserted;
  if (result.errors.length > 0) {
    console.log(`\n  Errors: ${result.errors.length}`);
  }

  console.log(`\n\n  ✅ V-Dem ingest complete`);
  console.log(`     Rows inserted: ${totalInserted.toLocaleString()}`);
  console.log(`     Rows skipped:  ${totalSkipped.toLocaleString()} (pre-${START_YEAR}, missing data, or unmapped country)`);
  console.log(`     Countries:     ${countriesSeen.size}`);
  console.log('');
  console.log('  Next: run post_backfill_chain.cjs to rebuild baselines and re-score all country-years.');
}

main().catch(err => { console.error('\nFatal:', err.message); process.exit(1); });
