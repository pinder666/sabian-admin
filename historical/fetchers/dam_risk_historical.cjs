// dam_risk_historical.cjs
// Dam failure / water infrastructure risk signal
// Signal: dam_risk
// Source: World Bank freshwater withdrawal (ER.H2O.FWTL.ZS) +
//         World Bank improved water source access (SH.H2O.BASW.ZS)
//         + GDP per capita as infrastructure maintenance proxy (NY.GDP.PCAP.CD)
// High withdrawal + low GDP + low water access = high dam risk
// Coverage: 1990–present
// Free, no key required

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const INDICATORS = [
  { id: 'ER.H2O.FWTL.ZS',  weight: +1.5 }, // freshwater withdrawal % renewable resources (high = strain)
  { id: 'SH.H2O.BASW.ZS',  weight: -1.0 }, // basic water service access (high = safer infrastructure)
  { id: 'NY.GDP.PCAP.CD',   weight: -0.5 }, // GDP per capita (proxy: richer = better dam maintenance)
];

const ISO2 = {
  'Afghanistan':'AF','Algeria':'DZ','Angola':'AO','Argentina':'AR','Armenia':'AM',
  'Azerbaijan':'AZ','Bangladesh':'BD','Bolivia':'BO','Brazil':'BR',
  'Burkina Faso':'BF','Burundi':'BI','Cambodia':'KH','Cameroon':'CM',
  'CAR':'CF','Chad':'TD','Chile':'CL','China':'CN','Colombia':'CO',
  'DRC':'CD','Congo':'CG','Ecuador':'EC','Egypt':'EG','El Salvador':'SV',
  'Eritrea':'ER','Ethiopia':'ET','Georgia':'GE','Ghana':'GH',
  'Guatemala':'GT','Guinea':'GN','Haiti':'HT','Honduras':'HN',
  'India':'IN','Indonesia':'ID','Iran':'IR','Iraq':'IQ','Israel':'IL',
  'Jordan':'JO','Kazakhstan':'KZ','Kenya':'KE','Kyrgyzstan':'KG',
  'Laos':'LA','Lebanon':'LB','Liberia':'LR','Libya':'LY',
  'Madagascar':'MG','Malawi':'MW','Malaysia':'MY','Mali':'ML',
  'Mauritania':'MR','Mexico':'MX','Moldova':'MD','Mongolia':'MN',
  'Morocco':'MA','Mozambique':'MZ','Myanmar':'MM','Nepal':'NP',
  'Nicaragua':'NI','Niger':'NE','Nigeria':'NG','Oman':'OM',
  'Pakistan':'PK','Papua New Guinea':'PG','Peru':'PE','Philippines':'PH',
  'Russia':'RU','Rwanda':'RW','Saudi Arabia':'SA','Senegal':'SN',
  'Sierra Leone':'SL','Somalia':'SO','South Africa':'ZA','South Sudan':'SS',
  'Sri Lanka':'LK','Sudan':'SD','Syria':'SY','Tajikistan':'TJ',
  'Tanzania':'TZ','Thailand':'TH','Togo':'TG','Tunisia':'TN',
  'Turkey':'TR','Turkmenistan':'TM','Uganda':'UG','Ukraine':'UA',
  'UAE':'AE','Uzbekistan':'UZ','Venezuela':'VE','Vietnam':'VN',
  'Yemen':'YE','Zambia':'ZM','Zimbabwe':'ZW',
};

async function fetchDamRisk() {
  const readings = [];
  const byCountryYear = {};
  console.log('Fetching dam risk proxy data (World Bank water infrastructure)...');
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

          // Normalize GDP per capita (log scale): log10(100000)=5, scale to 0-100
          if (id === 'NY.GDP.PCAP.CD') {
            value = Math.min(100, (Math.log10(Math.max(value, 1)) / 5) * 100);
          }

          const key = `${country}|${year}`;
          if (!byCountryYear[key]) byCountryYear[key] = { country, year, score: 0, n: 0, iso2 };
          byCountryYear[key].score += value * weight;
          byCountryYear[key].n++;
        }
      } catch (e) { /* silent */ }
      await new Promise(r => setTimeout(r, 100));
    }
    count++;
    if (count % 25 === 0) console.log(`  ${count} countries`);
  }

  for (const { country, year, score, iso2, n } of Object.values(byCountryYear)) {
    if (n === 0) continue;
    const riskScore = Math.max(0, Math.min(100, score));
    readings.push({
      country, signal_key: 'dam_risk', signal_name: 'Dam Risk',
      date: `${year}-01-01`, raw_value: parseFloat(riskScore.toFixed(3)),
      raw_metadata: { composite_score: score, n_indicators: n, iso2, year },
      source: 'World Bank WDI', gap: false, ingested_at: new Date().toISOString(),
    });
  }

  console.log(`Fetched ${readings.length} dam_risk readings`);
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
  console.log('Dam Risk Historical Fetcher');
  console.log('═══════════════════════════════════════════════════════════════');
  const readings = await fetchDamRisk();
  const saved = await saveReadings(readings);
  console.log(`Saved ${saved} readings to database`);
}

if (require.main === module) { run().catch(console.error); }
module.exports = { fetchDamRisk, saveReadings };
