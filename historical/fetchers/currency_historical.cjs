// currency_historical.cjs
// Fetches currency collapse data from World Bank (official exchange rates)
// Signal: currency_collapse (Currency Collapse)
// Source: World Bank WDI — PA.NUS.FCRF (Official exchange rate, LCU per USD)
// Coverage: 1960-present, annual
// Method: YoY depreciation rate — large depreciation = higher collapse risk

require('dotenv').config({ path: '../../.env' });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

// ISO2 → country name
const COUNTRIES = {
  'AF': 'Afghanistan', 'AL': 'Albania', 'DZ': 'Algeria', 'AO': 'Angola',
  'AR': 'Argentina', 'AM': 'Armenia', 'AZ': 'Azerbaijan', 'BD': 'Bangladesh',
  'BY': 'Belarus', 'BO': 'Bolivia', 'BR': 'Brazil', 'BF': 'Burkina Faso',
  'BI': 'Burundi', 'KH': 'Cambodia', 'CM': 'Cameroon', 'CF': 'CAR',
  'TD': 'Chad', 'CL': 'Chile', 'CN': 'China', 'CO': 'Colombia',
  'CD': 'DRC', 'CG': 'Congo', 'CU': 'Cuba', 'EC': 'Ecuador',
  'EG': 'Egypt', 'SV': 'El Salvador', 'ER': 'Eritrea', 'ET': 'Ethiopia',
  'GH': 'Ghana', 'GT': 'Guatemala', 'GN': 'Guinea', 'HT': 'Haiti',
  'HN': 'Honduras', 'IN': 'India', 'ID': 'Indonesia', 'IR': 'Iran',
  'IQ': 'Iraq', 'JO': 'Jordan', 'KZ': 'Kazakhstan', 'KE': 'Kenya',
  'KG': 'Kyrgyzstan', 'LA': 'Laos', 'LB': 'Lebanon', 'LY': 'Libya',
  'MG': 'Madagascar', 'MW': 'Malawi', 'MY': 'Malaysia', 'ML': 'Mali',
  'MR': 'Mauritania', 'MX': 'Mexico', 'MD': 'Moldova', 'MN': 'Mongolia',
  'MA': 'Morocco', 'MZ': 'Mozambique', 'MM': 'Myanmar', 'NP': 'Nepal',
  'NI': 'Nicaragua', 'NE': 'Niger', 'NG': 'Nigeria', 'PK': 'Pakistan',
  'PG': 'Papua New Guinea', 'PY': 'Paraguay', 'PE': 'Peru', 'PH': 'Philippines',
  'RU': 'Russia', 'RW': 'Rwanda', 'SN': 'Senegal', 'SL': 'Sierra Leone',
  'SO': 'Somalia', 'ZA': 'South Africa', 'SS': 'South Sudan', 'SD': 'Sudan',
  'SY': 'Syria', 'TJ': 'Tajikistan', 'TZ': 'Tanzania', 'TH': 'Thailand',
  'TG': 'Togo', 'TN': 'Tunisia', 'TR': 'Turkey', 'TM': 'Turkmenistan',
  'UG': 'Uganda', 'UA': 'Ukraine', 'UZ': 'Uzbekistan', 'VE': 'Venezuela',
  'VN': 'Vietnam', 'YE': 'Yemen', 'ZM': 'Zambia', 'ZW': 'Zimbabwe'
};

async function fetchCurrencyCollapse() {
  const readings = [];

  console.log('Fetching World Bank currency / exchange rate data...');

  for (const [iso2, country] of Object.entries(COUNTRIES)) {
    try {
      const url = `https://api.worldbank.org/v2/country/${iso2}/indicator/PA.NUS.FCRF?date=1960:${new Date().getFullYear()}&format=json&per_page=100`;

      const response = await fetch(url);
      if (!response.ok) continue;

      const data = await response.json();

      if (!Array.isArray(data) || !data[1]) continue;

      // Build year→rate map and compute YoY depreciation
      const rateByYear = {};
      for (const obs of data[1]) {
        if (obs.value !== null && obs.value !== undefined && obs.value > 0) {
          rateByYear[parseInt(obs.date)] = obs.value;
        }
      }

      const years = Object.keys(rateByYear).map(Number).sort();
      let count = 0;

      for (let i = 1; i < years.length; i++) {
        const year = years[i];
        const prevYear = years[i - 1];
        if (year - prevYear > 1) continue; // Skip gaps

        const rate = rateByYear[year];
        const prevRate = rateByYear[prevYear];

        // Depreciation %: (current - prev) / prev * 100
        // Positive = currency weakened (LCU buys fewer USD) = collapse risk
        const depreciation = ((rate - prevRate) / prevRate) * 100;

        readings.push({
          country,
          signal_key: 'currency_collapse',
          signal_name: 'Currency Collapse',
          date: `${year}-01-01`,
          raw_value: Math.round(depreciation * 100) / 100,
          raw_metadata: {
            exchange_rate: rate,
            prev_year_rate: prevRate,
            iso2,
            indicator: 'PA.NUS.FCRF'
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

  console.log(`Fetched ${readings.length} currency readings`);
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
  console.log('Currency Collapse Historical Fetcher');
  console.log('═══════════════════════════════════════════════════════════════');

  const readings = await fetchCurrencyCollapse();
  const saved = await saveReadings(readings);

  console.log(`Saved ${saved} readings to database`);
}

if (require.main === module) {
  run().catch(console.error);
}

module.exports = { fetchCurrencyCollapse, saveReadings };
