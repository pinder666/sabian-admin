// flood_risk_historical.cjs
// Flood / climate disaster risk signal
// Signal: flood_risk
// Source: World Bank precipitation + water access + urban exposure indicators
//         AG.LND.PRCP.MM = Average precipitation (mm/year) — high = flood exposure
//         SH.H2O.BASW.ZS = Basic water service access (inverted: low = higher vulnerability)
//         SP.URB.TOTL.IN.ZS = Urban population % (high density = more flood impact)
//         VC.IDP.NWDP = IDP by natural disasters (where available)
// Coverage: 1990–present
// Free, no key required

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const INDICATORS = [
  { id: 'AG.LND.PRCP.MM',  weight: +1.0 }, // annual precipitation (high = flood exposure)
  { id: 'SH.H2O.BASW.ZS',  weight: -1.0 }, // water service access (inverted: low = more vulnerable)
  { id: 'SP.URB.TOTL.IN.ZS', weight: +0.5 }, // urban population % (high density = more flood impact)
  { id: 'VC.IDP.NWDP',     weight: +1.5 }, // IDP by natural disasters (primary if available)
];

const ISO2 = {
  'Afghanistan':'AF','Algeria':'DZ','Angola':'AO','Argentina':'AR','Armenia':'AM',
  'Azerbaijan':'AZ','Bangladesh':'BD','Bolivia':'BO','Brazil':'BR',
  'Burkina Faso':'BF','Burundi':'BI','Cambodia':'KH','Cameroon':'CM',
  'CAR':'CF','Chad':'TD','Chile':'CL','China':'CN','Colombia':'CO',
  'DRC':'CD','Congo':'CG','Cuba':'CU','Djibouti':'DJ','Ecuador':'EC',
  'Egypt':'EG','El Salvador':'SV','Eritrea':'ER','Ethiopia':'ET',
  'Georgia':'GE','Ghana':'GH','Guatemala':'GT','Guinea':'GN',
  'Guinea-Bissau':'GW','Haiti':'HT','Honduras':'HN','India':'IN',
  'Indonesia':'ID','Iran':'IR','Iraq':'IQ','Israel':'IL','Jordan':'JO',
  'Kazakhstan':'KZ','Kenya':'KE','Kyrgyzstan':'KG','Laos':'LA',
  'Lebanon':'LB','Liberia':'LR','Libya':'LY','Madagascar':'MG',
  'Malawi':'MW','Malaysia':'MY','Mali':'ML','Mauritania':'MR',
  'Mexico':'MX','Moldova':'MD','Mongolia':'MN','Morocco':'MA',
  'Mozambique':'MZ','Myanmar':'MM','Nepal':'NP','Nicaragua':'NI',
  'Niger':'NE','Nigeria':'NG','Oman':'OM','Pakistan':'PK',
  'Papua New Guinea':'PG','Peru':'PE','Philippines':'PH',
  'Russia':'RU','Rwanda':'RW','Saudi Arabia':'SA','Senegal':'SN',
  'Sierra Leone':'SL','Solomon Islands':'SB','Somalia':'SO',
  'South Africa':'ZA','South Sudan':'SS','Sri Lanka':'LK',
  'Sudan':'SD','Syria':'SY','Tajikistan':'TJ','Tanzania':'TZ',
  'Thailand':'TH','Timor-Leste':'TL','Togo':'TG','Tunisia':'TN',
  'Turkey':'TR','Turkmenistan':'TM','Uganda':'UG','Ukraine':'UA',
  'UAE':'AE','Uzbekistan':'UZ','Venezuela':'VE','Vietnam':'VN',
  'Yemen':'YE','Zambia':'ZM','Zimbabwe':'ZW',
};

async function fetchFloodRisk() {
  const readings = [];
  const byCountryYear = {};
  console.log('Fetching flood risk data (World Bank precipitation + water access + urban exposure)...');
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

          // Normalize each indicator to 0-100 contribution
          let normalized;
          if (id === 'AG.LND.PRCP.MM') normalized = Math.min(100, (value / 3000) * 100); // 0-3000mm range
          else if (id === 'SH.H2O.BASW.ZS') normalized = Math.min(100, value); // already 0-100%
          else if (id === 'SP.URB.TOTL.IN.ZS') normalized = Math.min(100, value); // already 0-100%
          else if (id === 'VC.IDP.NWDP') {
            // IDP by disaster: log normalize
            normalized = Math.min(100, (Math.log10(Math.max(value, 1)) / 6.7) * 100);
          } else normalized = value;

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
      country, signal_key: 'flood_risk', signal_name: 'Flood Risk',
      date: `${year}-01-01`, raw_value: parseFloat(riskScore.toFixed(3)),
      raw_metadata: {
        precip_mm: vals['AG.LND.PRCP.MM'],
        water_access_pct: vals['SH.H2O.BASW.ZS'],
        urban_pct: vals['SP.URB.TOTL.IN.ZS'],
        idp_disaster: vals['VC.IDP.NWDP'],
        iso2, year
      },
      source: 'World Bank WDI', gap: false, ingested_at: new Date().toISOString(),
    });
  }

  console.log(`Fetched ${readings.length} flood_risk readings`);
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
  console.log('Flood Risk Historical Fetcher');
  console.log('═══════════════════════════════════════════════════════════════');
  const readings = await fetchFloodRisk();
  const saved = await saveReadings(readings);
  console.log(`Saved ${saved} readings to database`);
}

if (require.main === module) { run().catch(console.error); }
module.exports = { fetchFloodRisk, saveReadings };
