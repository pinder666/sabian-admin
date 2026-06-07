// cable_disruption_historical.cjs
// Internet/cable infrastructure disruption signal
// Signal: cable_disruption
// Source: World Bank IT.NET.BBND.P2 (fixed broadband per 100) + IT.NET.USER.ZS (internet users %)
//         Year-over-year drop in internet access = disruption event
//         Also: IT.CEL.SETS.P2 (mobile subscriptions) as connectivity baseline
// Coverage: 2000–present
// Free, no key required

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const INDICATORS = [
  { id: 'IT.NET.BBND.P2',   name: 'broadband_per100' },    // fixed broadband per 100 people
  { id: 'IT.NET.USER.ZS',   name: 'internet_users_pct' },  // internet users % of population
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

async function fetchCableDisruption() {
  const byCountry = {};
  console.log('Fetching cable/internet disruption proxy (World Bank connectivity YoY)...');
  let count = 0;

  for (const [country, iso2] of Object.entries(ISO2)) {
    byCountry[country] = { iso2, years: {} };

    for (const { id, name } of INDICATORS) {
      try {
        const url = `https://api.worldbank.org/v2/country/${iso2}/indicator/${id}?date=2000:2024&format=json&per_page=30`;
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

      // Primary: broadband. Fallback: internet users.
      const curVal = cur.broadband_per100 ?? cur.internet_users_pct ?? null;
      const prevVal = prev ? (prev.broadband_per100 ?? prev.internet_users_pct ?? null) : null;

      let disruptionScore = 0;

      if (curVal !== null && prevVal !== null && prevVal > 0) {
        const yoyChange = (curVal - prevVal) / prevVal;
        if (yoyChange < 0) {
          // A negative YoY change in internet access = disruption event
          disruptionScore = Math.min(100, Math.abs(yoyChange) * 500); // -20% drop → score 100
        }
        // Also flag very low absolute connectivity (always vulnerable to disruption)
        const absRisk = Math.max(0, 100 - curVal * 5); // < 20 broadband per 100 → risk
        disruptionScore = Math.max(disruptionScore, absRisk * 0.3); // blend
      } else if (curVal !== null) {
        // No prior year: use absolute level as baseline risk
        disruptionScore = Math.max(0, Math.min(100, 100 - curVal * 3));
      }

      const meta = { iso2, year };
      if (cur.broadband_per100 !== undefined) meta.broadband_per100 = cur.broadband_per100;
      if (cur.internet_users_pct !== undefined) meta.internet_users_pct = cur.internet_users_pct;
      if (prevVal !== null) meta.prev_val = prevVal;

      readings.push({
        country, signal_key: 'cable_disruption', signal_name: 'Cable Disruption',
        date: `${year}-01-01`, raw_value: parseFloat(disruptionScore.toFixed(3)),
        raw_metadata: meta,
        source: 'World Bank WDI (internet connectivity)', gap: false, ingested_at: new Date().toISOString(),
      });
    }
  }

  console.log(`Fetched ${readings.length} cable_disruption readings`);
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
  console.log('Cable Disruption Historical Fetcher');
  console.log('═══════════════════════════════════════════════════════════════');
  const readings = await fetchCableDisruption();
  const saved = await saveReadings(readings);
  console.log(`Saved ${saved} readings to database`);
}

if (require.main === module) { run().catch(console.error); }
module.exports = { fetchCableDisruption, saveReadings };
