// ioda_historical.cjs
// Fetches Internet Outage Detection and Analysis (IODA) data
// Signal: internet_shutdown (Internet Shutdown Score)
// Source: Georgia Tech IODA API (free, no key)
// Coverage: 2011-present, daily → aggregated annually

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

// ISO2 → country name mapping
const COUNTRIES = {
  'AF': 'Afghanistan', 'AL': 'Albania', 'DZ': 'Algeria', 'AO': 'Angola',
  'AR': 'Argentina', 'AM': 'Armenia', 'AZ': 'Azerbaijan', 'BD': 'Bangladesh',
  'BY': 'Belarus', 'BJ': 'Benin', 'BO': 'Bolivia', 'BR': 'Brazil',
  'BF': 'Burkina Faso', 'BI': 'Burundi', 'KH': 'Cambodia', 'CM': 'Cameroon',
  'CF': 'CAR', 'TD': 'Chad', 'CN': 'China', 'CO': 'Colombia',
  'CD': 'DRC', 'CU': 'Cuba', 'EG': 'Egypt', 'ER': 'Eritrea',
  'ET': 'Ethiopia', 'GE': 'Georgia', 'GH': 'Ghana', 'GT': 'Guatemala',
  'GN': 'Guinea', 'HT': 'Haiti', 'HN': 'Honduras', 'IN': 'India',
  'ID': 'Indonesia', 'IR': 'Iran', 'IQ': 'Iraq', 'JO': 'Jordan',
  'KZ': 'Kazakhstan', 'KE': 'Kenya', 'KP': 'North Korea', 'KG': 'Kyrgyzstan',
  'LA': 'Laos', 'LB': 'Lebanon', 'LY': 'Libya', 'MG': 'Madagascar',
  'MW': 'Malawi', 'MY': 'Malaysia', 'ML': 'Mali', 'MR': 'Mauritania',
  'MX': 'Mexico', 'MD': 'Moldova', 'MN': 'Mongolia', 'MA': 'Morocco',
  'MZ': 'Mozambique', 'MM': 'Myanmar', 'NP': 'Nepal', 'NI': 'Nicaragua',
  'NE': 'Niger', 'NG': 'Nigeria', 'OM': 'Oman', 'PK': 'Pakistan',
  'PE': 'Peru', 'PH': 'Philippines', 'RU': 'Russia', 'RW': 'Rwanda',
  'SA': 'Saudi Arabia', 'SN': 'Senegal', 'SL': 'Sierra Leone', 'SO': 'Somalia',
  'ZA': 'South Africa', 'SS': 'South Sudan', 'SD': 'Sudan', 'SY': 'Syria',
  'TJ': 'Tajikistan', 'TZ': 'Tanzania', 'TH': 'Thailand', 'TN': 'Tunisia',
  'TR': 'Turkey', 'TM': 'Turkmenistan', 'UG': 'Uganda', 'UA': 'Ukraine',
  'AE': 'UAE', 'UZ': 'Uzbekistan', 'VE': 'Venezuela',
  'VN': 'Vietnam', 'YE': 'Yemen', 'ZM': 'Zambia', 'ZW': 'Zimbabwe'
};

async function fetchIODA() {
  const readings = [];
  const startYear = 2011;
  const endYear = new Date().getFullYear() - 1;

  console.log('Fetching IODA Internet Outage data...');

  for (const [iso2, country] of Object.entries(COUNTRIES)) {
    try {
      // Fetch one year at a time to keep requests small
      for (let year = startYear; year <= endYear; year++) {
        const startTs = Math.floor(new Date(`${year}-01-01T00:00:00Z`).getTime() / 1000);
        const endTs = Math.floor(new Date(`${year}-12-31T23:59:59Z`).getTime() / 1000);

        const url = `https://api.ioda.inetintel.cc.gatech.edu/v2/signals/raw/country/${iso2}?startTime=${startTs}&endTime=${endTs}&datasource=bgp`;

        const response = await fetch(url, {
          headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) continue;

        const data = await response.json();

        if (data && data.data && data.data.length > 0) {
          // Aggregate: count significant outage events (value deviates significantly from normal)
          const values = data.data.flatMap(series => (series.values || []).filter(v => v !== null));
          if (values.length === 0) continue;

          const mean = values.reduce((a, b) => a + b, 0) / values.length;
          const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
          const stdDev = Math.sqrt(variance);

          // Outage score: proportion of measurements > 2 std devs below mean (anomalies)
          const anomalies = values.filter(v => v < mean - 2 * stdDev).length;
          const outageScore = values.length > 0 ? (anomalies / values.length) * 100 : 0;

          readings.push({
            country,
            signal_key: 'internet_shutdown_ioda',
            signal_name: 'Internet Shutdown Score',
            date: `${year}-01-01`,
            raw_value: Math.round(outageScore * 100) / 100,
            raw_metadata: {
              measurements: values.length,
              anomalies,
              mean_bgp: Math.round(mean * 100) / 100,
              iso2
            },
            source: 'IODA (Georgia Tech)',
            gap: false,
            ingested_at: new Date().toISOString()
          });
        }

        await new Promise(r => setTimeout(r, 100));
      }

      const countryRows = readings.filter(r => r.country === country).length;
      if (countryRows > 0) console.log(`  ${country}: ${countryRows} years`);
    } catch (e) {
      console.log(`  ${country}: Error - ${e.message}`);
    }

    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`Fetched ${readings.length} IODA readings`);
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
      onConflict: 'country,signal_key,date,source'
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
  console.log('IODA Historical Fetcher');
  console.log('═══════════════════════════════════════════════════════════════');

  const readings = await fetchIODA();
  const saved = await saveReadings(readings);

  console.log(`Saved ${saved} readings to database`);
}

if (require.main === module) {
  run().catch(console.error);
}

module.exports = { fetchIODA, saveReadings };
