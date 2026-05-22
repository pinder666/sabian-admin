// maritime_port_feed.cjs
// Datalastic maritime AIS -- port call frequency by country primary port
// Signal: sharp drop in vessel arrivals = supply chain collapse, sanctions effect, conflict blockade
// Requires DATALASTIC_API_KEY in .env ($199/mo plan: https://datalastic.com)
// DORMANT until DATALASTIC_API_KEY is set -- returns graceful null like ACLED
// Wire now, activate on first DOD contract
// Follows fred_macro_data.cjs pattern

require('dotenv').config({ path: './.env' });
const https = require('https');
const { logToHive } = require('./logger.cjs');

// Primary conflict-watch ports by country
// Datalastic uses LOCODE (UN Location Code) for port lookup
// Format: 2-char country + 3-char location
const COUNTRY_PORTS = {
  // Active conflicts -- primary entry points, highest signal value
  'Sudan':        [{ name: 'Port Sudan',     locode: 'SDPZU' }],
  'Yemen':        [{ name: 'Hudaydah',       locode: 'YEHOD' }, { name: 'Aden',         locode: 'YEAD' }],
  'Somalia':      [{ name: 'Mogadishu',      locode: 'SOMGQ' }],
  'DRC':          [{ name: 'Matadi',         locode: 'CDMAT' }],
  'Libya':        [{ name: 'Tripoli',        locode: 'LYTIP' }, { name: 'Benghazi',     locode: 'LYBEG' }],
  'Haiti':        [{ name: 'Port-au-Prince', locode: 'HTPAP' }],
  'Ukraine':      [{ name: 'Odessa',         locode: 'UAODS' }, { name: 'Mykolaiv',     locode: 'UAMKN' }],
  'Syria':        [{ name: 'Latakia',        locode: 'SYLTK' }, { name: 'Tartus',       locode: 'SYTTL' }],
  'Lebanon':      [{ name: 'Beirut',         locode: 'LBBEY' }],
  'Myanmar':      [{ name: 'Yangon',         locode: 'MMRGN' }],
  'Venezuela':    [{ name: 'La Guaira',      locode: 'VELVG' }, { name: 'Maracaibo',    locode: 'VEMAR' }],
  'Iran':         [{ name: 'Bandar Abbas',   locode: 'IRBND' }, { name: 'Shahid Rajaee', locode: 'IRSHR' }],
  'Israel':       [{ name: 'Haifa',          locode: 'ILHFA' }, { name: 'Ashdod',       locode: 'ILASH' }],
  'Gaza':         [{ name: 'Gaza Port',      locode: 'PSGZA' }],
  'Iraq':         [{ name: 'Umm Qasr',       locode: 'IQUQR' }],
  'Mozambique':   [{ name: 'Maputo',         locode: 'MZMPM' }, { name: 'Beira',        locode: 'MZBEW' }],
  'Nigeria':      [{ name: 'Lagos (Apapa)', locode: 'NGAPP' }, { name: 'Tin Can',       locode: 'NGTCN' }],
  'Cameroon':     [{ name: 'Douala',         locode: 'CMDLA' }],
  'Djibouti':     [{ name: 'Djibouti',       locode: 'DJJIB' }],
  'Eritrea':      [{ name: 'Massawa',        locode: 'ERMAW' }],
  'Pakistan':     [{ name: 'Karachi',        locode: 'PKKAR' }, { name: 'Gwadar',       locode: 'PKGWD' }],
  'Sri Lanka':    [{ name: 'Colombo',        locode: 'LKCMB' }],
  'Bangladesh':   [{ name: 'Chittagong',     locode: 'BDCGP' }],
  // High-risk threshold watch
  'Taiwan':       [{ name: 'Kaohsiung',      locode: 'TWKHH' }, { name: 'Taipei',       locode: 'TWKEL' }],
  'North Korea':  [{ name: 'Nampo',          locode: 'KPNAM' }],
  'Georgia':      [{ name: 'Batumi',         locode: 'GEBTU' }, { name: 'Poti',         locode: 'GEPTI' }],
  'Armenia':      [], // Landlocked -- no port signal
  'Kenya':        [{ name: 'Mombasa',        locode: 'KEMBA' }],
  'Tanzania':     [{ name: 'Dar es Salaam',  locode: 'TZDAR' }],
  'Zambia':       [], // Landlocked
  'Zimbabwe':     [], // Landlocked
  'Senegal':      [{ name: 'Dakar',          locode: 'SNDKR' }],
  'Guinea':       [{ name: 'Conakry',        locode: 'GNCON' }],
  'Ecuador':      [{ name: 'Guayaquil',      locode: 'ECGYE' }],
  'Bolivia':      [], // Landlocked
  'Colombia':     [{ name: 'Cartagena',      locode: 'COCTG' }, { name: 'Buenaventura', locode: 'COBUN' }]
};

// Days to compare: recent window vs prior same-length window
const WINDOW_DAYS = 30;

