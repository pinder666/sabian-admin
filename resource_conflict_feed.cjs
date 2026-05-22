// resource_conflict_feed.cjs
// Resource conflict signal — commodity price collapse as instability indicator
// Countries mapped to primary export commodity (oil, gold, cobalt, copper, gas)
// Price drop > 30% YoY = fiscal crisis → security breakdown → conflict risk
// Uses Alpha Vantage commodity API (already keyed in .env)
// Follows convergence_engine.cjs signal pattern

require('dotenv').config({ path: './.env' });
const https = require('https');
const { logToHive } = require('./logger.cjs');

const ALPHA_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const METAL_KEY = process.env.METAL_API_KEY;

// Primary export commodity per country — the one most tied to fiscal capacity
// 'oil' | 'gold' | 'cobalt' | 'copper' | 'gas' | 'uranium' | null
const COUNTRY_COMMODITY = {
  // Oil-dependent states — fiscal collapse when oil crashes
  'Nigeria':     'oil',
  'Venezuela':   'oil',
  'Chad':        'oil',
  'South Sudan': 'oil',
  'Iraq':        'oil',
  'Yemen':       'oil',
  'Libya':       'oil',
  'Iran':        'oil',
  'Colombia':    'oil',
  // Gold-dependent states — illegal mining + armed group financing
  'Sudan':       'gold',
  'Mali':        'gold',
  'Burkina Faso':'gold',
  'Niger':       'gold',
  'Ethiopia':    'gold',
  'CAR':         'gold',
  'Ghana':       'gold',
  'Zimbabwe':    'gold',
  'Senegal':     'gold',
  'Guinea':      'gold',
  // Cobalt/copper — DRC + Zambia
  'DRC':         'cobalt',
  'Zambia':      'copper',
  'Eritrea':     'copper',
  // Gas
  'Mozambique':  'gas',
  'Bangladesh':  'gas',
  // Mixed / diversified — use copper as proxy for industrial commodity
  'Ukraine':     'copper',
  'Afghanistan': 'gold',
  'Myanmar':     'gold',
  'Pakistan':    null,
  'Lebanon':     null,
  'Syria':       null,
  'Somalia':     null,
  'Haiti':       null,
  // Expanded — AFRICOM
  'Algeria':     'oil',
  'Angola':      'oil',
  'Congo':       'oil',
  'Equatorial Guinea': 'oil',
  'Gabon':       'oil',
  'South Africa':'gold',
  'Ghana':       'gold',
  'Ivory Coast': 'gold',
  'Tanzania':    'gold',
  'Rwanda':      'gold',
  'Burundi':     'gold',
  'Malawi':      'gold',
  'Liberia':     'gold',
  'Sierra Leone':'gold',
  'Guinea-Bissau':null,
  'Mauritania':  'gold',
  'Morocco':     'copper',
  'Tunisia':     null,
  'Togo':        'gold',
  'Benin':       null,
  'Cameroon':    'oil',
  'Namibia':     'copper',
  'Botswana':    'copper',
  // CENTCOM
  'Saudi Arabia':'oil',
  'UAE':         'oil',
  'Qatar':       'gas',
  'Kuwait':      'oil',
  'Oman':        'oil',
  'Bahrain':     'oil',
  'Jordan':      null,
  'Kazakhstan':  'oil',
  'Uzbekistan':  'gold',
  'Kyrgyzstan':  'gold',
  'Tajikistan':  'gold',
  'Turkmenistan':'gas',
  'Azerbaijan':  'oil',
  // INDOPACOM
  'Philippines': 'copper',
  'Indonesia':   'oil',
  'Vietnam':     'oil',
  'Mongolia':    'copper',
  'Papua New Guinea': 'gold',
  'Solomon Islands':  'gold',
  'Timor-Leste': 'oil',
  'Cambodia':    null,
  'Laos':        'copper',
  'India':       null,
  'China':       'copper',
  'Australia':   'gold',
  'Malaysia':    'oil',
  'Thailand':    null,
  // SOUTHCOM
  'Peru':        'copper',
  'Chile':       'copper',
  'Bolivia':     'gas',
  'Argentina':   'gas',
  'Brazil':      'oil',
  'Guyana':      'oil',
  'Suriname':    'oil',
  'Mexico':      'oil',
  'Guatemala':   null,
  'Honduras':    null,
  'El Salvador': null,
  'Nicaragua':   null,
  'Cuba':        'oil',
  'Dominican Republic': null,
  'Trinidad and Tobago': 'oil',
  // EUCOM
  'Russia':      'oil',
  'Norway':      'oil',
  'Azerbaijan':  'oil',
  'Romania':     'oil',
  'Bulgaria':    null,
  'Turkey':      null
};

// Alpha Vantage function names for commodities
const AV_FUNCTIONS = {
  'oil':    'WTI',
  'gas':    'NATURAL_GAS',
  'copper': 'COPPER'
};

async function fetchAVCommodity(commodity) {
  const fn = AV_FUNCTIONS[commodity];
  if (!fn || !ALPHA_KEY) return null;
  const path = `/query?function=${fn}&interval=monthly&apikey=${ALPHA_KEY}`;
  try {
    const raw = await fetchJson('www.alphavantage.co', path);
    const data = raw?.data;
    if (!data || !data.length) return null;
    // data[0] = latest month, sorted descending
    const latest = parseFloat(data[0]?.value);
    // Find ~12 months ago
    const prior = data.find((d, i) => i >= 10 && i <= 14);
    const priorVal = prior ? parseFloat(prior.value) : null;
    return { latest, prior: priorVal, date: data[0]?.date };
  } catch (_) { return null; }
}

