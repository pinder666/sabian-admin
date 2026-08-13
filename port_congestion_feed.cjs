// port_congestion_feed.cjs
// Port Congestion Signal — import delay risk for wholesale apparel
// Added: 2026-08-13 — highest-value signal for PNSIQ wholesale intelligence
//
// Why this matters:
//   ~40% of US apparel imports arrive via LA/Long Beach from Asia.
//   Port congestion → delayed goods → missed ship windows → retailer chargebacks.
//   A brand whose goods sit 8 days at anchor has a chargeback problem they don't know about yet.
//   This feed surfaces that before the invoice dispute arrives.
//
// Key ports (apparel import volume ranked):
//   Los Angeles (POLA), Long Beach (POLB), New York/NJ, Savannah GA,
//   Seattle/Tacoma, Miami
//
// Sources:
//   Primary:   FRED API — US import volume from China (monthly, proxy for LA/LB load)
//   Secondary: BTS Port Performance baselines (hardcoded quarterly averages)
//   Stub:      Marine Exchange vessel-at-anchor count (add MARINE_EXCHANGE_KEY when ready)
//              Register free at: https://www.mxps.net/
//              Or: MarineTraffic API — https://www.marinetraffic.com/en/ais-api-services
//
// Score 0–100: higher = more congestion, higher delay/chargeback risk for apparel brands
// Cadence: daily (FRED monthly data + rolling vessel stub)

require('dotenv').config({ path: './.env' });
const https = require('https');
const { logToHive } = require('./logger.cjs');

const FRED_API_KEY           = process.env.FRED_API_KEY;
const MARINE_EXCHANGE_KEY    = process.env.MARINE_EXCHANGE_KEY || null; // stub — add when ready

// ── Port profiles ─────────────────────────────────────────────────────────────
// capacity_teu: annual TEU capacity (millions)
// apparel_share: % of US apparel imports this port handles (approximate)
// baseline_wait_days: normal average vessel wait days pre-pandemic
// critical_wait_days: threshold at which chargebacks start occurring (typical ship window = 2 days)
const PORT_PROFILES = {
  'Los Angeles': {
    code: 'POLA', region: 'West Coast', state: 'CA',
    capacity_teu: 10.7, apparel_share: 0.22,
    baseline_wait_days: 0.5, critical_wait_days: 3,
    fred_proxy: 'IMPCH',   // US imports from China — main driver of LA/LB load
    lat: 33.7366, lon: -118.2614
  },
  'Long Beach': {
    code: 'POLB', region: 'West Coast', state: 'CA',
    capacity_teu: 9.5, apparel_share: 0.18,
    baseline_wait_days: 0.5, critical_wait_days: 3,
    fred_proxy: 'IMPCH',
    lat: 33.7701, lon: -118.1937
  },
  'New York / New Jersey': {
    code: 'PANYNJ', region: 'East Coast', state: 'NY/NJ',
    capacity_teu: 9.4, apparel_share: 0.14,
    baseline_wait_days: 0.3, critical_wait_days: 2,
    fred_proxy: 'IMPEU',   // US imports from EU — drives NY/NJ garment imports
    lat: 40.6840, lon: -74.1502
  },
  'Savannah': {
    code: 'GPA', region: 'East Coast', state: 'GA',
    capacity_teu: 6.1, apparel_share: 0.08,
    baseline_wait_days: 0.2, critical_wait_days: 2,
    fred_proxy: 'IMPCH',
    lat: 32.0809, lon: -81.0912
  },
  'Seattle / Tacoma': {
    code: 'NWSA', region: 'West Coast', state: 'WA',
    capacity_teu: 4.1, apparel_share: 0.06,
    baseline_wait_days: 0.3, critical_wait_days: 2,
    fred_proxy: 'IMPCH',
    lat: 47.5612, lon: -122.3493
  },
  'Miami': {
    code: 'PortMiami', region: 'Southeast', state: 'FL',
    capacity_teu: 1.8, apparel_share: 0.04,
    baseline_wait_days: 0.2, critical_wait_days: 2,
    fred_proxy: 'IMPMX',   // US imports from Mexico/Latin America — drives Miami apparel
    lat: 25.7739, lon: -80.1700
  }
};

