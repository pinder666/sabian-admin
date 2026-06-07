// tor_historical.cjs
// Fetches Tor Project Metrics data
// Signal: tor_censorship (Tor Censorship)
// Source: Tor Project Metrics API
// Coverage: 2011-present

require('dotenv').config({ path: '../../.env' });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

// Country codes for Tor metrics
const COUNTRIES = {
  'af': 'Afghanistan', 'al': 'Albania', 'dz': 'Algeria', 'ao': 'Angola',
  'ar': 'Argentina', 'am': 'Armenia', 'az': 'Azerbaijan', 'bd': 'Bangladesh',
  'by': 'Belarus', 'bj': 'Benin', 'bo': 'Bolivia', 'ba': 'Bosnia',
  'br': 'Brazil', 'bg': 'Bulgaria', 'bf': 'Burkina Faso', 'bi': 'Burundi',
  'kh': 'Cambodia', 'cm': 'Cameroon', 'cf': 'CAR', 'td': 'Chad',
  'cl': 'Chile', 'cn': 'China', 'co': 'Colombia', 'cd': 'DRC',
  'cg': 'Congo', 'cr': 'Costa Rica', 'ci': 'Ivory Coast', 'cu': 'Cuba',
  'cy': 'Cyprus', 'cz': 'Czech Republic', 'dj': 'Djibouti', 'do': 'Dominican Republic',
  'ec': 'Ecuador', 'eg': 'Egypt', 'sv': 'El Salvador', 'er': 'Eritrea',
  'et': 'Ethiopia', 'ge': 'Georgia', 'gh': 'Ghana', 'gr': 'Greece',
  'gt': 'Guatemala', 'gn': 'Guinea', 'gw': 'Guinea-Bissau', 'ht': 'Haiti',
  'hn': 'Honduras', 'hu': 'Hungary', 'in': 'India', 'id': 'Indonesia',
  'ir': 'Iran', 'iq': 'Iraq', 'il': 'Israel', 'jo': 'Jordan',
  'kz': 'Kazakhstan', 'ke': 'Kenya', 'kp': 'North Korea', 'kr': 'South Korea',
  'kw': 'Kuwait', 'kg': 'Kyrgyzstan', 'la': 'Laos', 'lb': 'Lebanon',
  'lr': 'Liberia', 'ly': 'Libya', 'mg': 'Madagascar', 'mw': 'Malawi',
  'my': 'Malaysia', 'ml': 'Mali', 'mr': 'Mauritania', 'mx': 'Mexico',
  'md': 'Moldova', 'mn': 'Mongolia', 'ma': 'Morocco', 'mz': 'Mozambique',
  'mm': 'Myanmar', 'na': 'Namibia', 'np': 'Nepal', 'ni': 'Nicaragua',
  'ne': 'Niger', 'ng': 'Nigeria', 'om': 'Oman', 'pk': 'Pakistan',
  'pa': 'Panama', 'pg': 'Papua New Guinea', 'py': 'Paraguay', 'pe': 'Peru',
  'ph': 'Philippines', 'pl': 'Poland', 'qa': 'Qatar', 'ro': 'Romania',
  'ru': 'Russia', 'rw': 'Rwanda', 'sa': 'Saudi Arabia', 'sn': 'Senegal',
  'rs': 'Serbia', 'sl': 'Sierra Leone', 'sg': 'Singapore', 'so': 'Somalia',
  'za': 'South Africa', 'ss': 'South Sudan', 'es': 'Spain', 'lk': 'Sri Lanka',
  'sd': 'Sudan', 'sy': 'Syria', 'tw': 'Taiwan', 'tj': 'Tajikistan',
  'tz': 'Tanzania', 'th': 'Thailand', 'tl': 'Timor-Leste', 'tg': 'Togo',
  'tn': 'Tunisia', 'tr': 'Turkey', 'tm': 'Turkmenistan', 'ug': 'Uganda',
  'ua': 'Ukraine', 'ae': 'UAE', 'gb': 'UK',
  'us': 'United States', 'uy': 'Uruguay', 'uz': 'Uzbekistan', 've': 'Venezuela',
  'vn': 'Vietnam', 'ye': 'Yemen', 'zm': 'Zambia', 'zw': 'Zimbabwe'
};

