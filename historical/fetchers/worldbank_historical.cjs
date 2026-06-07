// historical/fetchers/worldbank_historical.cjs
// Fetches historical World Bank data for a country.
// Covers: WGI governance (1996–present), WDI economic stress (1960–present),
//         electricity access/power grid (1990–present), trade collapse (1960–present).
// Returns array of { signal_key, date, raw_value, raw_metadata, source, gap, gap_reason }

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const axios = require('axios');

async function httpsGet(url) {
  const res = await axios.get(url, {
    headers: { 'User-Agent': 'Sabian-Intelligence/1.0', 'Accept-Encoding': 'identity' },
    timeout: 30000,
  });
  return res.data;
}

async function fetchIndicator(iso2, indicatorCode, signalKey, signalName, startYear = 1960) {
  const rows = [];
  const url = `https://api.worldbank.org/v2/country/${iso2}/indicator/${indicatorCode}?date=${startYear}:${new Date().getFullYear()}&format=json&per_page=200`;
  try {
    const json = await httpsGet(url);
    const observations = json[1] || [];
    for (const obs of observations) {
      rows.push({
        signal_key:   signalKey,
        signal_name:  signalName,
        date:         `${obs.date}-01-01`,
        raw_value:    obs.value !== null ? parseFloat(String(obs.value)) : null,
        raw_metadata: { indicator: indicatorCode, country_iso: obs.countryiso3code, date_raw: obs.date },
        source:       'world_bank_wdi',
        gap:          obs.value === null,
        gap_reason:   obs.value === null ? 'not_reported_this_year' : null,
      });
    }
  } catch (err) {
    rows.push({
      signal_key:   signalKey,
      signal_name:  signalName,
      date:         `${startYear}-01-01`,
      raw_value:    null,
      raw_metadata: { error: err.message },
      source:       'world_bank_wdi',
      gap:          true,
      gap_reason:   'fetch_error',
    });
  }
  return rows;
}

