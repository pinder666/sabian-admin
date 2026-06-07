// maritime_trade_historical.cjs
// Fetches maritime/merchandise trade data from World Bank WDI
// Signal: maritime_trade (Maritime Trade)
// Source: World Bank WDI — TM.VAL.MRCH.CD.WT (imports) + TX.VAL.MRCH.CD.WT (exports)
// Coverage: 1960-present, annual

require('dotenv').config({ path: '../../.env' });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

const COUNTRIES = {
  'AF': 'Afghanistan', 'AL': 'Albania', 'DZ': 'Algeria', 'AO': 'Angola',
  'AR': 'Argentina', 'AM': 'Armenia', 'AZ': 'Azerbaijan', 'BD': 'Bangladesh',
  'BY': 'Belarus', 'BO': 'Bolivia', 'BR': 'Brazil', 'BF': 'Burkina Faso',
  'BI': 'Burundi', 'KH': 'Cambodia', 'CM': 'Cameroon', 'CF': 'CAR',
  'TD': 'Chad', 'CL': 'Chile', 'CN': 'China', 'CO': 'Colombia',
  'CD': 'DRC', 'CU': 'Cuba', 'EC': 'Ecuador', 'EG': 'Egypt',
  'SV': 'El Salvador', 'ER': 'Eritrea', 'ET': 'Ethiopia', 'GH': 'Ghana',
  'GT': 'Guatemala', 'GN': 'Guinea', 'HT': 'Haiti', 'HN': 'Honduras',
  'IN': 'India', 'ID': 'Indonesia', 'IR': 'Iran', 'IQ': 'Iraq',
  'JO': 'Jordan', 'KZ': 'Kazakhstan', 'KE': 'Kenya', 'KP': 'North Korea',
  'KG': 'Kyrgyzstan', 'LA': 'Laos', 'LB': 'Lebanon', 'LY': 'Libya',
  'MG': 'Madagascar', 'MW': 'Malawi', 'MY': 'Malaysia', 'ML': 'Mali',
  'MR': 'Mauritania', 'MX': 'Mexico', 'MA': 'Morocco', 'MZ': 'Mozambique',
  'MM': 'Myanmar', 'NP': 'Nepal', 'NE': 'Niger', 'NG': 'Nigeria',
  'OM': 'Oman', 'PK': 'Pakistan', 'PE': 'Peru', 'PH': 'Philippines',
  'QA': 'Qatar', 'RU': 'Russia', 'RW': 'Rwanda', 'SA': 'Saudi Arabia',
  'SN': 'Senegal', 'SL': 'Sierra Leone', 'SO': 'Somalia', 'ZA': 'South Africa',
  'SS': 'South Sudan', 'SD': 'Sudan', 'SY': 'Syria', 'TJ': 'Tajikistan',
  'TZ': 'Tanzania', 'TH': 'Thailand', 'TN': 'Tunisia', 'TR': 'Turkey',
  'TM': 'Turkmenistan', 'UG': 'Uganda', 'UA': 'Ukraine', 'AE': 'UAE',
  'UZ': 'Uzbekistan', 'VE': 'Venezuela', 'VN': 'Vietnam', 'YE': 'Yemen',
  'ZM': 'Zambia', 'ZW': 'Zimbabwe'
};

async function fetchIndicator(iso2, indicator) {
  const url = `https://api.worldbank.org/v2/country/${iso2}/indicator/${indicator}?date=1960:${new Date().getFullYear()}&format=json&per_page=100`;
  const response = await fetch(url);
  if (!response.ok) return {};

  const data = await response.json();
  if (!Array.isArray(data) || !data[1]) return {};

  const result = {};
  for (const obs of data[1]) {
    if (obs.value !== null && obs.value !== undefined) {
      result[obs.date] = parseFloat(obs.value);
    }
  }
  return result;
}

async function fetchMaritimeTrade() {
  const readings = [];

  console.log('Fetching World Bank merchandise trade data...');

  for (const [iso2, country] of Object.entries(COUNTRIES)) {
    try {
      // Imports + Exports (current USD) as trade volume signal
      const [imports, exports] = await Promise.all([
        fetchIndicator(iso2, 'TM.VAL.MRCH.CD.WT'),
        fetchIndicator(iso2, 'TX.VAL.MRCH.CD.WT')
      ]);

      const years = new Set([...Object.keys(imports), ...Object.keys(exports)]);
      let count = 0;

      for (const year of years) {
        const imp = imports[year] || 0;
        const exp = exports[year] || 0;
        const total = imp + exp;
        if (total <= 0) continue;

        // Trade openness proxy: log of total trade volume (USD billions)
        const tradeVolumeBn = total / 1e9;
        if (tradeVolumeBn <= 0) continue;

        readings.push({
          country,
          signal_key: 'maritime_trade',
          signal_name: 'Maritime Trade',
          date: `${year}-01-01`,
          raw_value: Math.round(tradeVolumeBn * 1000) / 1000,
          raw_metadata: {
            imports_usd: imp,
            exports_usd: exp,
            iso2,
            unit: 'USD billions'
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

    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`Fetched ${readings.length} maritime trade readings`);
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
  console.log('Maritime Trade Historical Fetcher');
  console.log('═══════════════════════════════════════════════════════════════');

  const readings = await fetchMaritimeTrade();
  const saved = await saveReadings(readings);

  console.log(`Saved ${saved} readings to database`);
}

if (require.main === module) {
  run().catch(console.error);
}

module.exports = { fetchMaritimeTrade, saveReadings };
