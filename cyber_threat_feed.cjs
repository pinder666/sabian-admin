// cyber_threat_feed.cjs
// Cyber Threat Signal — active threat intelligence per country
// Source: AlienVault OTX (Open Threat Exchange) — pulse data by country
// Score 0–100: higher = more active cyber threat activity targeting or originating from country
// Logic: OTX pulses contain verified IOCs attributed to specific countries.
//   A spike in pulses targeting or originating from a country precedes
//   infrastructure attacks, ransomware campaigns, and state-sponsored intrusions.
// Cadence: 24h — OTX updates continuously, we query last 7-day window
// API key: OTX_API_KEY (free account at otx.alienvault.com)

require('dotenv').config({ path: './.env' });
const https = require('https');
const { logToHive } = require('./logger.cjs');

const OTX_API_KEY = process.env.OTX_API_KEY;

// ISO2 codes for OTX country queries
const COUNTRY_ISO2 = {
  'Russia': 'RU', 'China': 'CN', 'Iran': 'IR', 'North Korea': 'KP',
  'Ukraine': 'UA', 'United States': 'US', 'Germany': 'DE', 'France': 'FR',
  'UK': 'GB', 'Israel': 'IL', 'Saudi Arabia': 'SA', 'UAE': 'AE',
  'Pakistan': 'PK', 'India': 'IN', 'Turkey': 'TR', 'Brazil': 'BR',
  'Nigeria': 'NG', 'South Africa': 'ZA', 'Egypt': 'EG', 'Ethiopia': 'ET',
  'Indonesia': 'ID', 'Vietnam': 'VN', 'Bangladesh': 'BD', 'Mexico': 'MX',
  'Argentina': 'AR', 'Colombia': 'CO', 'Venezuela': 'VE', 'Iraq': 'IQ',
  'Syria': 'SY', 'Libya': 'LY', 'Sudan': 'SD', 'Somalia': 'SO',
  'Yemen': 'YE', 'Afghanistan': 'AF', 'Myanmar': 'MM', 'Thailand': 'TH',
  'Malaysia': 'MY', 'Philippines': 'PH', 'Taiwan': 'TW', 'South Korea': 'KR',
  'Japan': 'JP', 'Australia': 'AU', 'Canada': 'CA', 'Poland': 'PL',
  'Romania': 'RO', 'Bulgaria': 'BG', 'Kazakhstan': 'KZ', 'Uzbekistan': 'UZ',
  'Belarus': 'BY', 'Georgia': 'GE', 'Azerbaijan': 'AZ', 'Armenia': 'AM',
  'Lebanon': 'LB', 'Jordan': 'JO', 'Qatar': 'QA', 'Kuwait': 'KW',
  'Bahrain': 'BH', 'Oman': 'OM', 'Morocco': 'MA', 'Algeria': 'DZ',
  'Tunisia': 'TN', 'Kenya': 'KE', 'Tanzania': 'TZ', 'Ghana': 'GH',
  'Ivory Coast': 'CI', 'Senegal': 'SN', 'Cameroon': 'CM', 'Angola': 'AO',
  'Zambia': 'ZM', 'Zimbabwe': 'ZW', 'Mozambique': 'MZ', 'DRC': 'CD',
  'Uganda': 'UG', 'Rwanda': 'RW', 'Sri Lanka': 'LK', 'Nepal': 'NP',
  'Cambodia': 'KH', 'Laos': 'LA', 'Mongolia': 'MN', 'Tajikistan': 'TJ',
  'Kyrgyzstan': 'KG', 'Turkmenistan': 'TM', 'Moldova': 'MD', 'Serbia': 'RS',
  'Bosnia': 'BA', 'Kosovo': 'XK', 'Albania': 'AL', 'North Macedonia': 'MK',
  'Montenegro': 'ME', 'Croatia': 'HR', 'Hungary': 'HU', 'Czech Republic': 'CZ',
  'Slovakia': 'SK', 'Austria': 'AT', 'Switzerland': 'CH', 'Netherlands': 'NL',
  'Belgium': 'BE', 'Spain': 'ES', 'Portugal': 'PT', 'Italy': 'IT',
  'Greece': 'GR', 'Cyprus': 'CY', 'Ireland': 'IE', 'Denmark': 'DK',
  'Sweden': 'SE', 'Norway': 'NO', 'Finland': 'FI', 'Estonia': 'EE',
  'Latvia': 'LV', 'Lithuania': 'LT', 'Singapore': 'SG', 'New Zealand': 'NZ',
  'Chile': 'CL', 'Peru': 'PE', 'Ecuador': 'EC', 'Bolivia': 'BO',
  'Paraguay': 'PY', 'Uruguay': 'UY', 'Panama': 'PA', 'Guatemala': 'GT',
  'Honduras': 'HN', 'El Salvador': 'SV', 'Nicaragua': 'NI', 'Costa Rica': 'CR',
  'Haiti': 'HT', 'Cuba': 'CU', 'Mali': 'ML', 'Niger': 'NE',
  'Burkina Faso': 'BF', 'Chad': 'TD', 'CAR': 'CF', 'South Sudan': 'SS',
  'Eritrea': 'ER', 'Djibouti': 'DJ', 'Liberia': 'LR', 'Sierra Leone': 'SL',
  'Guinea': 'GN', 'Guinea-Bissau': 'GW', 'Togo': 'TG', 'Benin': 'BJ',
  'Malawi': 'MW', 'Burundi': 'BI', 'North Korea': 'KP', 'Haiti': 'HT',
  'Libya': 'LY', 'Congo': 'CG', 'Gabon': 'GA', 'Namibia': 'NA',
  'Botswana': 'BW', 'Mauritania': 'MR'
};

