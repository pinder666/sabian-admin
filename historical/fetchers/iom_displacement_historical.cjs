// iom_displacement_historical.cjs
// Internal displacement / forced migration signal
// Signal: iom_displacement
// Source: World Bank SM.POP.NETM (Net migration) +
//         SL.UEM.TOTL.ZS (Unemployment) + VC.IHR.PSRC.P5 (Homicide rate)
//         Combined: net outflow + unemployment + violence = displacement pressure index
//         All indicators confirmed available in WB API
// Coverage: 1960–present (net migration), 1991–present (unemployment), 2003–present (homicide)
// Free, no key required

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const INDICATORS = [
  { id: 'SM.POP.NETM',     weight: +1.5 }, // Net migration (large negative = internal displacement pressure)
  { id: 'SL.UEM.TOTL.ZS', weight: +1.0 }, // Unemployment (economic displacement driver)
  { id: 'VC.IHR.PSRC.P5', weight: +1.5 }, // Homicide rate (violence-driven displacement)
];

const ISO2 = {
  'Afghanistan':'AF','Algeria':'DZ','Angola':'AO','Argentina':'AR','Armenia':'AM',
  'Azerbaijan':'AZ','Bangladesh':'BD','Bolivia':'BO','Brazil':'BR',
  'Burkina Faso':'BF','Burundi':'BI','Cambodia':'KH','Cameroon':'CM',
  'CAR':'CF','Chad':'TD','China':'CN','Colombia':'CO',
  'DRC':'CD','Congo':'CG','Ecuador':'EC','Egypt':'EG',
  'El Salvador':'SV','Eritrea':'ER','Ethiopia':'ET','Georgia':'GE',
  'Ghana':'GH','Guatemala':'GT','Guinea':'GN','Haiti':'HT',
  'Honduras':'HN','India':'IN','Indonesia':'ID','Iran':'IR',
  'Iraq':'IQ','Israel':'IL','Jordan':'JO','Kazakhstan':'KZ',
  'Kenya':'KE','Kyrgyzstan':'KG','Laos':'LA','Lebanon':'LB',
  'Liberia':'LR','Libya':'LY','Madagascar':'MG','Malawi':'MW',
  'Malaysia':'MY','Mali':'ML','Mauritania':'MR','Mexico':'MX',
  'Moldova':'MD','Mongolia':'MN','Morocco':'MA','Mozambique':'MZ',
  'Myanmar':'MM','Nepal':'NP','Nicaragua':'NI','Niger':'NE',
  'Nigeria':'NG','Pakistan':'PK','Papua New Guinea':'PG',
  'Peru':'PE','Philippines':'PH','Russia':'RU','Rwanda':'RW',
  'Saudi Arabia':'SA','Senegal':'SN','Sierra Leone':'SL','Somalia':'SO',
  'South Africa':'ZA','South Sudan':'SS','Sri Lanka':'LK',
  'Sudan':'SD','Syria':'SY','Tajikistan':'TJ','Tanzania':'TZ',
  'Thailand':'TH','Togo':'TG','Tunisia':'TN','Turkey':'TR',
  'Uganda':'UG','Ukraine':'UA','Uzbekistan':'UZ','Venezuela':'VE',
  'Vietnam':'VN','Yemen':'YE','Zambia':'ZM','Zimbabwe':'ZW',
};

async function fetchIOMDisplacement() {
  const readings = [];
  const byCountryYear = {};
  console.log('Fetching displacement pressure proxy (WB net migration + unemployment + homicide)...');
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
    const unem = components['SL.UEM.TOTL.ZS'];
    const homicide = components['VC.IHR.PSRC.P5'];

    let score = 0;
    let totalWeight = 0;

    if (netMig !== undefined) {
      // Large negative net migration = displacement outflow pressure
      const migScore = netMig < 0
        ? Math.min(100, (Math.abs(netMig) / 500000) * 100) // -500k = 100
        : Math.max(0, 20 - (netMig / 100000)); // small positive = low risk
      score += migScore * 1.5;
      totalWeight += 1.5;
    }

    if (unem !== undefined) {
      const unemScore = Math.min(100, (unem / 40) * 100);
      score += unemScore * 1.0;
      totalWeight += 1.0;
    }

    if (homicide !== undefined) {
      const homScore = Math.min(100, (homicide / 50) * 100);
      score += homScore * 1.5;
      totalWeight += 1.5;
    }

    if (totalWeight === 0) continue;
    const riskScore = Math.max(0, Math.min(100, score / totalWeight));

    readings.push({
      country, signal_key: 'iom_displacement', signal_name: 'IOM Displacement',
      date: `${year}-01-01`, raw_value: parseFloat(riskScore.toFixed(3)),
      raw_metadata: { net_migration: netMig, unemployment_pct: unem, homicide_per100k: homicide, iso2, year },
      source: 'World Bank WDI (displacement proxy)', gap: false, ingested_at: new Date().toISOString(),
    });
  }

  console.log(`Fetched ${readings.length} iom_displacement readings`);
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
  console.log('IOM Displacement Historical Fetcher');
  console.log('═══════════════════════════════════════════════════════════════');
  const readings = await fetchIOMDisplacement();
  const saved = await saveReadings(readings);
  console.log(`Saved ${saved} readings to database`);
}

if (require.main === module) { run().catch(console.error); }
module.exports = { fetchIOMDisplacement, saveReadings };
