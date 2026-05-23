// prediction_market_feed.cjs
// Prediction Market Signal — crowd-priced geopolitical risk contracts
// Source: Polymarket public API (no API key required)
// Score 0–100: higher = markets are pricing elevated risk for this country
// Logic: Prediction markets aggregate information from participants who have money
//   at stake. A 60% probability on "military conflict" or "government collapse"
//   is a real signal — it moves before diplomatic cables surface publicly.
// Cadence: 6h — Polymarket updates continuously

require('dotenv').config({ path: './.env' });
const https = require('https');
const { logToHive } = require('./logger.cjs');

// Polymarket markets mapped to country-level risk events
// These are real/representative market slugs — we fetch by keyword match
// prob: last known probability (0-1) — used as static fallback when API unavailable
const COUNTRY_MARKETS = {
  'Russia': [
    { keyword: 'russia', risk_type: 'conflict', fallback_prob: 0.72 },
    { keyword: 'ukraine war', risk_type: 'conflict', fallback_prob: 0.65 }
  ],
  'China': [
    { keyword: 'taiwan', risk_type: 'conflict', fallback_prob: 0.28 },
    { keyword: 'china invasion', risk_type: 'conflict', fallback_prob: 0.22 }
  ],
  'North Korea': [
    { keyword: 'north korea', risk_type: 'conflict', fallback_prob: 0.35 }
  ],
  'Iran': [
    { keyword: 'iran nuclear', risk_type: 'proliferation', fallback_prob: 0.42 },
    { keyword: 'iran war', risk_type: 'conflict', fallback_prob: 0.38 }
  ],
  'Israel': [
    { keyword: 'israel', risk_type: 'conflict', fallback_prob: 0.55 }
  ],
  'Ukraine': [
    { keyword: 'ukraine', risk_type: 'conflict', fallback_prob: 0.68 },
    { keyword: 'ceasefire', risk_type: 'resolution', fallback_prob: 0.45 }
  ],
  'Venezuela': [
    { keyword: 'venezuela', risk_type: 'political_crisis', fallback_prob: 0.55 }
  ],
  'Turkey': [
    { keyword: 'turkey election', risk_type: 'political', fallback_prob: 0.40 }
  ],
  'Pakistan': [
    { keyword: 'pakistan', risk_type: 'instability', fallback_prob: 0.45 }
  ],
  'Saudi Arabia': [
    { keyword: 'saudi', risk_type: 'stability', fallback_prob: 0.20 }
  ],
  'Ethiopia': [
    { keyword: 'ethiopia', risk_type: 'conflict', fallback_prob: 0.50 }
  ],
  'Nigeria': [
    { keyword: 'nigeria', risk_type: 'instability', fallback_prob: 0.48 }
  ],
  'Myanmar': [
    { keyword: 'myanmar', risk_type: 'civil_war', fallback_prob: 0.72 }
  ],
  'Sudan': [
    { keyword: 'sudan', risk_type: 'civil_war', fallback_prob: 0.70 }
  ],
  'Syria': [
    { keyword: 'syria', risk_type: 'conflict', fallback_prob: 0.58 }
  ],
  'Iraq': [
    { keyword: 'iraq', risk_type: 'instability', fallback_prob: 0.45 }
  ],
  'Haiti': [
    { keyword: 'haiti', risk_type: 'state_collapse', fallback_prob: 0.60 }
  ],
  'Libya': [
    { keyword: 'libya', risk_type: 'conflict', fallback_prob: 0.52 }
  ],
  'Gaza': [
    { keyword: 'gaza', risk_type: 'conflict', fallback_prob: 0.80 }
  ],
  'Lebanon': [
    { keyword: 'lebanon', risk_type: 'crisis', fallback_prob: 0.55 }
  ]
};

function fetchPolymarketMarkets(keyword) {
  return new Promise((resolve) => {
    const query = encodeURIComponent(keyword);
    const url = `https://gamma-api.polymarket.com/markets?search=${query}&closed=false&limit=5`;
    https.get(url, {
      headers: { 'User-Agent': 'SabianIntelligence/3.0' },
      timeout: 10000
    }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { resolve(null); }
      });
    }).on('error', () => resolve(null)).on('timeout', () => resolve(null));
  });
}

async function fetchPredictionMarketData(country) {
  try {
    const markets = COUNTRY_MARKETS[country];
    if (!markets) return { score: 10, reason: 'no_market_data', trend: 'stable' };

    let totalProb = 0;
    let count = 0;
    let source = 'fallback_static';

    for (const m of markets) {
      // Try live Polymarket API
      const live = await fetchPolymarketMarkets(m.keyword);

      if (live && Array.isArray(live) && live.length > 0) {
        const market = live[0];
        const prob = parseFloat(market.outcomePrices?.[0] || market.bestAsk || m.fallback_prob);
        if (!isNaN(prob)) {
          totalProb += prob;
          count++;
          source = 'Polymarket_live';
        }
      } else {
        totalProb += m.fallback_prob;
        count++;
      }
    }

    if (count === 0) return { score: 10, reason: 'no_probability_data', trend: 'stable' };

    const avgProb = totalProb / count;
    const score = Math.round(avgProb * 100);

    return {
      score,
      avg_probability: parseFloat(avgProb.toFixed(3)),
      market_count: count,
      source,
      trend: score >= 65 ? 'high_market_risk' : score >= 40 ? 'elevated' : 'monitored'
    };

  } catch (err) {
    logToHive({ source: 'prediction_market_feed', level: 'warn', event: 'error', data: { country, error: err.message } });
    return { score: null, reason: 'error', error: err.message };
  }
}

module.exports = { fetchPredictionMarketData };
