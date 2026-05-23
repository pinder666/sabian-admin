// water_stress_feed.cjs
// Water Stress Signal — structural water scarcity risk per country
// Sources: WRI Aqueduct Water Risk Atlas (country scores) + Copernicus GDO drought indicators
// Score 0–100: higher = more severe structural water stress
// Cadence: annual baseline (WRI) + bi-weekly drought update (Copernicus GDO)

require('dotenv').config({ path: './.env' });
const https = require('https');
const { logToHive } = require('./logger.cjs');

// WRI Aqueduct 3.0 country-level baseline water stress scores (0–5 scale → normalized 0–100)
// Source: wri.org/aqueduct — overall water risk combining quantity, quality, and regulatory dimensions
// 0 = Low, 1 = Low-Medium, 2 = Medium-High, 3 = High, 4 = Extremely High, 5 = Arid/No Data
const AQUEDUCT_SCORES = {
  // MENA — highest water stress region globally
  'Yemen': 95, 'Kuwait': 92, 'UAE': 90, 'Qatar': 90, 'Bahrain': 90,
  'Saudi Arabia': 88, 'Oman': 85, 'Jordan': 87, 'Libya': 82, 'Egypt': 80,
  'Iran': 78, 'Iraq': 82, 'Israel': 75, 'Palestine': 80, 'Lebanon': 65,
  'Syria': 78, 'Tunisia': 68, 'Algeria': 60, 'Morocco': 65,
  // South Asia — high stress, large populations
  'Pakistan': 78, 'India': 72, 'Bangladesh': 55, 'Sri Lanka': 40,
  'Nepal': 30, 'Afghanistan': 68,
  // Central Asia
  'Uzbekistan': 82, 'Turkmenistan': 85, 'Tajikistan': 45, 'Kyrgyzstan': 30,
  'Kazakhstan': 55, 'Azerbaijan': 60, 'Armenia': 50, 'Georgia': 30,
  // Sub-Saharan Africa — highly variable
  'Somalia': 75, 'Eritrea': 70, 'Djibouti': 88, 'Ethiopia': 55,
  'Sudan': 65, 'South Sudan': 50, 'Chad': 60, 'Niger': 65,
  'Mali': 60, 'Burkina Faso': 55, 'Mauritania': 72, 'Senegal': 45,
  'Nigeria': 42, 'Ghana': 38, 'Ivory Coast': 30, 'Guinea': 25,
  'Sierra Leone': 22, 'Liberia': 20, 'Guinea-Bissau': 25,
  'Cameroon': 28, 'CAR': 30, 'DRC': 20, 'Congo': 22,
  'Gabon': 18, 'Equatorial Guinea': 18, 'Angola': 35, 'Zambia': 30,
  'Zimbabwe': 45, 'Mozambique': 38, 'Malawi': 42, 'Tanzania': 40,
  'Kenya': 55, 'Uganda': 38, 'Rwanda': 45, 'Burundi': 42,
  'South Africa': 55, 'Namibia': 65, 'Botswana': 60,
  'Togo': 35, 'Benin': 38, 'Liberia': 22,
  // East/Southeast Asia
  'China': 65, 'Mongolia': 50, 'North Korea': 48, 'South Korea': 55,
  'Japan': 30, 'Taiwan': 40, 'Vietnam': 42, 'Cambodia': 38,
  'Laos': 25, 'Thailand': 48, 'Myanmar': 35, 'Malaysia': 28,
  'Indonesia': 32, 'Philippines': 38, 'Timor-Leste': 35,
  'Papua New Guinea': 18, 'Solomon Islands': 15, 'Fiji': 18,
  // Latin America
  'Mexico': 52, 'Guatemala': 42, 'Honduras': 45, 'El Salvador': 48,
  'Nicaragua': 38, 'Costa Rica': 28, 'Panama': 25, 'Cuba': 35,
  'Haiti': 52, 'Dominican Republic': 42, 'Jamaica': 40,
  'Colombia': 35, 'Venezuela': 40, 'Guyana': 18, 'Suriname': 15,
  'Ecuador': 38, 'Peru': 45, 'Bolivia': 42, 'Brazil': 35,
  'Paraguay': 30, 'Uruguay': 28, 'Chile': 55, 'Argentina': 45,
  'Trinidad and Tobago': 38,
  // Europe
  'Spain': 58, 'Portugal': 55, 'Italy': 48, 'Greece': 52,
  'Cyprus': 65, 'Turkey': 55, 'Bulgaria': 42, 'Romania': 38,
  'Hungary': 35, 'Serbia': 38, 'Bosnia': 32, 'Croatia': 30,
  'Albania': 35, 'Kosovo': 38, 'Montenegro': 30, 'North Macedonia': 38,
  'Slovakia': 30, 'Poland': 32, 'Austria': 22, 'Switzerland': 18,
  'Germany': 30, 'France': 32, 'Belgium': 35, 'Netherlands': 38,
  'Denmark': 28, 'Sweden': 18, 'Norway': 12, 'Finland': 12,
  'UK': 28,
  // Other
  'Russia': 22, 'Ukraine': 35, 'Belarus': 28, 'Moldova': 40,
  'Belize': 22, 'New Zealand': 15, 'Australia': 50,
  'Singapore': 45, 'Bahrain': 90,
  'United States': 35
};