// Full ISO2 map — all 153 countries in ALL_COUNTRIES
const ISO_MAP = {
  'Mali': 'ML', 'Burkina Faso': 'BF', 'Niger': 'NE', 'Sudan': 'SD', 'Ethiopia': 'ET',
  'Myanmar': 'MM', 'Venezuela': 'VE', 'Somalia': 'SO', 'DRC': 'CD', 'CAR': 'CF',
  'Chad': 'TD', 'Nigeria': 'NG', 'Mozambique': 'MZ', 'Libya': 'LY', 'Haiti': 'HT',
  'Yemen': 'YE', 'Afghanistan': 'AF', 'Syria': 'SY', 'Iraq': 'IQ', 'South Sudan': 'SS',
  'Israel': 'IL', 'Palestine': 'PS', 'Ukraine': 'UA', 'Colombia': 'CO', 'Lebanon': 'LB',
  'Pakistan': 'PK', 'Cameroon': 'CM', 'Armenia': 'AM', 'Georgia': 'GE', 'Russia': 'RU',
  'Philippines': 'PH', 'Indonesia': 'ID', 'Mexico': 'MX', 'Iran': 'IR', 'Zimbabwe': 'ZW',
  'Bangladesh': 'BD', 'Sri Lanka': 'LK', 'Kenya': 'KE', 'Uganda': 'UG', 'Tanzania': 'TZ',
  'Zambia': 'ZM', 'Senegal': 'SN', 'Guinea': 'GN', 'Ecuador': 'EC', 'Bolivia': 'BO',
  'Eritrea': 'ER', 'Djibouti': 'DJ', 'Kosovo': 'XK', 'Bosnia': 'BA', 'Taiwan': 'TW',
  'North Korea': 'KP', 'Belarus': 'BY', 'Moldova': 'MD', 'Serbia': 'RS', 'Azerbaijan': 'AZ',
  'Kyrgyzstan': 'KG', 'Tajikistan': 'TJ', 'Turkmenistan': 'TM', 'Uzbekistan': 'UZ',
  'Kazakhstan': 'KZ', 'Peru': 'PE', 'Brazil': 'BR', 'Nicaragua': 'NI', 'Honduras': 'HN',
  'Guatemala': 'GT', 'El Salvador': 'SV', 'Cuba': 'CU', 'Angola': 'AO', 'Rwanda': 'RW',
  'Burundi': 'BI', 'Malawi': 'MW', 'Guinea-Bissau': 'GW', 'Sierra Leone': 'SL',
  'Liberia': 'LR', 'Togo': 'TG', 'Benin': 'BJ', 'Mauritania': 'MR', 'Tunisia': 'TN',
  'Algeria': 'DZ', 'Morocco': 'MA', 'Egypt': 'EG', 'Jordan': 'JO', 'Saudi Arabia': 'SA',
  'Oman': 'OM', 'Kuwait': 'KW', 'Vietnam': 'VN', 'Cambodia': 'KH', 'Laos': 'LA',
  'Nepal': 'NP', 'India': 'IN', 'Timor-Leste': 'TL', 'Papua New Guinea': 'PG',
  'Solomon Islands': 'SB', 'Fiji': 'FJ', 'Turkey': 'TR', 'Greece': 'GR', 'Bulgaria': 'BG',
  'Romania': 'RO', 'Hungary': 'HU', 'Poland': 'PL', 'Slovakia': 'SK', 'Croatia': 'HR',
  'North Macedonia': 'MK', 'Montenegro': 'ME', 'Albania': 'AL', 'China': 'CN',
  'South Korea': 'KR', 'Japan': 'JP', 'Mongolia': 'MN', 'Thailand': 'TH', 'Malaysia': 'MY',
  'Singapore': 'SG', 'Australia': 'AU', 'New Zealand': 'NZ', 'South Africa': 'ZA',
  'Ghana': 'GH', 'Ivory Coast': 'CI', 'Gabon': 'GA', 'Congo': 'CG',
  'Equatorial Guinea': 'GQ', 'Namibia': 'NA', 'Botswana': 'BW', 'Argentina': 'AR',
  'Chile': 'CL', 'Paraguay': 'PY', 'Uruguay': 'UY', 'Guyana': 'GY', 'Suriname': 'SR',
  'Trinidad and Tobago': 'TT', 'Panama': 'PA', 'Costa Rica': 'CR',
  'Dominican Republic': 'DO', 'Jamaica': 'JM', 'Belize': 'BZ', 'UAE': 'AE',
  'Qatar': 'QA', 'Bahrain': 'BH', 'UK': 'GB', 'France': 'FR', 'Germany': 'DE',
  'Spain': 'ES', 'Italy': 'IT', 'Portugal': 'PT', 'Sweden': 'SE', 'Finland': 'FI',
  'Norway': 'NO', 'Denmark': 'DK', 'Netherlands': 'NL', 'Belgium': 'BE', 'Austria': 'AT',
  'Switzerland': 'CH', 'Cyprus': 'CY', 'United States': 'US',
};

async function fetchWorldBankHistorical(country) {
  const iso2 = ISO_MAP[country];
  if (!iso2) return [];

  const results = [];

  // Political Stability (WGI) — 1996+
  const psRows = await fetchIndicator(iso2, 'GOV_WGI_PV.SC', 'governance', 'Governance', 1996);
  results.push(...psRows);

  // Government Effectiveness (WGI) — 1996+ (merge metadata into governance rows)
  const geRows = await fetchIndicator(iso2, 'GOV_WGI_GE.SC', 'governance', 'Governance', 1996);
  for (const row of geRows) {
    const existing = results.find(r => r.signal_key === 'governance' && r.date === row.date);
    if (existing && row.raw_value !== null) {
      existing.raw_metadata.gov_effectiveness = row.raw_value;
    }
  }

  // GDP growth (economic stress proxy) — 1960+
  const gdpRows = await fetchIndicator(iso2, 'NY.GDP.MKTP.KD.ZG', 'economic_stress', 'Economic Stress', 1960);
  results.push(...gdpRows);

  // Electricity access (power grid proxy) — 1990+
  const elecRows = await fetchIndicator(iso2, 'EG.ELC.ACCS.ZS', 'power_grid', 'Power Grid', 1990);
  results.push(...elecRows);

  // Import volume growth — trade collapse signal — 1947+
  const tradeRows = await fetchIndicator(iso2, 'NE.IMP.GNFS.KD.ZG', 'trade_collapse', 'Trade Collapse', 1947);
  results.push(...tradeRows);

  return results;
}

module.exports = { fetchWorldBankHistorical };
