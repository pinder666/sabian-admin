// ooni_historical.cjs
// Fetches OONI (Open Observatory of Network Interference) data
// Signal: ooni_internet (Internet Freedom)
// Source: OONI API
// Coverage: 2012-present

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { sb, upsertReadings } = require('../db.cjs');

// ISO2 codes for countries we track
const COUNTRIES = {
  'AF': 'Afghanistan', 'AL': 'Albania', 'DZ': 'Algeria', 'AO': 'Angola',
  'AR': 'Argentina', 'AM': 'Armenia', 'AZ': 'Azerbaijan', 'BD': 'Bangladesh',
  'BY': 'Belarus', 'BJ': 'Benin', 'BO': 'Bolivia', 'BA': 'Bosnia',
  'BW': 'Botswana', 'BR': 'Brazil', 'BG': 'Bulgaria', 'BF': 'Burkina Faso',
  'BI': 'Burundi', 'KH': 'Cambodia', 'CM': 'Cameroon', 'CF': 'CAR',
  'TD': 'Chad', 'CL': 'Chile', 'CN': 'China', 'CO': 'Colombia',
  'CD': 'DRC', 'CG': 'Congo', 'CR': 'Costa Rica', 'CI': 'Ivory Coast',
  'HR': 'Croatia', 'CU': 'Cuba', 'CY': 'Cyprus', 'CZ': 'Czech Republic',
  'DJ': 'Djibouti', 'DO': 'Dominican Republic', 'EC': 'Ecuador', 'EG': 'Egypt',
  'SV': 'El Salvador', 'ER': 'Eritrea', 'ET': 'Ethiopia', 'GE': 'Georgia',
  'GH': 'Ghana', 'GR': 'Greece', 'GT': 'Guatemala', 'GN': 'Guinea',
  'GW': 'Guinea-Bissau', 'HT': 'Haiti', 'HN': 'Honduras', 'HU': 'Hungary',
  'IN': 'India', 'ID': 'Indonesia', 'IR': 'Iran', 'IQ': 'Iraq',
  'IL': 'Israel', 'JM': 'Jamaica', 'JO': 'Jordan', 'KZ': 'Kazakhstan',
  'KE': 'Kenya', 'KP': 'North Korea', 'KR': 'South Korea', 'KW': 'Kuwait',
  'KG': 'Kyrgyzstan', 'LA': 'Laos', 'LB': 'Lebanon', 'LR': 'Liberia',
  'LY': 'Libya', 'MG': 'Madagascar', 'MW': 'Malawi', 'MY': 'Malaysia',
  'ML': 'Mali', 'MR': 'Mauritania', 'MX': 'Mexico', 'MD': 'Moldova',
  'MN': 'Mongolia', 'MA': 'Morocco', 'MZ': 'Mozambique', 'MM': 'Myanmar',
  'NA': 'Namibia', 'NP': 'Nepal', 'NI': 'Nicaragua', 'NE': 'Niger',
  'NG': 'Nigeria', 'OM': 'Oman', 'PK': 'Pakistan', 'PA': 'Panama',
  'PG': 'Papua New Guinea', 'PY': 'Paraguay', 'PE': 'Peru', 'PH': 'Philippines',
  'PL': 'Poland', 'QA': 'Qatar', 'RO': 'Romania', 'RU': 'Russia',
  'RW': 'Rwanda', 'SA': 'Saudi Arabia', 'SN': 'Senegal', 'RS': 'Serbia',
  'SL': 'Sierra Leone', 'SG': 'Singapore', 'SO': 'Somalia', 'ZA': 'South Africa',
  'SS': 'South Sudan', 'ES': 'Spain', 'LK': 'Sri Lanka', 'SD': 'Sudan',
  'SY': 'Syria', 'TW': 'Taiwan', 'TJ': 'Tajikistan', 'TZ': 'Tanzania',
  'TH': 'Thailand', 'TL': 'Timor-Leste', 'TG': 'Togo', 'TN': 'Tunisia',
  'TR': 'Turkey', 'TM': 'Turkmenistan', 'UG': 'Uganda', 'UA': 'Ukraine',
  'AE': 'UAE', 'GB': 'UK', 'US': 'United States',
  'UY': 'Uruguay', 'UZ': 'Uzbekistan', 'VE': 'Venezuela', 'VN': 'Vietnam',
  'YE': 'Yemen', 'ZM': 'Zambia', 'ZW': 'Zimbabwe'
};

async function fetchOONI() {
  const readings = [];

  console.log('Fetching OONI Internet Freedom data...');

  for (const [iso2, country] of Object.entries(COUNTRIES)) {
    try {
      // OONI aggregation API - get monthly stats
      const url = `https://api.ooni.io/api/v1/aggregation?probe_cc=${iso2}&since=2012-01-01&until=${new Date().toISOString().split('T')[0]}&axis_x=measurement_start_day`;

      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) continue;

      const data = await response.json();

      if (data && data.result && Array.isArray(data.result)) {
        // Group by year for annual readings
        const byYear = {};
        for (const row of data.result) {
          const year = row.measurement_start_day?.substring(0, 4);
          if (!year) continue;

          if (!byYear[year]) {
            byYear[year] = { total: 0, anomalies: 0, confirmed: 0 };
          }
          byYear[year].total += row.measurement_count || 0;
          byYear[year].anomalies += row.anomaly_count || 0;
          byYear[year].confirmed += row.confirmed_count || 0;
        }

        for (const [year, stats] of Object.entries(byYear)) {
          // Internet freedom score: lower anomaly rate = higher freedom
          // 100 - (anomaly_rate * 100)
          const anomalyRate = stats.total > 0 ? stats.anomalies / stats.total : 0;
          const freedomScore = 100 - (anomalyRate * 100);

          readings.push({
            country,
            signal_key: 'ooni_internet',
            signal_name: 'Internet Freedom',
            date: `${year}-01-01`,
            raw_value: freedomScore,
            raw_metadata: {
              total_measurements: stats.total,
              anomalies: stats.anomalies,
              confirmed_blocked: stats.confirmed,
              iso2
            },
            source: 'OONI',
            gap: false,
            ingested_at: new Date().toISOString()
          });
        }
      }
    } catch (e) {
      // Silent continue
    }

    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`Fetched ${readings.length} OONI readings`);
  return readings;
}

async function saveReadings(readings) {
  if (readings.length === 0) return 0;

  const seen = new Set();
  const unique = readings.filter(r => {
    const key = `${r.country}|${r.signal_key}|${r.date}|${r.source}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`Deduped: ${readings.length} -> ${unique.length}`);

  const { inserted, errors } = await upsertReadings(sb, unique, { batchSize: 500 });
  if (errors.length > 0) errors.forEach(e => console.log('Upsert error:', e.error));
  return inserted;
}

async function run() {
  console.log('OONI Historical Fetcher');
  console.log('═══════════════════════════════════════════════════════════════');

  const readings = await fetchOONI();
  const saved = await saveReadings(readings);

  console.log(`Saved ${saved} readings to database`);
}

if (require.main === module) {
  run().catch(console.error);
}

module.exports = { fetchOONI, saveReadings };
