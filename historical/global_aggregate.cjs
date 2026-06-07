// historical/global_aggregate.cjs
// Sabian Global Intelligence Aggregate
//
// Two-layer view:
//   Base layer  — most recent year from historical_convergence_scores (153 countries, validated)
//   Alert layer — band transitions from observations table (threshold crossings)
//
// Exports:
//   getGlobalSnapshot()         — all countries, current score, band, trajectory, theater
//   getRegionalSnapshot(region) — same filtered to one theater
//   getTopRisk(n)               — top N countries by score
//   getThresholdCrossings(days) — countries that changed bands within N days
//   getRegionalRollup()         — per-theater aggregates with band counts + movement
//   buildGlobalResponse()       — full API response: all of the above combined

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Theater mapping (matches sabian-plugin.js) ────────────────────────────────

const THEATER_MAP = {
  AFRICOM: [
    'Mali','Burkina Faso','Niger','Sudan','Ethiopia','Somalia','DRC','CAR','Chad',
    'Nigeria','Mozambique','Libya','South Sudan','Cameroon','Zimbabwe','Zambia',
    'Tanzania','Senegal','Guinea','Kenya','Uganda','Eritrea','Djibouti',
    'Angola','Rwanda','Burundi','Malawi','Guinea-Bissau','Sierra Leone','Liberia',
    'Togo','Benin','Mauritania','Tunisia','Algeria','Morocco','Egypt',
    'Ghana','Ivory Coast','Gabon','Congo','Equatorial Guinea','Namibia','Botswana',
    'South Africa'
  ],
  CENTCOM: [
    'Yemen','Syria','Iraq','Afghanistan','Pakistan','Iran','Lebanon','Israel','Palestine',
    'Jordan','Saudi Arabia','UAE','Qatar','Bahrain','Kuwait','Oman',
    'Kazakhstan','Kyrgyzstan','Tajikistan','Turkmenistan','Uzbekistan','Azerbaijan'
  ],
  EUCOM: [
    'Ukraine','Armenia','Georgia','Kosovo','Bosnia','Russia','Belarus','Moldova',
    'Serbia','Albania','North Macedonia','Montenegro','Bulgaria','Romania',
    'Hungary','Poland','Slovakia','Croatia','Turkey','Greece','Cyprus',
    'UK','France','Germany','Spain','Italy','Portugal','Sweden','Finland',
    'Norway','Denmark','Netherlands','Belgium','Austria','Switzerland'
  ],
  INDOPACOM: [
    'Myanmar','Bangladesh','Sri Lanka','Taiwan','North Korea','South Korea',
    'China','Japan','Mongolia','Philippines','Indonesia','Vietnam','Cambodia',
    'Laos','Thailand','Malaysia','Singapore','Nepal','India','Timor-Leste',
    'Papua New Guinea','Solomon Islands','Fiji','Australia','New Zealand'
  ],
  SOUTHCOM: [
    'Venezuela','Colombia','Haiti','Ecuador','Bolivia','Peru','Brazil',
    'Argentina','Chile','Paraguay','Uruguay','Guyana','Suriname',
    'Trinidad and Tobago','Panama','Costa Rica','Nicaragua','Honduras',
    'Guatemala','El Salvador','Cuba','Dominican Republic','Jamaica','Belize','Mexico'
  ],
  NORTHCOM: [
    'United States'
  ]
};

function getTheater(country) {
  for (const [t, countries] of Object.entries(THEATER_MAP)) {
    if (countries.includes(country)) return t;
  }
  return 'GLOBAL';
}

function getRiskBand(score) {
  if (score >= 81) return 'CRITICAL';
  if (score >= 66) return 'WARNING';
  if (score >= 41) return 'ELEVATED';
  return 'STABLE';
}

// ── Base layer: most recent year per country from historical_convergence_scores ─

