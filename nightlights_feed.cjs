// nightlights_feed.cjs
// Night Lights Signal — economic activity from orbit via World Bank electricity access
// Score 0–100: higher = darker country (low electricity access = infrastructure collapse risk)
// Source: World Bank API (EG.ELC.ACCS.ZS — % population with electricity access)
// Logic: Countries already in darkness cannot absorb further disruption.
//   A conflict country with 10% electricity access goes fully dark instantly.
//   A country where access is declining year-over-year is losing the lights slowly.
// Cadence: annual (World Bank updates yearly — trend detection runs across 5 years)

require('dotenv').config({ path: './.env' });
const https = require('https');
const { logToHive } = require('./logger.cjs');
const { resolveTableKey } = require('./resolve_table_key.cjs');

// ISO2 map — World Bank uses ISO2 codes
const COUNTRY_ISO2 = {
  'Afghanistan': 'AF', 'Albania': 'AL', 'Algeria': 'DZ', 'Angola': 'AO',
  'Argentina': 'AR', 'Armenia': 'AM', 'Australia': 'AU', 'Azerbaijan': 'AZ',
  'Bahrain': 'BH', 'Bangladesh': 'BD', 'Belarus': 'BY', 'Belgium': 'BE',
  'Belize': 'BZ', 'Benin': 'BJ', 'Bolivia': 'BO', 'Bosnia': 'BA',
  'Botswana': 'BW', 'Brazil': 'BR', 'Bulgaria': 'BG', 'Burkina Faso': 'BF',
  'Burundi': 'BI', 'Cambodia': 'KH', 'Cameroon': 'CM', 'CAR': 'CF',
  'Chad': 'TD', 'Chile': 'CL', 'China': 'CN', 'Colombia': 'CO',
  'Congo': 'CG', 'Costa Rica': 'CR', 'Croatia': 'HR', 'Cuba': 'CU',
  'Cyprus': 'CY', 'Denmark': 'DK', 'Djibouti': 'DJ', 'Dominican Republic': 'DO',
  'DRC': 'CD', 'Ecuador': 'EC', 'Egypt': 'EG', 'El Salvador': 'SV',
  'Equatorial Guinea': 'GQ', 'Eritrea': 'ER', 'Ethiopia': 'ET', 'Fiji': 'FJ',
  'Finland': 'FI', 'France': 'FR', 'Gabon': 'GA', 'Georgia': 'GE',
  'Germany': 'DE', 'Ghana': 'GH', 'Greece': 'GR', 'Guatemala': 'GT',
  'Guinea': 'GN', 'Guinea-Bissau': 'GW', 'Guyana': 'GY', 'Haiti': 'HT',
  'Honduras': 'HN', 'Hungary': 'HU', 'India': 'IN', 'Indonesia': 'ID',
  'Iran': 'IR', 'Iraq': 'IQ', 'Israel': 'IL', 'Italy': 'IT',
  'Ivory Coast': 'CI', 'Jamaica': 'JM', 'Japan': 'JP', 'Jordan': 'JO',
  'Kazakhstan': 'KZ', 'Kenya': 'KE', 'Kosovo': 'XK', 'Kuwait': 'KW',
  'Kyrgyzstan': 'KG', 'Laos': 'LA', 'Lebanon': 'LB', 'Liberia': 'LR',
  'Libya': 'LY', 'Malawi': 'MW', 'Malaysia': 'MY', 'Mali': 'ML',
  'Mauritania': 'MR', 'Mexico': 'MX', 'Moldova': 'MD', 'Mongolia': 'MN',
  'Montenegro': 'ME', 'Morocco': 'MA', 'Mozambique': 'MZ', 'Myanmar': 'MM',
  'Namibia': 'NA', 'Nepal': 'NP', 'Netherlands': 'NL', 'New Zealand': 'NZ',
  'Nicaragua': 'NI', 'Niger': 'NE', 'Nigeria': 'NG', 'North Korea': 'KP',
  'North Macedonia': 'MK', 'Norway': 'NO', 'Oman': 'OM', 'Pakistan': 'PK',
  'Palestine': 'PS', 'Panama': 'PA', 'Papua New Guinea': 'PG', 'Paraguay': 'PY',
  'Peru': 'PE', 'Philippines': 'PH', 'Poland': 'PL', 'Portugal': 'PT',
  'Qatar': 'QA', 'Romania': 'RO', 'Russia': 'RU', 'Rwanda': 'RW',
  'Saudi Arabia': 'SA', 'Senegal': 'SN', 'Serbia': 'RS', 'Sierra Leone': 'SL',
  'Singapore': 'SG', 'Slovakia': 'SK', 'Solomon Islands': 'SB', 'Somalia': 'SO',
  'South Africa': 'ZA', 'South Korea': 'KR', 'South Sudan': 'SS', 'Spain': 'ES',
  'Sri Lanka': 'LK', 'Sudan': 'SD', 'Suriname': 'SR', 'Sweden': 'SE',
  'Switzerland': 'CH', 'Syria': 'SY', 'Taiwan': 'TW', 'Tajikistan': 'TJ',
  'Tanzania': 'TZ', 'Thailand': 'TH', 'Timor-Leste': 'TL', 'Togo': 'TG',
  'Trinidad and Tobago': 'TT', 'Tunisia': 'TN', 'Turkey': 'TR', 'Turkmenistan': 'TM',
  'UAE': 'AE', 'Uganda': 'UG', 'UK': 'GB', 'Ukraine': 'UA',
  'United States': 'US', 'Uruguay': 'UY', 'Uzbekistan': 'UZ', 'Venezuela': 'VE',
  'Vietnam': 'VN', 'Yemen': 'YE', 'Zambia': 'ZM', 'Zimbabwe': 'ZW',
  'Armenia': 'AM', 'Bahrain': 'BH', 'Bosnia': 'BA', 'Myanmar': 'MM'
};

