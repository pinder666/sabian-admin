// usda_food_historical.cjs
// Signal: usda_food
// Source: World Bank WDI — cereal yield, food imports, undernourishment
// Coverage: 1980–present

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { sb, upsertReadings } = require('../db.cjs');

const WB_INDICATORS = [
  { id: 'AG.YLD.CREL.KG',   name: 'cereal_yield_kg_ha',  direction: +1 },
  { id: 'TM.VAL.FOOD.ZS.UN', name: 'food_imports_pct',    direction: +1 },
  { id: 'SN.ITK.DEFC.ZS',   name: 'undernourishment_pct', direction: +1 },
];

const ISO2 = {
  'Afghanistan':'AF','Algeria':'DZ','Angola':'AO','Argentina':'AR',
  'Bangladesh':'BD','Bolivia':'BO','Brazil':'BR','Burkina Faso':'BF',
  'Burundi':'BI','Cambodia':'KH','Cameroon':'CM','CAR':'CF',
  'Chad':'TD','Chile':'CL','China':'CN','Colombia':'CO',
  'DRC':'CD','Congo':'CG','Cuba':'CU','Ecuador':'EC','Egypt':'EG',
  'El Salvador':'SV','Eritrea':'ER','Ethiopia':'ET','Ghana':'GH',
  'Guatemala':'GT','Guinea':'GN','Haiti':'HT','Honduras':'HN',
  'India':'IN','Indonesia':'ID','Iran':'IR','Iraq':'IQ',
  'Jordan':'JO','Kazakhstan':'KZ','Kenya':'KE','Laos':'LA',
  'Lebanon':'LB','Liberia':'LR','Libya':'LY','Madagascar':'MG',
  'Malawi':'MW','Malaysia':'MY','Mali':'ML','Mauritania':'MR',
  'Mexico':'MX','Morocco':'MA','Mozambique':'MZ','Myanmar':'MM',
  'Nepal':'NP','Nicaragua':'NI','Niger':'NE','Nigeria':'NG',
  'Pakistan':'PK','Papua New Guinea':'PG','Peru':'PE','Philippines':'PH',
  'Rwanda':'RW','Saudi Arabia':'SA','Senegal':'SN','Sierra Leone':'SL',
  'Somalia':'SO','South Africa':'ZA','South Sudan':'SS','Sri Lanka':'LK',
  'Sudan':'SD','Syria':'SY','Tanzania':'TZ','Thailand':'TH',
  'Togo':'TG','Tunisia':'TN','Turkey':'TR','Turkmenistan':'TM',
  'Uganda':'UG','Ukraine':'UA','Uzbekistan':'UZ','Venezuela':'VE',
  'Vietnam':'VN','Yemen':'YE','Zambia':'ZM','Zimbabwe':'ZW',
};

async function fetchUsdaFood() {
  console.log('Fetching usda_food via World Bank WDI...');
  const byCountryYear = {};

  for (const [country, iso2] of Object.entries(ISO2)) {
    for (const { id, name, direction } of WB_INDICATORS) {
      try {
        const url = `https://api.worldbank.org/v2/country/${iso2}/indicator/${id}?date=1980:2024&format=json&per_page=60`;
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) continue;
        const data = await res.json();
        if (!Array.isArray(data) || !data[1]) continue;

        for (const row of data[1]) {
          if (row.value === null || row.value === undefined) continue;
          const year = parseInt(row.date);
          const value = parseFloat(row.value);
          if (isNaN(value) || isNaN(year)) continue;

          let contribution;
          if (name === 'cereal_yield_kg_ha') {
            contribution = Math.max(0, Math.min(100, 100 - (value / 100)));
          } else if (name === 'food_imports_pct') {
            contribution = Math.min(100, (value / 50) * 100);
          } else if (name === 'undernourishment_pct') {
            contribution = Math.min(100, (value / 70) * 100);
          } else {
            contribution = value;
          }

          const key = `${country}|${year}`;
          if (!byCountryYear[key]) byCountryYear[key] = { country, year, scores: [], iso2 };
          byCountryYear[key].scores.push(contribution * direction);
        }
      } catch (e) { /* silent */ }
      await new Promise(r => setTimeout(r, 100));
    }
  }

  const readings = [];
  for (const { country, year, scores, iso2 } of Object.values(byCountryYear)) {
    if (!scores.length) continue;
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const riskScore = Math.max(0, Math.min(100, avg));
    readings.push({
      country, signal_key: 'usda_food', signal_name: 'Food Security Risk',
      date: `${year}-01-01`, raw_value: parseFloat(riskScore.toFixed(3)),
      raw_metadata: { composite_score: avg, n_indicators: scores.length, iso2, year },
      source: 'World Bank WDI', gap: false, ingested_at: new Date().toISOString(),
    });
  }

  console.log(`Fetched ${readings.length} usda_food readings`);
  return readings;
}

async function saveReadings(readings) {
  if (!readings.length) return 0;
  const seen = new Set();
  const unique = readings.filter(r => {
    const key = `${r.country}|${r.signal_key}|${r.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const { inserted, errors } = await upsertReadings(sb, unique, { batchSize: 500 });
  if (errors.length) errors.forEach(e => console.log(`  Batch ${e.batch} error: ${e.error}`));
  return inserted;
}

async function run() {
  const readings = await fetchUsdaFood();
  await saveReadings(readings);
}

if (require.main === module) { run().catch(console.error); }
module.exports = { fetchUsdaFood, saveReadings };