async function fetchHistoricalBaseline() {
  const { data, error } = await sb
    .from('historical_convergence_scores')
    .select('country, year, score, breakdown')
    .order('year', { ascending: false })
    .limit(3000); // enough for 153 countries × several years

  if (error) throw new Error(`Historical baseline: ${error.message}`);

  // Keep only the most recent year per country
  const latest = {};
  for (const row of (data || [])) {
    if (!latest[row.country]) latest[row.country] = row;
  }

  return latest; // { [country]: { country, year, score, breakdown } }
}

// ── Alert layer: live scan scores (most recent per country) ───────────────────

async function fetchLiveScores() {
  const { data, error } = await sb
    .from('convergence_scores')
    .select('country, scan_date, convergence_score, risk_level, theater, top_3_signals')
    .order('scan_date', { ascending: false })
    .limit(1000);

  if (error) return {};

  const latest = {};
  for (const row of (data || [])) {
    if (!latest[row.country]) latest[row.country] = row;
  }
  return latest; // { [country]: { convergence_score, risk_level, scan_date, theater, top_3_signals } }
}

// ── Threshold crossings from observations table ───────────────────────────────

async function fetchRecentCrossings(days = 7) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().slice(0, 10);

  const { data, error } = await sb
    .from('observations')
    .select('country, scan_date, risk_level, previous_risk_level, direction, convergence_score')
    .gte('scan_date', sinceStr)
    .order('scan_date', { ascending: false })
    .limit(200);

  if (error) return [];
  return data || [];
}

// ── Build the combined country snapshot ──────────────────────────────────────

async function buildSnapshot() {
  const [historical, live, crossings] = await Promise.all([
    fetchHistoricalBaseline(),
    fetchLiveScores(),
    fetchRecentCrossings(7)
  ]);

  // Build crossing map: country → most recent crossing
  const crossingMap = {};
  for (const c of crossings) {
    if (!crossingMap[c.country]) crossingMap[c.country] = c;
  }

  // Merge all known countries
  const allCountries = new Set([
    ...Object.keys(historical),
    ...Object.keys(live)
  ]);

  const snapshot = [];

  for (const country of allCountries) {
    const hist = historical[country];
    const lv   = live[country];

    // Use historical score as authoritative baseline; live score if more recent
    const histScore  = hist?.score ?? null;
    const liveScore  = lv?.convergence_score ?? null;

    // Prefer live score (more recent) if available, otherwise historical
    const score      = liveScore ?? histScore;
    if (score === null) continue;

    const band       = lv?.risk_level || getRiskBand(score);
    const theater    = lv?.theater || getTheater(country);
    const year       = hist?.year || null;
    const scanDate   = lv?.scan_date || null;
    const crossing   = crossingMap[country] || null;

    // Trajectory: compare live score to historical baseline
    let trajectory = 'STABLE';
    if (liveScore !== null && histScore !== null) {
      const delta = liveScore - histScore;
      if      (delta >=  10) trajectory = 'SHARP_RISE';
      else if (delta >=   5) trajectory = 'RISING';
      else if (delta <=  -10) trajectory = 'SHARP_FALL';
      else if (delta <=  -5) trajectory = 'FALLING';
    }

    snapshot.push({
      country,
      score:             Math.round(score),
      band,
      theater,
      trajectory,
      historical_year:   year,
      historical_score:  histScore ? Math.round(histScore) : null,
      live_score:        liveScore ? Math.round(liveScore) : null,
      live_scan_date:    scanDate,
      top_signals:       lv?.top_3_signals || null,
      recent_crossing:   crossing ? {
        date:          crossing.scan_date,
        from:          crossing.previous_risk_level,
        to:            crossing.risk_level,
        direction:     crossing.direction
      } : null
    });
  }

  // Sort by score descending
  snapshot.sort((a, b) => b.score - a.score);
  return snapshot;
}

// ── Public API functions ──────────────────────────────────────────────────────

async function getGlobalSnapshot() {
  return buildSnapshot();
}

async function getRegionalSnapshot(region) {
  const all = await buildSnapshot();
  return all.filter(c => c.theater === region.toUpperCase());
}

