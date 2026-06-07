// run_unhcr_displacement_refetch.cjs
// Re-fetches all displacement data using the fixed unhcr_historical.cjs.
// Overwrites the string-concatenation garbage values with correct refugee totals.
// Does NOT chain to baseline_discovery or convergence_history.
//
// Usage: node historical/run_unhcr_displacement_refetch.cjs
// Runtime: ~70 minutes (153 countries × 75 years × 1.1s, 3 concurrent)

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { fetchUnhcrHistorical } = require('./fetchers/unhcr_historical.cjs');
const { sb, upsertReadings } = require('./db.cjs');

const ALL_COUNTRIES = [
  'Mali','Burkina Faso','Niger','Sudan','Ethiopia','Myanmar','Venezuela','Somalia',
  'DRC','CAR','Chad','Nigeria','Mozambique','Libya','Haiti','Yemen','Afghanistan',
  'Syria','Iraq','South Sudan','Israel','Palestine','Ukraine','Colombia','Lebanon',
  'Pakistan','Cameroon','Armenia','Georgia','Russia','Philippines','Indonesia','Mexico',
  'Iran','Zimbabwe','Bangladesh','Sri Lanka','Kenya','Uganda','Tanzania','Zambia',
  'Senegal','Guinea','Ecuador','Bolivia','Eritrea','Djibouti','Kosovo','Bosnia',
  'Taiwan','North Korea','Belarus','Moldova','Serbia','Azerbaijan','Kyrgyzstan',
  'Tajikistan','Turkmenistan','Uzbekistan','Kazakhstan','Peru','Brazil','Nicaragua',
  'Honduras','Guatemala','El Salvador','Cuba','Angola','Rwanda','Burundi','Malawi',
  'Guinea-Bissau','Sierra Leone','Liberia','Togo','Benin','Mauritania','Tunisia',
  'Algeria','Morocco','Egypt','Jordan','Saudi Arabia','Oman','Kuwait','Vietnam',
  'Cambodia','Laos','Nepal','India','Timor-Leste','Papua New Guinea','Solomon Islands','Fiji',
  'Turkey','Greece','Bulgaria','Romania','Hungary','Poland','Slovakia','Croatia',
  'North Macedonia','Montenegro','Albania','China','South Korea','Japan','Mongolia',
  'Thailand','Malaysia','Singapore','Australia','New Zealand','South Africa','Ghana',
  'Ivory Coast','Gabon','Congo','Equatorial Guinea','Namibia','Botswana',
  'Argentina','Chile','Paraguay','Uruguay','Guyana','Suriname','Trinidad and Tobago',
  'Panama','Costa Rica','Dominican Republic','Jamaica','Belize',
  'UAE','Qatar','Bahrain','UK','France','Germany','Spain','Italy','Portugal',
  'Sweden','Finland','Norway','Denmark','Netherlands','Belgium','Austria','Switzerland',
  'Cyprus','United States',
];

async function runPool(tasks, concurrency) {
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
}

async function processCountry(country, num, total) {
  try {
    const readings = await fetchUnhcrHistorical(country);
    if (!readings || readings.length === 0) {
      console.log(`  [${num}/${total}] ${country}: no ISO3 mapping, skipped`);
      return 0;
    }

    const stamped = readings.map(r => ({
      ...r,
      country,
      ingested_at: new Date().toISOString(),
    }));

    const { inserted, errors } = await upsertReadings(sb, stamped, { batchSize: 500 });
    if (errors.length > 0) {
      errors.forEach(e => console.log(`  ⚠ ${country} batch ${e.batch}: ${e.error}`));
    }
    console.log(`  ✅ [${num}/${total}] ${country}: ${inserted} rows`);
    return inserted;
  } catch (err) {
    console.error(`  ❌ [${num}/${total}] ${country}: ${err.message}`);
    return 0;
  }
}

async function main() {
  console.log('UNHCR Displacement Re-fetch (string-concat fix)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Countries: ${ALL_COUNTRIES.length}`);
  console.log('Concurrency: 3 | Rate limit: 1.1s/year/country');
  console.log('Estimated runtime: ~70 minutes');
  console.log('Does NOT rebuild baselines or convergence scores.');
  console.log('');

  let totalWritten = 0;
  let num = 0;

  const tasks = ALL_COUNTRIES.map(country => async () => {
    num++;
    const n = await processCountry(country, num, ALL_COUNTRIES.length);
    totalWritten += n;
  });

  await runPool(tasks, 3);

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`✅ Re-fetch complete. Total rows written: ${totalWritten}`);
  console.log('');
  console.log('Verify with:');
  console.log('  node -e "const {sb}=require(\'./db.cjs\'); sb.from(\'historical_signal_readings\').select(\'raw_value\').eq(\'signal_key\',\'displacement\').gt(\'raw_value\',1000000000).then(r=>console.log(\'Over-1B rows (should be 0):\',r.data?.length))"');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
