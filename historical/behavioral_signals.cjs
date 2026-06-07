// historical/behavioral_signals.cjs
// Behavioral Signal Fetchers — Night Lights, Remittances, Food Prices
// Unengineered human behavior data for the Sabian historical record.
//
// These signals capture what people DO, not what institutions report:
// - Night lights: Economic activity visible from space (can't be faked)
// - Remittances: Diaspora sending money home (voting with wallets)
// - Food prices: Survival economics (precedes unrest)

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// ── Signal definitions ────────────────────────────────────────────────────────

const BEHAVIORAL_SIGNALS = {
  night_lights: {
    key: 'night_lights',
    name: 'Night Lights',
    source: 'NOAA VIIRS/DMSP',
    description: 'Satellite luminosity — economic activity visible from space',
    available_from: 1992,
    unit: 'radiance_index',
    interpretation: 'Higher = more economic activity. Decline = contraction, conflict, infrastructure failure.',
    invert: true // Lower is worse
  },
  diaspora_remittance: {
    key: 'diaspora_remittance',
    name: 'Diaspora Remittances',
    source: 'World Bank',
    description: 'Personal remittances received as % of GDP',
    available_from: 1970,
    unit: 'percent_gdp',
    interpretation: 'Spike = diaspora worried, supporting family. Drop = gave up or source country crisis.',
    invert: false // Complex — both high and sudden drops are signals
  },
  food_stress: {
    key: 'food_stress',
    name: 'Food Stress',
    source: 'World Bank',
    description: 'Prevalence of undernourishment (% of population) — SN.ITK.DEFC.ZS',
    available_from: 2000,
    unit: 'percent_population',
    interpretation: 'Higher = more people unable to meet caloric needs. Yemen >50% during famine years.',
    invert: false // Higher is worse
  }
};

// ── World Bank API — Remittances ──────────────────────────────────────────────
// Indicator: BX.TRF.PWKR.DT.GD.ZS (Personal remittances, received % of GDP)

async function fetchRemittanceData(countryCode, startYear = 1970, endYear = 2025) {
  const indicator = 'BX.TRF.PWKR.DT.GD.ZS';
  const url = `https://api.worldbank.org/v2/country/${countryCode}/indicator/${indicator}?date=${startYear}:${endYear}&format=json&per_page=100`;

  try {
    const response = await axios.get(url, { timeout: 30000 });
    const data = response.data?.[1] || [];

    return data
      .filter(d => d.value !== null)
      .map(d => ({
        country_code: countryCode,
        year: parseInt(d.date),
        value: d.value,
        signal_key: 'diaspora_remittance'
      }));
  } catch (err) {
    console.log(`[REMITTANCE] Failed for ${countryCode}: ${err.message}`);
    return [];
  }
}

// ── World Bank — Food Stress (Undernourishment) ───────────────────────────────
// Indicator: SN.ITK.DEFC.ZS — Prevalence of undernourishment (% of population)
// FAO FAOSTAT API was deprecated/broken (fenixservices.fao.org returns 521).
// World Bank publishes the same FAO undernourishment data via their API.
// Coverage: 2000-present, 130+ countries.

async function fetchFoodStressData(countryCode, startYear = 2000, endYear = 2025) {
  const indicator = 'SN.ITK.DEFC.ZS';
  const url = `https://api.worldbank.org/v2/country/${countryCode}/indicator/${indicator}?date=${startYear}:${endYear}&format=json&per_page=30`;

  try {
    const response = await axios.get(url, { timeout: 30000 });
    const data = response.data?.[1] || [];

    return data
      .filter(d => d.value !== null)
      .map(d => ({
        country_code: countryCode,
        year: parseInt(d.date),
        value: d.value,
        signal_key: 'food_stress'
      }));
  } catch (err) {
    console.log(`[FOOD] Failed for ${countryCode}: ${err.message}`);
    return [];
  }
}

// ── Night Lights — Proxy from World Bank electricity/GDP ──────────────────────
// Full night lights requires satellite imagery processing.
// Proxy: Electric power consumption (kWh per capita) as luminosity proxy

