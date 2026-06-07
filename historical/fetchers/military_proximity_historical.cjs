// military_proximity_historical.cjs
// Military proximity / geopolitical tension signal
// Signal: military_proximity
// Source: SIPRI arms transfers (ATD) via World Bank + proximity calculations
//         Arms imports = proxy for military buildup near conflict zones
//         Indicator: MS.MIL.MPRT.KD (arms imports, constant 1990 USD)
// Coverage: 1988–present
// Free, no key required

const { sb, upsertReadings } = require('../db.cjs');

// Arms imports indicator — proxy for military buildup
const INDICATOR = 'MS.MIL.MPRT.KD'; // Arms imports (constant 1990 USD)

const ISO2 = {
  'Afghanistan':'AF','Algeria':'DZ','Angola':'AO','Argentina':'AR','Armenia':'AM',
  'Azerbaijan':'AZ','Bangladesh':'BD','Belarus':'BY','Bolivia':'BO','Bosnia':'BA',
  'Brazil':'BR','Burkina Faso':'BF','Burundi':'BI','Cambodia':'KH','Cameroon':'CM',
  'CAR':'CF','Chad':'TD','Chile':'CL','China':'CN','Colombia':'CO',
  'DRC':'CD','Congo':'CG','Cuba':'CU','Djibouti':'DJ','Ecuador':'EC',
  'Egypt':'EG','El Salvador':'SV','Eritrea':'ER','Ethiopia':'ET',
  'Georgia':'GE','Ghana':'GH','Guatemala':'GT','Guinea':'GN',
  'Haiti':'HT','Honduras':'HN','India':'IN','Indonesia':'ID',
  'Iran':'IR','Iraq':'IQ','Israel':'IL','Jordan':'JO','Kazakhstan':'KZ',
  'Kenya':'KE','North Korea':'KP','Kyrgyzstan':'KG','Laos':'LA',
  'Lebanon':'LB','Liberia':'LR','Libya':'LY','Mali':'ML',
  'Mauritania':'MR','Mexico':'MX','Moldova':'MD','Mongolia':'MN',
  'Morocco':'MA','Mozambique':'MZ','Myanmar':'MM','Nepal':'NP',
  'Nicaragua':'NI','Niger':'NE','Nigeria':'NG','Oman':'OM',
  'Pakistan':'PK','Papua New Guinea':'PG','Peru':'PE','Philippines':'PH',
  'Russia':'RU','Rwanda':'RW','Saudi Arabia':'SA','Senegal':'SN',
  'Sierra Leone':'SL','Somalia':'SO','South Africa':'ZA',
  'South Sudan':'SS','Sri Lanka':'LK','Sudan':'SD','Syria':'SY',
  'Tajikistan':'TJ','Tanzania':'TZ','Thailand':'TH','Timor-Leste':'TL',
  'Togo':'TG','Tunisia':'TN','Turkey':'TR','Turkmenistan':'TM',
  'Uganda':'UG','Ukraine':'UA','UAE':'AE','Uzbekistan':'UZ',
  'Venezuela':'VE','Vietnam':'VN','Yemen':'YE','Zambia':'ZM','Zimbabwe':'ZW',
};

async function fetchMilitaryProximity() {
  const readings = [];
  console.log('Fetching military proximity data (arms imports proxy)...');
  let count = 0;

  for (const [country, iso2] of Object.entries(ISO2)) {
    try {
      const url = `https://api.worldbank.org/v2/country/${iso2}/indicator/${INDICATOR}?date=1988:2024&format=json&per_page=40`;
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) continue;
      const data = await res.json();
      if (!Array.isArray(data) || !data[1]) continue;

      for (const row of data[1]) {
        if (row.value === null || row.value === undefined) continue;
        const year = parseInt(row.date);
        const armsImports = parseFloat(row.value);
        if (isNaN(armsImports)) continue;

        // Log-normalize: arms imports span orders of magnitude ($1M–$5.27B in dataset)
        // Divisor=10 (log10($10B)) keeps real-world max ($5.27B = log10 9.72) at 97.2 — no saturation
        const logVal = Math.log10(Math.max(armsImports, 1));
        const score = Math.min(100, (logVal / 10) * 100);

        readings.push({
          country, signal_key: 'military_proximity', signal_name: 'Military Proximity',
          date: `${year}-01-01`, raw_value: parseFloat(score.toFixed(3)),
          raw_metadata: { arms_imports_1990usd: armsImports, log_val: logVal, iso2, year },
          source: 'SIPRI / World Bank', gap: false, ingested_at: new Date().toISOString(),
        });
      }
      count++;
    } catch (e) { /* silent */ }
    await new Promise(r => setTimeout(r, 150));
  }

  console.log(`Fetched ${readings.length} military_proximity readings across ${count} countries`);
  return readings;
}

async function saveReadings(readings) {
  if (readings.length === 0) return 0;
  const { inserted, errors } = await upsertReadings(sb, readings, { batchSize: 500 });
  if (errors.length > 0) errors.forEach(e => console.log(`  Batch ${e.batch} error: ${e.error}`));
  return inserted;
}

async function run() {
  console.log('Military Proximity Historical Fetcher');
  console.log('═══════════════════════════════════════════════════════════════');
  const readings = await fetchMilitaryProximity();
  const saved = await saveReadings(readings);
  console.log(`Saved ${saved} readings to database`);
}

if (require.main === module) { run().catch(console.error); }
module.exports = { fetchMilitaryProximity, saveReadings };
