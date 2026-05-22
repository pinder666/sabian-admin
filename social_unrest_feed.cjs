// social_unrest_feed.cjs
// Social Unrest Signal — ACLED civil protest/riot event layer
// Source: ACLED (acleddata.com) — requires free registration, non-commercial licence
// Auth: ACLED_EMAIL + ACLED_API_KEY in .env
//
// EULA constraint: data may NOT be used to train ML models — convergence scoring only, never into hive
//
// Queries PROTEST and RIOT event types — distinct from the armed conflict feed
// which tracks Battles, Violence against civilians, and Explosions/Remote violence.
// These two signals do not double-count ACLED data.
//
// Window: 90 days (protest cycles are shorter than armed conflict cycles)

require('dotenv').config({ path: './.env' });
const https = require('https');
const { logToHive } = require('./logger.cjs');

// ACLED country name mapping — covers all 160 monitored countries
const COUNTRY_NAMES = {
  'Mali': 'Mali', 'Burkina Faso': 'Burkina Faso', 'Niger': 'Niger',
  'Sudan': 'Sudan', 'Ethiopia': 'Ethiopia', 'Somalia': 'Somalia',
  'DRC': 'Democratic Republic of Congo', 'CAR': 'Central African Republic',
  'Chad': 'Chad', 'Myanmar': 'Myanmar', 'Venezuela': 'Venezuela',
  'South Sudan': 'South Sudan', 'Israel': 'Israel', 'Palestine': 'State of Palestine',
  'Ukraine': 'Ukraine', 'Colombia': 'Colombia', 'Lebanon': 'Lebanon',
  'Iraq': 'Iraq', 'Pakistan': 'Pakistan', 'Cameroon': 'Cameroon',
  'Armenia': 'Armenia', 'Georgia': 'Georgia', 'Libya': 'Libya',
  'Haiti': 'Haiti', 'Yemen': 'Yemen', 'Syria': 'Syria',
  'Afghanistan': 'Afghanistan', 'Nigeria': 'Nigeria', 'Mozambique': 'Mozambique',
  'Zimbabwe': 'Zimbabwe', 'Iran': 'Iran', 'Kosovo': 'Kosovo',
  'Bosnia': 'Bosnia-Herzegovina', 'Zambia': 'Zambia', 'Tanzania': 'Tanzania',
  'Senegal': 'Senegal', 'Guinea': 'Guinea', 'Ecuador': 'Ecuador',
  'Bolivia': 'Bolivia', 'Bangladesh': 'Bangladesh', 'Sri Lanka': 'Sri Lanka',
  'Kenya': 'Kenya', 'Uganda': 'Uganda', 'Eritrea': 'Eritrea', 'Djibouti': 'Djibouti',
  'Taiwan': 'Taiwan', 'North Korea': 'North Korea',
  'Russia': 'Russia', 'Belarus': 'Belarus', 'Serbia': 'Serbia',
  'Turkey': 'Turkey', 'India': 'India', 'Brazil': 'Brazil',
  'Peru': 'Peru', 'Chile': 'Chile', 'Argentina': 'Argentina',
  'Mexico': 'Mexico', 'Cuba': 'Cuba', 'Nicaragua': 'Nicaragua',
  'Honduras': 'Honduras', 'Guatemala': 'Guatemala', 'El Salvador': 'El Salvador',
  'Egypt': 'Egypt', 'Algeria': 'Algeria', 'Tunisia': 'Tunisia',
  'Morocco': 'Morocco', 'Saudi Arabia': 'Saudi Arabia', 'Jordan': 'Jordan',
  'Indonesia': 'Indonesia', 'Philippines': 'Philippines', 'Thailand': 'Thailand',
  'Vietnam': 'Vietnam', 'Cambodia': 'Cambodia', 'Nepal': 'Nepal',
  'Kazakhstan': 'Kazakhstan', 'Kyrgyzstan': 'Kyrgyzstan', 'Tajikistan': 'Tajikistan',
  'Uzbekistan': 'Uzbekistan', 'Turkmenistan': 'Turkmenistan',
  'Azerbaijan': 'Azerbaijan', 'Moldova': 'Moldova',
  'South Africa': 'South Africa', 'Ghana': 'Ghana', 'Angola': 'Angola',
  'Rwanda': 'Rwanda', 'Burundi': 'Burundi', 'Malawi': 'Malawi',
  'Guinea-Bissau': 'Guinea-Bissau', 'Sierra Leone': 'Sierra Leone',
  'Liberia': 'Liberia', 'Togo': 'Togo', 'Benin': 'Benin', 'Mauritania': 'Mauritania',
  'Ivory Coast': "Côte d'Ivoire", 'Gabon': 'Gabon', 'Congo': 'Republic of Congo',
  'Equatorial Guinea': 'Equatorial Guinea', 'Namibia': 'Namibia', 'Botswana': 'Botswana',
  'China': 'China', 'South Korea': 'South Korea', 'Japan': 'Japan', 'Mongolia': 'Mongolia',
  'Malaysia': 'Malaysia', 'Singapore': 'Singapore',
  'UK': 'United Kingdom', 'France': 'France', 'Germany': 'Germany', 'Spain': 'Spain',
  'Italy': 'Italy', 'Portugal': 'Portugal', 'Sweden': 'Sweden', 'Finland': 'Finland',
  'Norway': 'Norway', 'Denmark': 'Denmark', 'Netherlands': 'Netherlands',
  'Belgium': 'Belgium', 'Austria': 'Austria', 'Switzerland': 'Switzerland',
  'Greece': 'Greece', 'Bulgaria': 'Bulgaria', 'Romania': 'Romania',
  'Hungary': 'Hungary', 'Poland': 'Poland', 'Slovakia': 'Slovakia',
  'Croatia': 'Croatia', 'North Macedonia': 'North Macedonia',
  'Montenegro': 'Montenegro', 'Albania': 'Albania',
  'UAE': 'United Arab Emirates', 'Qatar': 'Qatar', 'Bahrain': 'Bahrain',
  'Kuwait': 'Kuwait', 'Oman': 'Oman',
  'Paraguay': 'Paraguay', 'Uruguay': 'Uruguay', 'Guyana': 'Guyana',
  'Suriname': 'Suriname', 'Trinidad and Tobago': 'Trinidad and Tobago',
  'Panama': 'Panama', 'Costa Rica': 'Costa Rica',
  'Dominican Republic': 'Dominican Republic', 'Jamaica': 'Jamaica', 'Belize': 'Belize',
  'Timor-Leste': 'Timor-Leste', 'Papua New Guinea': 'Papua New Guinea',
  'Solomon Islands': 'Solomon Islands', 'Fiji': 'Fiji',
  'Australia': 'Australia', 'New Zealand': 'New Zealand',
  'Laos': 'Laos', 'Cyprus': 'Cyprus',
  'United States': 'United States'
};

