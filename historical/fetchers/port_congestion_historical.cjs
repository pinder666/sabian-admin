// port_congestion_historical.cjs
// Port congestion / logistics friction signal
// Signal: port_congestion
// Source: World Bank Logistics Performance Index (LP.LPI.CUST.XQ, LP.LPI.INFR.XQ)
//         + UNCTAD liner shipping connectivity index
// Coverage: 2007–present (LPI biennial), 2004–present (UNCTAD LSCI)
// Free, no key required

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const INDICATORS = [
  'LP.LPI.OVRL.XQ',  // Overall LPI (1-5)
  'LP.LPI.INFR.XQ',  // Infrastructure LPI
  'IS.SHP.GCNW.XQ',  // Liner shipping connectivity index
];

const ISO2 = {
  'Afghanistan':'AF','Algeria':'DZ','Angola':'AO','Argentina':'AR','Armenia':'AM',
  'Azerbaijan':'AZ','Bangladesh':'BD','Belarus':'BY','Benin':'BJ','Bolivia':'BO',
  'Bosnia':'BA','Brazil':'BR','Burkina Faso':'BF','Burundi':'BI','Cambodia':'KH',
  'Cameroon':'CM','CAR':'CF','Chad':'TD','Chile':'CL','China':'CN',
  'Colombia':'CO','DRC':'CD','Congo':'CG','Cuba':'CU','Djibouti':'DJ',
  'Ecuador':'EC','Egypt':'EG','El Salvador':'SV','Eritrea':'ER','Ethiopia':'ET',
  'Georgia':'GE','Ghana':'GH','Guatemala':'GT','Guinea':'GN','Guinea-Bissau':'GW',
  'Haiti':'HT','Honduras':'HN','India':'IN','Indonesia':'ID','Iran':'IR',
  'Iraq':'IQ','Israel':'IL','Jordan':'JO','Kazakhstan':'KZ','Kenya':'KE',
  'North Korea':'KP','Kyrgyzstan':'KG','Laos':'LA','Lebanon':'LB','Liberia':'LR',
  'Libya':'LY','Madagascar':'MG','Malawi':'MW','Malaysia':'MY','Mali':'ML',
  'Mauritania':'MR','Mexico':'MX','Moldova':'MD','Mongolia':'MN','Morocco':'MA',
  'Mozambique':'MZ','Myanmar':'MM','Nepal':'NP','Nicaragua':'NI','Niger':'NE',
  'Nigeria':'NG','Oman':'OM','Pakistan':'PK','Papua New Guinea':'PG',
  'Peru':'PE','Philippines':'PH','Russia':'RU','Rwanda':'RW','Saudi Arabia':'SA',
  'Senegal':'SN','Sierra Leone':'SL','Solomon Islands':'SB','Somalia':'SO',
  'South Africa':'ZA','South Sudan':'SS','Sri Lanka':'LK','Sudan':'SD',
  'Syria':'SY','Tajikistan':'TJ','Tanzania':'TZ','Thailand':'TH','Timor-Leste':'TL',
  'Togo':'TG','Tunisia':'TN','Turkey':'TR','Turkmenistan':'TM','Uganda':'UG',
  'Ukraine':'UA','UAE':'AE','Uzbekistan':'UZ','Venezuela':'VE','Vietnam':'VN',
  'Yemen':'YE','Zambia':'ZM','Zimbabwe':'ZW',
};

async function fetchPortCongestion() {
  const readings = [];
  const byCountryYear = {};
  console.log('Fetching port congestion / logistics friction data...');
  let count = 0;

  for (const [country, iso2] of Object.entries(ISO2)) {
    for (const indicator of INDICATORS) {
      try {
        const url = `https://api.worldbank.org/v2/country/${iso2}/indicator/${indicator}?date=2000:2024&format=json&per_page=30`;
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) continue;
        const data = await res.json();
        if (!Array.isArray(data) || !data[1]) continue;

        for (const row of data[1]) {
          if (row.value === null || row.value === undefined) continue;
          const year = parseInt(row.date);
          const value = parseFloat(row.value);
          if (isNaN(value)) continue;

          const key = `${country}|${year}`;
          if (!byCountryYear[key]) byCountryYear[key] = { country, year, values: [], iso2 };
          byCountryYear[key].values.push(value);
        }
      } catch (e) { /* silent */ }
      await new Promise(r => setTimeout(r, 100));
    }
    count++;
    if (count % 25 === 0) console.log(`  ${count} countries`);
  }

  for (const { country, year, values, iso2 } of Object.values(byCountryYear)) {
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    // Convert: LPI is 1-5 scale (higher = better). Port congestion: lower LPI = more congestion.
    // For LSCI (0-100+), higher = better connectivity. Invert for congestion.
    // Normalize to 0-100 congestion score
    const normalizedVal = avg < 10 ? avg : avg / 100; // handle LPI vs LSCI scale
    const congestionScore = Math.max(0, Math.min(100, 100 - (normalizedVal * 20)));

    readings.push({
      country, signal_key: 'port_congestion', signal_name: 'Port Congestion',
      date: `${year}-01-01`, raw_value: parseFloat(congestionScore.toFixed(3)),
      raw_metadata: { avg_indicator: avg, n_indicators: values.length, iso2, year },
      source: 'World Bank LPI/LSCI', gap: false, ingested_at: new Date().toISOString(),
    });
  }

  console.log(`Fetched ${readings.length} port_congestion readings`);
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
  console.log('Port Congestion Historical Fetcher');
  console.log('═══════════════════════════════════════════════════════════════');
  const readings = await fetchPortCongestion();
  const saved = await saveReadings(readings);
  console.log(`Saved ${saved} readings to database`);
}

if (require.main === module) { run().catch(console.error); }
module.exports = { fetchPortCongestion, saveReadings };
