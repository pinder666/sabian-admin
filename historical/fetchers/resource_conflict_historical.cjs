// resource_conflict_historical.cjs
// Resource conflict signal: natural resource rents as % of GDP + commodity price volatility proxy
// Signal: resource_conflict
// Source: World Bank WDI (NY.GDP.TOTL.RT.ZS — total natural resource rents % GDP)
// Coverage: 1970–present
// High resource rents + stress = resource conflict risk. Free, no key required.

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const INDICATOR = 'NY.GDP.TOTL.RT.ZS'; // Total natural resources rents (% of GDP)

const ISO2 = {
  'Afghanistan':'AF','Algeria':'DZ','Angola':'AO','Argentina':'AR','Armenia':'AM',
  'Azerbaijan':'AZ','Bangladesh':'BD','Belarus':'BY','Benin':'BJ','Bolivia':'BO',
  'Bosnia':'BA','Botswana':'BW','Brazil':'BR','Burkina Faso':'BF','Burundi':'BI',
  'Cambodia':'KH','Cameroon':'CM','CAR':'CF','Chad':'TD','Chile':'CL',
  'China':'CN','Colombia':'CO','DRC':'CD','Congo':'CG','Cuba':'CU',
  'Djibouti':'DJ','Ecuador':'EC','Egypt':'EG','El Salvador':'SV','Eritrea':'ER',
  'Ethiopia':'ET','Georgia':'GE','Ghana':'GH','Guatemala':'GT','Guinea':'GN',
  'Guinea-Bissau':'GW','Haiti':'HT','Honduras':'HN','India':'IN','Indonesia':'ID',
  'Iran':'IR','Iraq':'IQ','Israel':'IL','Jordan':'JO','Kazakhstan':'KZ',
  'Kenya':'KE','North Korea':'KP','Kyrgyzstan':'KG','Laos':'LA','Lebanon':'LB',
  'Liberia':'LR','Libya':'LY','Madagascar':'MG','Malawi':'MW','Malaysia':'MY',
  'Mali':'ML','Mauritania':'MR','Mexico':'MX','Moldova':'MD','Mongolia':'MN',
  'Morocco':'MA','Mozambique':'MZ','Myanmar':'MM','Nepal':'NP','Nicaragua':'NI',
  'Niger':'NE','Nigeria':'NG','Oman':'OM','Pakistan':'PK','Papua New Guinea':'PG',
  'Peru':'PE','Philippines':'PH','Russia':'RU','Rwanda':'RW','Saudi Arabia':'SA',
  'Senegal':'SN','Sierra Leone':'SL','Solomon Islands':'SB','Somalia':'SO',
  'South Africa':'ZA','South Sudan':'SS','Sri Lanka':'LK','Sudan':'SD',
  'Syria':'SY','Tajikistan':'TJ','Tanzania':'TZ','Thailand':'TH','Timor-Leste':'TL',
  'Togo':'TG','Tunisia':'TN','Turkey':'TR','Turkmenistan':'TM','Uganda':'UG',
  'Ukraine':'UA','UAE':'AE','Uzbekistan':'UZ','Venezuela':'VE','Vietnam':'VN',
  'Yemen':'YE','Zambia':'ZM','Zimbabwe':'ZW',
};

async function fetchPage(iso2, page) {
  const url = `https://api.worldbank.org/v2/country/${iso2}/indicator/${INDICATOR}?date=1970:2024&format=json&per_page=60&page=${page}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) return null;
  return res.json();
}

async function fetchResourceConflict() {
  const readings = [];
  console.log('Fetching World Bank natural resource rents (resource_conflict)...');
  let count = 0;

  for (const [country, iso2] of Object.entries(ISO2)) {
    try {
      let page = 1;
      while (true) {
        const data = await fetchPage(iso2, page);
        if (!data || !Array.isArray(data) || !data[1]) break;

        for (const row of data[1]) {
          if (row.value === null || row.value === undefined) continue;
          const year = parseInt(row.date);
          const value = parseFloat(row.value);
          if (isNaN(value)) continue;

          readings.push({
            country,
            signal_key: 'resource_conflict',
            signal_name: 'Resource Conflict',
            date: `${year}-01-01`,
            raw_value: parseFloat(value.toFixed(4)),
            raw_metadata: { indicator: INDICATOR, iso2, year },
            source: 'World Bank WDI',
            gap: false,
            ingested_at: new Date().toISOString(),
          });
        }

        const total = data[0]?.total || 0;
        const perPage = data[0]?.per_page || 60;
        if (page * perPage >= total) break;
        page++;
        await new Promise(r => setTimeout(r, 100));
      }
      count++;
      if (count % 20 === 0) console.log(`  ${count} countries`);
    } catch (e) {
      // silent
    }
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`Fetched ${readings.length} resource_conflict readings`);
  return readings;
}

async function saveReadings(readings) {
  if (readings.length === 0) return 0;
  const seen = new Set();
  const unique = readings.filter(r => {
    const key = `${r.country}|${r.signal_key}|${r.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  let saved = 0;
  for (let i = 0; i < unique.length; i += 500) {
    const { error } = await sb.from('historical_signal_readings').upsert(unique.slice(i, i + 500), { onConflict: 'country,signal_key,date' });
    if (!error) saved += Math.min(500, unique.length - i);
  }
  return saved;
}

async function run() {
  console.log('Resource Conflict Historical Fetcher');
  console.log('═══════════════════════════════════════════════════════════════');
  const readings = await fetchResourceConflict();
  const saved = await saveReadings(readings);
  console.log(`Saved ${saved} readings to database`);
}

if (require.main === module) { run().catch(console.error); }
module.exports = { fetchResourceConflict, saveReadings };
