// historical/fetchers/unhcr_historical.cjs
// UNHCR forced displacement historical data.
// Source: api.unhcr.org/population/v1
// Uses coo (country of origin) — people displaced FROM the country.
// Covers: refugees, IDPs, asylum seekers back to ~1951.
// Returns array of { signal_key, date, raw_value, raw_metadata, source, gap, gap_reason }

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const axios = require('axios');

async function httpsGet(url) {
  const res = await axios.get(url, {
    headers: { 'Accept': 'application/json', 'User-Agent': 'Sabian-Intelligence/1.0' },
    timeout: 15000,
  });
  return res.data;
}

// Full ISO3 map — all 153 countries
const ISO3_MAP = {
  'Mali': 'MLI', 'Burkina Faso': 'BFA', 'Niger': 'NER', 'Sudan': 'SDN', 'Ethiopia': 'ETH',
  'Myanmar': 'MMR', 'Venezuela': 'VEN', 'Somalia': 'SOM', 'DRC': 'COD', 'CAR': 'CAF',
  'Chad': 'TCD', 'Nigeria': 'NGA', 'Mozambique': 'MOZ', 'Libya': 'LBY', 'Haiti': 'HTI',
  'Yemen': 'YEM', 'Afghanistan': 'AFG', 'Syria': 'SYR', 'Iraq': 'IRQ', 'South Sudan': 'SSD',
  'Israel': 'ISR', 'Palestine': 'PSE', 'Ukraine': 'UKR', 'Colombia': 'COL', 'Lebanon': 'LBN',
  'Pakistan': 'PAK', 'Cameroon': 'CMR', 'Armenia': 'ARM', 'Georgia': 'GEO', 'Russia': 'RUS',
  'Philippines': 'PHL', 'Indonesia': 'IDN', 'Mexico': 'MEX', 'Iran': 'IRN', 'Zimbabwe': 'ZWE',
  'Bangladesh': 'BGD', 'Sri Lanka': 'LKA', 'Kenya': 'KEN', 'Uganda': 'UGA', 'Tanzania': 'TZA',
  'Zambia': 'ZMB', 'Senegal': 'SEN', 'Guinea': 'GIN', 'Ecuador': 'ECU', 'Bolivia': 'BOL',
  'Eritrea': 'ERI', 'Djibouti': 'DJI', 'Kosovo': 'XKX', 'Bosnia': 'BIH', 'Taiwan': 'TWN',
  'North Korea': 'PRK', 'Belarus': 'BLR', 'Moldova': 'MDA', 'Serbia': 'SRB', 'Azerbaijan': 'AZE',
  'Kyrgyzstan': 'KGZ', 'Tajikistan': 'TJK', 'Turkmenistan': 'TKM', 'Uzbekistan': 'UZB',
  'Kazakhstan': 'KAZ', 'Peru': 'PER', 'Brazil': 'BRA', 'Nicaragua': 'NIC', 'Honduras': 'HND',
  'Guatemala': 'GTM', 'El Salvador': 'SLV', 'Cuba': 'CUB', 'Angola': 'AGO', 'Rwanda': 'RWA',
  'Burundi': 'BDI', 'Malawi': 'MWI', 'Guinea-Bissau': 'GNB', 'Sierra Leone': 'SLE',
  'Liberia': 'LBR', 'Togo': 'TGO', 'Benin': 'BEN', 'Mauritania': 'MRT', 'Tunisia': 'TUN',
  'Algeria': 'DZA', 'Morocco': 'MAR', 'Egypt': 'EGY', 'Jordan': 'JOR', 'Saudi Arabia': 'SAU',
  'Oman': 'OMN', 'Kuwait': 'KWT', 'Vietnam': 'VNM', 'Cambodia': 'KHM', 'Laos': 'LAO',
  'Nepal': 'NPL', 'India': 'IND', 'Timor-Leste': 'TLS', 'Papua New Guinea': 'PNG',
  'Solomon Islands': 'SLB', 'Fiji': 'FJI', 'Turkey': 'TUR', 'Greece': 'GRC', 'Bulgaria': 'BGR',
  'Romania': 'ROU', 'Hungary': 'HUN', 'Poland': 'POL', 'Slovakia': 'SVK', 'Croatia': 'HRV',
  'North Macedonia': 'MKD', 'Montenegro': 'MNE', 'Albania': 'ALB', 'China': 'CHN',
  'South Korea': 'KOR', 'Japan': 'JPN', 'Mongolia': 'MNG', 'Thailand': 'THA', 'Malaysia': 'MYS',
  'Singapore': 'SGP', 'Australia': 'AUS', 'New Zealand': 'NZL', 'South Africa': 'ZAF',
  'Ghana': 'GHA', 'Ivory Coast': 'CIV', 'Gabon': 'GAB', 'Congo': 'COG',
  'Equatorial Guinea': 'GNQ', 'Namibia': 'NAM', 'Botswana': 'BWA', 'Argentina': 'ARG',
  'Chile': 'CHL', 'Paraguay': 'PRY', 'Uruguay': 'URY', 'Guyana': 'GUY', 'Suriname': 'SUR',
  'Trinidad and Tobago': 'TTO', 'Panama': 'PAN', 'Costa Rica': 'CRI',
  'Dominican Republic': 'DOM', 'Jamaica': 'JAM', 'Belize': 'BLZ', 'UAE': 'ARE',
  'Qatar': 'QAT', 'Bahrain': 'BHR', 'UK': 'GBR', 'France': 'FRA', 'Germany': 'DEU',
  'Spain': 'ESP', 'Italy': 'ITA', 'Portugal': 'PRT', 'Sweden': 'SWE', 'Finland': 'FIN',
  'Norway': 'NOR', 'Denmark': 'DNK', 'Netherlands': 'NLD', 'Belgium': 'BEL', 'Austria': 'AUT',
  'Switzerland': 'CHE', 'Cyprus': 'CYP', 'United States': 'USA',
};