function fetchWorldBankElectricity(iso2) {
  return new Promise((resolve) => {
    const url = `https://api.worldbank.org/v2/country/${iso2}/indicator/EG.ELC.ACCS.ZS?format=json&mrv=5&per_page=5`;
    https.get(url, { timeout: 12000 }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { resolve(null); }
      });
    }).on('error', () => resolve(null)).on('timeout', () => resolve(null));
  });
}

async function fetchNightLightsData(country) {
  try {
    const { value: iso2 } = await resolveTableKey(country, COUNTRY_ISO2);
    if (!iso2) return { score: null, reason: 'no_iso2_mapping' };

    const data = await fetchWorldBankElectricity(iso2);

    if (!data || !Array.isArray(data) || !data[1] || !data[1].length) {
      return { score: null, reason: 'no_worldbank_data' };
    }

    // Extract valid readings (World Bank often has nulls for recent years)
    const readings = data[1]
      .filter(r => r.value !== null && r.value !== undefined)
      .map(r => ({ year: r.date, access: parseFloat(r.value) }));

    if (readings.length === 0) return { score: null, reason: 'no_electricity_data' };

    const latest = readings[0];  // most recent
    const accessPct = latest.access;

    // Convert electricity access % to darkness risk (0-100)
    // 0% access  → score 100 (total darkness, maximum risk)
    // 50% access → score 50
    // 100% access → score 0 (full light, minimum darkness risk)
    const baseScore = Math.round(100 - accessPct);

    // Trend: compare most recent to 3-4 years ago
    let trend = 'stable';
    let trendDelta = 0;
    if (readings.length >= 3) {
      const older = readings[readings.length - 1].access;
      trendDelta = Math.round((accessPct - older) * 10) / 10;
      if (trendDelta < -3) trend = 'deteriorating';
      else if (trendDelta > 3) trend = 'improving';
    }

    // Deteriorating trend = add up to 15 points to risk
    const trendPenalty = trend === 'deteriorating' ? Math.min(15, Math.round(Math.abs(trendDelta) * 2)) : 0;
    const score = Math.min(100, baseScore + trendPenalty);

    return {
      score,
      electricity_access_pct: Math.round(accessPct * 10) / 10,
      latest_year: latest.year,
      trend,
      trend_delta_pct: trendDelta,
      readings_count: readings.length
    };

  } catch (err) {
    logToHive({ source: 'nightlights_feed', level: 'warn', event: 'fetch_error', data: { country, error: err.message } });
    return { score: null, reason: 'fetch_error', error: err.message };
  }
}

module.exports = { fetchNightLightsData };