// ── FRED series metadata ──────────────────────────────────────────────────────
// Maps proxy series to their expected monthly value ranges for scoring
const FRED_SERIES_META = {
  'IMPCH': { name: 'US Imports from China',        baseline_bn: 42,  surge_bn: 55  },
  'IMPEU': { name: 'US Imports from European Union', baseline_bn: 38,  surge_bn: 48  },
  'IMPMX': { name: 'US Imports from Mexico',        baseline_bn: 35,  surge_bn: 48  }
};

// ── FRED fetch ────────────────────────────────────────────────────────────────
function fetchFredSeries(seriesId, months = 6) {
  return new Promise((resolve) => {
    if (!FRED_API_KEY) return resolve(null);
    const start = new Date();
    start.setMonth(start.getMonth() - months);
    const params = new URLSearchParams({
      series_id:         seriesId,
      api_key:           FRED_API_KEY,
      file_type:         'json',
      observation_start: start.toISOString().slice(0, 10),
      limit:             String(months + 2),
      sort_order:        'desc'
    });
    const url = `https://api.stlouisfed.org/fred/series/observations?${params}`;
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

// ── Marine Exchange stub ──────────────────────────────────────────────────────
// Returns vessels at anchor + average wait hours for a port.
// Currently returns null — plug in MARINE_EXCHANGE_KEY to activate.
// Free registration: https://www.mxps.net/
// Marine Traffic alternative: https://www.marinetraffic.com/en/ais-api-services (100 free credits/mo)
async function fetchVesselsAtAnchor(portCode) {
  if (!MARINE_EXCHANGE_KEY) return null;
  // TODO: implement Marine Exchange API call when key is available
  // Endpoint pattern: https://api.mxps.net/v1/anchorage?port=POLA&key=<KEY>
  // Returns: { vessels_at_anchor: 12, avg_wait_hours: 48, updated: "2026-08-13T06:00:00Z" }
  return null;
}

// ── Score calculation ─────────────────────────────────────────────────────────
function scoreFromImportVolume(fredData, meta) {
  if (!fredData || !fredData.observations) return { score: null, reason: 'no_fred_data' };

  const obs = fredData.observations
    .filter(o => o.value !== '.' && o.value !== null)
    .map(o => ({ date: o.date, value: parseFloat(o.value) }));

  if (obs.length < 2) return { score: null, reason: 'insufficient_data' };

  const latest   = obs[0].value;
  const sixMoAvg = obs.slice(0, 6).reduce((s, o) => s + o.value, 0) / Math.min(obs.length, 6);
  const trend    = ((latest - sixMoAvg) / sixMoAvg) * 100; // % above 6-month avg

  // Score: 0 = at or below baseline, 100 = at or above surge level
  const baseline = meta.baseline_bn;
  const surge    = meta.surge_bn;
  let volumeScore = Math.round(((latest - baseline) / (surge - baseline)) * 60);
  volumeScore = Math.max(0, Math.min(60, volumeScore)); // volume component: 0–60

  // Trend bonus: sharp YoY acceleration adds urgency
  let trendScore = 0;
  if (trend > 15)      trendScore = 25;
  else if (trend > 8)  trendScore = 15;
  else if (trend > 3)  trendScore = 8;

  const total = Math.min(100, volumeScore + trendScore);

  return {
    score: total,
    latest_bn: latest,
    six_mo_avg_bn: Math.round(sixMoAvg * 10) / 10,
    trend_pct: Math.round(trend * 10) / 10,
    latest_date: obs[0].date,
    reason: 'fred_volume_proxy'
  };
}

function scoreFromVessels(vesselData, profile) {
  if (!vesselData || vesselData.vessels_at_anchor == null) return null;
  const { vessels_at_anchor, avg_wait_hours } = vesselData;
  const waitDays = avg_wait_hours / 24;

  // Score based on wait days vs port's critical threshold
  if (waitDays >= profile.critical_wait_days * 3) return 95;
  if (waitDays >= profile.critical_wait_days * 2) return 80;
  if (waitDays >= profile.critical_wait_days)     return 65;
  if (waitDays >= profile.baseline_wait_days * 3) return 40;
  if (waitDays >= profile.baseline_wait_days * 2) return 20;
  return 10;
}

function congestionLabel(score) {
  if (score == null)  return 'UNKNOWN';
  if (score >= 80)    return 'SEVERE';
  if (score >= 60)    return 'HIGH';
  if (score >= 40)    return 'ELEVATED';
  if (score >= 20)    return 'MODERATE';
  return 'NORMAL';
}

function chargebackRisk(score, apparelShare) {
  // Higher apparel share + higher congestion = direct chargeback exposure
  if (score == null) return null;
  const risk = Math.round(score * apparelShare * 2);
  return Math.min(100, risk);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function fetchPortCongestionData() {
  const results = [];
  const seenSeries = {};

  // Fetch each unique FRED proxy series once
  for (const profile of Object.values(PORT_PROFILES)) {
    if (!seenSeries[profile.fred_proxy]) {
      seenSeries[profile.fred_proxy] = await fetchFredSeries(profile.fred_proxy, 8);
    }
  }

  for (const [portName, profile] of Object.entries(PORT_PROFILES)) {
    const fredData   = seenSeries[profile.fred_proxy];
    const meta       = FRED_SERIES_META[profile.fred_proxy];
    const vesselData = await fetchVesselsAtAnchor(profile.code);

    const volumeResult  = scoreFromImportVolume(fredData, meta);
    const vesselScore   = scoreFromVessels(vesselData, profile);

    // If we have live vessel data, weight it heavily. Otherwise use volume proxy alone.
    let finalScore;
    if (vesselScore != null) {
      finalScore = Math.round(vesselScore * 0.7 + (volumeResult.score || 0) * 0.3);
    } else {
      finalScore = volumeResult.score;
    }

    const result = {
      port:               portName,
      code:               profile.code,
      region:             profile.region,
      state:              profile.state,
      congestion_score:   finalScore,
      congestion_label:   congestionLabel(finalScore),
      apparel_share_pct:  Math.round(profile.apparel_share * 100),
      chargeback_risk:    chargebackRisk(finalScore, profile.apparel_share),
      vessels_at_anchor:  vesselData ? vesselData.vessels_at_anchor : null,
      avg_wait_hours:     vesselData ? vesselData.avg_wait_hours : null,
      import_volume_bn:   volumeResult.latest_bn   || null,
      import_trend_pct:   volumeResult.trend_pct   || null,
      data_date:          volumeResult.latest_date  || new Date().toISOString().slice(0, 10),
      source:             vesselData ? 'marine_exchange+fred' : 'fred_volume_proxy',
      live_vessel_data:   vesselData != null,
      lat:                profile.lat,
      lon:                profile.lon
    };

    results.push(result);

    logToHive({
      source: 'port_congestion_feed',
      level:  finalScore >= 60 ? 'warning' : 'intel',
      event:  `port_score`,
      data:   { port: portName, score: finalScore, label: result.congestion_label, chargeback_risk: result.chargeback_risk },
      tags:   ['port', 'apparel', 'congestion', profile.region.toLowerCase().replace('/', '').replace(' ', '_')]
    });
  }

  // Sort by congestion score descending — highest risk port first
  results.sort((a, b) => (b.congestion_score || 0) - (a.congestion_score || 0));

  const summary = {
    as_of:              new Date().toISOString(),
    ports_scored:       results.filter(r => r.congestion_score != null).length,
    ports_severe:       results.filter(r => r.congestion_label === 'SEVERE').length,
    ports_high:         results.filter(r => r.congestion_label === 'HIGH').length,
    highest_risk_port:  results[0]?.port || null,
    highest_risk_score: results[0]?.congestion_score || null,
    live_vessel_feeds:  results.filter(r => r.live_vessel_data).length,
    note_vessel_feeds:  MARINE_EXCHANGE_KEY
      ? 'Marine Exchange live data active'
      : 'Vessel-at-anchor data not yet active — add MARINE_EXCHANGE_KEY to Railway env vars to enable real-time counts. Register free at https://www.mxps.net/'
  };

  logToHive({
    source: 'port_congestion_feed',
    level:  summary.ports_severe > 0 ? 'warning' : 'intel',
    event:  'port_scan_complete',
    data:   summary,
    tags:   ['port', 'apparel', 'summary']
  });

  return { ports: results, summary };
}

module.exports = { fetchPortCongestionData };
