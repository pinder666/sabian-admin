// cablewatch_feed.cjs
// Cable Disruption Signal — internet traffic anomaly detection via Cloudflare Radar
// Source: Cloudflare Radar API (CLOUDFLARE_RADAR_TOKEN required)
// Score 0–100: higher = greater internet disruption vs 7-day baseline
// Logic: Submarine cable cuts, BGP hijacks, and government shutdowns all reduce
//   a country's internet traffic. Cloudflare sees ~20% of global web traffic.
//   A sudden drop vs baseline = physical infrastructure attack or deliberate shutdown.
//   This cannot be faked — it is measured at the network layer.
// Cadence: 24h — Cloudflare Radar updates continuously, we read 7-day window

require('dotenv').config({ path: './.env' });
const https = require('https');
const { logToHive } = require('./logger.cjs');
const { resolveTableKey } = require('./resolve_table_key.cjs');

const CF_TOKEN = process.env.CLOUDFLARE_RADAR_TOKEN;

// Cloudflare uses ISO 3166-1 alpha-2 codes
const COUNTRY_CF_CODE = {
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
  'Vietnam': 'VN', 'Yemen': 'YE', 'Zambia': 'ZM', 'Zimbabwe': 'ZW'
};

function fetchCloudflareSummary(cfCode) {
  return new Promise((resolve) => {
    if (!CF_TOKEN) return resolve(null);
    const params = new URLSearchParams({
      dateRange: '7d',
      location:  cfCode,
      format:    'json'
    });
    const options = {
      hostname: 'api.cloudflare.com',
      path:     `/client/v4/radar/http/summary/device_type?${params.toString()}`,
      headers:  {
        'Authorization': `Bearer ${CF_TOKEN}`,
        'Content-Type':  'application/json'
      },
      timeout: 15000
    };
    https.get(options, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { resolve(null); }
      });
    }).on('error', () => resolve(null)).on('timeout', () => resolve(null));
  });
}

function fetchCloudflareTimeseries(cfCode) {
  return new Promise((resolve) => {
    if (!CF_TOKEN) return resolve(null);
    const params = new URLSearchParams({
      dateRange: '14d',
      location:  cfCode,
      name:      'main',
      format:    'json'
    });
    const options = {
      hostname: 'api.cloudflare.com',
      path:     `/client/v4/radar/netflows/timeseries?${params.toString()}`,
      headers:  {
        'Authorization': `Bearer ${CF_TOKEN}`,
        'Content-Type':  'application/json'
      },
      timeout: 15000
    };
    https.get(options, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { resolve(null); }
      });
    }).on('error', () => resolve(null)).on('timeout', () => resolve(null));
  });
}

function fetchCloudflareOutages(cfCode) {
  return new Promise((resolve) => {
    if (!CF_TOKEN) return resolve(null);
    const params = new URLSearchParams({
      dateRange: '7d',
      location:  cfCode,
      format:    'json'
    });
    const options = {
      hostname: 'api.cloudflare.com',
      path:     `/client/v4/radar/annotations/outages?${params.toString()}`,
      headers:  {
        'Authorization': `Bearer ${CF_TOKEN}`,
        'Content-Type':  'application/json'
      },
      timeout: 15000
    };
    https.get(options, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { resolve(null); }
      });
    }).on('error', () => resolve(null)).on('timeout', () => resolve(null));
  });
}

async function fetchCableWatchData(country) {
  try {
    if (!CF_TOKEN) {
      logToHive({ source: 'cablewatch_feed', level: 'warn', event: 'no_token', data: { country } });
      return { score: null, reason: 'no_cloudflare_token' };
    }

    const { value: cfCode } = await resolveTableKey(country, COUNTRY_CF_CODE);
    if (!cfCode) return { score: null, reason: 'no_cf_code' };

    const [timeseries, outages] = await Promise.all([
      fetchCloudflareTimeseries(cfCode),
      fetchCloudflareOutages(cfCode)
    ]);

    let score = 0;
    let activeOutages = 0;
    let trafficDrop = 0;
    const details = [];

    // Check active outages — confirmed disruptions Cloudflare has detected
    if (outages && outages.success && Array.isArray(outages.result?.annotations)) {
      activeOutages = outages.result.annotations.length;
      if (activeOutages > 0) {
        details.push(`${activeOutages} active outage event(s) detected`);
        score += Math.min(60, activeOutages * 20);  // each outage = +20, cap at 60
      }
    }

    // Check traffic timeseries — look for anomalous drop in last 24h vs 7-day baseline
    if (timeseries && timeseries.success && timeseries.result?.main) {
      const series = timeseries.result.main;
      const values = series.values || [];
      if (values.length >= 8) {
        const baseline = values.slice(0, -2).reduce((s, v) => s + parseFloat(v), 0) / (values.length - 2);
        const recent   = values.slice(-2).reduce((s, v) => s + parseFloat(v), 0) / 2;
        if (baseline > 0) {
          trafficDrop = Math.round(((baseline - recent) / baseline) * 100);
          if (trafficDrop > 50) {
            details.push(`${trafficDrop}% traffic drop vs 7-day baseline — severe disruption`);
            score += 40;
          } else if (trafficDrop > 20) {
            details.push(`${trafficDrop}% traffic drop vs 7-day baseline — moderate disruption`);
            score += 20;
          } else if (trafficDrop < -10) {
            details.push('Traffic elevated — possible rerouting or DDoS');
            score += 5;
          }
        }
      }
    }

    score = Math.min(100, score);

    if (score === 0 && activeOutages === 0) {
      return { score: 5, active_outages: 0, traffic_drop_pct: trafficDrop, status: 'normal' };
    }

    return {
      score,
      active_outages: activeOutages,
      traffic_drop_pct: trafficDrop,
      details
    };

  } catch (err) {
    logToHive({ source: 'cablewatch_feed', level: 'warn', event: 'fetch_error', data: { country, error: err.message } });
    return { score: null, reason: 'fetch_error', error: err.message };
  }
}

module.exports = { fetchCableWatchData };
