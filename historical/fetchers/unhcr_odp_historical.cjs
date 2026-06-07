// unhcr_odp_historical.cjs
// Refugee outflow signal — displacement pressure from origin country
// Signal: unhcr_odp (UNHCR Origin/Destination)
// Source: World Bank SM.POP.NETM (Net migration)
//         Negative net migration = refugees/emigrants leaving the country
//         Large negative net migration = high displacement pressure on origin country
//         Also: VC.IHR.PSRC.P5 (homicide rate as conflict-displacement proxy)
// Coverage: 1960–present (net migration), 2003–present (homicide)
// Free, no key required

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const INDICATORS = [
  { id: 'SM.POP.NETM',      weight: +2.0 }, // Net migration (negative = outflow = displacement)
  { id: 'VC.IHR.PSRC.P5',  weight: +1.0 }, // Homicide rate (conflict → displacement)
];

const ISO2 = {
  'Afghanistan':'AF','Algeria':'DZ','Angola':'AO','Argentina':'AR','Armenia':'AM',
  'Azerbaijan':'AZ','Bangladesh':'BD','Belarus':'BY','Bolivia':'BO','Brazil':'BR',
  'Burkina Faso':'BF','Burundi':'BI','Cambodia':'KH','Cameroon':'CM',
  'CAR':'CF','Chad':'TD','Chile':'CL','China':'CN','Colombia':'CO',
  'DRC':'CD','Congo':'CG','Cuba':'CU','Djibouti':'DJ','Ecuador':'EC',
  'Egypt':'EG','El Salvador':'SV','Eritrea':'ER','Ethiopia':'ET',
  'Georgia':'GE','Ghana':'GH','Guatemala':'GT','Guinea':'GN',
  'Guinea-Bissau':'GW','Haiti':'HT','Honduras':'HN','India':'IN',
  'Indonesia':'ID','Iran':'IR','Iraq':'IQ','Israel':'IL','Jordan':'JO',
  'Kazakhstan':'KZ','Kenya':'KE','North Korea':'KP','Kyrgyzstan':'KG',
  'Laos':'LA','Lebanon':'LB','Liberia':'LR','Libya':'LY',
  'Madagascar':'MG','Malawi':'MW','Malaysia':'MY','Mali':'ML',
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

async function fetchUNHCRODP() {
  const readings = [];
  const byCountryYear = {};
  console.log('Fetching UNHCR ODP proxy (WB net migration outflow + homicide rate)...');
  let count = 0;

  for (const [country, iso2] of Object.entries(ISO2)) {
    for (const { id, weight } of INDICATORS) {
      try {
        const url = `https://api.worldbank.org/v2/country/${iso2}/indicator/${id}?date=1960:2024&format=json&per_page=80`;
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
          if (!byCountryYear[key]) byCountryYear[key] = { country, year, components: {}, iso2 };
          byCountryYear[key].components[id] = value;
        }
      } catch (e) { /* silent */ }
      await new Promise(r => setTimeout(r, 100));
    }
    count++;
    if (count % 25 === 0) console.log(`  ${count} countries`);
  }

  for (const { country, year, components, iso2 } of Object.values(byCountryYear)) {
    const netMig = components['SM.POP.NETM'];
    const homicide = components['VC.IHR.PSRC.P5'];

    let score = 0;
    let totalWeight = 0;

    if (netMig !== undefined) {
      // Negative net migration = outflows = displacement
      // -5M (Syria peak) → score 100, 0 → score 0, positive → score 0
      const outflowScore = netMig < 0
        ? Math.min(100, (Math.abs(netMig) / 1000000) * 20) // -1M = 20, -5M = 100
        : 0;
      score += outflowScore * 2.0;
      totalWeight += 2.0;
    }

    if (homicide !== undefined) {
      // 0-50 homicides per 100k → 0-100 score
      const homScore = Math.min(100, (homicide / 50) * 100);
      score += homScore * 1.0;
      totalWeight += 1.0;
    }

    if (totalWeight === 0) continue;
    const riskScore = Math.max(0, Math.min(100, score / totalWeight));

    readings.push({
      country, signal_key: 'unhcr_odp', signal_name: 'UNHCR Origin/Destination',
      date: `${year}-01-01`, raw_value: parseFloat(riskScore.toFixed(3)),
      raw_metadata: { net_migration: netMig, homicide_per100k: homicide, iso2, year },
      source: 'World Bank WDI (net migration + homicide proxy)', gap: false, ingested_at: new Date().toISOString(),
    });
  }

  console.log(`Fetched ${readings.length} unhcr_odp readings`);
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
  console.log('UNHCR ODP Historical Fetcher');
  console.log('═══════════════════════════════════════════════════════════════');
  const readings = await fetchUNHCRODP();
  const saved = await saveReadings(readings);
  console.log(`Saved ${saved} readings to database`);
}

if (require.main === module) { run().catch(console.error); }
module.exports = { fetchUNHCRODP, saveReadings };
