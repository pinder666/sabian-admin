// rail_corridor_historical.cjs
// Rail corridor risk signal — infrastructure vulnerability
// Signal: rail_corridor
// Source: World Bank rail lines (IS.RRS.TOTL.KM) + rail freight (IS.RRS.GOOD.MT.K6)
//         Low rail density in conflict zones = corridor disruption risk
// Coverage: 1990–present
// Free, no key required

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const INDICATORS = [
  { id: 'IS.RRS.TOTL.KM', name: 'rail_lines_km', invert: false },      // total rail lines
  { id: 'IS.RRS.GOOD.MT.K6', name: 'rail_freight_mtkm', invert: false }, // rail freight
];

const ISO2 = {
  'Afghanistan':'AF','Algeria':'DZ','Angola':'AO','Argentina':'AR','Armenia':'AM',
  'Azerbaijan':'AZ','Bangladesh':'BD','Belarus':'BY','Bolivia':'BO','Brazil':'BR',
  'Burkina Faso':'BF','Burundi':'BI','Cambodia':'KH','Cameroon':'CM',
  'CAR':'CF','Chad':'TD','Chile':'CL','China':'CN','Colombia':'CO',
  'DRC':'CD','Congo':'CG','Cuba':'CU','Ecuador':'EC',
  'Egypt':'EG','El Salvador':'SV','Eritrea':'ER','Ethiopia':'ET',
  'Georgia':'GE','Ghana':'GH','Guatemala':'GT','Guinea':'GN',
  'Haiti':'HT','Honduras':'HN','India':'IN','Indonesia':'ID',
  'Iran':'IR','Iraq':'IQ','Israel':'IL','Jordan':'JO','Kazakhstan':'KZ',
  'Kenya':'KE','North Korea':'KP','Kyrgyzstan':'KG','Laos':'LA',
  'Lebanon':'LB','Liberia':'LR','Libya':'LY','Madagascar':'MG',
  'Malawi':'MW','Malaysia':'MY','Mali':'ML','Mauritania':'MR',
  'Mexico':'MX','Moldova':'MD','Mongolia':'MN','Morocco':'MA',
  'Mozambique':'MZ','Myanmar':'MM','Nepal':'NP','Nicaragua':'NI',
  'Niger':'NE','Nigeria':'NG','Pakistan':'PK','Papua New Guinea':'PG',
  'Peru':'PE','Philippines':'PH','Russia':'RU','Rwanda':'RW',
  'Saudi Arabia':'SA','Senegal':'SN','Sierra Leone':'SL','Somalia':'SO',
  'South Africa':'ZA','South Sudan':'SS','Sri Lanka':'LK','Sudan':'SD',
  'Syria':'SY','Tajikistan':'TJ','Tanzania':'TZ','Thailand':'TH',
  'Togo':'TG','Tunisia':'TN','Turkey':'TR','Turkmenistan':'TM',
  'Uganda':'UG','Ukraine':'UA','UAE':'AE','Uzbekistan':'UZ',
  'Venezuela':'VE','Vietnam':'VN','Yemen':'YE','Zambia':'ZM','Zimbabwe':'ZW',
};

async function fetchRailCorridor() {
  const readings = [];
  const byCountryYear = {};
  console.log('Fetching rail corridor risk data (World Bank rail infrastructure)...');
  let count = 0;

  for (const [country, iso2] of Object.entries(ISO2)) {
    for (const { id } of INDICATORS) {
      try {
        const url = `https://api.worldbank.org/v2/country/${iso2}/indicator/${id}?date=1990:2024&format=json&per_page=40`;
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) continue;
        const data = await res.json();
        if (!Array.isArray(data) || !data[1]) continue;

        for (const row of data[1]) {
          if (row.value === null || row.value === undefined) continue;
          const year = parseInt(row.date);
          const value = parseFloat(row.value);
          if (isNaN(value) || value < 0) continue;

          const key = `${country}|${year}`;
          if (!byCountryYear[key]) byCountryYear[key] = { country, year, railKm: null, freight: null, iso2 };
          if (id === 'IS.RRS.TOTL.KM') byCountryYear[key].railKm = value;
          if (id === 'IS.RRS.GOOD.MT.K6') byCountryYear[key].freight = value;
        }
      } catch (e) { /* silent */ }
      await new Promise(r => setTimeout(r, 100));
    }
    count++;
    if (count % 25 === 0) console.log(`  ${count} countries`);
  }

  for (const { country, year, railKm, freight, iso2 } of Object.values(byCountryYear)) {
    if (railKm === null && freight === null) continue;

    // Risk = low rail density → high corridor disruption risk
    // Normalize rail km: 0 = highest risk, 100,000+ km = lowest risk
    let riskScore = 50; // default mid
    if (railKm !== null) {
      const logKm = Math.log10(Math.max(railKm, 1));
      // log10(100000) ≈ 5, so 5 = lowest risk
      riskScore = Math.max(0, Math.min(100, 100 - (logKm / 5) * 100));
    }

    readings.push({
      country, signal_key: 'rail_corridor', signal_name: 'Rail Corridor Risk',
      date: `${year}-01-01`, raw_value: parseFloat(riskScore.toFixed(3)),
      raw_metadata: { rail_km: railKm, freight_mtkm: freight, iso2, year },
      source: 'World Bank WDI', gap: false, ingested_at: new Date().toISOString(),
    });
  }

  console.log(`Fetched ${readings.length} rail_corridor readings`);
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
  console.log('Rail Corridor Historical Fetcher');
  console.log('═══════════════════════════════════════════════════════════════');
  const readings = await fetchRailCorridor();
  const saved = await saveReadings(readings);
  console.log(`Saved ${saved} readings to database`);
}

if (require.main === module) { run().catch(console.error); }
module.exports = { fetchRailCorridor, saveReadings };