async function getTopRisk(n = 10) {
  const all = await buildSnapshot();
  return all.slice(0, n);
}

async function getThresholdCrossings(days = 7) {
  const raw = await fetchRecentCrossings(days);
  // Enrich with theater
  return raw.map(c => ({
    ...c,
    theater: getTheater(c.country),
    direction_label: c.direction === 'ASCENDING' ? 'WORSENING' : 'IMPROVING'
  }));
}

async function getRegionalRollup() {
  const all = await buildSnapshot();
  const crossings7d = await fetchRecentCrossings(7);
  const crossings30d = await fetchRecentCrossings(30);

  // Build crossing counts per theater
  const crossingsByTheater7  = {};
  const crossingsByTheater30 = {};
  for (const c of crossings7d) {
    const t = getTheater(c.country);
    crossingsByTheater7[t] = (crossingsByTheater7[t] || 0) + 1;
  }
  for (const c of crossings30d) {
    const t = getTheater(c.country);
    crossingsByTheater30[t] = (crossingsByTheater30[t] || 0) + 1;
  }

  const theaters = [...Object.keys(THEATER_MAP), 'GLOBAL'];
  const rollup = {};

  for (const theater of theaters) {
    const countries = all.filter(c => c.theater === theater);
    if (countries.length === 0) continue;

    const bands = { CRITICAL: 0, WARNING: 0, ELEVATED: 0, STABLE: 0 };
    const rising = [], falling = [];
    let totalScore = 0;

    for (const c of countries) {
      bands[c.band] = (bands[c.band] || 0) + 1;
      totalScore += c.score;
      if (c.trajectory === 'RISING' || c.trajectory === 'SHARP_RISE') rising.push(c.country);
      if (c.trajectory === 'FALLING' || c.trajectory === 'SHARP_FALL') falling.push(c.country);
    }

    rollup[theater] = {
      country_count:        countries.length,
      average_score:        Math.round(totalScore / countries.length),
      bands,
      rising_count:         rising.length,
      falling_count:        falling.length,
      crossings_7d:         crossingsByTheater7[theater] || 0,
      crossings_30d:        crossingsByTheater30[theater] || 0,
      highest_risk:         countries[0] ? { country: countries[0].country, score: countries[0].score, band: countries[0].band } : null,
      critical_countries:   countries.filter(c => c.band === 'CRITICAL').map(c => c.country),
      warning_countries:    countries.filter(c => c.band === 'WARNING').map(c => c.country)
    };
  }

  return rollup;
}

// ── Full response builder for GET /api/global ─────────────────────────────────

async function buildGlobalResponse() {
  const [snapshot, crossings, rollup] = await Promise.all([
    buildSnapshot(),
    fetchRecentCrossings(7),
    getRegionalRollup()
  ]);

  const bandCounts = { CRITICAL: 0, WARNING: 0, ELEVATED: 0, STABLE: 0 };
  for (const c of snapshot) {
    bandCounts[c.band] = (bandCounts[c.band] || 0) + 1;
  }

  return {
    generated_at:       new Date().toISOString(),
    country_count:      snapshot.length,
    band_counts:        bandCounts,
    global_avg_score:   snapshot.length
      ? Math.round(snapshot.reduce((s, c) => s + c.score, 0) / snapshot.length)
      : null,
    top_10:             snapshot.slice(0, 10),
    recent_crossings:   crossings.slice(0, 20).map(c => ({
      country:       c.country,
      theater:       getTheater(c.country),
      date:          c.scan_date,
      from:          c.previous_risk_level,
      to:            c.risk_level,
      direction:     c.direction,
      score:         c.convergence_score
    })),
    regional_rollup:    rollup,
    all_countries:      snapshot
  };
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  getGlobalSnapshot,
  getRegionalSnapshot,
  getTopRisk,
  getThresholdCrossings,
  getRegionalRollup,
  buildGlobalResponse,
  THEATER_MAP,
  getTheater
};
