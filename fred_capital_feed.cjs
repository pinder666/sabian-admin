// fred_capital_feed.cjs
// Capital Flows Signal — World Bank FDI Net Inflows (% of GDP)
// Indicator: BX.KLT.DINV.WD.GD.ZS
// Score 0–100: higher = greater capital volatility / stress
// Cadence: Annual — World Bank updates yearly
// Upserts to historical_signal_readings with signal_key='capital_flows', source='world_bank_wdi'

require('dotenv').config({ path: './.env' });
const https = require('https');
const { createClient } = require('@supabase/supabase-js');
const { logToHive } = require('./logger.cjs');
const { resolveTableKey } = require('./resolve_table_key.cjs');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const INDICATOR = 'BX.KLT.DINV.WD.GD.ZS';

// Full 212-country ISO2 map — matches historical_signal_readings country names
const ISO_MAP = {
  'Abkhazia': null,              // No World Bank data (disputed territory)
  'Afghanistan': 'AF',
  'Albania': 'AL',
  'Algeria': 'DZ',
  'Andorra': 'AD',
  'Angola': 'AO',
  'Antigua & Barbuda': 'AG',
  'Argentina': 'AR',
  'Armenia': 'AM',
  'Australia': 'AU',
  'Austria': 'AT',
  'Azerbaijan': 'AZ',
  'Bahamas': 'BS',
  'Bahrain': 'BH',
  'Bangladesh': 'BD',
  'Barbados': 'BB',
  'Belarus': 'BY',
  'Belgium': 'BE',
  'Belize': 'BZ',
  'Benin': 'BJ',
  'Bhutan': 'BT',
  'Bolivia': 'BO',
  'Bosnia': 'BA',
  'Botswana': 'BW',
  'Brazil': 'BR',
  'Brunei': 'BN',
  'Bulgaria': 'BG',
  'Burkina Faso': 'BF',
  'Burundi': 'BI',
  'CAR': 'CF',
  'Cambodia': 'KH',
  'Cameroon': 'CM',
  'Canada': 'CA',
  'Cape Verde': 'CV',
  'Chad': 'TD',
  'Chile': 'CL',
  'China': 'CN',
  'Colombia': 'CO',
  'Comoros': 'KM',
  'Congo': 'CG',
  'Costa Rica': 'CR',
  'Croatia': 'HR',
  'Cuba': 'CU',
  'Cyprus': 'CY',
  'Czech Republic': 'CZ',
  'Czechoslovakia': null,        // Historical — dissolved 1993
  'DRC': 'CD',
  'Democratic Republic of Vietnam': null,  // Historical — unified 1976
  'Denmark': 'DK',
  'Djibouti': 'DJ',
  'Dominica': 'DM',
  'Dominican Republic': 'DO',
  'East Germany': null,          // Historical — reunified 1990
  'Ecuador': 'EC',
  'Egypt': 'EG',
  'El Salvador': 'SV',
  'Equatorial Guinea': 'GQ',
  'Eritrea': 'ER',
  'Estonia': 'EE',
  'Eswatini': 'SZ',
  'Ethiopia': 'ET',
  'Federated States of Micronesia': 'FM',
  'Fiji': 'FJ',
  'Finland': 'FI',
  'France': 'FR',
  'Gabon': 'GA',
  'Gambia': 'GM',
  'Georgia': 'GE',
  'German Federal Republic': null,  // Historical — use Germany
  'Germany': 'DE',
  'Ghana': 'GH',
  'Greece': 'GR',
  'Grenada': 'GD',
  'Guatemala': 'GT',
  'Guinea': 'GN',
  'Guinea-Bissau': 'GW',
  'Guyana': 'GY',
  'Haiti': 'HT',
  'Honduras': 'HN',
  'Hong Kong': 'HK',
  'Hungary': 'HU',
  'Iceland': 'IS',
  'India': 'IN',
  'Indonesia': 'ID',
  'Iran': 'IR',
  'Iraq': 'IQ',
  'Ireland': 'IE',
  'Israel': 'IL',
  'Italy': 'IT',
  'Ivory Coast': 'CI',
  'Jamaica': 'JM',
  'Japan': 'JP',
  'Jordan': 'JO',
  'Kazakhstan': 'KZ',
  'Kenya': 'KE',
  'Kiribati': 'KI',
  'Kosovo': 'XK',
  'Kuwait': 'KW',
  'Kyrgyzstan': 'KG',
  'Laos': 'LA',
  'Latvia': 'LV',
  'Lebanon': 'LB',
  'Lesotho': 'LS',
  'Liberia': 'LR',
  'Libya': 'LY',
  'Liechtenstein': 'LI',
  'Lithuania': 'LT',
  'Luxembourg': 'LU',
  'Macau': 'MO',
  'Madagascar': 'MG',
  'Malawi': 'MW',
  'Malaysia': 'MY',
  'Maldives': 'MV',
  'Mali': 'ML',
  'Malta': 'MT',
  'Marshall Islands': 'MH',
  'Mauritania': 'MR',
  'Mauritius': 'MU',
  'Mexico': 'MX',
  'Micronesia': 'FM',
  'Moldova': 'MD',
  'Monaco': 'MC',
  'Mongolia': 'MN',
  'Montenegro': 'ME',
  'Morocco': 'MA',
  'Mozambique': 'MZ',
  'Myanmar': 'MM',
  'Namibia': 'NA',
  'Nauru': 'NR',
  'Nepal': 'NP',
  'Netherlands': 'NL',
  'New Zealand': 'NZ',
  'Nicaragua': 'NI',
  'Niger': 'NE',
  'Nigeria': 'NG',
  'North Korea': 'KP',
  'North Macedonia': 'MK',
  'Norway': 'NO',
  'Oman': 'OM',
  'Pakistan': 'PK',
  'Palau': 'PW',
  'Palestine': 'PS',
  'Panama': 'PA',
  'Papua New Guinea': 'PG',
  'Paraguay': 'PY',
  'Peru': 'PE',
  'Philippines': 'PH',
  'Poland': 'PL',
  'Portugal': 'PT',
  'Puerto Rico': 'PR',
  'Qatar': 'QA',
  'Republic of Vietnam': null,   // Historical — unified 1976
  'Romania': 'RO',
  'Russia': 'RU',
  'Russia (Soviet Union)': null, // Historical — use Russia
  'Rwanda': 'RW',
  'Samoa': 'WS',
  'San Marino': 'SM',
  'Sao Tome and Principe': 'ST',
  'Saudi Arabia': 'SA',
  'Senegal': 'SN',
  'Serbia': 'RS',
  'Seychelles': 'SC',
  'Sierra Leone': 'SL',
  'Singapore': 'SG',
  'Slovakia': 'SK',
  'Slovenia': 'SI',
  'Solomon Islands': 'SB',
  'Somalia': 'SO',
  'South Africa': 'ZA',
  'South Korea': 'KR',
  'South Ossetia': null,         // No World Bank data (disputed territory)
  'South Sudan': 'SS',
  'South Yemen': null,           // Historical — unified 1990
  'Spain': 'ES',
  'Sri Lanka': 'LK',
  'St. Kitts and Nevis': 'KN',
  'St. Lucia': 'LC',
  'St. Vincent': 'VC',
  'St. Vincent and the Grenadines': 'VC',
  'Sudan': 'SD',
  'Suriname': 'SR',
  'Sweden': 'SE',
  'Switzerland': 'CH',
  'Syria': 'SY',
  'Taiwan': 'TW',
  'Tajikistan': 'TJ',
  'Tanzania': 'TZ',
  'Thailand': 'TH',
  'Timor-Leste': 'TL',
  'Togo': 'TG',
  'Tonga': 'TO',
  'Trinidad and Tobago': 'TT',
  'Tunisia': 'TN',
  'Turkey': 'TR',
  'Turkmenistan': 'TM',
  'Tuvalu': 'TV',
  'UAE': 'AE',
  'UK': 'GB',
  'Uganda': 'UG',
  'Ukraine': 'UA',
  'United States': 'US',
  'Uruguay': 'UY',
  'Uzbekistan': 'UZ',
  'Vanuatu': 'VU',
  'Vatican': 'VA',
  'Venezuela': 'VE',
  'Vietnam': 'VN',
  'Yemen': 'YE',
  'Yugoslavia': null,            // Historical — dissolved 1992
  'Zambia': 'ZM',
  'Zimbabwe': 'ZW'
};