// ── Fetch protest/riot events from ACLED ─────────────────────────────────────

async function fetchSocialUnrestData(country, dateFrom, dateTo) {
  const email  = process.env.ACLED_EMAIL;
  const apiKey = process.env.ACLED_API_KEY;

  if (!email || !apiKey || apiKey.startsWith('PASTE')) {
    return { social_unrest_score: null, warning: 'ACLED_EMAIL + ACLED_API_KEY not set', source: 'ACLED' };
  }

  const acledName = COUNTRY_NAMES[country] || country;
  const endDate   = dateTo   || new Date().toISOString().slice(0, 10);
  const startDate = dateFrom || subtractDays(endDate, 90);

  // Fetch all events for country/period — filter to Protests/Riots client-side
  // (more reliable than ACLED event_type multi-value syntax)
  const params = new URLSearchParams({
    email,
    key:              apiKey,
    country:          acledName,
    event_date:       `${startDate}|${endDate}`,
    event_date_where: 'BETWEEN',
    limit:            '2000',
    fields:           'event_date|event_type|sub_event_type|fatalities|actor1',
    format:           'json'
  });

  return new Promise((resolve) => {
    const options = {
      hostname: 'acleddata.com',
      path:     `/api/acled/read/?${params.toString()}`,
      method:   'GET',
      headers:  { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          resolve({ social_unrest_score: null, error: `ACLED HTTP ${res.statusCode}`, source: 'ACLED', country });
          return;
        }
        try {
          const body   = JSON.parse(data);
          const all    = Array.isArray(body.data) ? body.data : (Array.isArray(body) ? body : []);
          // Filter to civil unrest event types only — no overlap with conflict feed
          const events = all.filter(e => e.event_type === 'Protests' || e.event_type === 'Riots');
          resolve(_scoreUnrest(country, events, startDate, endDate));
        } catch (e) {
          resolve({ social_unrest_score: null, error: `ACLED parse: ${e.message}`, source: 'ACLED', country });
        }
      });
    });

    req.on('error', (e) => resolve({ social_unrest_score: null, error: e.message, source: 'ACLED', country }));
    req.setTimeout(30000, () => {
      req.destroy();
      resolve({ social_unrest_score: null, error: 'ACLED timeout', source: 'ACLED', country });
    });
    req.end();
  });
}

