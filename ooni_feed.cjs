// ooni_feed.cjs
// OONI — Open Observatory of Network Interference
// Detects internet shutdowns, censorship, and connectivity disruption
// FREE, no key required
// CRITICAL SIGNAL: governments kill the internet 24-72 hours before coups, crackdowns, mass violence
// Myanmar Feb 2021 coup: OONI detected shutdown hours before announcement
// Belarus 2020: internet throttled before mass arrests
// Ethiopia 2021: Tigray internet cut before offensive
// This is a hard, physical, unmanipulable signal

require('dotenv').config({ path: './.env' });
const https = require('https');
const { logToHive } = require('./logger.cjs');
const { resolveTableKey } = require('./resolve_table_key.cjs');

async function fetchOoniScore(country, date) {
  const countryCode = await getCountryCode(country);
  if (!countryCode) {
    return { source: 'OONI', country, conflict_score: null, warning: `No country code for ${country}` };
  }

  const targetDate = date ? new Date(date) : new Date();
  const endStr = targetDate.toISOString().slice(0, 10);
  const startDate = new Date(targetDate);
  startDate.setDate(startDate.getDate() - 30);
  const startStr = startDate.toISOString().slice(0, 10);

  try {
    // OONI API: get measurement counts and anomaly rates
    const path = `/api/v1/aggregation?probe_cc=${countryCode}&since=${startStr}&until=${endStr}&axis_x=measurement_start_day&format=JSON`;
    const raw = await fetchJson('api.ooni.io', path);

    const results = raw?.result || [];

    if (!results.length) {
      return {
        source: 'OONI',
        country,
        conflict_score: 0,
        anomaly_rate: 0,
        measurement_count: 0,
        trend: 'no measurement data',
        period: `${startStr} to ${endStr}`
      };
    }

    // Calculate anomaly rate across the period
    const totalMeasurements = results.reduce((s, r) => s + (r.measurement_count || 0), 0);
    const totalAnomalies = results.reduce((s, r) => s + (r.anomaly_count || 0), 0);
    const anomalyRate = totalMeasurements > 0 ? totalAnomalies / totalMeasurements : 0;

    // Check for recent spike — last 7 days vs prior 23 days
    const recentResults = results.slice(-7);
    const priorResults = results.slice(0, -7);
    const recentAnomRate = getAnomalyRate(recentResults);
    const priorAnomRate = getAnomalyRate(priorResults);
    const spike = priorAnomRate > 0 ? (recentAnomRate - priorAnomRate) / priorAnomRate : 0;

    // Check for complete blackout days (0 measurements = internet fully cut)
    const blackoutDays = results.filter(r => (r.measurement_count || 0) === 0).length;

    // Score: anomaly rate + blackout days + recent spike
    let score = 0;

    // Anomaly rate component (0-50 points)
    if (anomalyRate >= 0.5) score += 50;
    else if (anomalyRate >= 0.3) score += 35;
    else if (anomalyRate >= 0.15) score += 20;
    else if (anomalyRate >= 0.05) score += 10;

    // Blackout days component (0-30 points)
    if (blackoutDays >= 7) score += 30;
    else if (blackoutDays >= 3) score += 20;
    else if (blackoutDays >= 1) score += 15;

    // Recent spike component (0-20 points)
    if (spike >= 2.0) score += 20;      // anomalies doubled recently
    else if (spike >= 1.0) score += 12;
    else if (spike >= 0.5) score += 6;

    score = Math.min(100, score);

    const trend = blackoutDays >= 3 ? 'internet blackout detected' :
                  anomalyRate >= 0.3 ? 'heavy censorship/throttling' :
                  anomalyRate >= 0.1 ? 'elevated interference' :
                  spike >= 1.0 ? 'interference spiking' : 'normal connectivity';

    logToHive({
      source: 'ooni_feed',
      level: 'intel',
      event: 'ooni_scored',
      data: { country, anomalyRate: parseFloat(anomalyRate.toFixed(3)), blackoutDays, spike: parseFloat(spike.toFixed(2)), score },
      tags: ['ooni', 'internet', country]
    });

    return {
      source: 'OONI',
      country,
      conflict_score: score,
      anomaly_rate: parseFloat((anomalyRate * 100).toFixed(1)),
      blackout_days: blackoutDays,
      measurement_count: totalMeasurements,
      recent_spike: parseFloat(spike.toFixed(2)),
      trend,
      period: `${startStr} to ${endStr}`,
      fetched_at: new Date().toISOString()
    };

  } catch (err) {
    logToHive({
      source: 'ooni_feed',
      level: 'error',
      event: 'fetch_failed',
      data: { country, message: err.message },
      tags: ['ooni', 'error']
    });
    return { source: 'OONI', country, conflict_score: null, error: err.message };
  }
}

function getAnomalyRate(results) {
  const total = results.reduce((s, r) => s + (r.measurement_count || 0), 0);
  const anomalies = results.reduce((s, r) => s + (r.anomaly_count || 0), 0);
  return total > 0 ? anomalies / total : 0;
}

