// internet_ioda_feed.cjs
// IODA Internet Outage Signal — BGP-based internet connectivity monitoring
// Source: IODA API (Georgia Tech / CAIDA) — free, no key required
// Score 0–100: higher = more severe internet connectivity disruption
// Logic: IODA uses three independent measurement methods:
//   1. BGP routing table changes (prefix withdrawals = disconnection)
//   2. Internet Background Radiation (IBR) — passive traffic probes
//   3. Active ping probing to address blocks
// This is the third independent shutdown signal alongside OONI and Cloudflare.
// Cadence: near-realtime — IODA updates every 5 minutes

require('dotenv').config({ path: './.env' });
const https = require('https');
const { logToHive } = require('./logger.cjs');

const IODA_ISO2 = {
  'Afghanistan': 'AF', 'Algeria': 'DZ', 'Angola': 'AO', 'Argentina': 'AR',
  'Armenia': 'AM', 'Azerbaijan': 'AZ', 'Bahrain': 'BH', 'Bangladesh': 'BD',
  'Belarus': 'BY', 'Bolivia': 'BO', 'Bosnia': 'BA', 'Brazil': 'BR',
  'Bulgaria': 'BG', 'Burkina Faso': 'BF', 'Burundi': 'BI', 'Cambodia': 'KH',
  'Cameroon': 'CM', 'CAR': 'CF', 'Chad': 'TD', 'Chile': 'CL',
  'China': 'CN', 'Colombia': 'CO', 'Congo': 'CG', 'Cuba': 'CU',
  'Cyprus': 'CY', 'DRC': 'CD', 'Ecuador': 'EC', 'Egypt': 'EG',
  'El Salvador': 'SV', 'Eritrea': 'ER', 'Ethiopia': 'ET',
  'Georgia': 'GE', 'Ghana': 'GH', 'Greece': 'GR', 'Guatemala': 'GT',
  'Guinea': 'GN', 'Haiti': 'HT', 'Honduras': 'HN', 'Hungary': 'HU',
  'India': 'IN', 'Indonesia': 'ID', 'Iran': 'IR', 'Iraq': 'IQ',
  'Israel': 'IL', 'Ivory Coast': 'CI', 'Jamaica': 'JM', 'Jordan': 'JO',
  'Kazakhstan': 'KZ', 'Kenya': 'KE', 'Kuwait': 'KW', 'Kyrgyzstan': 'KG',
  'Laos': 'LA', 'Lebanon': 'LB', 'Libya': 'LY', 'Malaysia': 'MY',
  'Mali': 'ML', 'Mexico': 'MX', 'Moldova': 'MD', 'Mongolia': 'MN',
  'Morocco': 'MA', 'Mozambique': 'MZ', 'Myanmar': 'MM', 'Nepal': 'NP',
  'Nicaragua': 'NI', 'Niger': 'NE', 'Nigeria': 'NG', 'North Korea': 'KP',
  'Oman': 'OM', 'Pakistan': 'PK', 'Palestine': 'PS', 'Panama': 'PA',
  'Peru': 'PE', 'Philippines': 'PH', 'Poland': 'PL', 'Qatar': 'QA',
  'Romania': 'RO', 'Russia': 'RU', 'Rwanda': 'RW', 'Saudi Arabia': 'SA',
  'Senegal': 'SN', 'Serbia': 'RS', 'Sierra Leone': 'SL', 'Singapore': 'SG',
  'Somalia': 'SO', 'South Africa': 'ZA', 'South Korea': 'KR',
  'South Sudan': 'SS', 'Spain': 'ES', 'Sri Lanka': 'LK', 'Sudan': 'SD',
  'Syria': 'SY', 'Taiwan': 'TW', 'Tajikistan': 'TJ', 'Tanzania': 'TZ',
  'Thailand': 'TH', 'Togo': 'TG', 'Tunisia': 'TN', 'Turkey': 'TR',
  'Turkmenistan': 'TM', 'UAE': 'AE', 'Uganda': 'UG', 'UK': 'GB',
  'Ukraine': 'UA', 'United States': 'US', 'Uzbekistan': 'UZ',
  'Venezuela': 'VE', 'Vietnam': 'VN', 'Yemen': 'YE', 'Zambia': 'ZM',
  'Zimbabwe': 'ZW', 'Ethiopia': 'ET', 'Djibouti': 'DJ'
};

function fetchIodaAlerts(iso2) {
  return new Promise((resolve) => {
    const until = Math.floor(Date.now() / 1000);
    const from  = until - (7 * 24 * 60 * 60);  // 7 days
    const url = `https://api.ioda.inetintel.cc.gatech.edu/v2/alerts?entityType=country&entityCode=${iso2}&from=${from}&until=${until}&limit=20`;
    https.get(url, { headers: { 'User-Agent': 'SabianIntelligence/3.0' }, timeout: 15000 }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { resolve(null); }
      });
    }).on('error', () => resolve(null)).on('timeout', () => resolve(null));
  });
}

async function fetchInternetIodaData(country) {
  try {
    const iso2 = IODA_ISO2[country];
    if (!iso2) return { score: null, reason: 'no_ioda_country' };

    const data = await fetchIodaAlerts(iso2);

    if (!data) return { score: null, reason: 'ioda_unreachable' };

    // Handle IODA API response structure
    const alerts = data?.data?.alerts || data?.alerts || [];

    if (!Array.isArray(alerts) || alerts.length === 0) {
      return { score: 5, alert_count: 0, trend: 'normal' };
    }

    // Score by alert severity and count
    // IODA levels: 0=info, 1=warning, 2=critical
    let score = 0;
    const criticalAlerts = alerts.filter(a => a.level >= 2 || a.severity === 'critical');
    const warningAlerts  = alerts.filter(a => a.level === 1 || a.severity === 'warning');

    score += Math.min(60, criticalAlerts.length * 25);
    score += Math.min(30, warningAlerts.length * 10);

    // Check for BGP-specific alerts (most reliable shutdown indicator)
    const bgpAlerts = alerts.filter(a =>
      (a.datasource || '').toLowerCase().includes('bgp') ||
      (a.type || '').toLowerCase().includes('bgp')
    );
    if (bgpAlerts.length > 0) score = Math.min(100, score + 20);

    return {
      score:          Math.min(100, Math.max(5, score)),
      alert_count:    alerts.length,
      critical_count: criticalAlerts.length,
      bgp_alerts:     bgpAlerts.length,
      trend:          score >= 50 ? 'outage_detected' : score >= 25 ? 'degraded' : 'normal'
    };

  } catch (err) {
    logToHive({ source: 'internet_ioda_feed', level: 'warn', event: 'fetch_error', data: { country, error: err.message } });
    return { score: null, reason: 'fetch_error', error: err.message };
  }
}

module.exports = { fetchInternetIodaData };
