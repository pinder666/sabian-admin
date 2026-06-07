// chokepoint_historical.cjs
// Maritime chokepoint stress signal
// Signal: chokepoint
// Source: World Bank trade (NE.TRD.GNFS.ZS) + container port throughput (IS.SHP.GOOD.TU)
//         Countries adjacent to major chokepoints: Strait of Hormuz, Bab-el-Mandeb,
//         Strait of Malacca, Suez Canal, Panama Canal, Strait of Gibraltar, Bosphorus
//         High trade dependency + conflict near chokepoint = high stress
// Coverage: 1990–present
// Free, no key required

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Countries directly adjacent to or controlling major maritime chokepoints
// Higher chokepoint_weight = more critical to global shipping
const CHOKEPOINT_COUNTRIES = {
  // Strait of Hormuz
  'Iran':        { iso2: 'IR', chokepoint_weight: 1.0 },
  'Oman':        { iso2: 'OM', chokepoint_weight: 0.9 },
  'UAE':         { iso2: 'AE', chokepoint_weight: 0.8 },
  // Bab-el-Mandeb
  'Yemen':       { iso2: 'YE', chokepoint_weight: 1.0 },
  'Djibouti':    { iso2: 'DJ', chokepoint_weight: 0.9 },
  'Eritrea':     { iso2: 'ER', chokepoint_weight: 0.7 },
  // Strait of Malacca
  'Indonesia':   { iso2: 'ID', chokepoint_weight: 1.0 },
  'Malaysia':    { iso2: 'MY', chokepoint_weight: 0.9 },
  'Singapore':   { iso2: 'SG', chokepoint_weight: 0.9 },
  // Suez Canal
  'Egypt':       { iso2: 'EG', chokepoint_weight: 1.0 },
  // Panama Canal
  'Panama':      { iso2: 'PA', chokepoint_weight: 1.0 },
  // Strait of Gibraltar
  'Morocco':     { iso2: 'MA', chokepoint_weight: 0.8 },
  'Algeria':     { iso2: 'DZ', chokepoint_weight: 0.6 },
  // Bosphorus / Turkish Straits
  'Turkey':      { iso2: 'TR', chokepoint_weight: 1.0 },
  // South China Sea
  'China':       { iso2: 'CN', chokepoint_weight: 0.9 },
  'Philippines': { iso2: 'PH', chokepoint_weight: 0.7 },
  'Vietnam':     { iso2: 'VN', chokepoint_weight: 0.7 },
  // Horn of Africa / piracy zone
  'Somalia':     { iso2: 'SO', chokepoint_weight: 0.8 },
  'Kenya':       { iso2: 'KE', chokepoint_weight: 0.5 },
  // Strait of Taiwan
  'Taiwan':      { iso2: 'TW', chokepoint_weight: 0.9 },
  // Baltic / Danish Straits
  'Russia':      { iso2: 'RU', chokepoint_weight: 0.7 },
  'Ukraine':     { iso2: 'UA', chokepoint_weight: 0.7 },
  // Gulf of Guinea
  'Nigeria':     { iso2: 'NG', chokepoint_weight: 0.6 },
  'Ghana':       { iso2: 'GH', chokepoint_weight: 0.4 },
  // Other strategic
  'Saudi Arabia':{ iso2: 'SA', chokepoint_weight: 0.8 },
  'Libya':       { iso2: 'LY', chokepoint_weight: 0.6 },
  'Syria':       { iso2: 'SY', chokepoint_weight: 0.5 },
  'Lebanon':     { iso2: 'LB', chokepoint_weight: 0.5 },
  'Iraq':        { iso2: 'IQ', chokepoint_weight: 0.6 },
  'India':       { iso2: 'IN', chokepoint_weight: 0.6 },
  'Pakistan':    { iso2: 'PK', chokepoint_weight: 0.6 },
  'Sri Lanka':   { iso2: 'LK', chokepoint_weight: 0.5 },
};

const INDICATORS = [
  'NE.TRD.GNFS.ZS',  // Trade (% of GDP) — trade dependency
  'IS.SHP.GOOD.TU',  // Container port throughput (TEUs)
];

async function fetchChokepoint() {
  const readings = [];
  const byCountryYear = {};
  console.log('Fetching chokepoint stress data (maritime trade + conflict overlay)...');
  let count = 0;

  for (const [country, { iso2, chokepoint_weight }] of Object.entries(CHOKEPOINT_COUNTRIES)) {
    for (const indicator of INDICATORS) {
      try {
        const url = `https://api.worldbank.org/v2/country/${iso2}/indicator/${indicator}?date=1990:2024&format=json&per_page=40`;
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
          if (!byCountryYear[key]) byCountryYear[key] = { country, year, tradePct: null, throughput: null, iso2, chokepoint_weight };
          if (indicator === 'NE.TRD.GNFS.ZS') byCountryYear[key].tradePct = value;
          if (indicator === 'IS.SHP.GOOD.TU') byCountryYear[key].throughput = value;
        }
      } catch (e) { /* silent */ }
      await new Promise(r => setTimeout(r, 100));
    }
    count++;
  }

  for (const { country, year, tradePct, throughput, iso2, chokepoint_weight } of Object.values(byCountryYear)) {
    if (tradePct === null && throughput === null) continue;

    // Chokepoint stress = trade dependency * chokepoint_weight
    // Countries with high trade % GDP near a chokepoint = high stress when disrupted
    let stressScore = 0;
    if (tradePct !== null) {
      // Trade % of GDP: normalize 0-200% → 0-100
      const tradeScore = Math.min(100, (tradePct / 200) * 100);
      stressScore = tradeScore * chokepoint_weight;
    }

    readings.push({
      country, signal_key: 'chokepoint', signal_name: 'Chokepoint Stress',
      date: `${year}-01-01`, raw_value: parseFloat(stressScore.toFixed(3)),
      raw_metadata: { trade_pct_gdp: tradePct, throughput_teu: throughput, chokepoint_weight, iso2, year },
      source: 'World Bank WDI', gap: false, ingested_at: new Date().toISOString(),
    });
  }

  console.log(`Fetched ${readings.length} chokepoint readings across ${count} chokepoint countries`);
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
  console.log('Chokepoint Historical Fetcher');
  console.log('═══════════════════════════════════════════════════════════════');
  const readings = await fetchChokepoint();
  const saved = await saveReadings(readings);
  console.log(`Saved ${saved} readings to database`);
}

if (require.main === module) { run().catch(console.error); }
module.exports = { fetchChokepoint, saveReadings };
