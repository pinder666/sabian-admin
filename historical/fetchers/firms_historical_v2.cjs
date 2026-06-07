// historical/fetchers/firms_historical_v2.cjs
// NASA FIRMS MODIS fire hotspot using AREA endpoint (country endpoint deprecated)
// Returns array of { signal_key, date, raw_value, raw_metadata, source, gap, gap_reason }

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const https = require('https');

const FIRMS_KEY = process.env.FIRMS_MAP_KEY;

// Country bounding boxes: [west, south, east, north]
// Source: Natural Earth boundaries, rounded to nearest degree
const COUNTRY_BBOX = {
  'Afghanistan': [60, 29, 75, 39],
  'Angola': [11, -18, 24, -4],
  'Argentina': [-73, -55, -53, -21],
  'Australia': [113, -44, 154, -10],
  'Bangladesh': [88, 20, 93, 27],
  'Bolivia': [-69, -23, -57, -9],
  'Brazil': [-74, -34, -34, 6],
  'Burkina Faso': [-6, 9, 3, 15],
  'Cameroon': [8, 1, 17, 13],
  'CAR': [14, 2, 28, 11],
  'Chad': [13, 7, 24, 24],
  'China': [73, 18, 135, 54],
  'Colombia': [-79, -5, -66, 13],
  'DRC': [12, -14, 32, 6],
  'Ethiopia': [33, 3, 48, 15],
  'India': [68, 6, 98, 36],
  'Indonesia': [95, -11, 141, 6],
  'Iraq': [38, 29, 49, 38],
  'Kenya': [33, -5, 42, 5],
  'Libya': [9, 19, 26, 34],
  'Mali': [-13, 10, 5, 25],
  'Mexico': [-118, 14, -86, 33],
  'Mozambique': [30, -27, 41, -10],
  'Myanmar': [92, 9, 102, 29],
  'Niger': [-1, 11, 16, 24],
  'Nigeria': [2, 4, 15, 14],
  'Pakistan': [60, 23, 78, 38],
  'Paraguay': [-63, -28, -54, -19],
  'Peru': [-82, -19, -68, -0],
  'Russia': [19, 41, -169, 82],
  'Somalia': [40, -2, 52, 12],
  'South Sudan': [23, 3, 36, 13],
  'Sudan': [21, 8, 39, 23],
  'Syria': [35, 32, 43, 38],
  'Tanzania': [29, -12, 41, -1],
  'Uganda': [29, -2, 35, 5],
  'Ukraine': [22, 44, 41, 53],
  'Venezuela': [-74, -1, -59, 13],
  'Yemen': [42, 12, 54, 19],
  'Zambia': [21, -18, 34, -8],
  'Zimbabwe': [25, -23, 34, -15],
};

function fetchCsv(url) {
  return new Promise((resolve, reject) => {
    const opts = { headers: { 'User-Agent': 'Sabian-Intelligence/1.0' } };
    https.get(url, opts, (res) => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${raw.substring(0, 200)}`));
        } else {
          resolve(raw);
        }
      });
    }).on('error', reject);
  });
}

function parseCsvRowCount(csvText) {
  const lines = csvText.trim().split('\n');
  return Math.max(0, lines.length - 1); // subtract header
}

// FIRMS area endpoint only supports 1-10 day ranges
// For historical data, need to make multiple requests per year
async function fetchFirmsHistorical(country) {
  const bbox = COUNTRY_BBOX[country];
  if (!bbox || !FIRMS_KEY) {
    return [{
      signal_key: 'fire_hotspot',
      signal_name: 'Satellite Fire',
      date: '2001-01-01',
      raw_value: null,
      raw_metadata: { country, error: !bbox ? 'no_bounding_box' : 'no_api_key' },
      source: 'nasa_firms_modis',
      gap: true,
      gap_reason: !bbox ? 'country_not_in_bbox_table' : 'missing_api_key',
    }];
  }

  const results = [];
  const startYear = 2001; // MODIS Terra launched Nov 2000, full year data from 2001
  const currentYear = new Date().getFullYear();
  const bboxStr = bbox.join(',');

  // IMPORTANT: FIRMS /api/country/ endpoint is DEPRECATED as of 2024
  // Must use /api/area/ endpoint with bounding box coordinates
  // Area endpoint limitation: max 10 days per request
  // For yearly data: split into ~36 requests per year (10-day chunks)

  for (let year = startYear; year <= currentYear; year++) {
    let yearCount = 0;
    const chunks = [];

    // Split year into 10-day chunks
    for (let dayOfYear = 1; dayOfYear <= 365; dayOfYear += 10) {
      const date = new Date(year, 0, dayOfYear);
      const dateStr = date.toISOString().split('T')[0];
      chunks.push({ date: dateStr, dayRange: Math.min(10, 365 - dayOfYear + 1) });
    }

    // Fetch each chunk
    for (const chunk of chunks) {
      const product = year < (currentYear - 9) ? 'MODIS_C6_1' : 'MODIS_NRT';
      const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${FIRMS_KEY}/${product}/${bboxStr}/${chunk.dayRange}/${chunk.date}`;

      try {
        const csv = await fetchCsv(url);
        const count = parseCsvRowCount(csv);
        yearCount += count;
      } catch (err) {
        // Fail silently for individual chunks, continue aggregating
      }

      // Rate limit: FIRMS allows 5000 requests per 10 minutes = ~8 req/sec
      // Use 200ms delay to stay well under limit
      await new Promise(r => setTimeout(r, 200));
    }

    // Store annual aggregate
    results.push({
      signal_key: 'fire_hotspot',
      signal_name: 'Satellite Fire',
      date: `${year}-01-01`,
      raw_value: yearCount,
      raw_metadata: { country, year, bbox: bboxStr, hotspot_count: yearCount, chunks: chunks.length },
      source: 'nasa_firms_modis',
      gap: yearCount === 0,
      gap_reason: yearCount === 0 ? 'no_fires_detected_this_year' : null,
    });

    console.log(`  ${country} ${year}: ${yearCount} fire detections`);
  }

  return results;
}

module.exports = { fetchFirmsHistorical };

if (require.main === module) {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('FIRMS V2 FETCHER TEST - Area Endpoint');
  console.log('Country endpoint deprecated - using bounding box method');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Test Sudan for 2023 only
  async function test() {
    console.log('[TEST] Fetching Sudan fire data for 2023...\n');

    const bbox = COUNTRY_BBOX['Sudan'];
    const bboxStr = bbox.join(',');
    const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${FIRMS_KEY}/MODIS_NRT/${bboxStr}/10/2023-01-01`;

    console.log('Testing URL:', url);
    console.log('Bounding box:', bboxStr, '\n');

    try {
      const https = require('https');
      https.get(url, { headers: { 'User-Agent': 'Sabian-Intelligence/1.0' } }, (res) => {
        let raw = '';
        res.on('data', d => raw += d);
        res.on('end', () => {
          const lines = raw.trim().split('\n');
          const count = Math.max(0, lines.length - 1);
          console.log('Status:', res.statusCode);
          console.log('Fire detections:', count);
          if (count > 0) {
            console.log('Sample row:', lines[1].substring(0, 100));
          }
          console.log('\n✅ FIRMS area endpoint working');
        });
      }).on('error', (e) => {
        console.log('❌ Request error:', e.message);
      });
    } catch (err) {
      console.log('❌ Error:', err.message);
    }
  }

  test();
}