async function fetchNightLightsProxy(countryCode, startYear = 1992, endYear = 2025) {
  // Proxy indicators for night lights:
  // EG.USE.ELEC.KH.PC — Electric power consumption (kWh per capita)
  // EG.ELC.ACCS.ZS — Access to electricity (% of population)
  const indicators = ['EG.USE.ELEC.KH.PC', 'EG.ELC.ACCS.ZS'];

  const results = [];
  for (const indicator of indicators) {
    const url = `https://api.worldbank.org/v2/country/${countryCode}/indicator/${indicator}?date=${startYear}:${endYear}&format=json&per_page=100`;

    try {
      const response = await axios.get(url, { timeout: 30000 });
      const data = response.data?.[1] || [];

      for (const d of data) {
        if (d.value !== null) {
          results.push({
            year: parseInt(d.date),
            indicator,
            value: d.value
          });
        }
      }
    } catch (err) {
      // Continue with other indicator
    }
  }

  // Combine into single night_lights score per year
  const byYear = {};
  for (const r of results) {
    if (!byYear[r.year]) byYear[r.year] = [];
    byYear[r.year].push(r.value);
  }

  return Object.entries(byYear)
    .filter(([_, v]) => v.length > 0)
    .map(([year, values]) => ({
      country_code: countryCode,
      year: parseInt(year),
      value: values.reduce((a, b) => a + b, 0) / values.length,
      signal_key: 'night_lights'
    }));
}

// ── Country code mapping ──────────────────────────────────────────────────────