// ISO 3166-1 alpha-2 country codes
async function getCountryCode(country) {
  const codes = {
    'Afghanistan': 'AF', 'Albania': 'AL', 'Algeria': 'DZ', 'Angola': 'AO',
    'Argentina': 'AR', 'Armenia': 'AM', 'Australia': 'AU', 'Austria': 'AT',
    'Azerbaijan': 'AZ', 'Bahrain': 'BH', 'Bangladesh': 'BD', 'Belarus': 'BY',
    'Belgium': 'BE', 'Belize': 'BZ', 'Benin': 'BJ', 'Bolivia': 'BO',
    'Bosnia': 'BA', 'Botswana': 'BW', 'Brazil': 'BR', 'Bulgaria': 'BG',
    'Burkina Faso': 'BF', 'Burundi': 'BI', 'Cambodia': 'KH', 'Cameroon': 'CM',
    'CAR': 'CF', 'Chad': 'TD', 'Chile': 'CL', 'China': 'CN',
    'Colombia': 'CO', 'Congo': 'CG', 'Costa Rica': 'CR', 'Croatia': 'HR',
    'Cuba': 'CU', 'Cyprus': 'CY', 'DRC': 'CD', 'Denmark': 'DK',
    'Djibouti': 'DJ', 'Dominican Republic': 'DO', 'Ecuador': 'EC', 'Egypt': 'EG',
    'El Salvador': 'SV', 'Eritrea': 'ER', 'Ethiopia': 'ET', 'Fiji': 'FJ',
    'Finland': 'FI', 'France': 'FR', 'Gabon': 'GA', 'Gambia': 'GM',
    'Georgia': 'GE', 'Germany': 'DE', 'Ghana': 'GH', 'Greece': 'GR',
    'Guatemala': 'GT', 'Guinea': 'GN', 'Guinea-Bissau': 'GW', 'Guyana': 'GY',
    'Haiti': 'HT', 'Honduras': 'HN', 'Hungary': 'HU', 'India': 'IN',
    'Indonesia': 'ID', 'Iran': 'IR', 'Iraq': 'IQ', 'Israel': 'IL',
    'Italy': 'IT', 'Ivory Coast': 'CI', 'Jamaica': 'JM', 'Japan': 'JP',
    'Jordan': 'JO', 'Kazakhstan': 'KZ', 'Kenya': 'KE', 'Kosovo': 'XK',
    'Kuwait': 'KW', 'Kyrgyzstan': 'KG', 'Laos': 'LA', 'Lebanon': 'LB',
    'Liberia': 'LR', 'Libya': 'LY', 'Malawi': 'MW', 'Malaysia': 'MY',
    'Mali': 'ML', 'Mauritania': 'MR', 'Mexico': 'MX', 'Moldova': 'MD',
    'Mongolia': 'MN', 'Montenegro': 'ME', 'Morocco': 'MA', 'Mozambique': 'MZ',
    'Myanmar': 'MM', 'Namibia': 'NA', 'Nepal': 'NP', 'Netherlands': 'NL',
    'New Zealand': 'NZ', 'Nicaragua': 'NI', 'Niger': 'NE', 'Nigeria': 'NG',
    'North Korea': 'KP', 'North Macedonia': 'MK', 'Norway': 'NO', 'Oman': 'OM',
    'Pakistan': 'PK', 'Palestine': 'PS', 'Panama': 'PA', 'Papua New Guinea': 'PG',
    'Paraguay': 'PY', 'Peru': 'PE', 'Philippines': 'PH', 'Poland': 'PL',
    'Portugal': 'PT', 'Qatar': 'QA', 'Romania': 'RO', 'Russia': 'RU',
    'Rwanda': 'RW', 'Saudi Arabia': 'SA', 'Senegal': 'SN', 'Serbia': 'RS',
    'Sierra Leone': 'SL', 'Solomon Islands': 'SB', 'Somalia': 'SO',
    'South Africa': 'ZA', 'South Korea': 'KR', 'South Sudan': 'SS',
    'Spain': 'ES', 'Sri Lanka': 'LK', 'Sudan': 'SD', 'Suriname': 'SR',
    'Sweden': 'SE', 'Switzerland': 'CH', 'Syria': 'SY', 'Taiwan': 'TW',
    'Tajikistan': 'TJ', 'Tanzania': 'TZ', 'Thailand': 'TH', 'Timor-Leste': 'TL',
    'Togo': 'TG', 'Trinidad and Tobago': 'TT', 'Tunisia': 'TN', 'Turkey': 'TR',
    'Turkmenistan': 'TM', 'UAE': 'AE', 'Uganda': 'UG', 'UK': 'GB',
    'Ukraine': 'UA', 'Uruguay': 'UY', 'Uzbekistan': 'UZ', 'Vanuatu': 'VU',
    'Venezuela': 'VE', 'Vietnam': 'VN', 'Yemen': 'YE', 'Zambia': 'ZM', 'Zimbabwe': 'ZW'
  };
  const { value } = await resolveTableKey(country, codes);
  return value;
}

function fetchJson(hostname, path) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname, path, method: 'GET', headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' } },
      res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          if (res.statusCode !== 200) { reject(new Error(`OONI HTTP ${res.statusCode}`)); return; }
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error(`Parse error: ${e.message}`)); }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('OONI timeout')); });
    req.end();
  });
}

module.exports = fetchOoniScore;

if (require.main === module) {
  const country = process.argv[2] || 'Myanmar';
  fetchOoniScore(country)
    .then(r => console.log(JSON.stringify(r, null, 2)))
    .catch(console.error);
}
