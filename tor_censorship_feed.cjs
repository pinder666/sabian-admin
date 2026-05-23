// tor_censorship_feed.cjs
// Tor Censorship Signal — Tor and bridge user spikes as censorship/crackdown indicator
// Source: Tor Metrics API (metrics.torproject.org) — free, no key required
// Score 0–100: higher = more anomalous Tor/bridge usage = active censorship escalation
// Logic: When governments block internet or crack down on dissent, Tor bridge usage
//   spikes 50-300x baseline. Validated: Iran 2022 (3000% spike), Russia 2022 (600% spike).
//   Direct relay users = baseline; bridge users = censorship bypass attempts.
// Cadence: daily

require('dotenv').config({ path: './.env' });
const https = require('https');
const { logToHive } = require('./logger.cjs');

// ISO2 codes for Tor Metrics API
const TOR_COUNTRY_CODES = {
  'Afghanistan': 'af', 'Albania': 'al', 'Algeria': 'dz', 'Angola': 'ao',
  'Argentina': 'ar', 'Armenia': 'am', 'Australia': 'au', 'Azerbaijan': 'az',
  'Bahrain': 'bh', 'Bangladesh': 'bd', 'Belarus': 'by', 'Belize': 'bz',
  'Benin': 'bj', 'Bolivia': 'bo', 'Bosnia': 'ba', 'Botswana': 'bw',
  'Brazil': 'br', 'Bulgaria': 'bg', 'Burkina Faso': 'bf', 'Burundi': 'bi',
  'Cambodia': 'kh', 'Cameroon': 'cm', 'CAR': 'cf', 'Chad': 'td',
  'Chile': 'cl', 'China': 'cn', 'Colombia': 'co', 'Congo': 'cg',
  'Costa Rica': 'cr', 'Croatia': 'hr', 'Cuba': 'cu', 'Cyprus': 'cy',
  'Denmark': 'dk', 'Djibouti': 'dj', 'Dominican Republic': 'do', 'DRC': 'cd',
  'Ecuador': 'ec', 'Egypt': 'eg', 'El Salvador': 'sv', 'Eritrea': 'er',
  'Ethiopia': 'et', 'Fiji': 'fj', 'Finland': 'fi', 'France': 'fr',
  'Gabon': 'ga', 'Georgia': 'ge', 'Germany': 'de', 'Ghana': 'gh',
  'Greece': 'gr', 'Guatemala': 'gt', 'Guinea': 'gn', 'Guinea-Bissau': 'gw',
  'Haiti': 'ht', 'Honduras': 'hn', 'Hungary': 'hu', 'India': 'in',
  'Indonesia': 'id', 'Iran': 'ir', 'Iraq': 'iq', 'Israel': 'il',
  'Italy': 'it', 'Ivory Coast': 'ci', 'Jamaica': 'jm', 'Japan': 'jp',
  'Jordan': 'jo', 'Kazakhstan': 'kz', 'Kenya': 'ke', 'Kosovo': 'xk',
  'Kuwait': 'kw', 'Kyrgyzstan': 'kg', 'Laos': 'la', 'Lebanon': 'lb',
  'Liberia': 'lr', 'Libya': 'ly', 'Malawi': 'mw', 'Malaysia': 'my',
  'Mali': 'ml', 'Mauritania': 'mr', 'Mexico': 'mx', 'Moldova': 'md',
  'Mongolia': 'mn', 'Montenegro': 'me', 'Morocco': 'ma', 'Mozambique': 'mz',
  'Myanmar': 'mm', 'Namibia': 'na', 'Nepal': 'np', 'Netherlands': 'nl',
  'Nicaragua': 'ni', 'Niger': 'ne', 'Nigeria': 'ng', 'North Korea': 'kp',
  'Norway': 'no', 'Oman': 'om', 'Pakistan': 'pk', 'Palestine': 'ps',
  'Panama': 'pa', 'Paraguay': 'py', 'Peru': 'pe', 'Philippines': 'ph',
  'Poland': 'pl', 'Portugal': 'pt', 'Qatar': 'qa', 'Romania': 'ro',
  'Russia': 'ru', 'Rwanda': 'rw', 'Saudi Arabia': 'sa', 'Senegal': 'sn',
  'Serbia': 'rs', 'Sierra Leone': 'sl', 'Singapore': 'sg', 'Slovakia': 'sk',
  'Somalia': 'so', 'South Africa': 'za', 'South Korea': 'kr', 'South Sudan': 'ss',
  'Spain': 'es', 'Sri Lanka': 'lk', 'Sudan': 'sd', 'Suriname': 'sr',
  'Sweden': 'se', 'Switzerland': 'ch', 'Syria': 'sy', 'Taiwan': 'tw',
  'Tajikistan': 'tj', 'Tanzania': 'tz', 'Thailand': 'th', 'Timor-Leste': 'tl',
  'Togo': 'tg', 'Tunisia': 'tn', 'Turkey': 'tr', 'Turkmenistan': 'tm',
  'UAE': 'ae', 'Uganda': 'ug', 'UK': 'gb', 'Ukraine': 'ua',
  'United States': 'us', 'Uruguay': 'uy', 'Uzbekistan': 'uz', 'Venezuela': 've',
  'Vietnam': 'vn', 'Yemen': 'ye', 'Zambia': 'zm', 'Zimbabwe': 'zw'
};