function fetchOtxPulses(iso2) {
  return new Promise((resolve) => {
    if (!OTX_API_KEY) return resolve(null);
    const url = `https://otx.alienvault.com/api/v1/pulses/subscribed?limit=100&modified_since=${getSevenDaysAgo()}`;
    const options = {
      headers: { 'X-OTX-API-KEY': OTX_API_KEY, 'User-Agent': 'SabianIntelligence/3.0' },
      timeout: 15000
    };
    https.get(url, options, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          const pulses = (json.results || []).filter(p =>
            p.targeted_countries && p.targeted_countries.includes(iso2)
          );
          resolve({ pulse_count: pulses.length, pulses });
        } catch { resolve(null); }
      });
    }).on('error', () => resolve(null)).on('timeout', () => resolve(null));
  });
}

function getSevenDaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().split('T')[0];
}

async function fetchCyberThreatData(country) {
  try {
    const iso2 = COUNTRY_ISO2[country];
    if (!iso2) return { score: 5, reason: 'no_iso2', trend: 'stable' };

    if (!OTX_API_KEY) {
      return { score: null, reason: 'no_api_key', trend: 'unknown' };
    }

    const result = await fetchOtxPulses(iso2);

    if (!result) {
      return { score: 5, reason: 'no_otx_response', trend: 'stable' };
    }

    const { pulse_count } = result;

    // Score: each pulse = significant threat activity
    // 10+ pulses in 7 days = elevated (score 60+)
    // 25+ pulses = critical (score 85+)
    const score = Math.min(100,
      pulse_count <= 0  ? 5  :
      pulse_count <= 3  ? 20 :
      pulse_count <= 7  ? 40 :
      pulse_count <= 15 ? 60 :
      pulse_count <= 25 ? 75 :
      85 + Math.min(15, pulse_count - 25)
    );

    return {
      score,
      pulse_count_7d: pulse_count,
      source: 'AlienVault_OTX',
      trend: score >= 70 ? 'critical_threat' : score >= 40 ? 'elevated' : 'monitored'
    };

  } catch (err) {
    logToHive({ source: 'cyber_threat_feed', level: 'warn', event: 'error', data: { country, error: err.message } });
    return { score: null, reason: 'error', error: err.message };
  }
}

module.exports = { fetchCyberThreatData };
