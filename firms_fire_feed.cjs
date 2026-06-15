// firms_fire_feed.cjs
// NASA FIRMS -- VIIRS SNPP satellite fire hotspot data by country bounding box
// Free API key: https://firms.modaps.eosdis.nasa.gov/api/ (instant registration)
// Signal: fire hotspot density + FRP intensity = conflict burning, infrastructure destruction
// VIIRS SNPP orbits Earth every 24 hours at 375m resolution -- 3-12 hour latency
// FIRMS API limit: 5 days max per request -- chunked automatically for longer windows
// Follows fred_macro_data.cjs pattern

require('dotenv').config({ path: './.env' });
const https = require('https');
const { logToHive } = require('./logger.cjs');
const { resolveTableKey } = require('./resolve_table_key.cjs');

// Country bounding boxes [W,S,E,N] -- FIRMS expects comma-separated, no spaces
const COUNTRY_BBOX = {
  // Active conflicts
  'Mali':          '-4.2,10.0,4.2,25.0',
  'Burkina Faso':  '-5.5,9.4,2.4,15.1',
  'Niger':         '0.2,11.7,15.9,23.5',
  'Sudan':         '21.8,8.7,38.6,22.2',
  'Ethiopia':      '33.0,3.4,47.9,14.9',
  'Somalia':       '40.9,-1.7,51.4,11.9',
  'DRC':           '12.2,-13.5,31.3,5.3',
  'CAR':           '14.4,2.2,27.5,11.0',
  'Chad':          '13.5,7.4,24.0,23.4',
  'Myanmar':       '92.2,9.8,101.2,28.5',
  'Venezuela':     '-73.4,0.6,-59.8,12.2',
  'South Sudan':   '24.1,3.5,35.9,12.2',
  'Nigeria':       '2.7,4.3,14.7,13.9',
  'Mozambique':    '30.2,-26.9,40.8,-10.5',
  'Afghanistan':   '60.5,29.4,74.9,38.5',
  'Syria':         '35.7,32.3,42.4,37.3',
  'Yemen':         '42.5,11.7,54.5,19.0',
  'Haiti':         '-74.5,18.0,-71.6,20.1',
  'Libya':         '9.3,19.5,25.2,33.2',
  'Israel':        '34.2,29.5,35.9,33.3',
  'Palestine':     '34.2,31.2,35.6,32.6',
  'Ukraine':       '22.1,44.4,40.2,52.4',
  'Colombia':      '-79.0,-4.2,-66.8,12.4',
  'Lebanon':       '35.1,33.1,36.6,34.7',
  'Iraq':          '38.8,29.1,48.8,37.4',
  'Pakistan':      '61.0,23.5,77.8,37.1',
  'Cameroon':      '8.5,1.6,16.2,13.1',
  'Armenia':       '43.4,38.8,46.6,41.3',
  'Georgia':       '40.0,41.0,46.7,43.6',
  // High-risk threshold watch
  'Zimbabwe':      '25.2,-22.4,33.1,-15.6',
  'Taiwan':        '119.9,21.9,122.0,25.3',
  'Iran':          '44.0,25.0,63.3,39.8',
  'North Korea':   '124.2,37.7,130.7,42.6',
  'Kosovo':        '20.0,41.9,21.8,43.3',
  'Bosnia':        '15.7,42.5,19.6,45.3',
  'Zambia':        '22.0,-18.1,33.7,-8.2',
  'Tanzania':      '29.3,-11.7,40.4,-1.0',
  'Senegal':       '-17.5,12.3,-11.4,16.7',
  'Guinea':        '-15.1,7.2,-7.6,12.7',
  'Ecuador':       '-81.0,-5.0,-75.2,1.4',
  'Bolivia':       '-69.6,-22.9,-57.5,-9.7',
  'Bangladesh':    '88.0,20.7,92.7,26.6',
  'Sri Lanka':     '79.7,5.9,81.9,9.8',
  'Kenya':         '33.9,-4.7,41.9,5.0',
  'Uganda':        '29.5,-1.5,35.1,4.2',
  'Eritrea':       '36.4,12.4,43.1,18.0',
  'Djibouti':      '41.8,11.0,43.4,12.7'
};

// Months when agricultural burning is expected (reduces signal weight for these)
// Sahel: Nov-Feb is main burn season; fires in populated areas during other months = higher conflict signal
const AG_BURN_MONTHS = {
  'Mali': [11, 12, 1, 2], 'Burkina Faso': [11, 12, 1, 2], 'Niger': [11, 12, 1, 2],
  'Chad': [11, 12, 1, 2], 'Sudan': [11, 12, 1, 2], 'Ethiopia': [10, 11, 1, 2],
  'DRC': [5, 6, 7, 8], 'CAR': [11, 12, 1, 2], 'Mozambique': [8, 9, 10]
};

