// iom_dtm_historical.cjs
// IOM Displacement Tracking Matrix (DTM) API v3
// Country/Admin0 IDP endpoint via Azure APIM portal
// Auth: Ocp-Apim-Subscription-Key header from DTM_API_KEY in .env
// Returns array of { signal_key, date, raw_value, raw_metadata, source, gap, gap_reason }

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const https = require('https');

const DTM_KEY = process.env.DTM_API_KEY;

function httpsGetDTM(url) {
  return new Promise((resolve, reject) => {
    const opts = {
      headers: {
        'Ocp-Apim-Subscription-Key': DTM_KEY,
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 45000,  // server is slow, needs > 30s
    };
    const req = https.get(url, opts, (res) => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body: raw });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('DTM_REQUEST_TIMEOUT_45s')); });
  });
}

async function fetchIomDtmHistorical(country) {
  const results = [];

  // v3 Admin0 endpoint confirmed from portal
  const url = `https://dtmapi.iom.int/v3/displacement/admin0?CountryName=${encodeURIComponent(country)}`;

  console.log(`[IOM DTM v3] Fetching displacement data for ${country}...`);

  try {
    const { status, body } = await httpsGetDTM(url);

    if (status !== 200) {
      results.push({
        signal_key: 'displacement_idp', signal_name: 'IDPs (Internal Displacement)',
        date: new Date().toISOString().split('T')[0],
        raw_value: null,
        raw_metadata: { country, http_status: status, error: body.slice(0, 300) },
        source: 'iom_dtm_v3', gap: true, gap_reason: `http_${status}`,
      });
      return results;
    }

    let data;
    try { data = JSON.parse(body); } catch (e) {
      results.push({
        signal_key: 'displacement_idp', signal_name: 'IDPs (Internal Displacement)',
        date: new Date().toISOString().split('T')[0],
        raw_value: null,
        raw_metadata: { country, error: 'json_parse_failed', body: body.slice(0, 200) },
        source: 'iom_dtm_v3', gap: true, gap_reason: 'parse_error',
      });
      return results;
    }

    const rows = Array.isArray(data) ? data : (data.result || data.value || data.results || data.data || []);
    if (rows.length === 0) {
      results.push({
        signal_key: 'displacement_idp', signal_name: 'IDPs (Internal Displacement)',
        date: new Date().toISOString().split('T')[0],
        raw_value: null,
        raw_metadata: { country, error: 'no_rows' },
        source: 'iom_dtm_v3', gap: true, gap_reason: 'country_not_tracked',
      });
      return results;
    }

    for (const row of rows) {
      const reportDate = row.reportingDate || row.ReportingDate || row.date || row.Date
        || new Date().toISOString().split('T')[0];
      const idpCount = row.numPresentIdpInd || row.individuallyDisplacedPersons || row.IndividuallyDisplacedPersons
        || row.idpCount || row.IDPCount || row.individuals || row.Individuals || 0;

      results.push({
        signal_key: 'displacement_idp', signal_name: 'IDPs (Internal Displacement)',
        date: String(reportDate).split('T')[0],
        raw_value: parseInt(idpCount) || 0,
        raw_metadata: { country, idp_count: idpCount, row },
        source: 'iom_dtm_v3', gap: !idpCount, gap_reason: !idpCount ? 'no_idp_count' : null,
      });
    }

  } catch (err) {
    results.push({
      signal_key: 'displacement_idp', signal_name: 'IDPs (Internal Displacement)',
      date: new Date().toISOString().split('T')[0],
      raw_value: null,
      raw_metadata: { country, error: err.message },
      source: 'iom_dtm_v3', gap: true, gap_reason: 'fetch_error',
    });
  }

  return results;
}

module.exports = { fetchIomDtmHistorical };
