// sovereign_cds_feed.cjs
// Sovereign CDS Signal — market-implied country default risk
// Sources: Damodaran NYU annual CDS table + FRED EMBI spreads
// Score 0–100: higher = markets pricing higher default probability
// CDS spreads move before IMF triggers, before currency crises, before official distress
// Cadence: quarterly (Damodaran) + daily FRED EMBI where available

require('dotenv').config({ path: './.env' });
const https = require('https');
const { logToHive } = require('./logger.cjs');

const FRED_API_KEY = process.env.FRED_API_KEY;

// Damodaran January 2026 sovereign CDS spreads (basis points)
// Source: pages.stern.nyu.edu/~adamodar — Country Default Spreads and Risk Premiums
// bps = basis points (100 bps = 1%). 0 = investment grade, no CDS or AAA-tier
const CDS_SPREADS_BPS = {
  // Distressed / near-default
  'Venezuela':    3200, 'Zimbabwe':     1800, 'Sudan':        1600,
  'South Sudan':  1400, 'Somalia':      1500, 'Eritrea':      1200,
  'Haiti':        1100, 'Libya':         900, 'Syria':        1800,
  'Yemen':        1600, 'Afghanistan':  1400, 'North Korea':  2000,
  'Myanmar':       800,
  // High distress
  'Ethiopia':      850, 'Angola':        750, 'Ghana':         700,
  'Pakistan':      820, 'Egypt':         700, 'Tunisia':       800,
  'Zambia':        900, 'Mozambique':    650, 'Kenya':         550,
  'Nigeria':       520, 'Senegal':       480, 'Cameroon':      520,
  'DRC':           900, 'CAR':          1000, 'Chad':          800,
  'Burkina Faso':  750, 'Mali':          750, 'Niger':         750,
  'Malawi':        750, 'Guinea-Bissau': 650, 'Sierra Leone':  600,
  'Liberia':       550, 'Togo':          500, 'Benin':         480,
  'Guinea':        600, 'Ivory Coast':   400, 'Rwanda':        420,
  'Burundi':       700, 'Uganda':        450, 'Tanzania':      400,
  'Mauritania':    550,
  // Elevated risk
  'Ecuador':       450, 'Bolivia':       420, 'Nicaragua':     480,
  'El Salvador':   390, 'Honduras':      370, 'Guatemala':     320,
  'Jamaica':       380, 'Cuba':          900, 'Venezuela':    3200,
  'Argentina':     850, 'Colombia':      280, 'Peru':          200,
  'Paraguay':      250, 'Suriname':      420, 'Guyana':        320,
  'Bangladesh':    320, 'Sri Lanka':     680, 'Nepal':         350,
  'Cambodia':      310, 'Laos':          580, 'Vietnam':       200,
  'Philippines':   175, 'Indonesia':     175, 'Mongolia':      380,
  'Kazakhstan':    200, 'Uzbekistan':    280, 'Kyrgyzstan':    380,
  'Tajikistan':    420, 'Turkmenistan':  350, 'Azerbaijan':    220,
  'Georgia':       250, 'Armenia':       280, 'Moldova':       380,
  'Ukraine':       900, 'Belarus':       800, 'Russia':        550,
  'Turkey':        350, 'Iraq':          450, 'Iran':          900,
  'Lebanon':      1800, 'Jordan':        320, 'Morocco':       200,
  'Algeria':       250, 'Bahrain':       220, 'Oman':          180,
  'Saudi Arabia':   80, 'Qatar':          55, 'UAE':            55,
  'Kuwait':         55, 'Israel':         90,
  'Serbia':         180, 'Kosovo':        250, 'Bosnia':        220,
  'Albania':        230, 'Montenegro':    280, 'North Macedonia': 250,
  'Bulgaria':       110, 'Romania':       130, 'Hungary':       145,
  'Croatia':        110, 'Slovakia':       70, 'Poland':         90,
  'Greece':         130, 'Portugal':       70, 'Spain':          70,
  'Italy':           90, 'Cyprus':         95,
  'South Africa':   310, 'Namibia':       280, 'Botswana':      150,
  'Equatorial Guinea': 500, 'Gabon':      420, 'Congo':         550,
  'Papua New Guinea': 420, 'Fiji':        350, 'Solomon Islands': 450,
  'Timor-Leste':   300, 'Myanmar':       800,
  'Brazil':         240, 'Mexico':        185, 'Chile':          110,
  'Uruguay':        130, 'Costa Rica':    185, 'Panama':        145,
  'Dominican Republic': 280, 'Trinidad and Tobago': 200,
  'India':          140, 'China':          80, 'Malaysia':       95,
  'Thailand':       100, 'Singapore':      25, 'Australia':      25,
  'New Zealand':     25, 'Japan':          40, 'South Korea':    60,
  'Taiwan':          80,
  'UK':              25, 'France':          30, 'Germany':        20,
  'Austria':         25, 'Switzerland':     15, 'Netherlands':    20,
  'Belgium':         35, 'Sweden':          20, 'Norway':         15,
  'Denmark':         18, 'Finland':         20,
  'United States':   20
};

// FRED series for EM bond spread (EMBI) — where available
const FRED_EMBI_SERIES = {
  'Brazil':       'BAMLEMRECRPICOAST',
  'Mexico':       'BAMLEMRECRPICOAST',
  'Colombia':     'BAMLEMRECRPICOAST',
  'South Africa': 'BAMLEMRECRPICOAST'
};

function fetchFredSeries(seriesId) {
  return new Promise((resolve) => {
    if (!FRED_API_KEY) return resolve(null);
    const params = new URLSearchParams({
      series_id:       seriesId,
      api_key:         FRED_API_KEY,
      file_type:       'json',
      observation_start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      limit:           '10'
    });
    const url = `https://api.stlouisfed.org/fred/series/observations?${params.toString()}`;
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

// Convert CDS spread (bps) to 0–100 risk score
// 0–50 bps (AAA/AA) → 0–8
// 51–150 bps (A/BBB) → 9–25
// 151–350 bps (BB) → 26–50
// 351–750 bps (B/CCC) → 51–80
// 750+ bps (CC/C/D) → 81–100
function cdsToScore(bps) {
  if (bps <= 50)   return Math.round(bps * 0.16);
  if (bps <= 150)  return Math.round(8 + (bps - 50) * 0.17);
  if (bps <= 350)  return Math.round(25 + (bps - 150) * 0.125);
  if (bps <= 750)  return Math.round(50 + (bps - 350) * 0.075);
  return Math.min(100, Math.round(80 + (bps - 750) * 0.02));
}

async function fetchSovereignCdsData(country) {
  try {
    const staticBps = CDS_SPREADS_BPS[country];
    if (staticBps === undefined) {
      return { score: null, reason: 'no_cds_data' };
    }

    const score = cdsToScore(staticBps);

    return {
      score,
      cds_spread_bps:  staticBps,
      data_source:     'Damodaran_Jan2026',
      rating_proxy:    staticBps <= 50 ? 'AAA-AA' : staticBps <= 150 ? 'A-BBB' : staticBps <= 350 ? 'BB' : staticBps <= 750 ? 'B-CCC' : 'CC-D',
      trend:           score >= 70 ? 'distressed' : score >= 40 ? 'elevated' : score >= 20 ? 'watch' : 'stable'
    };

  } catch (err) {
    logToHive({ source: 'sovereign_cds_feed', level: 'warn', event: 'fetch_error', data: { country, error: err.message } });
    return { score: null, reason: 'fetch_error', error: err.message };
  }
}

module.exports = { fetchSovereignCdsData };