async function fetchTorMetrics() {
  const readings = [];

  console.log('Fetching Tor Metrics data...');

  // Tor metrics provides CSV data for bridge users by country
  // Higher bridge usage relative to relay usage indicates censorship
  const startDate = '2011-01-01';
  const endDate = new Date().toISOString().split('T')[0];

  try {
    // Get bridge user data (new endpoint post-2023, no country filter = all countries)
    const bridgeUrl = `https://metrics.torproject.org/userstats-bridge-country.csv?start=${startDate}&end=${endDate}`;
    const bridgeResponse = await fetch(bridgeUrl);

    if (!bridgeResponse.ok) {
      console.log(`Failed to fetch bridge data: ${bridgeResponse.status}`);
      return readings;
    }

    const bridgeText = await bridgeResponse.text();
    // New schema: date,country,users,lower,upper (skip comment lines starting with #)
    const bridgeLines = bridgeText.split('\n').filter(l => l.trim() && !l.startsWith('#')).slice(1);

    const bridgeData = {};
    for (const line of bridgeLines) {
      if (!line.trim()) continue;
      const cols = line.split(',');
      const date = cols[0];
      const cc = cols[1]?.toLowerCase().trim();
      const users = parseFloat(cols[2]) || 0;

      if (!date || !cc || !COUNTRIES[cc]) continue;

      const year = date.substring(0, 4);
      const key = `${cc}_${year}`;
      if (!bridgeData[key]) {
        bridgeData[key] = { cc, year, bridgeUsers: 0, count: 0 };
      }
      bridgeData[key].bridgeUsers += users;
      bridgeData[key].count++;
    }

    // Get relay user data (new endpoint post-2023, no country filter = all countries)
    const relayUrl = `https://metrics.torproject.org/userstats-relay-country.csv?start=${startDate}&end=${endDate}`;
    const relayResponse = await fetch(relayUrl);

    const relayData = {};
    if (relayResponse.ok) {
      const relayText = await relayResponse.text();
      const relayLines = relayText.split('\n').filter(l => l.trim() && !l.startsWith('#')).slice(1);

      for (const line of relayLines) {
        if (!line.trim()) continue;
        const cols = line.split(',');
        const date = cols[0];
        const cc = cols[1]?.toLowerCase().trim();
        const users = parseFloat(cols[2]) || 0;

        if (!date || !cc || !COUNTRIES[cc]) continue;

        const year = date.substring(0, 4);
        const key = `${cc}_${year}`;
        if (!relayData[key]) {
          relayData[key] = { relayUsers: 0, count: 0 };
        }
        relayData[key].relayUsers += users;
        relayData[key].count++;
      }
    }

    // Calculate censorship score: bridge_ratio = bridge / (bridge + relay)
    // Higher bridge ratio = more censorship
    for (const [key, data] of Object.entries(bridgeData)) {
      const country = COUNTRIES[data.cc];
      const relay = relayData[key]?.relayUsers || 0;
      const bridge = data.bridgeUsers;
      const total = bridge + relay;

      const bridgeRatio = total > 0 ? (bridge / total) * 100 : 0;

      readings.push({
        country,
        signal_key: 'tor_censorship',
        signal_name: 'Tor Censorship',
        date: `${data.year}-01-01`,
        raw_value: bridgeRatio,
        raw_metadata: {
          bridge_users_annual: bridge,
          relay_users_annual: relay,
          days_measured: data.count,
          iso2: data.cc.toUpperCase()
        },
        source: 'Tor Project Metrics',
        gap: false,
        ingested_at: new Date().toISOString()
      });
    }

  } catch (e) {
    console.log('Error fetching Tor metrics:', e.message);
  }

  console.log(`Fetched ${readings.length} Tor readings`);
  return readings;
}

async function saveReadings(readings) {
  if (readings.length === 0) return 0;

  const chunks = [];
  for (let i = 0; i < readings.length; i += 500) {
    chunks.push(readings.slice(i, i + 500));
  }

  let saved = 0;
  for (const chunk of chunks) {
    const { error } = await sb.from('historical_signal_readings').upsert(chunk, {
      onConflict: 'country,signal_key,date'
    });
    if (!error) saved += chunk.length;
  }

  return saved;
}

async function run() {
  console.log('Tor Metrics Historical Fetcher');
  console.log('═══════════════════════════════════════════════════════════════');

  const readings = await fetchTorMetrics();
  const saved = await saveReadings(readings);

  console.log(`Saved ${saved} readings to database`);
}

if (require.main === module) {
  run().catch(console.error);
}

module.exports = { fetchTorMetrics, saveReadings };