async function fetchPortActivity(country, dateFrom, dateTo) {
  const apiKey = process.env.DATALASTIC_API_KEY;

  // Graceful null -- dormant until key is set, same pattern as ACLED
  if (!apiKey) {
    return {
      source: 'Datalastic',
      country,
      score: null,
      error: 'DATALASTIC_API_KEY not set -- wire now, activate on first DOD contract (datalastic.com $199/mo)',
      dormant: true
    };
  }

  const ports = COUNTRY_PORTS[country];
  if (!ports || ports.length === 0) {
    return {
      source: 'Datalastic',
      country,
      score: null,
      error: `No primary port defined for ${country} (landlocked or unconfigured)`,
      dormant: false
    };
  }

  const endDate = dateTo || new Date().toISOString().slice(0, 10);
  const startDate = dateFrom || subtractDays(endDate, WINDOW_DAYS);
  const priorStart = subtractDays(startDate, WINDOW_DAYS);
  const priorEnd = subtractDays(startDate, 1);

  try {
    // Fetch port calls for primary port, current window and prior window
    const primaryPort = ports[0];
    const [recentCalls, priorCalls] = await Promise.allSettled([
      fetchPortCalls(apiKey, primaryPort.locode, startDate, endDate),
      fetchPortCalls(apiKey, primaryPort.locode, priorStart, priorEnd)
    ]);

    const recent = recentCalls.status === 'fulfilled' ? recentCalls.value : null;
    const prior = priorCalls.status === 'fulfilled' ? priorCalls.value : null;

    if (!recent) {
      return { source: 'Datalastic', country, error: recentCalls.reason?.message || 'Port data fetch failed' };
    }

    const recentCount = recent.total_calls || 0;
    const priorCount = prior ? (prior.total_calls || 0) : null;

    // Calculate delta
    const delta_pct = priorCount && priorCount > 0
      ? Math.round(((recentCount - priorCount) / priorCount) * 100)
      : null;

    // Score: port call collapse = supply chain collapse = elevated risk
    // +5% or more = growing = low risk
    // Flat to -30% = concern
    // -30% to -50% = significant risk
    // -50%+ = collapse signal
    let port_risk_score;
    if (delta_pct === null) {
      port_risk_score = recent.total_calls < 5 ? 75 : 40; // very low traffic even without prior = risk
    } else if (delta_pct >= 5) {
      port_risk_score = Math.max(0, 15 - delta_pct);
    } else if (delta_pct >= -30) {
      port_risk_score = Math.round(30 + Math.abs(Math.min(0, delta_pct)) * 1.5);
    } else if (delta_pct >= -50) {
      port_risk_score = Math.round(75 + Math.abs(delta_pct + 30));
    } else {
      port_risk_score = Math.min(100, Math.round(85 + Math.abs(delta_pct + 50) * 0.5));
    }

    logToHive({
      source: 'maritime_port_feed',
      level: 'intel',
      event: 'port_activity_scored',
      data: { country, port: primaryPort.name, recentCount, priorCount, delta_pct, port_risk_score },
      tags: ['maritime', 'datalastic', 'ais', country]
    });

    return {
      source: 'Datalastic',
      country,
      primary_port: primaryPort.name,
      locode: primaryPort.locode,
      period: `${startDate} to ${endDate}`,
      vessel_calls_recent: recentCount,
      vessel_calls_prior: priorCount,
      delta_pct,
      port_risk_score,
      trend: delta_pct === null  ? 'unknown'
           : delta_pct < -50    ? 'blockade_or_collapse'
           : delta_pct < -30    ? 'significant_decline'
           : delta_pct < -10    ? 'declining'
           : delta_pct <  5     ? 'flat'
           : 'growing',
      fetched_at: new Date().toISOString()
    };

  } catch (err) {
    logToHive({
      source: 'maritime_port_feed',
      level: 'error',
      event: 'fetch_failed',
      data: { country, message: err.message },
      tags: ['maritime', 'error']
    });
    return { source: 'Datalastic', country, error: err.message };
  }
}

// Datalastic port calls API
// GET /api/v0/vessel/portcalls?port_locode={LOCODE}&date_from={YYYY-MM-DD}&date_to={YYYY-MM-DD}
function fetchPortCalls(apiKey, locode, dateFrom, dateTo) {
  return new Promise((resolve, reject) => {
    const path = `/api/v0/vessel/portcalls?port_locode=${locode}&date_from=${dateFrom}&date_to=${dateTo}&limit=500`;
    const options = {
      hostname: 'api.datalastic.com',
      path,
      method: 'GET',
      headers: {
        'api-key': apiKey,
        'Accept': 'application/json',
        'User-Agent': 'Sabian-Convergence-Engine/1.0'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 401 || res.statusCode === 403) {
          reject(new Error(`Datalastic auth failed (${res.statusCode}) -- verify DATALASTIC_API_KEY`));
          return;
        }
        if (res.statusCode === 402) {
          reject(new Error('Datalastic payment required -- upgrade plan at datalastic.com'));
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Datalastic HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
          return;
        }
        try {
          const json = JSON.parse(data);
          // Datalastic returns { data: [...portcalls], meta: { total: N } }
          const calls = json.data || [];
          resolve({
            total_calls: json.meta?.total || calls.length,
            calls: calls.slice(0, 10) // keep sample for inspection
          });
        } catch (e) {
          reject(new Error(`Datalastic parse error: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Datalastic request timeout')); });
    req.end();
  });
}

function subtractDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

module.exports = fetchPortActivity;

// Standalone test: node maritime_port_feed.cjs Sudan
// Returns score: null with dormant: true until DATALASTIC_API_KEY is set
if (require.main === module) {
  const country = process.argv[2] || 'Sudan';
  const dateFrom = process.argv[3] || null;
  const dateTo   = process.argv[4] || null;
  fetchPortActivity(country, dateFrom, dateTo)
    .then(r => console.log(JSON.stringify(r, null, 2)))
    .catch(console.error);
}
