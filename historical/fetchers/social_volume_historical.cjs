// social_volume_historical.cjs
// Social unrest volume signal
// Signal: social_volume
// Source: World Bank social stress indicators
//         SL.UEM.TOTL.ZS = Unemployment rate (high = economic pressure → unrest)
//         SI.POV.GINI = GINI inequality (high = social fracture)
//         VC.IHR.PSRC.P5 = Intentional homicide rate (social disorder)
//         SP.POP.GROW = Population growth rate (rapid growth + poverty → unrest)
// Coverage: 1990–present
// Free, no key required

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const INDICATORS = [
  { id: 'SL.UEM.TOTL.ZS',  weight: +1.5 }, // unemployment % — higher = more social stress
  { id: 'SI.POV.GINI',     weight: +1.0 }, // GINI coefficient — higher = more inequality = unrest
  { id: 'VC.IHR.PSRC.P5',  weight: +2.0 }, // homicide rate per 100k — higher = more violence/disorder
  { id: 'SP.POP.GROW',      weight: +0.5 }, // population growth rate — rapid growth amplifies stress
];

const ISO2 = {
  'Afghanistan':'AF','Algeria':'DZ','Angola':'AO','Argentina':'AR','Armenia':'AM',
  'Azerbaijan':'AZ','Bangladesh':'BD','Belarus':'BY','Bolivia':'BO','Brazil':'BR',
  'Burkina Faso':'BF','Burundi':'BI','Cambodia':'KH','Cameroon':'CM',
  'CAR':'CF','Chad':'TD','Chile':'CL','China':'CN','Colombia':'CO',
  'DRC':'CD','Congo':'CG','Cuba':'CU','Djibouti':'DJ','Ecuador':'EC',
  'Egypt':'EG','El Salvador':'SV','Eritrea':'ER','Ethiopia':'ET',
  'Georgia':'GE','Ghana':'GH','Guatemala':'GT','Guinea':'GN',
  'Haiti':'HT','Honduras':'HN','India':'IN','Indonesia':'ID',
  'Iran':'IR','Iraq':'IQ','Israel':'IL','Jordan':'JO','Kazakhstan':'KZ',
  'Kenya':'KE','North Korea':'KP','Kyrgyzstan':'KG','Laos':'LA',
  'Lebanon':'LB','Liberia':'LR','Libya':'LY','Madagascar':'MG',
  'Malawi':'MW','Malaysia':'MY','Mali':'ML','Mauritania':'MR',
  'Mexico':'MX','Moldova':'MD','Mongolia':'MN','Morocco':'MA',
  'Mozambique':'MZ','Myanmar':'MM','Nepal':'NP','Nicaragua':'NI',
  'Niger':'NE','Nigeria':'NG','Oman':'OM','Pakistan':'PK',
  'Papua New Guinea':'PG','Peru':'PE','Philippines':'PH',
  'Russia':'RU','Rwanda':'RW','Saudi Arabia':'SA','Senegal':'SN',
  'Sierra Leone':'SL','Somalia':'SO','South Africa':'ZA',
  'South Sudan':'SS','Sri Lanka':'LK','Sudan':'SD','Syria':'SY',
  'Tajikistan':'TJ','Tanzania':'TZ','Thailand':'TH','Togo':'TG',
  'Tunisia':'TN','Turkey':'TR','Turkmenistan':'TM','Uganda':'UG',
  'Ukraine':'UA','UAE':'AE','Uzbekistan':'UZ','Venezuela':'VE',
  'Vietnam':'VN','Yemen':'YE','Zambia':'ZM','Zimbabwe':'ZW',
};

async function fetchSocialVolume() {
  const readings = [];
  const byCountryYear = {};
  console.log('Fetching social volume data (unemployment + inequality + homicide)...');
  let count = 0;

  for (const [country, iso2] of Object.entries(ISO2)) {
    for (const { id, weight } of INDICATORS) {
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
          if (isNaN(value)) continue;

          // Normalize each indicator to 0-100
          let normalized;
          if (id === 'SL.UEM.TOTL.ZS') normalized = Math.min(100, (value / 40) * 100); // 0-40% range
          else if (id === 'SI.POV.GINI') normalized = Math.min(100, (value / 65) * 100); // 0-65 range
          else if (id === 'VC.IHR.PSRC.P5') normalized = Math.min(100, (value / 50) * 100); // 0-50 per 100k
          else if (id === 'SP.POP.GROW') normalized = Math.min(100, Math.max(0, value * 20)); // 0-5% growth
          else normalized = Math.min(100, Math.abs(value));

          const key = `${country}|${year}`;
          if (!byCountryYear[key]) byCountryYear[key] = { country, year, score: 0, totalWeight: 0, iso2, vals: {} };
          byCountryYear[key].score += normalized * weight;
          byCountryYear[key].totalWeight += weight;
          byCountryYear[key].vals[id] = value;
        }
      } catch (e) { /* silent */ }
      await new Promise(r => setTimeout(r, 100));
    }
    count++;
    if (count % 25 === 0) console.log(`  ${count} countries`);
  }

  for (const { country, year, score, totalWeight, iso2, vals } of Object.values(byCountryYear)) {
    if (totalWeight === 0) continue;
    const socialScore = Math.max(0, Math.min(100, score / totalWeight));
    readings.push({
      country, signal_key: 'social_volume', signal_name: 'Social Volume',
      date: `${year}-01-01`, raw_value: parseFloat(socialScore.toFixed(3)),
      raw_metadata: {
        unemployment_pct: vals['SL.UEM.TOTL.ZS'],
        gini: vals['SI.POV.GINI'],
        homicide_per100k: vals['VC.IHR.PSRC.P5'],
        pop_growth_pct: vals['SP.POP.GROW'],
        iso2, year
      },
      source: 'World Bank WDI', gap: false, ingested_at: new Date().toISOString(),
    });
  }

  console.log(`Fetched ${readings.length} social_volume readings`);
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
  console.log('Social Volume Historical Fetcher');
  console.log('═══════════════════════════════════════════════════════════════');
  const readings = await fetchSocialVolume();
  const saved = await saveReadings(readings);
  console.log(`Saved ${saved} readings to database`);
}

if (require.main === module) { run().catch(console.error); }
module.exports = { fetchSocialVolume, saveReadings };
