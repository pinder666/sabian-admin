// load_displacement_flow_xlsx.cjs
// Loads UNHCR Flow Data XLSX → displacement_flow signal.
//
// Flow = annual departures FROM each origin country (all PT types: REF, ASY, ROC, OIP).
// This is the LEADING indicator — a spike means active crisis now.
// Complement to displacement_stock (cumulative burden).
//
// Input:  C:\Users\user\Downloads\download_2_extracted\UNHCR_Flow_Data.xlsx
// Output: signal_key='displacement_flow', source='UNHCR XLSX flow'
//
// Stores raw annual departure counts. The composite builder z-scores these.
//
// Usage: node historical/load_displacement_flow_xlsx.cjs

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const path  = require('path');
const XLSX  = require('xlsx');
const { sb, upsertReadings } = require('./db.cjs');

const XLSX_PATH = 'C:\\Users\\user\\Downloads\\download_2_extracted\\UNHCR_Flow_Data.xlsx';

// Invert of ISO3_MAP from unhcr_historical — maps ISO3 → Sabian country name
const ISO3_TO_SABIAN = {
  'MLI':'Mali','BFA':'Burkina Faso','NER':'Niger','SDN':'Sudan','ETH':'Ethiopia',
  'MMR':'Myanmar','VEN':'Venezuela','SOM':'Somalia','COD':'DRC','CAF':'CAR',
  'TCD':'Chad','NGA':'Nigeria','MOZ':'Mozambique','LBY':'Libya','HTI':'Haiti',
  'YEM':'Yemen','AFG':'Afghanistan','SYR':'Syria','IRQ':'Iraq','SSD':'South Sudan',
  'ISR':'Israel','PSE':'Palestine','UKR':'Ukraine','COL':'Colombia','LBN':'Lebanon',
  'PAK':'Pakistan','CMR':'Cameroon','ARM':'Armenia','GEO':'Georgia','RUS':'Russia',
  'PHL':'Philippines','IDN':'Indonesia','MEX':'Mexico','IRN':'Iran','ZWE':'Zimbabwe',
  'BGD':'Bangladesh','LKA':'Sri Lanka','KEN':'Kenya','UGA':'Uganda','TZA':'Tanzania',
  'ZMB':'Zambia','SEN':'Senegal','GIN':'Guinea','ECU':'Ecuador','BOL':'Bolivia',
  'ERI':'Eritrea','DJI':'Djibouti','XKX':'Kosovo','BIH':'Bosnia','TWN':'Taiwan',
  'PRK':'North Korea','BLR':'Belarus','MDA':'Moldova','SRB':'Serbia','AZE':'Azerbaijan',
  'KGZ':'Kyrgyzstan','TJK':'Tajikistan','TKM':'Turkmenistan','UZB':'Uzbekistan',
  'KAZ':'Kazakhstan','PER':'Peru','BRA':'Brazil','NIC':'Nicaragua','HND':'Honduras',
  'GTM':'Guatemala','SLV':'El Salvador','CUB':'Cuba','AGO':'Angola','RWA':'Rwanda',
  'BDI':'Burundi','MWI':'Malawi','GNB':'Guinea-Bissau','SLE':'Sierra Leone',
  'LBR':'Liberia','TGO':'Togo','BEN':'Benin','MRT':'Mauritania','TUN':'Tunisia',
  'DZA':'Algeria','MAR':'Morocco','EGY':'Egypt','JOR':'Jordan','SAU':'Saudi Arabia',
  'OMN':'Oman','KWT':'Kuwait','VNM':'Vietnam','KHM':'Cambodia','LAO':'Laos',
  'NPL':'Nepal','IND':'India','TLS':'Timor-Leste','PNG':'Papua New Guinea',
  'SLB':'Solomon Islands','FJI':'Fiji','TUR':'Turkey','GRC':'Greece','BGR':'Bulgaria',
  'ROU':'Romania','HUN':'Hungary','POL':'Poland','SVK':'Slovakia','HRV':'Croatia',
  'MKD':'North Macedonia','MNE':'Montenegro','ALB':'Albania','CHN':'China',
  'KOR':'South Korea','JPN':'Japan','MNG':'Mongolia','THA':'Thailand','MYS':'Malaysia',
  'SGP':'Singapore','AUS':'Australia','NZL':'New Zealand','ZAF':'South Africa',
  'GHA':'Ghana','CIV':'Ivory Coast','GAB':'Gabon','COG':'Congo',
  'GNQ':'Equatorial Guinea','NAM':'Namibia','BWA':'Botswana','ARG':'Argentina',
  'CHL':'Chile','PRY':'Paraguay','URY':'Uruguay','GUY':'Guyana','SUR':'Suriname',
  'TTO':'Trinidad and Tobago','PAN':'Panama','CRI':'Costa Rica',
  'DOM':'Dominican Republic','JAM':'Jamaica','BLZ':'Belize','ARE':'UAE',
  'QAT':'Qatar','BHR':'Bahrain','GBR':'UK','FRA':'France','DEU':'Germany',
  'ESP':'Spain','ITA':'Italy','PRT':'Portugal','SWE':'Sweden','FIN':'Finland',
  'NOR':'Norway','DNK':'Denmark','NLD':'Netherlands','BEL':'Belgium','AUT':'Austria',
  'CHE':'Switzerland','CYP':'Cyprus','USA':'United States',
};