// FIRMS limits each request to 5 days. Longer windows are chunked automatically.
const FIRMS_MAX_DAYS = 5;

async function fetchFireHotspots(country, dateFrom, dateTo) {
  const apiKey = process.env.FIRMS_MAP_KEY;
  if (!apiKey) {
    return {
      source: 'FIRMS',
      country,
      error: 'Missing FIRMS_MAP_KEY -- register free at https://firms.modaps.eosdis.nasa.gov/api/'
    };
  }

  const { value: bbox } = await resolveTableKey(country, COUNTRY_BBOX);
  if (!bbox) {
    return { source: 'FIRMS', country, error: `No bounding box defined for ${country}` };
  }

  const endDate = dateTo || new Date().toISOString().slice(0, 10);
  const startDate = dateFrom || subtractDays(endDate, 30);

  // VIIRS_SNPP_NRT covers roughly last 2 months (near real-time, 3-12hr latency)
  // VIIRS_SNPP_SP covers older historical data (standard processing, longer pipeline)
  const twoMonthsAgo = subtractDays(new Date().toISOString().slice(0, 10), 60);
  const useNRT = startDate >= twoMonthsAgo;
  const product = useNRT ? 'VIIRS_SNPP_NRT' : 'VIIRS_SNPP_SP';

  try {
    const rows = await fetchFirmsChunked(apiKey, product, bbox, startDate, endDate);
    return await scoreFireData(country, rows, startDate, endDate);
  } catch (err) {
    // Retry with standard processing if NRT failed
    if (useNRT) {
      try {
        const rows = await fetchFirmsChunked(apiKey, 'VIIRS_SNPP_SP', bbox, startDate, endDate);
        return await scoreFireData(country, rows, startDate, endDate);
      } catch (_) { /* fall through to error below */ }
    }

    logToHive({
      source: 'firms_fire_feed',
      level: 'error',
      event: 'fetch_failed',
      data: { country, message: err.message },
      tags: ['firms', 'satellite', 'error']
    });
    return { source: 'FIRMS', country, error: err.message };
  }
}

// Chunk date range into FIRMS_MAX_DAYS windows and merge all rows
async function fetchFirmsChunked(apiKey, product, bbox, startDate, endDate) {
  const allRows = [];
  let cursor = new Date(startDate);
  const end = new Date(endDate);

  while (cursor < end) {
    const chunkStart = cursor.toISOString().slice(0, 10);
    const chunkEndMs = Math.min(cursor.getTime() + FIRMS_MAX_DAYS * 86400000, end.getTime());
    const dayRange = Math.max(1, Math.ceil((chunkEndMs - cursor.getTime()) / 86400000));

    const rows = await fetchFirmsCSV(apiKey, product, bbox, dayRange, chunkStart);
    allRows.push(...rows);

    cursor = new Date(chunkEndMs + 86400000);
  }

  return allRows;
}

