// prediction_market_historical.cjs
// Prediction market / forward risk signal
// Signal: prediction_market
// Source: World Bank economic instability indicators as forward-risk proxy
//         NY.GDP.PCAP.CD = GDP per capita (YoY decline → rising instability risk)
//         SL.UEM.TOTL.ZS = Unemployment (rising → more instability)
//         GC.XPN.TOTL.GD.ZS = Government expenditure % GDP (fiscal pressure)
//         FP.CPI.TOTL.ZG = Inflation rate (high inflation → instability)
// All confirmed available in WB API
// Coverage: 1990–present
// Free, no key required

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const INDICATORS = [
  { id: 'NY.GDP.PCAP.CD',    name: 'gdp_per_capita' },    // for YoY trend
  { id: 'SL.UEM.TOTL.ZS',   name: 'unemployment_pct' },  // unemployment
  { id: 'FP.CPI.TOTL.ZG',   name: 'inflation_pct' },     // inflation rate
  { id: 'GC.XPN.TOTL.GD.ZS', name: 'govt_expenditure' }, // government expenditure
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

async function fetchPredictionMarket() {
  const byCountry = {};
  console.log('Fetching prediction market proxy (WB economic instability indicators)...');
  let count = 0;

  for (const [country, iso2] of Object.entries(ISO2)) {
    byCountry[country] = { iso2, years: {} };

    for (const { id, name } of INDICATORS) {
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
          if (!byCountry[country].years[year]) byCountry[country].years[year] = {};
          byCountry[country].years[year][name] = value;
        }
      } catch (e) { /* silent */ }
      await new Promise(r => setTimeout(r, 100));
    }
    count++;
    if (count % 25 === 0) console.log(`  ${count} countries`);
  }

  const readings = [];

  for (const [country, { iso2, years }] of Object.entries(byCountry)) {
    const sortedYears = Object.keys(years).map(Number).sort();

    for (let i = 0; i < sortedYears.length; i++) {
      const year = sortedYears[i];
      const cur = years[year];
      const prev = i > 0 ? years[sortedYears[i - 1]] : null;

      let riskScore = 0;
      let components = 0;

      // GDP per capita decline (key instability predictor)
      const curGDP = cur.gdp_per_capita;
      const prevGDP = prev?.gdp_per_capita;
      if (curGDP !== undefined && prevGDP && prevGDP > 0) {
        const yoyChange = (curGDP - prevGDP) / prevGDP;
        // Decline → risk. -20% decline → score 60, -50% → score 100
        if (yoyChange < 0) {
          riskScore += Math.min(100, Math.abs(yoyChange) * 3 * 100);
        }
        components++;
      } else if (curGDP !== undefined) {
        // Low absolute GDP → higher risk baseline
        const logGDP = Math.log10(Math.max(curGDP, 1));
        riskScore += Math.max(0, 100 - (logGDP / 5) * 60); // log10(100000)=5
        components++;
      }

      // Unemployment
      if (cur.unemployment_pct !== undefined) {
        riskScore += Math.min(100, (cur.unemployment_pct / 40) * 100);
        components++;
      }

      // Inflation (high = instability signal)
      if (cur.inflation_pct !== undefined) {
        const inf = cur.inflation_pct;
        if (inf > 0) {
          riskScore += Math.min(100, (Math.log10(Math.max(inf, 1)) / Math.log10(1000)) * 100);
          components++;
        }
      }

      if (components === 0) continue;

      const meta = { iso2, year };
      if (cur.gdp_per_capita) meta.gdp_per_capita = cur.gdp_per_capita;
      if (cur.unemployment_pct) meta.unemployment_pct = cur.unemployment_pct;
      if (cur.inflation_pct) meta.inflation_pct = cur.inflation_pct;
      if (prevGDP) meta.prev_gdp = prevGDP;

      readings.push({
        country, signal_key: 'prediction_market', signal_name: 'Prediction Market',
        date: `${year}-01-01`, raw_value: parseFloat(Math.min(100, riskScore / components).toFixed(3)),
        raw_metadata: meta,
        source: 'World Bank WDI (economic instability proxy)', gap: false, ingested_at: new Date().toISOString(),
      });
    }
  }

  console.log(`Fetched ${readings.length} prediction_market readings`);
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
  console.log('Prediction Market Historical Fetcher');
  console.log('═══════════════════════════════════════════════════════════════');
  const readings = await fetchPredictionMarket();
  const saved = await saveReadings(readings);
  console.log(`Saved ${saved} readings to database`);
}

if (require.main === module) { run().catch(console.error); }
module.exports = { fetchPredictionMarket, saveReadings };