async function fetchUnhcrHistorical(country) {
  const iso3 = ISO3_MAP[country];
  if (!iso3) return [];

  const results = [];
  const currentYear = new Date().getFullYear();

  for (let year = 1951; year <= currentYear; year++) {
    // coo = country of origin: people displaced FROM this country
    const url = `https://api.unhcr.org/population/v1/population/?coo=${iso3}&year=${year}&limit=10`;
    try {
      const json = await httpsGet(url);
      const items = json.items || [];
      if (items.length === 0) {
        results.push({
          signal_key:   'displacement',
          signal_name:  'Displacement',
          date:         `${year}-01-01`,
          raw_value:    null,
          raw_metadata: { iso3, year },
          source:       'unhcr_population_api',
          gap:          true,
          gap_reason:   'no_data_this_year',
        });
      } else {
        // Sum across ALL asylum countries (items[0] = one destination only)
        // API returns string fields — use parseInt to avoid string concatenation
        let refugees = 0, idps = 0, asylum_seekers = 0, stateless = 0;
        for (const d of items) {
          refugees       += parseInt(d.refugees)       || 0;
          idps           += parseInt(d.idps)           || 0;
          asylum_seekers += parseInt(d.asylum_seekers) || 0;
          stateless      += parseInt(d.stateless)      || 0;
        }
        const total = refugees + idps + asylum_seekers;
        results.push({
          signal_key:   'displacement',
          signal_name:  'Displacement',
          date:         `${year}-01-01`,
          raw_value:    total || null,
          raw_metadata: {
            iso3,
            year,
            refugees,
            idps,
            asylum_seekers,
            stateless,
            n_asylum_countries: items.length,
          },
          source:       'unhcr_population_api',
          gap:          total === 0 || total == null,
          gap_reason:   total === 0 ? 'zero_displacement_reported' : null,
        });
      }
    } catch (err) {
      results.push({
        signal_key:   'displacement',
        signal_name:  'Displacement',
        date:         `${year}-01-01`,
        raw_value:    null,
        raw_metadata: { iso3, year, error: err.message },
        source:       'unhcr_population_api',
        gap:          true,
        gap_reason:   'fetch_error',
      });
    }
    await new Promise(r => setTimeout(r, 1100));
  }

  return results;
}

module.exports = { fetchUnhcrHistorical };
