// historical/fetchers/firms_historical.cjs
// NASA FIRMS MODIS fire hotspot archive — back to 2001.
// Uses area/csv endpoint with MODIS_SP (Standard Product) — the only product
// that supports archive dates via the free API key.
// /country/csv/ returns 400 for all products; /area/csv/ with bounding box works.
// Per-year sample: 5-day window starting July 1 (consistent annual proxy).
// Returns array of { signal_key, date, raw_value, raw_metadata, source, gap, gap_reason }

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const https = require('https');

const FIRMS_KEY = process.env.FIRMS_MAP_KEY;

// Bounding boxes [west, south, east, north] — decimal degrees
const BBOX = {
  'Mali':         '-5,10,5,25',
  'Sudan':        '22,10,38,22',
  'Ethiopia':     '33,4,48,15',
  'DRC':          '12,-12,31,5',
  'Nigeria':      '3,4,15,14',
  'Afghanistan':  '60,29,75,38',
  'Myanmar':      '92,10,101,28',
  'Yemen':        '42,12,55,19',
  'South Sudan':  '24,3,36,12',
  'Somalia':      '41,-2,51,11',
  'CAR':          '14,2,27,11',
  'Chad':         '14,8,24,23',
  'Mozambique':   '30,-26,40,-10',
  'Libya':        '9,19,25,33',
  'Burkina Faso': '-5,9,3,15',
  'Niger':        '2,11,16,23',
  'Colombia':     '-79,-4,-67,12',
  'Venezuela':    '-73,0,-60,12',
  'Ukraine':      '22,44,40,52',
  'Syria':        '35,32,42,37',
  'Iraq':         '38,29,48,37',
  'Pakistan':     '61,24,77,37',
  'Bangladesh':   '88,20,93,26',
  'Kenya':        '34,-4,41,4',
  'Uganda':       '30,-1,35,4',
  'Tanzania':     '30,-12,40,-1',
  'Zimbabwe':     '25,-22,33,-15',
  'Cameroon':     '8,1,16,13',
  'Angola':       '11,-18,24,-4',
  'Zambia':       '21,-18,33,-8',
  'Brazil':       '-73,-33,-34,5',
  'Indonesia':    '95,-11,141,6',
  'India':        '68,8,97,35',
  'China':        '73,18,135,53',
  'Russia':       '27,41,180,81',
  'Australia':    '113,-44,154,-10',
  'Mexico':       '-118,14,-87,32',
  'Bolivia':      '-69,-22,-57,-9',
  'Peru':         '-81,-18,-68,0',
  'Paraguay':     '-62,-27,-54,-19',
  'Argentina':    '-73,-55,-53,-21',
};

function fetchCsv(url) {
  return new Promise((resolve, reject) => {
    const opts = { headers: { 'User-Agent': 'Sabian-Intelligence/1.0' } };
    https.get(url, opts, (res) => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => resolve(raw));
    }).on('error', reject);
  });
}

function parseCsvRowCount(csvText) {
  const lines = csvText.trim().split('\n');
  return Math.max(0, lines.length - 1); // subtract header row
}

async function fetchFirmsHistorical(country) {
  const bbox = BBOX[country];
  if (!bbox || !FIRMS_KEY) return [];

  const results = [];
  const startYear = 2001;
  const currentYear = new Date().getFullYear();

  for (let year = startYear; year < currentYear; year++) {
    // 5-day July window — MODIS_SP max is 5 days per call, July 1 is consistent annual proxy
    const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${FIRMS_KEY}/MODIS_SP/${bbox}/5/${year}-07-01`;

    try {
      const csv = await fetchCsv(url);
      if (csv.startsWith('Invalid') || csv.startsWith('Error')) {
        results.push({
          signal_key: 'fire_hotspot', signal_name: 'Satellite Fire',
          date: `${year}-01-01`, raw_value: null,
          raw_metadata: { country, bbox, year, error: csv.trim() },
          source: 'nasa_firms_modis', gap: true, gap_reason: 'api_error',
        });
      } else {
        const count = parseCsvRowCount(csv);
        results.push({
          signal_key: 'fire_hotspot', signal_name: 'Satellite Fire',
          date: `${year}-01-01`, raw_value: count,
          raw_metadata: { country, bbox, year, hotspot_count_july5d: count },
          source: 'nasa_firms_modis', gap: false, gap_reason: null,
        });
      }
    } catch (err) {
      results.push({
        signal_key: 'fire_hotspot', signal_name: 'Satellite Fire',
        date: `${year}-01-01`, raw_value: null,
        raw_metadata: { country, bbox, year, error: err.message },
        source: 'nasa_firms_modis', gap: true, gap_reason: 'fetch_error',
      });
    }

    await new Promise(r => setTimeout(r, 800));
  }

  return results;
}

module.exports = { fetchFirmsHistorical };
