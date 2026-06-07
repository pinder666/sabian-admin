// fews_food_security_historical.cjs
// Acute food insecurity signal
// Signal: food_security
// Source: World Bank food production + undernourishment indicators
//         SN.ITK.DEFC.ZS = Prevalence of undernourishment (%)
//         AG.PRD.FOOD.XD = Food production index (higher = more food = less risk)
//         AG.YLD.CREL.KG = Cereal yield kg/ha (lower = crop failure = food insecurity)
//         TM.VAL.FOOD.ZS.UN = Food imports % of merchandise (high dependency = vulnerability)
// Coverage: 1990–present
// Free, no key required

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const INDICATORS = [
  { id: 'SN.ITK.DEFC.ZS',    weight: +2.0 }, // undernourishment % — primary food security indicator
  { id: 'AG.PRD.FOOD.XD',    weight: -1.0 }, // food production index (higher = less stress)
  { id: 'AG.YLD.CREL.KG',    weight: -0.8 }, // cereal yield kg/ha (lower = crop failure)
  { id: 'TM.VAL.FOOD.ZS.UN', weight: +0.5 }, // food imports % (high dependency = vulnerable)
];

const ISO2 = {
  'Afghanistan':'AF','Algeria':'DZ','Angola':'AO','Armenia':'AM',
  'Azerbaijan':'AZ','Bangladesh':'BD','Bolivia':'BO','Brazil':'BR',
  'Burkina Faso':'BF','Burundi':'BI','Cambodia':'KH','Cameroon':'CM',
  'CAR':'CF','Chad':'TD','China':'CN','Colombia':'CO',
  'DRC':'CD','Congo':'CG','Cuba':'CU','Djibouti':'DJ','Ecuador':'EC',
  'Egypt':'EG','El Salvador':'SV','Eritrea':'ER','Ethiopia':'ET',
  'Ghana':'GH','Guatemala':'GT','Guinea':'GN','Guinea-Bissau':'GW',
  'Haiti':'HT','Honduras':'HN','India':'IN','Indonesia':'ID',
  'Iran':'IR','Iraq':'IQ','Jordan':'JO','Kazakhstan':'KZ',
  'Kenya':'KE','Kyrgyzstan':'KG','Laos':'LA','Lebanon':'LB',
  'Liberia':'LR','Libya':'LY','Madagascar':'MG','Malawi':'MW',
  'Malaysia':'MY','Mali':'ML','Mauritania':'MR','Mexico':'MX',
  'Moldova':'MD','Mongolia':'MN','Morocco':'MA','Mozambique':'MZ',
  'Myanmar':'MM','Nepal':'NP','Nicaragua':'NI','Niger':'NE',
  'Nigeria':'NG','Pakistan':'PK','Papua New Guinea':'PG','Peru':'PE',
  'Philippines':'PH','Russia':'RU','Rwanda':'RW','Saudi Arabia':'SA',
  'Senegal':'SN','Sierra Leone':'SL','Somalia':'SO','South Africa':'ZA',
  'South Sudan':'SS','Sri Lanka':'LK','Sudan':'SD','Syria':'SY',
  'Tajikistan':'TJ','Tanzania':'TZ','Thailand':'TH','Togo':'TG',
  'Tunisia':'TN','Turkey':'TR','Turkmenistan':'TM','Uganda':'UG',
  'Ukraine':'UA','Uzbekistan':'UZ','Venezuela':'VE','Vietnam':'VN',
  'Yemen':'YE','Zambia':'ZM','Zimbabwe':'ZW',
};

async function fetchFoodSecurity() {
  const readings = [];
  const byCountryYear = {};
  console.log('Fetching food security data (World Bank undernourishment + production indicators)...');
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
          if (id === 'SN.ITK.DEFC.ZS') normalized = Math.min(100, (value / 70) * 100); // 0-70% undernourishment
          else if (id === 'AG.PRD.FOOD.XD') normalized = Math.min(100, value); // 0-100+ index
          else if (id === 'AG.YLD.CREL.KG') normalized = Math.min(100, (value / 10000) * 100); // 0-10000 kg/ha
          else if (id === 'TM.VAL.FOOD.ZS.UN') normalized = Math.min(100, (value / 50) * 100); // 0-50%
          else normalized = Math.min(100, Math.abs(value));

          const key = `${country}|${year}`;
          if (!byCountryYear[key]) byCountryYear[key] = { country, year, score: 0, totalWeight: 0, iso2, vals: {} };
          byCountryYear[key].score += normalized * weight;
          byCountryYear[key].totalWeight += Math.abs(weight);
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
    const riskScore = Math.max(0, Math.min(100, score / totalWeight));
    readings.push({
      country, signal_key: 'food_security', signal_name: 'Food Security',
      date: `${year}-01-01`, raw_value: parseFloat(riskScore.toFixed(3)),
      raw_metadata: {
        undernourishment_pct: vals['SN.ITK.DEFC.ZS'],
        food_production_idx: vals['AG.PRD.FOOD.XD'],
        cereal_yield_kg: vals['AG.YLD.CREL.KG'],
        food_imports_pct: vals['TM.VAL.FOOD.ZS.UN'],
        iso2, year
      },
      source: 'World Bank WDI (food security)', gap: false, ingested_at: new Date().toISOString(),
    });
  }

  console.log(`Fetched ${readings.length} food_security readings`);
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
  console.log('Food Security Historical Fetcher');
  console.log('═══════════════════════════════════════════════════════════════');
  const readings = await fetchFoodSecurity();
  const saved = await saveReadings(readings);
  console.log(`Saved ${saved} readings to database`);
}

if (require.main === module) { run().catch(console.error); }
module.exports = { fetchFoodSecurity, saveReadings };
