// ingest_gdelt_tone_bq.cjs
// Ingests GDELT tone data from BigQuery CSV export.
// Maps GDELT/CAMEO ISO3 codes to Sabian country names.
// Upserts to historical_signal_readings (no delete).

const fs = require('fs');
const path = require('path');
const { sb, upsertReadings } = require('./db.cjs');

const CSV_PATH = path.join(process.env.USERPROFILE || process.env.HOME, 'Downloads', 'bq-results-20260531-021858-1780194027484.csv');

// GDELT/CAMEO ISO3 → Sabian country name
const ISO3_TO_COUNTRY = {
  'AFG': 'Afghanistan', 'ALB': 'Albania', 'DZA': 'Algeria', 'AGO': 'Angola',
  'ARG': 'Argentina', 'ARM': 'Armenia', 'AUS': 'Australia', 'AUT': 'Austria',
  'AZE': 'Azerbaijan', 'BGD': 'Bangladesh', 'BLR': 'Belarus', 'BEL': 'Belgium',
  'BEN': 'Benin', 'BOL': 'Bolivia', 'BIH': 'Bosnia and Herzegovina',
  'BWA': 'Botswana', 'BRA': 'Brazil', 'BGR': 'Bulgaria', 'BFA': 'Burkina Faso',
  'BDI': 'Burundi', 'KHM': 'Cambodia', 'CMR': 'Cameroon', 'CAN': 'Canada',
  'CAF': 'CAR', 'TCD': 'Chad', 'CHL': 'Chile', 'CHN': 'China', 'COL': 'Colombia',
  'COG': 'Congo', 'CRI': 'Costa Rica', 'HRV': 'Croatia', 'CUB': 'Cuba',
  'CYP': 'Cyprus', 'CZE': 'Czech Republic', 'COD': 'DRC', 'DNK': 'Denmark',
  'DJI': 'Djibouti', 'DOM': 'Dominican Republic', 'ECU': 'Ecuador', 'EGY': 'Egypt',
  'SLV': 'El Salvador', 'ERI': 'Eritrea', 'EST': 'Estonia', 'SWZ': 'Eswatini',
  'ETH': 'Ethiopia', 'FIN': 'Finland', 'FRA': 'France', 'GEO': 'Georgia',
  'DEU': 'Germany', 'GHA': 'Ghana', 'GRC': 'Greece', 'GTM': 'Guatemala',
  'GIN': 'Guinea', 'GNB': 'Guinea-Bissau', 'GUY': 'Guyana', 'HTI': 'Haiti',
  'HND': 'Honduras', 'HUN': 'Hungary', 'IND': 'India', 'IDN': 'Indonesia',
  'IRN': 'Iran', 'IRQ': 'Iraq', 'IRL': 'Ireland', 'ISR': 'Israel', 'ITA': 'Italy',
  'CIV': 'Ivory Coast', 'JAM': 'Jamaica', 'JPN': 'Japan', 'JOR': 'Jordan',
  'KAZ': 'Kazakhstan', 'KEN': 'Kenya', 'PRK': 'North Korea', 'KOR': 'South Korea',
  'KWT': 'Kuwait', 'KGZ': 'Kyrgyzstan', 'LAO': 'Laos', 'LVA': 'Latvia',
  'LBN': 'Lebanon', 'LSO': 'Lesotho', 'LBR': 'Liberia', 'LBY': 'Libya',
  'LTU': 'Lithuania', 'LUX': 'Luxembourg', 'MDG': 'Madagascar', 'MWI': 'Malawi',
  'MYS': 'Malaysia', 'MLI': 'Mali', 'MRT': 'Mauritania', 'MUS': 'Mauritius',
  'MEX': 'Mexico', 'MDA': 'Moldova', 'MNG': 'Mongolia', 'MNE': 'Montenegro',
  'MAR': 'Morocco', 'MOZ': 'Mozambique', 'MMR': 'Myanmar', 'NAM': 'Namibia',
  'NPL': 'Nepal', 'NLD': 'Netherlands', 'NZL': 'New Zealand', 'NIC': 'Nicaragua',
  'NER': 'Niger', 'NGA': 'Nigeria', 'NOR': 'Norway', 'OMN': 'Oman',
  'PAK': 'Pakistan', 'PAN': 'Panama', 'PNG': 'Papua New Guinea', 'PRY': 'Paraguay',
  'PER': 'Peru', 'PHL': 'Philippines', 'POL': 'Poland', 'PRT': 'Portugal',
  'QAT': 'Qatar', 'ROM': 'Romania', 'ROU': 'Romania', 'RUS': 'Russia',
  'RWA': 'Rwanda', 'SAU': 'Saudi Arabia', 'SEN': 'Senegal', 'SRB': 'Serbia',
  'SLE': 'Sierra Leone', 'SGP': 'Singapore', 'SVK': 'Slovakia', 'SVN': 'Slovenia',
  'SOM': 'Somalia', 'ZAF': 'South Africa', 'SSD': 'South Sudan', 'ESP': 'Spain',
  'LKA': 'Sri Lanka', 'SDN': 'Sudan', 'SUR': 'Suriname', 'SWE': 'Sweden',
  'CHE': 'Switzerland', 'SYR': 'Syria', 'TWN': 'Taiwan', 'TJK': 'Tajikistan',
  'TZA': 'Tanzania', 'THA': 'Thailand', 'TMP': 'Timor-Leste', 'TLS': 'Timor-Leste',
  'TGO': 'Togo', 'TTO': 'Trinidad and Tobago', 'TUN': 'Tunisia', 'TUR': 'Turkey',
  'TKM': 'Turkmenistan', 'UGA': 'Uganda', 'UKR': 'Ukraine', 'ARE': 'UAE',
  'GBR': 'UK', 'USA': 'United States', 'URY': 'Uruguay', 'UZB': 'Uzbekistan',
  'VEN': 'Venezuela', 'VNM': 'Vietnam', 'YEM': 'Yemen', 'ZMB': 'Zambia',
  'ZWE': 'Zimbabwe', 'PSE': 'Palestine', 'MKD': 'North Macedonia',
  'BHS': 'Bahamas', 'BHR': 'Bahrain', 'BRB': 'Barbados', 'BLZ': 'Belize',
  'BTN': 'Bhutan', 'BRN': 'Brunei', 'CPV': 'Cape Verde', 'COM': 'Comoros',
  'FJI': 'Fiji', 'GAB': 'Gabon', 'GMB': 'Gambia', 'GRD': 'Grenada',
  'GNQ': 'Equatorial Guinea', 'ISL': 'Iceland', 'LIE': 'Liechtenstein',
  'MLT': 'Malta', 'MCO': 'Monaco', 'SYC': 'Seychelles', 'STP': 'Sao Tome and Principe',
  'VCT': 'St. Vincent', 'KNA': 'St. Kitts and Nevis', 'LCA': 'St. Lucia',
  'DMA': 'Dominica', 'ATG': 'Antigua & Barbuda', 'AND': 'Andorra',
  'SMR': 'San Marino', 'VAT': 'Vatican', 'TON': 'Tonga', 'WSM': 'Samoa',
  'VUT': 'Vanuatu', 'SLB': 'Solomon Islands', 'KIR': 'Kiribati',
  'FSM': 'Micronesia', 'PLW': 'Palau', 'MHL': 'Marshall Islands',
  'NRU': 'Nauru', 'TUV': 'Tuvalu', 'HKG': 'Hong Kong', 'MAC': 'Macau',
  'MDV': 'Maldives',
};

