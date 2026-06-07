// historical/fetchers/gdelt_historical.cjs
// GDELT DOC 2.0 historical conflict data — gdelt_conflict signal only.
// Floor: 2013-02-19 (GDELT 2.0 launch). Pre-2013 requires GDELT 1.0 file downloads.
// gdelt_tone is sourced from BigQuery (ingest_gdelt_tone_bq.cjs) — NOT this fetcher.
// Returns array of { signal_key, date, raw_value, raw_metadata, source, gap, gap_reason }

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const https = require('https');

// Returns { status, body } — caller inspects status before parsing
function httpsGetRaw(url) {
  return new Promise((resolve, reject) => {
    const opts = { headers: { 'User-Agent': 'Sabian-Intelligence/1.0' } };
    https.get(url, opts, (res) => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => resolve({ status: res.statusCode, body: raw }));
    }).on('error', reject);
  });
}

// Retry on 429 with exponential backoff. Base wait matches GDELT's stated 5s limit.
async function httpsGetWithRetry(url, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const { status, body } = await httpsGetRaw(url);
    if (status === 429) {
      const waitMs = 5500 * Math.pow(2, attempt); // 5.5s, 11s, 22s
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }
    if (status < 200 || status >= 300) {
      throw new Error(`HTTP ${status}: ${body.slice(0, 120)}`);
    }
    try {
      return JSON.parse(body);
    } catch (e) {
      throw new Error(`JSON parse failed (status ${status}): ${e.message}`);
    }
  }
  throw new Error('GDELT max retries exceeded (rate limited)');
}

// GDELT country query terms (same as gdelt_conflict_feed.cjs)
const COUNTRY_QUERY = {
  'Sudan':       'Sudan civil war RSF attack violence',
  'Myanmar':     'Myanmar Burma military junta conflict attack',
  'Yemen':       'Yemen war Houthi attack airstrike',
  'Syria':       'Syria conflict attack airstrike violence',
  'DRC':         'Congo DRC M23 rebel attack violence',
  'Somalia':     'Somalia al-Shabaab attack conflict',
  'Afghanistan': 'Afghanistan Taliban attack violence',
  'South Sudan': 'South Sudan conflict attack fighting',
  'CAR':         'Central African Republic conflict attack',
  'Mali':        'Mali junta attack conflict violence',
  'Burkina Faso':'Burkina Faso attack jihadist conflict',
  'Niger':       'Niger attack conflict violence',
  'Ethiopia':    'Ethiopia Tigray Amhara attack conflict',
  'Nigeria':     'Nigeria Boko Haram attack violence',
  'Mozambique':  'Mozambique attack conflict violence',
  'Chad':        'Chad conflict attack violence',
  'Libya':       'Libya conflict militia attack fighting',
  'Haiti':       'Haiti gang attack violence',
  'Ukraine':     'Ukraine Russia war attack shelling',
  'Israel':      'Israel Gaza war attack airstrike',
  'Palestine':   'Gaza Palestine conflict attack',
  'Iraq':        'Iraq attack conflict militia violence',
  'Pakistan':    'Pakistan attack conflict terrorism',
  'Venezuela':   'Venezuela violence crime conflict protest',
  'Colombia':    'Colombia FARC ELN attack conflict',
};

// Minimum gap between any two requests (GDELT enforces 1 req/5s)
const GDELT_RATE_MS = 5500;
let _lastGdeltCall = 0;

async function gdeltThrottle() {
  const elapsed = Date.now() - _lastGdeltCall;
  if (elapsed < GDELT_RATE_MS) {
    await new Promise(r => setTimeout(r, GDELT_RATE_MS - elapsed));
  }
  _lastGdeltCall = Date.now();
}

// Fetch monthly aggregated conflict intensity for a country from GDELT DOC 2.0.
async function fetchGdeltHistorical(country) {
  const query = COUNTRY_QUERY[country];
  if (!query) {
    return [{
      signal_key:   'gdelt_conflict',
      signal_name:  'GDELT Conflict',
      date:         '2013-02-19',
      raw_value:    null,
      raw_metadata: { country },
      source:       'gdelt_doc_2',
      gap:          true,
      gap_reason:   'no_query_term_for_country',
    }];
  }

  const results = [];
  const gdeltStart = new Date('2013-02-19');
  const now = new Date();

  let cursor = new Date(gdeltStart);
  while (cursor <= now) {
    const yearStr  = cursor.getFullYear();
    const monthStr = String(cursor.getMonth() + 1).padStart(2, '0');
    const dateStr  = `${yearStr}-${monthStr}-01`;

    // Clamp first month to actual GDELT 2.0 floor (2013-02-19)
    const rawStart = `${yearStr}${monthStr}01000000`;
    const start = rawStart < '20130219000000' ? '20130219000000' : rawStart;
    const nextMonth = new Date(cursor);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const endYear  = nextMonth.getFullYear();
    const endMonth = String(nextMonth.getMonth() + 1).padStart(2, '0');
    const end = `${endYear}${endMonth}01000000`;

    const artlistUrl = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&startdatetime=${start}&enddatetime=${end}&maxrecords=250&format=json`;

    // Enforce 5.5s minimum spacing BEFORE each call (not after),
    // so cold-start first call is also rate-limited if another process just fired.
    await gdeltThrottle();

    try {
      const artJson = await httpsGetWithRetry(artlistUrl);
      const articles = artJson.articles || [];
      const count = articles.length;

      results.push({
        signal_key:   'gdelt_conflict',
        signal_name:  'GDELT Conflict',
        date:         dateStr,
        raw_value:    count,
        raw_metadata: { article_count: count, month: dateStr },
        source:       'gdelt_doc_2',
        gap:          count === 0,
        gap_reason:   count === 0 ? 'zero_articles_this_month' : null,
      });

    } catch (err) {
      results.push({
        signal_key:   'gdelt_conflict',
        signal_name:  'GDELT Conflict',
        date:         dateStr,
        raw_value:    null,
        raw_metadata: { error: err.message },
        source:       'gdelt_doc_2',
        gap:          true,
        gap_reason:   'fetch_error',
      });
    }

    cursor.setMonth(cursor.getMonth() + 1);
  }

  return results;
}

module.exports = { fetchGdeltHistorical };