// Copernicus GDO — attempt to fetch current drought anomaly
function fetchCopernicusDrought(iso2) {
  return new Promise((resolve) => {
    // GDO provides country-level drought indicators via their data viewer
    // Direct machine-readable endpoint for combined drought indicator
    const url = `https://drought.emergency.copernicus.eu/tumbo/drought/api/v1/gdo/smadi/?area=${iso2}&format=json`;
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

async function fetchWaterStressData(country) {
  try {
    const baseline = AQUEDUCT_SCORES[country];
    if (baseline === undefined) {
      return { score: null, reason: 'no_aqueduct_data' };
    }

    // Try Copernicus GDO for current drought anomaly
    const isoMap = {
      'Afghanistan': 'AF', 'Algeria': 'DZ', 'Angola': 'AO', 'Argentina': 'AR',
      'Ethiopia': 'ET', 'Iran': 'IR', 'Iraq': 'IQ', 'Jordan': 'JO',
      'Kenya': 'KE', 'Libya': 'LY', 'Mali': 'ML', 'Morocco': 'MA',
      'Niger': 'NE', 'Nigeria': 'NG', 'Pakistan': 'PK', 'Saudi Arabia': 'SA',
      'Somalia': 'SO', 'Sudan': 'SD', 'Syria': 'SY', 'Yemen': 'YE',
      'Egypt': 'EG', 'India': 'IN', 'China': 'CN', 'Spain': 'ES',
      'Turkey': 'TR', 'Mexico': 'MX', 'Brazil': 'BR', 'South Africa': 'ZA'
    };

    let droughtBonus = 0;
    const iso2 = isoMap[country];
    if (iso2) {
      const gdo = await fetchCopernicusDrought(iso2);
      if (gdo && Array.isArray(gdo) && gdo.length > 0) {
        const latest = gdo[gdo.length - 1];
        if (latest && latest.value !== null && latest.value !== undefined) {
          // SMADI: values < -1 = drought conditions
          const smadi = parseFloat(latest.value);
          if (smadi < -2)      droughtBonus = 20;
          else if (smadi < -1) droughtBonus = 10;
          else if (smadi < 0)  droughtBonus = 5;
        }
      }
    }

    const score = Math.min(100, baseline + droughtBonus);

    return {
      score,
      aqueduct_baseline: baseline,
      drought_bonus: droughtBonus,
      severity: score >= 75 ? 'extreme' : score >= 55 ? 'high' : score >= 35 ? 'medium' : 'low'
    };

  } catch (err) {
    logToHive({ source: 'water_stress_feed', level: 'warn', event: 'fetch_error', data: { country, error: err.message } });
    return { score: null, reason: 'fetch_error', error: err.message };
  }
}

module.exports = { fetchWaterStressData };