// Regional codes to skip (not country-specific)
const SKIP_CODES = new Set([
  'AFR', 'EUR', 'EEU', 'LAM', 'MEA', 'NAF', 'SAF', 'WAF', 'EAF', 'CAU',
  'CAS', 'SAS', 'SEA', 'SCN', 'CRB', 'SAM', 'NMR', 'PGS', 'WST', 'BLK',
  'country' // header row
]);

function parseCSV(content) {
  const lines = content.trim().split('\n');
  const rows = [];

  for (let i = 1; i < lines.length; i++) { // skip header
    const parts = lines[i].split(',');
    if (parts.length >= 4) {
      rows.push({
        code: parts[0],
        month: parts[1],
        avg_tone: parseFloat(parts[2]),
        event_count: parseInt(parts[3])
      });
    }
  }
  return rows;
}

async function run() {
  console.log('GDELT Tone BigQuery Ingest');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Reading: ${CSV_PATH}`);

  if (!fs.existsSync(CSV_PATH)) {
    console.error('ERROR: CSV file not found');
    process.exit(1);
  }

  const content = fs.readFileSync(CSV_PATH, 'utf8');
  const csvRows = parseCSV(content);
  console.log(`Parsed ${csvRows.length} CSV rows`);

  // Convert to readings
  const readings = [];
  const skippedCodes = new Set();
  const unmappedCodes = new Set();

  for (const row of csvRows) {
    if (SKIP_CODES.has(row.code)) {
      skippedCodes.add(row.code);
      continue;
    }

    const country = ISO3_TO_COUNTRY[row.code];
    if (!country) {
      unmappedCodes.add(row.code);
      continue;
    }

    if (isNaN(row.avg_tone)) continue;

    readings.push({
      country,
      signal_key: 'gdelt_tone',
      signal_name: 'GDELT Tone',
      date: `${row.month}-01`, // YYYY-MM-01
      raw_value: row.avg_tone,
      raw_metadata: {
        iso3: row.code,
        event_count: row.event_count,
        month: row.month
      },
      source: 'GDELT BigQuery',
      gap: false,
      ingested_at: new Date().toISOString()
    });
  }

  console.log(`\nMapped ${readings.length} readings`);
  console.log(`Skipped regional codes: ${skippedCodes.size}`);
  if (unmappedCodes.size > 0) {
    console.log(`Unmapped codes (${unmappedCodes.size}): ${[...unmappedCodes].slice(0, 20).join(', ')}${unmappedCodes.size > 20 ? '...' : ''}`);
  }

  // Get unique countries
  const countries = [...new Set(readings.map(r => r.country))];
  console.log(`Countries: ${countries.length}`);

  // Check value distribution
  const values = readings.map(r => r.raw_value);
  const nonZero = values.filter(v => v !== 0);
  console.log(`\nValue distribution:`);
  console.log(`  Min: ${Math.min(...values).toFixed(2)}`);
  console.log(`  Max: ${Math.max(...values).toFixed(2)}`);
  console.log(`  Non-zero: ${nonZero.length}/${values.length} (${(nonZero.length/values.length*100).toFixed(1)}%)`);

  // Upsert
  console.log(`\nUpserting ${readings.length} readings...`);
  const { inserted, errors } = await upsertReadings(sb, readings, {
    batchSize: 500,
    onProgress: ({ processed, total }) => {
      if (processed % 10000 === 0 || processed === total) {
        process.stdout.write(`  ${processed.toLocaleString()}/${total.toLocaleString()} rows\r`);
      }
    }
  });

  console.log(`\n\nUpserted: ${inserted.toLocaleString()} readings`);
  if (errors.length > 0) {
    console.log(`Errors: ${errors.length}`);
    errors.slice(0, 5).forEach(e => console.log(`  ${e.error}`));
  }

  // Verify
  console.log(`\nVerifying...`);
  const { data: sample } = await sb.from('historical_signal_readings')
    .select('country, date, raw_value')
    .eq('signal_key', 'gdelt_tone')
    .eq('source', 'GDELT BigQuery')
    .not('raw_value', 'eq', 0)
    .limit(10);

  const { count: totalCount } = await sb.from('historical_signal_readings')
    .select('*', { count: 'exact', head: true })
    .eq('signal_key', 'gdelt_tone')
    .eq('source', 'GDELT BigQuery');

  const { count: nonZeroCount } = await sb.from('historical_signal_readings')
    .select('*', { count: 'exact', head: true })
    .eq('signal_key', 'gdelt_tone')
    .eq('source', 'GDELT BigQuery')
    .not('raw_value', 'eq', 0);

  console.log(`\n✅ Verification:`);
  console.log(`  Total gdelt_tone (BigQuery): ${totalCount?.toLocaleString()}`);
  console.log(`  Non-zero: ${nonZeroCount?.toLocaleString()}`);
  console.log(`\nSample non-zero values:`);
  sample?.forEach(r => console.log(`  ${r.country} ${r.date}: ${r.raw_value.toFixed(2)}`));
}

run().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