// ── Score civil unrest 0-100 ──────────────────────────────────────────────────

function _scoreUnrest(country, events, startDate, endDate) {
  if (!events.length) {
    // Zero events = no meaningful unrest detected (explicit 0, not null)
    return {
      source: 'ACLED', country,
      period: `${startDate} to ${endDate}`,
      social_unrest_score: 0,
      total_events: 0, protest_count: 0, riot_count: 0,
      violent_events: 0, violent_pct: 0, state_force_count: 0,
      trend: 'stable', warning: 'No protest/riot events in period',
      fetched_at: new Date().toISOString()
    };
  }

  const protests = events.filter(e => e.event_type === 'Protests');
  const riots    = events.filter(e => e.event_type === 'Riots');

  // Violent sub-events — escalation markers
  const violent = events.filter(e => [
    'Violent demonstration', 'Mob violence',
    'Excessive force against protesters', 'Armed clash'
  ].includes(e.sub_event_type));

  // State-force sub-event — imminent escalation signal
  const stateForce = events.filter(e => e.sub_event_type === 'Excessive force against protesters');

  const total       = events.length;
  const violent_pct = total > 0 ? Math.round((violent.length / total) * 100) : 0;

  // Trend: first vs second half of window
  const midMs  = (new Date(startDate).getTime() + new Date(endDate).getTime()) / 2;
  const mid    = new Date(midMs).toISOString().slice(0, 10);
  const first  = events.filter(e => e.event_date < mid).length;
  const second = events.filter(e => e.event_date >= mid).length;
  const accel  = first > 0 ? (second - first) / first : (second > 0 ? 1 : 0);

  // Base score — calibrated to typical protest volumes
  // >300 events/90d = 100 | 100-300 = 50-90 | 30-100 = 20-50 | <30 = 0-20
  let base;
  if      (total >= 300) base = 100;
  else if (total >= 100) base = Math.round(50 + ((total - 100) / 200) * 40);
  else if (total >= 30)  base = Math.round(20 + ((total - 30)  / 70)  * 30);
  else                   base = Math.round((total / 30) * 20);

  const violence_bonus    = Math.round((violent_pct / 100) * 15);          // 0-15
  const repression_bonus  = Math.min(10, stateForce.length * 2);           // 0-10 — repression = imminent escalation
  const accel_bonus       = accel > 0.3 ? Math.min(10, Math.round(accel * 7)) : 0; // 0-10

  const score = Math.min(100, base + violence_bonus + repression_bonus + accel_bonus);

  logToHive({
    source: 'social_unrest_feed',
    level: 'intel',
    event: 'unrest_scored',
    data: { country, score, total, violent_pct, state_force: stateForce.length, accel: accel.toFixed(2) },
    tags: ['acled', 'unrest', country]
  });

  return {
    source: 'ACLED',
    country,
    period:              `${startDate} to ${endDate}`,
    social_unrest_score: score,
    total_events:        total,
    protest_count:       protests.length,
    riot_count:          riots.length,
    violent_events:      violent.length,
    violent_pct,
    state_force_count:   stateForce.length,
    trend:               accel > 0.3 ? 'escalating' : accel < -0.3 ? 'de-escalating' : 'sustained',
    fetched_at:          new Date().toISOString()
  };
}

function subtractDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

module.exports = { fetchSocialUnrestData };

// Standalone test: node social_unrest_feed.cjs Kenya
if (require.main === module) {
  const country  = process.argv[2] || 'Kenya';
  const dateFrom = process.argv[3] || null;
  const dateTo   = process.argv[4] || null;
  console.log(`\nSocial Unrest — ${country}...\n`);
  fetchSocialUnrestData(country, dateFrom, dateTo).then(r => {
    console.log(JSON.stringify(r, null, 2));
  }).catch(console.error);
}