function fetchTorUsers(countryCode, startDate, endDate) {
  return new Promise((resolve) => {
    const params = new URLSearchParams({
      start:   startDate,
      end:     endDate,
      country: countryCode
    });
    const url = `https://metrics.torproject.org/userstats-relay-country.csv?${params.toString()}`;
    https.get(url, { headers: { 'User-Agent': 'SabianIntelligence/3.0' }, timeout: 12000 }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve(body));
    }).on('error', () => resolve(null)).on('timeout', () => resolve(null));
  });
}

function fetchTorBridges(countryCode, startDate, endDate) {
  return new Promise((resolve) => {
    const params = new URLSearchParams({
      start:   startDate,
      end:     endDate,
      country: countryCode
    });
    const url = `https://metrics.torproject.org/userstats-bridge-country.csv?${params.toString()}`;
    https.get(url, { headers: { 'User-Agent': 'SabianIntelligence/3.0' }, timeout: 12000 }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve(body));
    }).on('error', () => resolve(null)).on('timeout', () => resolve(null));
  });
}

function parseTorCsv(csv) {
  if (!csv) return [];
  const lines = csv.trim().split('\n').filter(l => !l.startsWith('#') && !l.startsWith('date'));
  return lines.map(l => {
    const parts = l.split(',');
    return { date: parts[0], users: parseFloat(parts[1]) || 0 };
  }).filter(r => !isNaN(r.users));
}

async function fetchTorCensorshipData(country) {
  try {
    const cc = TOR_COUNTRY_CODES[country];
    if (!cc) return { score: null, reason: 'no_country_code' };

    const endDate   = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const [relayData, bridgeData] = await Promise.all([
      fetchTorUsers(cc, startDate, endDate),
      fetchTorBridges(cc, startDate, endDate)
    ]);

    const relayReadings  = parseTorCsv(relayData);
    const bridgeReadings = parseTorCsv(bridgeData);

    if (relayReadings.length === 0 && bridgeReadings.length === 0) {
      return { score: null, reason: 'no_tor_data' };
    }

    let score = 5;  // baseline — Tor usage exists everywhere at low levels
    let bridgeSpike = false;
    let relayDrop = false;

    // Bridge usage spike = censorship bypass (highest signal)
    if (bridgeReadings.length >= 10) {
      const baseline = bridgeReadings.slice(0, -7).reduce((s, r) => s + r.users, 0) / Math.max(1, bridgeReadings.length - 7);
      const recent   = bridgeReadings.slice(-7).reduce((s, r) => s + r.users, 0) / 7;
      if (baseline > 0) {
        const ratio = recent / baseline;
        if (ratio >= 10)     { score += 60; bridgeSpike = true; }
        else if (ratio >= 5) { score += 40; bridgeSpike = true; }
        else if (ratio >= 2) { score += 20; bridgeSpike = true; }
        else if (ratio >= 1.5) score += 10;
      } else if (recent > 50) {
        score += 20;
      }
    }

    // Relay drop = internet restriction causing Tor to be less accessible
    if (relayReadings.length >= 10) {
      const baseline = relayReadings.slice(0, -7).reduce((s, r) => s + r.users, 0) / Math.max(1, relayReadings.length - 7);
      const recent   = relayReadings.slice(-7).reduce((s, r) => s + r.users, 0) / 7;
      if (baseline > 0 && recent / baseline < 0.5) {
        score += 20;
        relayDrop = true;
      }
    }

    return {
      score: Math.min(100, score),
      bridge_spike:   bridgeSpike,
      relay_drop:     relayDrop,
      bridge_readings: bridgeReadings.length,
      relay_readings:  relayReadings.length,
      trend: score >= 60 ? 'crackdown_detected' : score >= 30 ? 'elevated' : 'normal'
    };

  } catch (err) {
    logToHive({ source: 'tor_censorship_feed', level: 'warn', event: 'fetch_error', data: { country, error: err.message } });
    return { score: null, reason: 'fetch_error', error: err.message };
  }
}

module.exports = { fetchTorCensorshipData };
