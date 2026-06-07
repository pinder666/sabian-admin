// sovereign_cds_historical.cjs
// Sovereign credit / default risk signal
// Signal: sovereign_cds
// Source: World Bank debt service + external debt indicators
//         DT.TDS.DECT.GD.ZS = Total debt service, % of GNI
//         GC.DOD.TOTL.GD.ZS = Central government debt, % of GDP
//         BN.CAB.XOKA.GD.ZS = Current account balance, % of GDP (negative = deficit = risk)
// Coverage: 1990–present
// Free, no key required

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { sb, upsertReadings } = require('../db.cjs');

// All indicators normalized 0-100 where 100 = maximum risk, weight = +1 (or relative).
// Deficit and reserve shortage are inverted during normalization so all contributions are positive risk.
const INDICATORS = [
  { id: 'DT.TDS.DECT.GD.ZS', weight: 1.5 }, // total debt service % GNI — higher = more risk
  { id: 'GC.DOD.TOTL.GD.ZS', weight: 1.0 }, // govt debt % GDP — higher = more risk
  { id: 'BN.CAB.XOKA.GD.ZS', weight: 1.0 }, // current account % GDP — only deficit contributes risk
  { id: 'FI.RES.TOTL.MO',    weight: 0.8 }, // reserves in months — inverted: lower reserves = more risk
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
  'Kenya':'KE','Kyrgyzstan':'KG','Laos':'LA','Lebanon':'LB',
  'Liberia':'LR','Libya':'LY','Madagascar':'MG','Malawi':'MW',
  'Malaysia':'MY','Mali':'ML','Mauritania':'MR','Mexico':'MX',
  'Moldova':'MD','Mongolia':'MN','Morocco':'MA','Mozambique':'MZ',
  'Myanmar':'MM','Nepal':'NP','Nicaragua':'NI','Niger':'NE',
  'Nigeria':'NG','Oman':'OM','Pakistan':'PK','Papua New Guinea':'PG',
  'Peru':'PE','Philippines':'PH','Russia':'RU','Rwanda':'RW',
  'Saudi Arabia':'SA','Senegal':'SN','Sierra Leone':'SL','Somalia':'SO',
  'South Africa':'ZA','South Sudan':'SS','Sri Lanka':'LK','Sudan':'SD',
  'Syria':'SY','Tajikistan':'TJ','Tanzania':'TZ','Thailand':'TH',
  'Togo':'TG','Tunisia':'TN','Turkey':'TR','Turkmenistan':'TM',
  'Uganda':'UG','Ukraine':'UA','UAE':'AE','Uzbekistan':'UZ',
  'Venezuela':'VE','Vietnam':'VN','Yemen':'YE','Zambia':'ZM','Zimbabwe':'ZW',
};

async function fetchSovereignCDS() {
  const readings = [];
  const byCountryYear = {};
  console.log('Fetching sovereign CDS proxy data (World Bank debt + fiscal indicators)...');
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
          let value = parseFloat(row.value);
          if (isNaN(value)) continue;

          // Normalize each indicator 0-100 where 100 = max risk.
          // Deficit and low-reserves are inverted so all contributions point in the risk direction.
          let normalized;
          if (id === 'DT.TDS.DECT.GD.ZS') {
            // Higher debt service % GNI = more risk. Cap at 50% GNI.
            normalized = Math.min(100, Math.max(0, (value / 50) * 100));
          } else if (id === 'GC.DOD.TOTL.GD.ZS') {
            // Higher govt debt % GDP = more risk. Cap at 200% GDP.
            normalized = Math.min(100, Math.max(0, (value / 200) * 100));
          } else if (id === 'BN.CAB.XOKA.GD.ZS') {
            // Only deficit contributes risk. Surplus = 0 risk contribution.
            // value is negative for deficit (e.g., -10% = 10 units of risk).
            // Cap deficit at 50% of GDP.
            normalized = Math.min(100, Math.max(0, (-value / 50) * 100));
          } else if (id === 'FI.RES.TOTL.MO') {
            // Lower reserves = more risk. Invert: 0 months → 100 risk, 24+ months → 0 risk.
            normalized = Math.min(100, Math.max(0, (1 - Math.min(value, 24) / 24) * 100));
          } else {
            normalized = Math.abs(value);
          }

          const key = `${country}|${year}`;
          if (!byCountryYear[key]) byCountryYear[key] = { country, year, score: 0, totalWeight: 0, iso2 };
          byCountryYear[key].score += normalized * weight;
          byCountryYear[key].totalWeight += Math.abs(weight);
        }
      } catch (e) { /* silent */ }
      await new Promise(r => setTimeout(r, 100));
    }
    count++;
    if (count % 25 === 0) console.log(`  ${count} countries`);
  }

  for (const { country, year, score, totalWeight, iso2 } of Object.values(byCountryYear)) {
    if (totalWeight === 0) continue;
    const riskScore = Math.max(0, Math.min(100, (score / totalWeight)));
    readings.push({
      country, signal_key: 'sovereign_cds', signal_name: 'Sovereign CDS',
      date: `${year}-01-01`, raw_value: parseFloat(riskScore.toFixed(3)),
      raw_metadata: { composite_score: score, total_weight: totalWeight, iso2, year },
      source: 'World Bank WDI (debt/fiscal)', gap: false, ingested_at: new Date().toISOString(),
    });
  }

  console.log(`Fetched ${readings.length} sovereign_cds readings`);
  return readings;
}

async function saveReadings(readings) {
  if (readings.length === 0) return 0;
  const seen = new Set();
  const unique = readings.filter(r => {
    const key = `${r.country}|${r.signal_key}|${r.date}|${r.source}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const { inserted, errors } = await upsertReadings(sb, unique, { batchSize: 500 });
  if (errors.length > 0) errors.forEach(e => console.log(`  Batch ${e.batch} error: ${e.error}`));
  return inserted;
}

async function run() {
  console.log('Sovereign CDS Historical Fetcher');
  console.log('═══════════════════════════════════════════════════════════════');
  const readings = await fetchSovereignCDS();
  const saved = await saveReadings(readings);
  console.log(`Saved ${saved} readings to database`);
}

if (require.main === module) { run().catch(console.error); }
module.exports = { fetchSovereignCDS, saveReadings };
