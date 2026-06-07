// historical/fetchers/seismic_historical.cjs
// USGS earthquake catalog — annual significant event counts per country bbox.
// Reliable from ~1970 globally; partial record back to 1900.
// Returns array of { signal_key, date, raw_value, raw_metadata, source, gap, gap_reason }

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const axios = require('axios');

async function httpsGet(url) {
  const res = await axios.get(url, {
    headers: { 'User-Agent': 'Sabian-Intelligence/1.0', 'Accept-Encoding': 'identity' },
    timeout: 30000,
  });
  return res.data;
}

// Country bounding boxes [minlat, maxlat, minlon, maxlon]
const COUNTRY_BBOX = {
  'Mali':       [10.0, 25.0, -4.2, 4.2],
  'Sudan':      [8.7, 22.2, 21.8, 38.6],
  'Ethiopia':   [3.4, 14.9, 33.0, 47.9],
  'DRC':        [-13.5, 5.3, 12.2, 31.3],
  'Nigeria':    [4.3, 13.9, 2.7, 14.7],
  'Afghanistan':[29.4, 38.5, 60.5, 74.9],
  'Myanmar':    [9.8, 28.5, 92.2, 101.2],
  'Yemen':      [11.7, 19.0, 42.5, 54.5],
  'South Sudan':[3.5, 12.2, 24.1, 35.9],
  'Somalia':    [-1.7, 11.9, 40.9, 51.4],
  'Ukraine':    [44.4, 52.4, 22.1, 40.2],
  'Syria':      [32.3, 37.3, 35.7, 42.4],
  'Iran':       [25.0, 39.8, 44.0, 63.3],
  'Pakistan':   [23.5, 37.1, 61.0, 77.8],
  'Turkey':     [35.8, 42.2, 26.0, 44.8],
  'Indonesia':  [-11.0, 6.0, 95.0, 141.0],
  'Philippines':[5.0, 21.0, 116.0, 127.0],
  'Japan':      [30.0, 46.0, 129.0, 146.0],
  'Chile':      [-56.0, -17.0, -76.0, -66.0],
  'Peru':       [-18.0, -0.5, -81.0, -68.0],
  'Nepal':      [26.3, 30.5, 80.0, 88.2],
  'Haiti':      [18.0, 20.1, -74.5, -71.6],
};

async function fetchSeismicHistorical(country) {
  const bbox = COUNTRY_BBOX[country];
  if (!bbox) return [];

  const results = [];
  const [minlat, maxlat, minlon, maxlon] = bbox;
  const startYear = 1900;
  const currentYear = new Date().getFullYear();

  for (let year = startYear; year <= currentYear; year++) {
    const url = [
      'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson',
      `&starttime=${year}-01-01`,
      `&endtime=${year}-12-31`,
      `&minlatitude=${minlat}&maxlatitude=${maxlat}`,
      `&minlongitude=${minlon}&maxlongitude=${maxlon}`,
      `&minmagnitude=5.0`,
      `&limit=1000`,
    ].join('');

    try {
      const json = await httpsGet(url);
      const count = json.metadata?.count ?? (json.features?.length ?? 0);
      const maxMag = json.features?.length > 0
        ? Math.max(...json.features.map(f => f.properties.mag || 0))
        : null;

      results.push({
        signal_key:   'seismic_risk',
        signal_name:  'Seismic Risk',
        date:         `${year}-01-01`,
        raw_value:    count,
        raw_metadata: { country, year, event_count_m5plus: count, max_magnitude: maxMag },
        source:       'usgs_earthquake_catalog',
        gap:          false,
        gap_reason:   null,
      });
    } catch (err) {
      results.push({
        signal_key:   'seismic_risk',
        signal_name:  'Seismic Risk',
        date:         `${year}-01-01`,
        raw_value:    null,
        raw_metadata: { country, year, error: err.message },
        source:       'usgs_earthquake_catalog',
        gap:          true,
        gap_reason:   'fetch_error',
      });
    }
    await new Promise(r => setTimeout(r, 500));
  }

  return results;
}

module.exports = { fetchSeismicHistorical };