async function fetchGoldPrice() {
  if (!METAL_KEY) return null;
  try {
    const path = `/v1/latest?base=USD&currencies=XAU&api_key=${METAL_KEY}`;
    const raw = await fetchJson('api.metalpriceapi.com', path);
    if (!raw?.success || !raw?.rates?.XAU) return null;
    // XAU rate = troy oz per USD, so gold price = 1/XAU
    const pricePerOz = 1 / raw.rates.XAU;
    return { latest: pricePerOz, prior: null, date: raw.updated };
  } catch (_) { return null; }
}

async function fetchCobaltPrice() {
  if (!METAL_KEY) return null;
  try {
    const path = `/v1/latest?base=USD&currencies=XCO&api_key=${METAL_KEY}`;
    const raw = await fetchJson('api.metalpriceapi.com', path);
    if (!raw?.success || !raw?.rates?.XCO) return null;
    const price = raw.rates.XCO;
    return { latest: price, prior: null, date: raw.updated };
  } catch (_) { return null; }
}

// Score resource risk 0-100
// Primary driver: YoY price change
// If no historical data: use absolute price level as proxy
function scoreFromPrices(latest, prior, commodity) {
  if (!latest) return null;

  // If we have YoY comparison
  if (prior && prior > 0) {
    const change = (latest - prior) / prior;
    // Price crash = fiscal crisis for producers
    if (change <= -0.50) return 100;
    if (change <= -0.30) return Math.round(70 + ((Math.abs(change) - 0.30) / 0.20) * 30);
    if (change <= -0.15) return Math.round(40 + ((Math.abs(change) - 0.15) / 0.15) * 30);
    if (change <= -0.05) return Math.round(20 + ((Math.abs(change) - 0.05) / 0.10) * 20);
    // Price stability or rise = lower resource conflict risk
    return Math.max(0, Math.round(15 - change * 20));
  }

  // No historical comparison — use commodity-specific baselines
  // These are rough 5-year average prices
  const baselines = {
    oil:    { low: 40, high: 100 },  // USD/barrel
    gold:   { low: 1200, high: 2500 }, // USD/oz
    cobalt: { low: 0.015, high: 0.05 }, // USD/g (MetalpriceAPI XCO is per gram)
    copper: { low: 3.0, high: 5.0 }   // USD/lb
  };
  const b = baselines[commodity];
  if (!b) return 20;
  if (latest <= b.low) return 80;
  if (latest >= b.high) return 15;
  return Math.round(15 + ((b.high - latest) / (b.high - b.low)) * 65);
}

async function fetchResourceConflictScore(country) {
  const commodity = COUNTRY_COMMODITY[country];

  if (!commodity) {
    return {
      source: 'ResourceConflict',
      country,
      conflict_score: null,
      warning: `No primary commodity mapped for ${country}`
    };
  }

  try {
    let priceData = null;

    if (commodity === 'gold') {
      priceData = await fetchGoldPrice();
    } else if (commodity === 'cobalt') {
      priceData = await fetchCobaltPrice();
    } else {
      priceData = await fetchAVCommodity(commodity);
    }

    if (!priceData || priceData.latest === null) {
      return { source: 'ResourceConflict', country, conflict_score: null, commodity, warning: 'Price fetch failed' };
    }

    const score = scoreFromPrices(priceData.latest, priceData.prior, commodity);
    const changeText = priceData.prior
      ? `${(((priceData.latest - priceData.prior) / priceData.prior) * 100).toFixed(1)}% YoY`
      : 'no YoY data';

    logToHive({
      source: 'resource_conflict_feed',
      level: 'intel',
      event: 'resource_scored',
      data: { country, commodity, price: priceData.latest, score, change: changeText },
      tags: ['resource', 'commodity', country, commodity]
    });

    return {
      source: 'ResourceConflict',
      country,
      commodity,
      conflict_score: score,
      price: parseFloat(priceData.latest?.toFixed(4)),
      price_change: priceData.prior ? parseFloat((((priceData.latest - priceData.prior) / priceData.prior) * 100).toFixed(1)) : null,
      trend: priceData.prior
        ? (priceData.latest < priceData.prior * 0.85 ? 'collapsing' : priceData.latest < priceData.prior * 0.97 ? 'declining' : priceData.latest > priceData.prior * 1.10 ? 'surging' : 'stable')
        : 'unknown',
      fetched_at: new Date().toISOString()
    };

  } catch (err) {
    logToHive({
      source: 'resource_conflict_feed',
      level: 'error',
      event: 'fetch_failed',
      data: { country, message: err.message },
      tags: ['resource', 'error']
    });
    return { source: 'ResourceConflict', country, conflict_score: null, error: err.message };
  }
}

function fetchJson(hostname, path) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname, path, method: 'GET', headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' } },
      res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error(`Parse error: ${e.message}`)); }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

module.exports = fetchResourceConflictScore;

// Standalone: node resource_conflict_feed.cjs DRC
if (require.main === module) {
  const country = process.argv[2] || 'Nigeria';
  fetchResourceConflictScore(country)
    .then(r => console.log(JSON.stringify(r, null, 2)))
    .catch(console.error);
}
