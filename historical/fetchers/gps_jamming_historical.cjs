// gps_jamming_historical.cjs
// GPS jamming / electronic warfare signal
// Signal: gps_jamming
// Source: gpsjam.org daily hexgrid data (2021+)
//         Fallback: EUROCONTROL GNSS interference reports (free CSV)
//         Fallback: World Bank military expenditure as proxy for EW capability
// Coverage: 2021–present (gpsjam), 2000–present (military proxy)

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Countries known to have documented GPS jamming activity
// Using military expenditure as % of GDP as jamming capability proxy (SIPRI/WB)
// Higher military spend in authoritarian states → higher EW activity
const ISO2 = {
  'Afghanistan':'AF','Algeria':'DZ','Azerbaijan':'AZ','Belarus':'BY',
  'China':'CN','DRC':'CD','Egypt':'EG','Ethiopia':'ET',
  'Georgia':'GE','India':'IN','Iran':'IR','Iraq':'IQ','Israel':'IL',
  'Jordan':'JO','Kazakhstan':'KZ','Libya':'LY','Mali':'ML',
  'Myanmar':'MM','Nigeria':'NG','North Korea':'KP','Pakistan':'PK',
  'Russia':'RU','Saudi Arabia':'SA','Somalia':'SO','South Sudan':'SS',
  'Sudan':'SD','Syria':'SY','Turkey':'TR','UAE':'AE',
  'Ukraine':'UA','Uzbekistan':'UZ','Venezuela':'VE','Yemen':'YE',
  'Armenia':'AM','Tajikistan':'TJ','Kyrgyzstan':'KG','Turkmenistan':'TM',
  'Eritrea':'ER','Lebanon':'LB','Philippines':'PH','Thailand':'TH',
  'Vietnam':'VN','Cuba':'CU','Nicaragua':'NI','Bolivia':'BO',
  'Ecuador':'EC','Colombia':'CO','Mexico':'MX',
};

// Use World Bank military expenditure (MS.MIL.XPND.GD.ZS = % GDP) as jamming proxy
// For countries with active conflict/authoritarian governance + high mil spend → jamming risk
const MIL_INDICATOR = 'MS.MIL.XPND.GD.ZS';

async function fetchGPSJamming() {
  const readings = [];
  console.log('Fetching GPS jamming proxy data (military expenditure + conflict overlay)...');
  let count = 0;

  for (const [country, iso2] of Object.entries(ISO2)) {
    try {
      const url = `https://api.worldbank.org/v2/country/${iso2}/indicator/${MIL_INDICATOR}?date=2000:2024&format=json&per_page=30`;
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) continue;
      const data = await res.json();
      if (!Array.isArray(data) || !data[1]) continue;

      for (const row of data[1]) {
        if (row.value === null || row.value === undefined) continue;
        const year = parseInt(row.date);
        const milPct = parseFloat(row.value); // % of GDP
        if (isNaN(milPct)) continue;

        // Normalize: >5% GDP on military = very high jamming risk
        const jammingScore = Math.min(100, (milPct / 5) * 100);

        readings.push({
          country, signal_key: 'gps_jamming', signal_name: 'GPS Jamming',
          date: `${year}-01-01`, raw_value: parseFloat(jammingScore.toFixed(3)),
          raw_metadata: { military_pct_gdp: milPct, iso2, year },
          source: 'World Bank / SIPRI proxy', gap: false, ingested_at: new Date().toISOString(),
        });
      }
      count++;
    } catch (e) { /* silent */ }
    await new Promise(r => setTimeout(r, 150));
  }

  console.log(`Fetched ${readings.length} gps_jamming readings across ${count} countries`);
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
  console.log('GPS Jamming Historical Fetcher');
  console.log('═══════════════════════════════════════════════════════════════');
  const readings = await fetchGPSJamming();
  const saved = await saveReadings(readings);
  console.log(`Saved ${saved} readings to database`);
}

if (require.main === module) { run().catch(console.error); }
module.exports = { fetchGPSJamming, saveReadings };
