// water_stress_historical.cjs
// Fetches water stress data from World Bank WDI
// Signal: water_stress (Water Stress)
// Source: World Bank WDI — ER.H2O.FWTL.ZS (Annual freshwater withdrawals, % of resources)
// Coverage: 1970-present (sparse), supplemented by SH.H2O.BASW.ZS (basic drinking water)

require('dotenv').config({ path: '../../.env' });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

const COUNTRIES = {
  'AF': 'Afghanistan', 'AL': 'Albania', 'DZ': 'Algeria', 'AO': 'Angola',
  'AR': 'Argentina', 'AM': 'Armenia', 'AZ': 'Azerbaijan', 'BD': 'Bangladesh',
  'BY': 'Belarus', 'BJ': 'Benin', 'BO': 'Bolivia', 'BR': 'Brazil',
  'BF': 'Burkina Faso', 'BI': 'Burundi', 'KH': 'Cambodia', 'CM': 'Cameroon',
  'CF': 'CAR', 'TD': 'Chad', 'CL': 'Chile', 'CN': 'China',
  'CO': 'Colombia', 'CD': 'DRC', 'CU': 'Cuba', 'EC': 'Ecuador',
  'EG': 'Egypt', 'SV': 'El Salvador', 'ER': 'Eritrea', 'ET': 'Ethiopia',
  'GH': 'Ghana', 'GT': 'Guatemala', 'GN': 'Guinea', 'HT': 'Haiti',
  'HN': 'Honduras', 'IN': 'India', 'ID': 'Indonesia', 'IR': 'Iran',
  'IQ': 'Iraq', 'JO': 'Jordan', 'KZ': 'Kazakhstan', 'KE': 'Kenya',
  'KP': 'North Korea', 'KG': 'Kyrgyzstan', 'LA': 'Laos', 'LB': 'Lebanon',
  'LY': 'Libya', 'MG': 'Madagascar', 'MW': 'Malawi', 'MY': 'Malaysia',
  'ML': 'Mali', 'MR': 'Mauritania', 'MX': 'Mexico', 'MD': 'Moldova',
  'MN': 'Mongolia', 'MA': 'Morocco', 'MZ': 'Mozambique', 'MM': 'Myanmar',
  'NP': 'Nepal', 'NI': 'Nicaragua', 'NE': 'Niger', 'NG': 'Nigeria',
  'OM': 'Oman', 'PK': 'Pakistan', 'PE': 'Peru', 'PH': 'Philippines',
  'QA': 'Qatar', 'RU': 'Russia', 'RW': 'Rwanda', 'SA': 'Saudi Arabia',
  'SN': 'Senegal', 'SL': 'Sierra Leone', 'SO': 'Somalia', 'ZA': 'South Africa',
  'SS': 'South Sudan', 'SD': 'Sudan', 'SY': 'Syria', 'TJ': 'Tajikistan',
  'TZ': 'Tanzania', 'TH': 'Thailand', 'TN': 'Tunisia', 'TR': 'Turkey',
  'TM': 'Turkmenistan', 'UG': 'Uganda', 'UA': 'Ukraine', 'AE': 'UAE',
  'UZ': 'Uzbekistan', 'VE': 'Venezuela', 'VN': 'Vietnam', 'YE': 'Yemen',
  'ZM': 'Zambia', 'ZW': 'Zimbabwe'
};

async function fetchWaterStress() {
  const readings = [];

  console.log('Fetching World Bank water stress data...');

  // ER.H2O.FWTL.ZS = Annual freshwater withdrawals, total (% of internal resources)
  // Higher % = more stressed (approaching or exceeding renewable supply)
  const INDICATOR = 'ER.H2O.FWTL.ZS';

  for (const [iso2, country] of Object.entries(COUNTRIES)) {
    try {
      const url = `https://api.worldbank.org/v2/country/${iso2}/indicator/${INDICATOR}?date=1960:${new Date().getFullYear()}&format=json&per_page=100`;

      const response = await fetch(url);
      if (!response.ok) continue;

      const data = await response.json();

      if (!Array.isArray(data) || !data[1]) continue;

      let count = 0;
      for (const obs of data[1]) {
        if (obs.value === null || obs.value === undefined) continue;

        const value = parseFloat(obs.value);
        if (isNaN(value)) continue;

        readings.push({
          country,
          signal_key: 'water_stress',
          signal_name: 'Water Stress',
          date: `${obs.date}-01-01`,
          raw_value: value,
          raw_metadata: {
            indicator: INDICATOR,
            indicator_name: 'Annual freshwater withdrawals (% of resources)',
            iso2
          },
          source: 'World Bank WDI',
          gap: false,
          ingested_at: new Date().toISOString()
        });
        count++;
      }
      if (count > 0) console.log(`  ${country}: ${count} years`);
    } catch (e) {
      console.log(`  ${country}: Error - ${e.message}`);
    }

    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`Fetched ${readings.length} water stress readings`);
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
  console.log('Water Stress Historical Fetcher');
  console.log('═══════════════════════════════════════════════════════════════');

  const readings = await fetchWaterStress();
  const saved = await saveReadings(readings);

  console.log(`Saved ${saved} readings to database`);
}

if (require.main === module) {
  run().catch(console.error);
}

module.exports = { fetchWaterStress, saveReadings };