function parseXlsx() {
  console.log(`Reading XLSX from ${XLSX_PATH}...`);
  const wb = XLSX.readFile(XLSX_PATH, { cellText: false, cellDates: false });
  const ws = wb.Sheets['DATA'];
  if (!ws) throw new Error(`Sheet "DATA" not found. Sheets: ${wb.SheetNames.join(', ')}`);
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });
  console.log(`  ${rows.length.toLocaleString()} raw rows in DATA sheet`);
  return rows;
}

function buildReadings(rows) {
  // Aggregate: sum Count by (OriginISO, Year)
  // Columns: origin, OriginISO, OriginName, asylum, AsylumISO, AsylumName, PT, Year, " Count "
  const byCountryYear = {};

  let skippedNoISO = 0;
  let skippedNotTracked = 0;

  for (const row of rows) {
    const iso3 = row['OriginISO'] || row['originiso'] || row['ORIGINISO'];
    const year  = parseInt(row['Year'] || row['year'] || row['YEAR']);
    // Column name is " Count " (space-Count-space) — UNHCR XLSX quirk
    const countRaw = row[' Count '] ?? row['Count'] ?? null;
    const count = parseInt(countRaw) || 0;

    if (!iso3) { skippedNoISO++; continue; }
    if (isNaN(year) || year < 1960 || year > 2030) continue;
    if (count <= 0) continue;

    const country = ISO3_TO_SABIAN[iso3];
    if (!country) { skippedNotTracked++; continue; }

    const key = `${iso3}|${year}`;
    if (!byCountryYear[key]) {
      byCountryYear[key] = { country, iso3, year, total: 0, n_asylum_countries: 0 };
    }
    byCountryYear[key].total += count;
    byCountryYear[key].n_asylum_countries++;
  }

  console.log(`  Skipped rows — no ISO: ${skippedNoISO} | not tracked: ${skippedNotTracked}`);

  const readings = [];
  const now = new Date().toISOString();

  for (const { country, iso3, year, total, n_asylum_countries } of Object.values(byCountryYear)) {
    readings.push({
      country,
      signal_key:   'displacement_flow',
      signal_name:  'Displacement Flow',
      date:         `${year}-01-01`,
      raw_value:    total,
      raw_metadata: { iso3, year, annual_departures: total, n_asylum_destinations: n_asylum_countries, source_type: 'flow' },
      source:       'UNHCR XLSX flow',
      gap:          false,
      ingested_at:  now,
    });
  }

  return readings;
}

async function main() {
  console.log('UNHCR Displacement Flow — XLSX Loader');
  console.log('═'.repeat(63));

  const rows = parseXlsx();
  const readings = buildReadings(rows);

  const countries = new Set(readings.map(r => r.country)).size;
  const years = readings.map(r => parseInt(r.date));
  const minY = Math.min(...years), maxY = Math.max(...years);

  console.log(`\n  Built ${readings.length.toLocaleString()} readings`);
  console.log(`  Countries: ${countries} | Years: ${minY}–${maxY}`);

  // Spot check known crises
  const checks = [
    { country: 'Ukraine', year: 2022 },
    { country: 'Sudan',   year: 2024 },
    { country: 'Syria',   year: 2015 },
    { country: 'Venezuela', year: 2018 },
  ];
  console.log('\n  Spot check (known crises should show large flow):');
  for (const { country, year } of checks) {
    const r = readings.find(x => x.country === country && x.date === `${year}-01-01`);
    console.log(`    ${country.padEnd(20)} ${year}: ${r ? r.raw_value.toLocaleString() : 'missing'}`);
  }

  console.log('\nWriting to historical_signal_readings...');
  const { inserted, errors } = await upsertReadings(sb, readings, { batchSize: 500 });
  if (errors.length > 0) errors.forEach(e => console.error(`  ⚠ batch ${e.batch}: ${e.error}`));
  console.log(`  Done. ${inserted.toLocaleString()} rows written.`);

  // Verify
  const { data: check } = await sb
    .from('historical_signal_readings')
    .select('country,date,raw_value')
    .eq('signal_key', 'displacement_flow')
    .order('raw_value', { ascending: false })
    .limit(5);
  console.log('\n  Top 5 flow events in DB:');
  for (const r of (check || [])) {
    console.log(`    ${r.country.padEnd(20)} ${r.date.slice(0,4)}: ${parseFloat(r.raw_value).toLocaleString()}`);
  }

  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