const COUNTRY_TO_ISO3 = {
  'Afghanistan': 'AFG', 'Albania': 'ALB', 'Algeria': 'DZA', 'Angola': 'AGO',
  'Argentina': 'ARG', 'Armenia': 'ARM', 'Australia': 'AUS', 'Austria': 'AUT',
  'Azerbaijan': 'AZE', 'Bangladesh': 'BGD', 'Belarus': 'BLR', 'Belgium': 'BEL',
  'Benin': 'BEN', 'Bolivia': 'BOL', 'Bosnia and Herzegovina': 'BIH',
  'Botswana': 'BWA', 'Brazil': 'BRA', 'Bulgaria': 'BGR', 'Burkina Faso': 'BFA',
  'Burundi': 'BDI', 'Cambodia': 'KHM', 'Cameroon': 'CMR', 'Canada': 'CAN',
  'CAR': 'CAF', 'Central African Republic': 'CAF', 'Chad': 'TCD', 'Chile': 'CHL',
  'China': 'CHN', 'Colombia': 'COL', 'Congo': 'COG', 'DRC': 'COD',
  'Costa Rica': 'CRI', 'Croatia': 'HRV', 'Cuba': 'CUB', 'Czech Republic': 'CZE',
  'Denmark': 'DNK', 'Dominican Republic': 'DOM', 'Ecuador': 'ECU', 'Egypt': 'EGY',
  'El Salvador': 'SLV', 'Eritrea': 'ERI', 'Estonia': 'EST', 'Ethiopia': 'ETH',
  'Finland': 'FIN', 'France': 'FRA', 'Gabon': 'GAB', 'Gambia': 'GMB',
  'Georgia': 'GEO', 'Germany': 'DEU', 'Ghana': 'GHA', 'Greece': 'GRC',
  'Guatemala': 'GTM', 'Guinea': 'GIN', 'Guinea-Bissau': 'GNB', 'Haiti': 'HTI',
  'Honduras': 'HND', 'Hungary': 'HUN', 'India': 'IND', 'Indonesia': 'IDN',
  'Iran': 'IRN', 'Iraq': 'IRQ', 'Ireland': 'IRL', 'Israel': 'ISR',
  'Italy': 'ITA', 'Jamaica': 'JAM', 'Japan': 'JPN', 'Jordan': 'JOR',
  'Kazakhstan': 'KAZ', 'Kenya': 'KEN', 'Kuwait': 'KWT', 'Kyrgyzstan': 'KGZ',
  'Laos': 'LAO', 'Latvia': 'LVA', 'Lebanon': 'LBN', 'Liberia': 'LBR',
  'Libya': 'LBY', 'Lithuania': 'LTU', 'Madagascar': 'MDG', 'Malawi': 'MWI',
  'Malaysia': 'MYS', 'Mali': 'MLI', 'Mauritania': 'MRT', 'Mexico': 'MEX',
  'Moldova': 'MDA', 'Mongolia': 'MNG', 'Montenegro': 'MNE', 'Morocco': 'MAR',
  'Mozambique': 'MOZ', 'Myanmar': 'MMR', 'Namibia': 'NAM', 'Nepal': 'NPL',
  'Netherlands': 'NLD', 'New Zealand': 'NZL', 'Nicaragua': 'NIC', 'Niger': 'NER',
  'Nigeria': 'NGA', 'North Korea': 'PRK', 'North Macedonia': 'MKD', 'Norway': 'NOR',
  'Oman': 'OMN', 'Pakistan': 'PAK', 'Palestine': 'PSE', 'Panama': 'PAN',
  'Papua New Guinea': 'PNG', 'Paraguay': 'PRY', 'Peru': 'PER', 'Philippines': 'PHL',
  'Poland': 'POL', 'Portugal': 'PRT', 'Qatar': 'QAT', 'Romania': 'ROU',
  'Russia': 'RUS', 'Rwanda': 'RWA', 'Saudi Arabia': 'SAU', 'Senegal': 'SEN',
  'Serbia': 'SRB', 'Sierra Leone': 'SLE', 'Singapore': 'SGP', 'Slovakia': 'SVK',
  'Slovenia': 'SVN', 'Solomon Islands': 'SLB', 'Somalia': 'SOM', 'South Africa': 'ZAF',
  'South Korea': 'KOR', 'South Sudan': 'SSD', 'Spain': 'ESP', 'Sri Lanka': 'LKA',
  'Sudan': 'SDN', 'Suriname': 'SUR', 'Sweden': 'SWE', 'Switzerland': 'CHE',
  'Syria': 'SYR', 'Taiwan': 'TWN', 'Tajikistan': 'TJK', 'Tanzania': 'TZA',
  'Thailand': 'THA', 'Timor-Leste': 'TLS', 'Togo': 'TGO', 'Trinidad and Tobago': 'TTO',
  'Tunisia': 'TUN', 'Turkey': 'TUR', 'Turkmenistan': 'TKM', 'UAE': 'ARE',
  'Uganda': 'UGA', 'UK': 'GBR', 'Ukraine': 'UKR', 'United States': 'USA',
  'Uruguay': 'URY', 'Uzbekistan': 'UZB', 'Venezuela': 'VEN', 'Vietnam': 'VNM',
  'Yemen': 'YEM', 'Zambia': 'ZMB', 'Zimbabwe': 'ZWE'
};

// ── Fetch all behavioral signals for a country ────────────────────────────────

async function fetchBehavioralSignals(country) {
  const iso3 = COUNTRY_TO_ISO3[country];
  if (!iso3) {
    console.log(`[BEHAVIORAL] No ISO3 code for: ${country}`);
    return [];
  }

  console.log(`[BEHAVIORAL] Fetching signals for ${country} (${iso3})...`);

  const [remittance, food, lights] = await Promise.all([
    fetchRemittanceData(iso3),
    fetchFoodStressData(iso3),
    fetchNightLightsProxy(iso3)
  ]);

  const all = [...remittance, ...food, ...lights].map(r => ({
    ...r,
    country
  }));

  console.log(`[BEHAVIORAL] ${country}: remittance=${remittance.length}, food=${food.length}, lights=${lights.length}`);
  return all;
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  BEHAVIORAL_SIGNALS,
  COUNTRY_TO_ISO3,
  fetchRemittanceData,
  fetchFoodStressData,
  fetchNightLightsProxy,
  fetchBehavioralSignals
};
