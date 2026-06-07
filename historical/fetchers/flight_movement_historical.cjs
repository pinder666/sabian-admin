// flight_movement_historical.cjs
// Flight movement disruption signal
// Signal: flight_movement
// Source: World Bank air transport passengers (IS.AIR.PSGR) +
//         air freight (IS.AIR.GOOD.MT.K1) + air carrier departures (IS.AIR.DPRT)
//         Sudden drop in flights = indicator of crisis/conflict disruption
// Coverage: 1970–present
// Free, no key required

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const INDICATORS = [
  { id: 'IS.AIR.PSGR',     name: 'air_passengers' },   // Air transport, passengers carried
  { id: 'IS.AIR.DPRT',     name: 'air_departures' },   // Air transport, registered carrier departures
  { id: 'IS.AIR.GOOD.MT.K1', name: 'air_freight_mt' }, // Air freight, metric ton-km
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

async function fetchFlightMovement() {
  const readings = [];
  const byCountryYear = {};
  console.log('Fetching flight movement data (World Bank air transport)...');
  let count = 0;

  for (const [country, iso2] of Object.entries(ISO2)) {
    for (const { id, name } of INDICATORS) {
      try {
        const url = `https://api.worldbank.org/v2/country/${iso2}/indicator/${id}?date=1970:2024&format=json&per_page=60`;
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) continue;
        const data = await res.json();
        if (!Array.isArray(data) || !data[1]) continue;

        for (const row of data[1]) {
          if (row.value === null || row.value === undefined) continue;
          const year = parseInt(row.date);
          const value = parseFloat(row.value);
          if (isNaN(value) || value < 0) continue;

          const key = `${country}|${year}`;
          if (!byCountryYear[key]) byCountryYear[key] = { country, year, vals: {}, iso2 };
          byCountryYear[key].vals[name] = value;
        }
      } catch (e) { /* silent */ }
      await new Promise(r => setTimeout(r, 100));
    }
    count++;
    if (count % 25 === 0) console.log(`  ${count} countries`);
  }

  // Build time series per country to detect year-over-year drops
  const byCountry = {};
  for (const { country, year, vals, iso2 } of Object.values(byCountryYear)) {
    if (!byCountry[country]) byCountry[country] = { iso2, years: {} };
    byCountry[country].years[year] = vals;
  }

  for (const [country, { iso2, years }] of Object.entries(byCountry)) {
    const sortedYears = Object.keys(years).map(Number).sort();
    for (let i = 0; i < sortedYears.length; i++) {
      const year = sortedYears[i];
      const cur = years[year];
      const prev = i > 0 ? years[sortedYears[i - 1]] : null;

      // Primary metric: air passengers (most consistent coverage)
      const curPax = cur.air_passengers || cur.air_departures || null;
      const prevPax = prev ? (prev.air_passengers || prev.air_departures || null) : null;

      let disruptionScore = 0;
      if (curPax !== null && prevPax !== null && prevPax > 0) {
        const yoyChange = (curPax - prevPax) / prevPax;
        // Negative change = disruption. -50% drop → score 100
        if (yoyChange < 0) {
          disruptionScore = Math.min(100, Math.abs(yoyChange) * 200);
        }
      } else if (curPax !== null) {
        // No prior year: normalize absolute level (low absolute = lower connectivity = higher disruption risk)
        const logPax = Math.log10(Math.max(curPax, 1));
        // log10(100M) = 8 → very high connectivity = low risk
        disruptionScore = Math.max(0, Math.min(100, 100 - (logPax / 8) * 100));
      }

      const metadata = { iso2, year };
      if (cur.air_passengers) metadata.air_passengers = cur.air_passengers;
      if (cur.air_departures) metadata.air_departures = cur.air_departures;
      if (cur.air_freight_mt) metadata.air_freight_mt = cur.air_freight_mt;
      if (prevPax) metadata.prev_passengers = prevPax;

      readings.push({
        country, signal_key: 'flight_movement', signal_name: 'Flight Movement',
        date: `${year}-01-01`, raw_value: parseFloat(disruptionScore.toFixed(3)),
        raw_metadata: metadata,
        source: 'World Bank WDI', gap: false, ingested_at: new Date().toISOString(),
      });
    }
  }

  console.log(`Fetched ${readings.length} flight_movement readings`);
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
  console.log('Flight Movement Historical Fetcher');
  console.log('═══════════════════════════════════════════════════════════════');
  const readings = await fetchFlightMovement();
  const saved = await saveReadings(readings);
  console.log(`Saved ${saved} readings to database`);
}

if (require.main === module) { run().catch(console.error); }
module.exports = { fetchFlightMovement, saveReadings };
