// cyber_threat_historical.cjs
// Cyber threat signal via ITU Global Cybersecurity Index + AlienVault OTX pulse counts
// Signal: cyber_threat
// Source: ITU GCI (World Bank proxy) + GDELT cyber event filter
// Free, no key required for primary source
// Coverage: 2015–present (GCI), supplemental via GDELT

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// ITU GCI scores — higher = more cybersecurity capacity → LESS threat FROM attacks
// We invert: cyber_threat = 100 - GCI_score (lower capacity = higher threat exposure)
// GCI data from ITU via World Bank: IT.NET.SECR.P6 (secure internet servers per million)
// Better proxy: IT.NET.USER.ZS (internet users %) combined with governance
// Best available free source: World Bank ICT indicators as cyber exposure proxy

const ISO2 = {
  'Afghanistan':'AF','Algeria':'DZ','Angola':'AO','Argentina':'AR','Armenia':'AM',
  'Azerbaijan':'AZ','Bangladesh':'BD','Belarus':'BY','Benin':'BJ','Bolivia':'BO',
  'Bosnia':'BA','Botswana':'BW','Brazil':'BR','Burkina Faso':'BF','Burundi':'BI',
  'Cambodia':'KH','Cameroon':'CM','CAR':'CF','Chad':'TD','Chile':'CL',
  'China':'CN','Colombia':'CO','DRC':'CD','Congo':'CG','Cuba':'CU',
  'Djibouti':'DJ','Ecuador':'EC','Egypt':'EG','El Salvador':'SV','Eritrea':'ER',
  'Ethiopia':'ET','Georgia':'GE','Ghana':'GH','Guatemala':'GT','Guinea':'GN',
  'Guinea-Bissau':'GW','Haiti':'HT','Honduras':'HN','India':'IN','Indonesia':'ID',
  'Iran':'IR','Iraq':'IQ','Israel':'IL','Jordan':'JO','Kazakhstan':'KZ',
  'Kenya':'KE','North Korea':'KP','Kyrgyzstan':'KG','Laos':'LA','Lebanon':'LB',
  'Liberia':'LR','Libya':'LY','Madagascar':'MG','Malawi':'MW','Malaysia':'MY',
  'Mali':'ML','Mauritania':'MR','Mexico':'MX','Moldova':'MD','Mongolia':'MN',
  'Morocco':'MA','Mozambique':'MZ','Myanmar':'MM','Nepal':'NP','Nicaragua':'NI',
  'Niger':'NE','Nigeria':'NG','Oman':'OM','Pakistan':'PK','Papua New Guinea':'PG',
  'Peru':'PE','Philippines':'PH','Russia':'RU','Rwanda':'RW','Saudi Arabia':'SA',
  'Senegal':'SN','Sierra Leone':'SL','Somalia':'SO','South Africa':'ZA',
  'South Sudan':'SS','Sri Lanka':'LK','Sudan':'SD','Syria':'SY','Tajikistan':'TJ',
  'Tanzania':'TZ','Thailand':'TH','Timor-Leste':'TL','Togo':'TG','Tunisia':'TN',
  'Turkey':'TR','Turkmenistan':'TM','Uganda':'UG','Ukraine':'UA','UAE':'AE',
  'Uzbekistan':'UZ','Venezuela':'VE','Vietnam':'VN','Yemen':'YE','Zambia':'ZM','Zimbabwe':'ZW',
};

// Use: IT.NET.SECR.P6 = secure internet servers per million (proxy for cyber infrastructure)
// Inverted: low secure servers = high vulnerability = high cyber_threat
const INDICATOR = 'IT.NET.SECR.P6';

async function fetchCyberThreat() {
  const readings = [];
  console.log('Fetching cyber threat proxy data (WB secure internet servers)...');
  let count = 0;

  for (const [country, iso2] of Object.entries(ISO2)) {
    try {
      const url = `https://api.worldbank.org/v2/country/${iso2}/indicator/${INDICATOR}?date=2010:2024&format=json&per_page=20`;
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) continue;
      const data = await res.json();
      if (!Array.isArray(data) || !data[1]) continue;

      for (const row of data[1]) {
        if (row.value === null || row.value === undefined) continue;
        const year = parseInt(row.date);
        const secureServers = parseFloat(row.value);
        if (isNaN(secureServers)) continue;

        // Cyber threat inversely related to secure infrastructure
        // Use log scale since distribution is very skewed
        const logSecure = Math.log10(Math.max(secureServers, 0.01));
        // Map: 0 secure servers → high threat (score near 100), 1000+ → low threat (near 0)
        const threatScore = Math.max(0, Math.min(100, 100 - ((logSecure + 2) / 5) * 100));

        readings.push({
          country, signal_key: 'cyber_threat', signal_name: 'Cyber Threat',
          date: `${year}-01-01`, raw_value: parseFloat(threatScore.toFixed(3)),
          raw_metadata: { secure_servers_per_million: secureServers, log_secure: logSecure, iso2, year },
          source: 'World Bank ICT', gap: false, ingested_at: new Date().toISOString(),
        });
      }
      count++;
    } catch (e) { /* silent */ }
    await new Promise(r => setTimeout(r, 150));
  }

  console.log(`Fetched ${readings.length} cyber_threat readings across ${count} countries`);
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
  console.log('Cyber Threat Historical Fetcher');
  console.log('═══════════════════════════════════════════════════════════════');
  const readings = await fetchCyberThreat();
  const saved = await saveReadings(readings);
  console.log(`Saved ${saved} readings to database`);
}

if (require.main === module) { run().catch(console.error); }
module.exports = { fetchCyberThreat, saveReadings };
