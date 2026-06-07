// eia_historical.cjs
// Fetches EIA international energy data
// Signal: energy_stress (Energy Stress)
// Source: EIA API v2
// Coverage: 1980-present, all countries in a few paginated requests

require('dotenv').config({ path: '../../.env' });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EIA_KEY = process.env.EIA_API_KEY || process.env.EIA_API || 'DEMO_KEY';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

// EIA ISO3 → display name for countries we track
const COUNTRY_MAP = {
  'AFG': 'Afghanistan', 'DZA': 'Algeria', 'AGO': 'Angola', 'ARG': 'Argentina',
  'AZE': 'Azerbaijan', 'BGD': 'Bangladesh', 'BLR': 'Belarus', 'BOL': 'Bolivia',
  'BRA': 'Brazil', 'CMR': 'Cameroon', 'CHL': 'Chile', 'CHN': 'China',
  'COL': 'Colombia', 'COD': 'DRC', 'ECU': 'Ecuador', 'EGY': 'Egypt',
  'ETH': 'Ethiopia', 'GHA': 'Ghana', 'GTM': 'Guatemala', 'IND': 'India',
  'IDN': 'Indonesia', 'IRN': 'Iran', 'IRQ': 'Iraq', 'ISR': 'Israel',
  'JOR': 'Jordan', 'KAZ': 'Kazakhstan', 'KEN': 'Kenya', 'KWT': 'Kuwait',
  'LBY': 'Libya', 'MYS': 'Malaysia', 'MEX': 'Mexico', 'MAR': 'Morocco',
  'MOZ': 'Mozambique', 'MMR': 'Myanmar', 'NGA': 'Nigeria', 'OMN': 'Oman',
  'PAK': 'Pakistan', 'PER': 'Peru', 'PHL': 'Philippines', 'QAT': 'Qatar',
  'RUS': 'Russia', 'SAU': 'Saudi Arabia', 'ZAF': 'South Africa', 'SDN': 'Sudan',
  'SYR': 'Syria', 'THA': 'Thailand', 'TUN': 'Tunisia', 'TUR': 'Turkey',
  'TKM': 'Turkmenistan', 'UKR': 'Ukraine', 'ARE': 'UAE',
  'UZB': 'Uzbekistan', 'VEN': 'Venezuela', 'VNM': 'Vietnam', 'YEM': 'Yemen',
  'ZMB': 'Zambia', 'ZWE': 'Zimbabwe'
};

async function fetchEIA() {
  const readings = [];

  console.log('Fetching EIA energy data (all countries, paginated)...');

  // Request all countries at once — no per-country facet filter
  // Paginate through results in chunks of 5000
  const PAGE_SIZE = 5000;
  let offset = 0;
  let totalRows = null;

  while (true) {
    try {
      const url = `https://api.eia.gov/v2/international/data/?api_key=${EIA_KEY}&frequency=annual&data[0]=value&facets[activityId][]=1&facets[productId][]=44&start=1980&end=2023&sort[0][column]=period&sort[0][direction]=asc&length=${PAGE_SIZE}&offset=${offset}`;

      const response = await fetch(url);
      if (!response.ok) {
        console.log(`  API error ${response.status} at offset ${offset}`);
        break;
      }

      const data = await response.json();

      if (!data || !data.response || !data.response.data) break;

      const rows = data.response.data;
      if (totalRows === null) {
        totalRows = data.response.total;
        console.log(`  Total EIA rows available: ${totalRows}`);
      }

      let pageMatched = 0;
      for (const row of rows) {
        const iso3 = row.countryRegionId || row['countryRegionId'];
        const country = COUNTRY_MAP[iso3];
        if (!country) continue;

        const year = row.period;
        const value = parseFloat(row.value);

        if (year && !isNaN(value)) {
          readings.push({
            country,
            signal_key: 'energy_stress',
            signal_name: 'Energy Stress',
            date: `${year}-01-01`,
            raw_value: value,
            raw_metadata: {
              unit: row.unit || 'Quadrillion Btu',
              iso3
            },
            source: 'EIA',
            gap: false,
            ingested_at: new Date().toISOString()
          });
          pageMatched++;
        }
      }

      console.log(`  Offset ${offset}: ${rows.length} rows, ${pageMatched} matched our countries`);

      offset += rows.length;
      if (offset >= totalRows || rows.length < PAGE_SIZE) break;

      // EIA rate limit: ~1s between paged requests is safe
      await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
      console.log(`  Error at offset ${offset}: ${e.message}`);
      break;
    }
  }

  console.log(`Fetched ${readings.length} energy readings`);
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

  console.log(`Deduped: ${readings.length} -> ${unique.length}`);

  const chunks = [];
  for (let i = 0; i < unique.length; i += 500) {
    chunks.push(unique.slice(i, i + 500));
  }

  let saved = 0;
  for (const chunk of chunks) {
    const { error } = await sb.from('historical_signal_readings').upsert(chunk, {
      onConflict: 'country,signal_key,date'
    });
    if (error) {
      console.log('Upsert error:', error.message);
    } else {
      saved += chunk.length;
    }
  }

  return saved;
}

async function run() {
  console.log('EIA Historical Fetcher');
  console.log('═══════════════════════════════════════════════════════════════');

  const readings = await fetchEIA();
  const saved = await saveReadings(readings);

  console.log(`Saved ${saved} readings to database`);
}

if (require.main === module) {
  run().catch(console.error);
}

module.exports = { fetchEIA, saveReadings };
