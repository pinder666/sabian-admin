// historical/fetchers/imf_historical.cjs
// IMF WEO fiscal/debt data and IMF DOTS trade data — historical.
// WEO: debt/GDP, fiscal deficit, reserves back to 1980.
// DOTS: bilateral trade volumes back to 1948 for major countries.
// Returns array of { signal_key, date, raw_value, raw_metadata, source, gap, gap_reason }

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const axios = require('axios');

async function httpsGet(url) {
  const res = await axios.get(url, {
    headers: {
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'Referer': 'https://www.imf.org/external/datamapper/',
    },
    timeout: 30000,
  });
  return res.data;
}

// IMF ISO3 codes (WEO uses 3-letter country codes)
const IMF_ISO3 = {
  'Mali': 'MLI', 'Sudan': 'SDN', 'Ethiopia': 'ETH', 'DRC': 'COD', 'Nigeria': 'NGA',
  'Afghanistan': 'AFG', 'Myanmar': 'MMR', 'Yemen': 'YEM', 'South Sudan': 'SSD',
  'Ukraine': 'UKR', 'Syria': 'SYR', 'Somalia': 'SOM', 'Haiti': 'HTI',
  'CAR': 'CAF', 'Chad': 'TCD', 'Mozambique': 'MOZ', 'Libya': 'LBY',
  'Burkina Faso': 'BFA', 'Niger': 'NER', 'Colombia': 'COL', 'Venezuela': 'VEN',
  'Iran': 'IRN', 'Iraq': 'IRQ', 'Pakistan': 'PAK', 'Bangladesh': 'BGD',
  'Sri Lanka': 'LKA', 'Kenya': 'KEN', 'Uganda': 'UGA', 'Rwanda': 'RWA',
  'Zimbabwe': 'ZWE', 'Cameroon': 'CMR', 'Lebanon': 'LBN', 'Egypt': 'EGY',
  'Jordan': 'JOR', 'Morocco': 'MAR', 'Tunisia': 'TUN', 'Algeria': 'DZA',
  'Angola': 'AGO', 'Ghana': 'GHA', 'Senegal': 'SEN', 'Tanzania': 'TZA',
  'Zambia': 'ZMB', 'Argentina': 'ARG', 'Brazil': 'BRA', 'Mexico': 'MEX',
  'Cuba': 'CUB', 'Nicaragua': 'NIC', 'Honduras': 'HND', 'Guatemala': 'GTM',
  'El Salvador': 'SLV', 'Venezuela': 'VEN',
};

// IMF WEO DataMapper API — debt/GDP and deficit merged into one row per year
async function fetchWeoHistorical(country) {
  const iso3 = IMF_ISO3[country];
  if (!iso3) return [];

  // Fetch both indicators then merge by year — one row per (country, 'imf_fiscal', year)
  const byYear = {};

  const indicators = [
    { code: 'GGXWDG_NGDP', field: 'gross_debt_pct_gdp' },
    { code: 'GGXCNL_NGDP', field: 'net_lending_pct_gdp' },
  ];

  for (const ind of indicators) {
    const url = `https://www.imf.org/external/datamapper/api/v1/${ind.code}/${iso3}`;
    try {
      const json = await httpsGet(url);
      const values = json?.values?.[ind.code]?.[iso3] || {};
      for (const [year, value] of Object.entries(values)) {
        if (!byYear[year]) byYear[year] = {};
        byYear[year][ind.field] = value !== null ? parseFloat(value) : null;
      }
    } catch (err) {
      // Non-fatal — other indicator may still have data
    }
    await new Promise(r => setTimeout(r, 300));
  }

  if (Object.keys(byYear).length === 0) {
    return [{
      signal_key: 'imf_fiscal', signal_name: 'Fiscal Stress',
      date: '1980-01-01', raw_value: null,
      raw_metadata: { iso3, error: 'no_data_returned' },
      source: 'imf_weo_datamapper', gap: true, gap_reason: 'fetch_error',
    }];
  }

  return Object.entries(byYear).map(([year, fields]) => {
    const debt = fields.gross_debt_pct_gdp;
    return {
      signal_key:   'imf_fiscal',
      signal_name:  'Fiscal Stress',
      date:         `${year}-01-01`,
      raw_value:    debt,
      raw_metadata: { iso3, year, ...fields },
      source:       'imf_weo_datamapper',
      gap:          debt === null,
      gap_reason:   debt === null ? 'not_reported' : null,
    };
  });
}

async function fetchImfHistorical(country) {
  return fetchWeoHistorical(country);
}

module.exports = { fetchImfHistorical };
