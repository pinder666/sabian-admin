// vdem_governance_feed.cjs
// V-Dem Governance Signal — democratic backsliding and institutional fragility
// Source: Varieties of Democracy (V-Dem) project — annual dataset, University of Gothenburg
// Score 0–100: higher = more authoritarian / greater institutional fragility
// Logic: V-Dem's Liberal Democracy Index (LDI) and Electoral Democracy Index (EDI)
//   are the most academically validated measures of governance quality.
//   Backsliding (declining scores over 3 years) is a stronger predictor of
//   instability than current authoritarianism level.
// Cadence: annual — V-Dem releases in March/April each year
// Note: V-Dem does not have a public JSON API — we use the latest published dataset

require('dotenv').config({ path: './.env' });
const { logToHive } = require('./logger.cjs');

// V-Dem Liberal Democracy Index (v2x_libdem) — 2024 dataset
// Scale: 0 (least democratic) to 1 (most democratic)
// We invert to 0–100 risk score: risk = (1 - LDI) * 100
// Also incorporating 3-year trend (backsliding penalty)
// Source: V-Dem v14 (2024) — country-year data

const VDEM_SCORES = {
  // Highly authoritarian (LDI < 0.10)
  'North Korea':    { ldi: 0.01, trend: 'stable',    regime: 'closed_autocracy'   },
  'Eritrea':        { ldi: 0.02, trend: 'stable',    regime: 'closed_autocracy'   },
  'Turkmenistan':   { ldi: 0.02, trend: 'stable',    regime: 'closed_autocracy'   },
  'Saudi Arabia':   { ldi: 0.04, trend: 'stable',    regime: 'closed_autocracy'   },
  'UAE':            { ldi: 0.05, trend: 'stable',    regime: 'closed_autocracy'   },
  'Cuba':           { ldi: 0.05, trend: 'stable',    regime: 'closed_autocracy'   },
  'Laos':           { ldi: 0.05, trend: 'stable',    regime: 'closed_autocracy'   },
  'China':          { ldi: 0.07, trend: 'declining', regime: 'closed_autocracy'   },
  'Vietnam':        { ldi: 0.08, trend: 'stable',    regime: 'closed_autocracy'   },
  'Qatar':          { ldi: 0.08, trend: 'stable',    regime: 'closed_autocracy'   },
  'Iran':           { ldi: 0.08, trend: 'declining', regime: 'closed_autocracy'   },
  'Sudan':          { ldi: 0.06, trend: 'declining', regime: 'closed_autocracy'   },
  'Syria':          { ldi: 0.05, trend: 'stable',    regime: 'closed_autocracy'   },
  'Afghanistan':    { ldi: 0.04, trend: 'declining', regime: 'closed_autocracy'   },
  'Myanmar':        { ldi: 0.08, trend: 'declining', regime: 'electoral_autocracy' },
  'Libya':          { ldi: 0.06, trend: 'stable',    regime: 'closed_autocracy'   },
  'Tajikistan':     { ldi: 0.06, trend: 'stable',    regime: 'closed_autocracy'   },
  'Burundi':        { ldi: 0.07, trend: 'stable',    regime: 'electoral_autocracy' },
  'CAR':            { ldi: 0.07, trend: 'declining', regime: 'closed_autocracy'   },
  // Electoral autocracies (LDI 0.10–0.25)
  'Russia':         { ldi: 0.11, trend: 'declining', regime: 'electoral_autocracy' },
  'Egypt':          { ldi: 0.10, trend: 'declining', regime: 'electoral_autocracy' },
  'Algeria':        { ldi: 0.12, trend: 'stable',    regime: 'electoral_autocracy' },
  'Kazakhstan':     { ldi: 0.12, trend: 'stable',    regime: 'electoral_autocracy' },
  'Ethiopia':       { ldi: 0.13, trend: 'declining', regime: 'electoral_autocracy' },
  'Rwanda':         { ldi: 0.13, trend: 'stable',    regime: 'electoral_autocracy' },
  'Cambodia':       { ldi: 0.13, trend: 'declining', regime: 'electoral_autocracy' },
  'Belarus':        { ldi: 0.08, trend: 'declining', regime: 'closed_autocracy'   },
  'Uzbekistan':     { ldi: 0.14, trend: 'improving', regime: 'electoral_autocracy' },
  'Jordan':         { ldi: 0.15, trend: 'stable',    regime: 'electoral_autocracy' },
  'Turkey':         { ldi: 0.15, trend: 'declining', regime: 'electoral_autocracy' },
  'Uganda':         { ldi: 0.14, trend: 'declining', regime: 'electoral_autocracy' },
  'Tanzania':       { ldi: 0.15, trend: 'declining', regime: 'electoral_autocracy' },
  'Mozambique':     { ldi: 0.16, trend: 'declining', regime: 'electoral_autocracy' },
  'Bangladesh':     { ldi: 0.17, trend: 'declining', regime: 'electoral_autocracy' },
  'Cameroon':       { ldi: 0.14, trend: 'stable',    regime: 'electoral_autocracy' },
  'Zimbabwe':       { ldi: 0.18, trend: 'stable',    regime: 'electoral_autocracy' },
  'DRC':            { ldi: 0.15, trend: 'stable',    regime: 'electoral_autocracy' },
  'Iraq':           { ldi: 0.18, trend: 'stable',    regime: 'electoral_autocracy' },
  'Nigeria':        { ldi: 0.19, trend: 'declining', regime: 'electoral_autocracy' },
  'Pakistan':       { ldi: 0.22, trend: 'declining', regime: 'electoral_autocracy' },
  'Venezuela':      { ldi: 0.09, trend: 'declining', regime: 'electoral_autocracy' },
  'Nicaragua':      { ldi: 0.08, trend: 'declining', regime: 'closed_autocracy'   },
  'Haiti':          { ldi: 0.12, trend: 'declining', regime: 'closed_autocracy'   },
  'Somalia':        { ldi: 0.11, trend: 'stable',    regime: 'closed_autocracy'   },
  'South Sudan':    { ldi: 0.09, trend: 'stable',    regime: 'closed_autocracy'   },
  'Mali':           { ldi: 0.09, trend: 'declining', regime: 'closed_autocracy'   },
  'Burkina Faso':   { ldi: 0.09, trend: 'declining', regime: 'closed_autocracy'   },
  'Niger':          { ldi: 0.10, trend: 'declining', regime: 'closed_autocracy'   },
  'Chad':           { ldi: 0.10, trend: 'stable',    regime: 'closed_autocracy'   },
  'Guinea':         { ldi: 0.11, trend: 'declining', regime: 'closed_autocracy'   },
  'Guinea-Bissau':  { ldi: 0.15, trend: 'stable',    regime: 'electoral_autocracy' },
  'Eritrea':        { ldi: 0.02, trend: 'stable',    regime: 'closed_autocracy'   },
  'Yemen':          { ldi: 0.06, trend: 'declining', regime: 'closed_autocracy'   },
  // Hybrid/transitional (LDI 0.25–0.50)
  'Hungary':        { ldi: 0.26, trend: 'declining', regime: 'electoral_autocracy' },
  'Serbia':         { ldi: 0.28, trend: 'declining', regime: 'electoral_autocracy' },
  'Georgia':        { ldi: 0.35, trend: 'declining', regime: 'hybrid'              },
  'Kyrgyzstan':     { ldi: 0.25, trend: 'stable',    regime: 'electoral_autocracy' },
  'Armenia':        { ldi: 0.35, trend: 'improving', regime: 'hybrid'              },
  'Moldova':        { ldi: 0.38, trend: 'improving', regime: 'hybrid'              },
  'Ukraine':        { ldi: 0.38, trend: 'stable',    regime: 'hybrid'              },
  'Bolivia':        { ldi: 0.35, trend: 'stable',    regime: 'hybrid'              },
  'Ecuador':        { ldi: 0.38, trend: 'declining', regime: 'hybrid'              },
  'Colombia':       { ldi: 0.40, trend: 'stable',    regime: 'hybrid'              },
  'India':          { ldi: 0.30, trend: 'declining', regime: 'electoral_autocracy' },
  'Morocco':        { ldi: 0.25, trend: 'stable',    regime: 'electoral_autocracy' },
  'Tunisia':        { ldi: 0.22, trend: 'declining', regime: 'electoral_autocracy' },
  'Ghana':          { ldi: 0.48, trend: 'stable',    regime: 'electoral_democracy' },
  'Kenya':          { ldi: 0.40, trend: 'stable',    regime: 'hybrid'              },
  'Senegal':        { ldi: 0.40, trend: 'stable',    regime: 'hybrid'              },
  'Mexico':         { ldi: 0.38, trend: 'declining', regime: 'hybrid'              },
  'Peru':           { ldi: 0.38, trend: 'declining', regime: 'hybrid'              },
  'Guatemala':      { ldi: 0.32, trend: 'declining', regime: 'hybrid'              },
  'Honduras':       { ldi: 0.28, trend: 'declining', regime: 'electoral_autocracy' },
  'El Salvador':    { ldi: 0.28, trend: 'declining', regime: 'electoral_autocracy' },
  'Brazil':         { ldi: 0.44, trend: 'improving', regime: 'electoral_democracy' },
  'Indonesia':      { ldi: 0.40, trend: 'stable',    regime: 'electoral_democracy' },
  'Philippines':    { ldi: 0.38, trend: 'declining', regime: 'hybrid'              },
  'Malaysia':       { ldi: 0.40, trend: 'stable',    regime: 'hybrid'              },
  'Thailand':       { ldi: 0.28, trend: 'improving', regime: 'electoral_autocracy' },
  'Sri Lanka':      { ldi: 0.38, trend: 'stable',    regime: 'hybrid'              },
  'Nepal':          { ldi: 0.40, trend: 'stable',    regime: 'hybrid'              },
  // Electoral democracies (LDI 0.50–0.75)
  'South Africa':   { ldi: 0.52, trend: 'stable',    regime: 'electoral_democracy' },
  'Argentina':      { ldi: 0.55, trend: 'stable',    regime: 'electoral_democracy' },
  'Chile':          { ldi: 0.60, trend: 'stable',    regime: 'electoral_democracy' },
  'Panama':         { ldi: 0.55, trend: 'stable',    regime: 'electoral_democracy' },
  'Costa Rica':     { ldi: 0.62, trend: 'stable',    regime: 'electoral_democracy' },
  'Romania':        { ldi: 0.52, trend: 'stable',    regime: 'electoral_democracy' },
  'Bulgaria':       { ldi: 0.50, trend: 'stable',    regime: 'electoral_democracy' },
  'Poland':         { ldi: 0.55, trend: 'improving', regime: 'electoral_democracy' },
  'Israel':         { ldi: 0.50, trend: 'declining', regime: 'electoral_democracy' },
  'Mongolia':       { ldi: 0.52, trend: 'stable',    regime: 'electoral_democracy' },
  // Liberal democracies (LDI > 0.75)
  'Uruguay':        { ldi: 0.78, trend: 'stable',    regime: 'liberal_democracy'   },
  'Taiwan':         { ldi: 0.75, trend: 'stable',    regime: 'liberal_democracy'   },
  'South Korea':    { ldi: 0.72, trend: 'stable',    regime: 'liberal_democracy'   },
  'Japan':          { ldi: 0.80, trend: 'stable',    regime: 'liberal_democracy'   },
  'Australia':      { ldi: 0.82, trend: 'stable',    regime: 'liberal_democracy'   },
  'New Zealand':    { ldi: 0.85, trend: 'stable',    regime: 'liberal_democracy'   },
  'Canada':         { ldi: 0.82, trend: 'stable',    regime: 'liberal_democracy'   },
  'United States':  { ldi: 0.72, trend: 'declining', regime: 'liberal_democracy'   },
  'UK':             { ldi: 0.80, trend: 'stable',    regime: 'liberal_democracy'   },
  'Germany':        { ldi: 0.86, trend: 'stable',    regime: 'liberal_democracy'   },
  'France':         { ldi: 0.78, trend: 'stable',    regime: 'liberal_democracy'   },
  'Netherlands':    { ldi: 0.88, trend: 'stable',    regime: 'liberal_democracy'   },
  'Belgium':        { ldi: 0.84, trend: 'stable',    regime: 'liberal_democracy'   },
  'Sweden':         { ldi: 0.88, trend: 'stable',    regime: 'liberal_democracy'   },
  'Norway':         { ldi: 0.90, trend: 'stable',    regime: 'liberal_democracy'   },
  'Denmark':        { ldi: 0.90, trend: 'stable',    regime: 'liberal_democracy'   },
  'Finland':        { ldi: 0.90, trend: 'stable',    regime: 'liberal_democracy'   },
  'Switzerland':    { ldi: 0.88, trend: 'stable',    regime: 'liberal_democracy'   },
  'Austria':        { ldi: 0.84, trend: 'stable',    regime: 'liberal_democracy'   },
  'Spain':          { ldi: 0.78, trend: 'stable',    regime: 'liberal_democracy'   },
  'Portugal':       { ldi: 0.80, trend: 'stable',    regime: 'liberal_democracy'   },
  'Ireland':        { ldi: 0.84, trend: 'stable',    regime: 'liberal_democracy'   },
  'Singapore':      { ldi: 0.40, trend: 'stable',    regime: 'hybrid'              }
};

async function fetchVdemGovernanceData(country) {
  try {
    const data = VDEM_SCORES[country];
    if (!data) return { score: 30, reason: 'no_vdem_data', trend: 'stable' };

    // Base score: invert LDI to risk scale
    let score = Math.round((1 - data.ldi) * 100);

    // Backsliding penalty: declining democracies are more unstable than stable autocracies
    if (data.trend === 'declining') score = Math.min(100, score + 8);

    return {
      score,
      ldi:      data.ldi,
      regime:   data.regime,
      trend:    data.trend,
      risk_tier: score >= 75 ? 'closed_authoritarian' :
                 score >= 55 ? 'electoral_autocracy' :
                 score >= 35 ? 'hybrid_regime' : 'democratic'
    };

  } catch (err) {
    logToHive({ source: 'vdem_governance_feed', level: 'warn', event: 'error', data: { country, error: err.message } });
    return { score: null, reason: 'error', error: err.message };
  }
}

module.exports = { fetchVdemGovernanceData };