async function scoreFireData(country, rows, startDate, endDate) {
  const period = `${startDate} to ${endDate}`;

  if (!rows.length) {
    return {
      source: 'FIRMS',
      country,
      period,
      fire_score: 0,
      total_hotspots: 0,
      warning: 'No fire hotspot data for this period'
    };
  }

  // Filter to high/nominal confidence only (drop low-confidence detections)
  const highConf = rows.filter(r => {
    const c = (r.confidence || '').toLowerCase();
    return c !== 'l' && c !== 'low' && c !== '0' && c !== '1' && c !== '2';
  });
  const total_hotspots = highConf.length;

  // Sum FRP (Fire Radiative Power, MW) -- proxy for fire intensity
  const total_frp = highConf.reduce((s, r) => s + (parseFloat(r.frp) || 0), 0);
  const mean_frp = total_hotspots > 0 ? total_frp / total_hotspots : 0;

  // Temporal acceleration: compare first vs second half of period
  const midTs = (new Date(startDate).getTime() + new Date(endDate).getTime()) / 2;
  const midDate = new Date(midTs).toISOString().slice(0, 10);
  const firstHalf = highConf.filter(r => r.acq_date < midDate).length;
  const secondHalf = highConf.filter(r => r.acq_date >= midDate).length;
  const acceleration = firstHalf > 0
    ? (secondHalf - firstHalf) / firstHalf
    : (secondHalf > 0 ? 1 : 0);

  // Agricultural burn season context -- dampen score if it's dry/burn season and fires are low intensity
  const queryMonth = new Date(startDate).getMonth() + 1;
  const { value: agMonthsRaw } = await resolveTableKey(country, AG_BURN_MONTHS);
  const agMonths = agMonthsRaw || [];
  const isAgSeason = agMonths.includes(queryMonth);
  const agDampen = isAgSeason && mean_frp < 30 ? 0.75 : 1.0;

  // Base score from hotspot count (calibrated to Sahel scale, 30-day window)
  // >1000 hotspots = 100, 400-1000 = 60-90, 50-400 = 20-60, <50 = 0-20
  let base_score;
  if (total_hotspots >= 1000) base_score = 100;
  else if (total_hotspots >= 400) base_score = Math.round(60 + ((total_hotspots - 400) / 600) * 30);
  else if (total_hotspots >= 50) base_score = Math.round(20 + ((total_hotspots - 50) / 350) * 40);
  else base_score = Math.round((total_hotspots / 50) * 20);

  base_score = Math.round(base_score * agDampen);

  // FRP intensity modifier: >50 MW mean = infrastructure/village burning, not just bush fire
  const frp_bonus = mean_frp > 50 ? Math.min(15, Math.round((mean_frp - 50) / 10)) : 0;

  // Acceleration modifier: rising fire activity in second half = escalation signal
  const accel_bonus = acceleration > 0.5 ? Math.min(10, Math.round(acceleration * 7)) : 0;

  const fire_score = Math.min(100, base_score + frp_bonus + accel_bonus);

  logToHive({
    source: 'firms_fire_feed',
    level: 'intel',
    event: 'fire_scored',
    data: {
      country,
      period,
      total_hotspots,
      total_frp: Math.round(total_frp),
      mean_frp: parseFloat(mean_frp.toFixed(1)),
      fire_score,
      acceleration_ratio: parseFloat(acceleration.toFixed(2)),
      ag_season: isAgSeason
    },
    tags: ['firms', 'satellite', 'fire', country]
  });

  return {
    source: 'FIRMS',
    country,
    period,
    total_hotspots,
    total_frp: Math.round(total_frp),
    mean_frp: parseFloat(mean_frp.toFixed(1)),
    fire_score,
    acceleration_ratio: parseFloat(acceleration.toFixed(2)),
    trend: acceleration > 0.3 ? 'escalating' : acceleration < -0.3 ? 'decreasing' : 'sustained',
    ag_burn_season: isAgSeason,
    fetched_at: new Date().toISOString()
  };
}

function fetchFirmsCSV(apiKey, product, bbox, dayRange, startDate) {
  return new Promise((resolve, reject) => {
    const path = `/api/area/csv/${apiKey}/${product}/${bbox}/${dayRange}/${startDate}`;

    const options = {
      hostname: 'firms.modaps.eosdis.nasa.gov',
      path,
      method: 'GET',
      headers: {
        'Accept': 'text/csv,text/plain,*/*',
        'User-Agent': 'Sabian-Convergence-Engine/1.0'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 401 || res.statusCode === 403) {
          reject(new Error(`FIRMS auth failed (${res.statusCode}) -- verify FIRMS_MAP_KEY`));
          return;
        }
        if (res.statusCode === 400) {
          reject(new Error(`FIRMS bad request (400): ${data.slice(0, 200)}`));
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`FIRMS HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
          return;
        }
        if (!data.trim() || data.startsWith('<')) {
          resolve([]);
          return;
        }
        resolve(parseCSV(data));
      });
    });

    req.on('error', reject);
    req.setTimeout(25000, () => { req.destroy(); reject(new Error('FIRMS request timeout')); });
    req.end();
  });
}

function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
  return lines.slice(1)
    .map(line => {
      const vals = line.split(',');
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim().replace(/"/g, ''); });
      return obj;
    })
    .filter(r => r.latitude && r.longitude);
}

function subtractDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

module.exports = fetchFireHotspots;

// Standalone tests:
//   node firms_fire_feed.cjs Mali                           -- last 30 days
//   node firms_fire_feed.cjs Mali 2026-03-01 2026-03-31     -- retroactive March 2026
//   node firms_fire_feed.cjs Sudan 2026-02-01 2026-03-01    -- Sudan Feb 2026
if (require.main === module) {
  const country = process.argv[2] || 'Mali';
  const dateFrom = process.argv[3] || null;
  const dateTo   = process.argv[4] || null;
  fetchFireHotspots(country, dateFrom, dateTo)
    .then(r => console.log(JSON.stringify(r, null, 2)))
    .catch(console.error);
}
