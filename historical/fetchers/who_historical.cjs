// who_historical.cjs
// Fetches WHO Global Health Observatory data
// Signal: health_crisis (Health Crisis)
// Source: WHO GHO API
// Coverage: 2000-present

require('dotenv').config({ path: '../../.env' });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

// ISO3 codes for countries we track
const COUNTRIES = {
  'AFG': 'Afghanistan', 'ALB': 'Albania', 'DZA': 'Algeria', 'AGO': 'Angola',
  'ARG': 'Argentina', 'ARM': 'Armenia', 'AZE': 'Azerbaijan', 'BGD': 'Bangladesh',
  'BLR': 'Belarus', 'BEN': 'Benin', 'BOL': 'Bolivia', 'BIH': 'Bosnia',
  'BWA': 'Botswana', 'BRA': 'Brazil', 'BGR': 'Bulgaria', 'BFA': 'Burkina Faso',
  'BDI': 'Burundi', 'KHM': 'Cambodia', 'CMR': 'Cameroon', 'CAF': 'CAR',
  'TCD': 'Chad', 'CHL': 'Chile', 'CHN': 'China', 'COL': 'Colombia',
  'COD': 'DRC', 'COG': 'Congo', 'CRI': 'Costa Rica', 'CIV': 'Ivory Coast',
  'HRV': 'Croatia', 'CUB': 'Cuba', 'CYP': 'Cyprus', 'CZE': 'Czech Republic',
  'DJI': 'Djibouti', 'DOM': 'Dominican Republic', 'ECU': 'Ecuador', 'EGY': 'Egypt',
  'SLV': 'El Salvador', 'ERI': 'Eritrea', 'ETH': 'Ethiopia', 'GEO': 'Georgia',
  'GHA': 'Ghana', 'GRC': 'Greece', 'GTM': 'Guatemala', 'GIN': 'Guinea',
  'GNB': 'Guinea-Bissau', 'HTI': 'Haiti', 'HND': 'Honduras', 'HUN': 'Hungary',
  'IND': 'India', 'IDN': 'Indonesia', 'IRN': 'Iran', 'IRQ': 'Iraq',
  'ISR': 'Israel', 'JAM': 'Jamaica', 'JOR': 'Jordan', 'KAZ': 'Kazakhstan',
  'KEN': 'Kenya', 'PRK': 'North Korea', 'KOR': 'South Korea', 'KWT': 'Kuwait',
  'KGZ': 'Kyrgyzstan', 'LAO': 'Laos', 'LBN': 'Lebanon', 'LBR': 'Liberia',
  'LBY': 'Libya', 'MDG': 'Madagascar', 'MWI': 'Malawi', 'MYS': 'Malaysia',
  'MLI': 'Mali', 'MRT': 'Mauritania', 'MEX': 'Mexico', 'MDA': 'Moldova',
  'MNG': 'Mongolia', 'MAR': 'Morocco', 'MOZ': 'Mozambique', 'MMR': 'Myanmar',
  'NAM': 'Namibia', 'NPL': 'Nepal', 'NIC': 'Nicaragua', 'NER': 'Niger',
  'NGA': 'Nigeria', 'OMN': 'Oman', 'PAK': 'Pakistan', 'PAN': 'Panama',
  'PNG': 'Papua New Guinea', 'PRY': 'Paraguay', 'PER': 'Peru', 'PHL': 'Philippines',
  'POL': 'Poland', 'QAT': 'Qatar', 'ROU': 'Romania', 'RUS': 'Russia',
  'RWA': 'Rwanda', 'SAU': 'Saudi Arabia', 'SEN': 'Senegal', 'SRB': 'Serbia',
  'SLE': 'Sierra Leone', 'SGP': 'Singapore', 'SOM': 'Somalia', 'ZAF': 'South Africa',
  'SSD': 'South Sudan', 'ESP': 'Spain', 'LKA': 'Sri Lanka', 'SDN': 'Sudan',
  'SYR': 'Syria', 'TWN': 'Taiwan', 'TJK': 'Tajikistan', 'TZA': 'Tanzania',
  'THA': 'Thailand', 'TLS': 'Timor-Leste', 'TGO': 'Togo', 'TUN': 'Tunisia',
  'TUR': 'Turkey', 'TKM': 'Turkmenistan', 'UGA': 'Uganda', 'UKR': 'Ukraine',
  'ARE': 'UAE', 'GBR': 'UK', 'USA': 'United States',
  'URY': 'Uruguay', 'UZB': 'Uzbekistan', 'VEN': 'Venezuela', 'VNM': 'Vietnam',
  'YEM': 'Yemen', 'ZMB': 'Zambia', 'ZWE': 'Zimbabwe'
};

// WHO indicators for health crisis signals
const INDICATORS = [
  'WHOSIS_000001', // Life expectancy at birth
  'MDG_0000000001', // Under-5 mortality rate
  'WHS4_100', // Hospital beds per 10,000
  'WHS6_102', // Physicians per 10,000
];

async function fetchWHO() {
  const readings = [];

  console.log('Fetching WHO GHO data...');

  // WHO GHO OData API
  for (const [iso3, country] of Object.entries(COUNTRIES)) {
    try {
      // Get under-5 mortality as primary health crisis indicator
      const url = `https://ghoapi.azureedge.net/api/MDG_0000000001?$filter=SpatialDim eq '${iso3}'`;

      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) continue;

      const data = await response.json();

      if (data && data.value && Array.isArray(data.value)) {
        for (const row of data.value) {
          const year = row.TimeDim;
          const value = row.NumericValue;

          if (year && value !== null && value !== undefined) {
            // Under-5 mortality rate per 1000 live births
            // Higher = worse health system = higher crisis risk
            readings.push({
              country,
              signal_key: 'health_crisis',
              signal_name: 'Health Crisis',
              date: `${year}-01-01`,
              raw_value: value,
              raw_metadata: {
                indicator: 'Under-5 mortality rate',
                unit: 'per 1000 live births',
                iso3
              },
              source: 'WHO GHO',
              gap: false,
              ingested_at: new Date().toISOString()
            });
          }
        }
      }
    } catch (e) {
      // Silent continue
    }

    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`Fetched ${readings.length} WHO readings`);
  return readings;
}

async function saveReadings(readings) {
  if (readings.length === 0) return 0;

  // Deduplicate by country+signal_key+date
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
  console.log('WHO Historical Fetcher');
  console.log('═══════════════════════════════════════════════════════════════');

  const readings = await fetchWHO();
  const saved = await saveReadings(readings);

  console.log(`Saved ${saved} readings to database`);
}

if (require.main === module) {
  run().catch(console.error);
}

module.exports = { fetchWHO, saveReadings };