function fetchWorldBankIndicator(iso2) {
  return new Promise((resolve, reject) => {
    const startYear = 1970;
    const endYear = new Date().getFullYear();
    const url = `https://api.worldbank.org/v2/country/${iso2}/indicator/${INDICATOR}?date=${startYear}:${endYear}&format=json&per_page=200`;

    https.get(url, { timeout: 30000 }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve(json);
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', e => reject(e)).on('timeout', () => resolve(null));
  });
}

async function fetchCapitalFlowsData(country) {
  const { value: iso2 } = await resolveTableKey(country, ISO_MAP);
  if (!iso2) {
    return { score: null, reason: 'no_iso_mapping' };
  }

  try {
    const json = await fetchWorldBankIndicator(iso2);
    const observations = json?.[1] || [];

    if (observations.length === 0) {
      return { score: null, reason: 'no_data' };
    }

    // Build rows for upsert to historical_signal_readings
    const rows = [];
    for (const obs of observations) {
      if (obs.value === null) continue;

      rows.push({
        country:      country,
        signal_key:   'capital_flows',
        signal_name:  'Capital Flows',
        date:         `${obs.date}-01-01`,
        raw_value:    parseFloat(String(obs.value)),
        raw_metadata: {
          indicator:    INDICATOR,
          country_iso:  obs.countryiso3code || iso2,
          date_raw:     obs.date
        },
        source:       'world_bank_wdi'
      });
    }

    // Upsert to database
    if (rows.length > 0) {
      const { error } = await sb
        .from('historical_signal_readings')
        .upsert(rows, {
          onConflict: 'country,signal_key,date,source',
          ignoreDuplicates: false
        });

      if (error) {
        logToHive({ source: 'fred_capital_feed', level: 'warn', event: 'upsert_error', data: { country, error: error.message } });
      }
    }

    // Return most recent value for live scoring
    const latest = observations.find(o => o.value !== null);
    if (!latest) {
      return { score: null, reason: 'all_null' };
    }

    const fdiPct = parseFloat(String(latest.value));

    // Score: FDI as % of GDP
    // Negative FDI = capital outflow = high stress
    // Very high positive FDI can also signal vulnerability (hot money)
    // Scoring: negative values → high score, moderate positive → low score, very high → elevated
    let score;
    if (fdiPct < -5) {
      score = 90;  // Severe capital flight
    } else if (fdiPct < -2) {
      score = 75;
    } else if (fdiPct < 0) {
      score = 60;
    } else if (fdiPct < 2) {
      score = 40;  // Low/stable inflows
    } else if (fdiPct < 5) {
      score = 30;  // Healthy inflows
    } else if (fdiPct < 10) {
      score = 35;  // Strong inflows
    } else {
      score = 50;  // Very high — potential hot money vulnerability
    }

    return {
      score,
      fdi_pct:       Math.round(fdiPct * 100) / 100,
      year:          latest.date,
      rows_upserted: rows.length,
      source:        'world_bank_wdi'
    };
  } catch (err) {
    logToHive({ source: 'fred_capital_feed', level: 'warn', event: 'fetch_error', data: { country, error: err.message } });
    return { score: null, reason: 'fetch_error', error: err.message };
  }
}

module.exports = { fetchCapitalFlowsData };
