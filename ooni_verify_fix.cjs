// ooni_verify_fix.cjs
// Targeted post-fix verification: confirms extractPayload OONI handler + db_stats exclusion
// eliminates 100% CONTRADICTION on ooni census calls.
// Simulates exactly what signal_census does: producer call → verifier call → compare.
// Run: node ooni_verify_fix.cjs

require('dotenv').config({ path: './.env' });
const https  = require('https');
const zlib   = require('zlib');
const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

const LOG = path.join(__dirname, 'shepherd_logs', 'census_diag', 'ooni_verify_post_fix.txt');

function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }

function _decompressBody(buf, enc) {
  try {
    if (enc === 'gzip')    return zlib.gunzipSync(buf).toString('utf8');
    if (enc === 'deflate') return zlib.inflateSync(buf).toString('utf8');
    if (enc === 'br')      return zlib.brotliDecompressSync(buf).toString('utf8');
  } catch (e) {}
  return buf.toString('utf8');
}

// ── extractPayload — copy of the patched version in signal_census.cjs ────────
function extractPayload(bodyStr) {
  if (!bodyStr || !bodyStr.trim()) return { format: 'empty', values: [], count: 0, nonNullCount: 0 };

  let parsed;
  try { parsed = JSON.parse(bodyStr); }
  catch (e) {
    const lines = bodyStr.split('\n').filter(l => l.trim() && !l.startsWith('#'));
    return { format: 'text', values: lines.map(l => ({ raw: l })), count: lines.length, nonNullCount: lines.length };
  }

  // WorldBank
  if (Array.isArray(parsed) && parsed.length === 2 && (Array.isArray(parsed[1]) || parsed[1] === null)) {
    if (!parsed[1]) return { format: 'worldbank', values: [], count: 0, nonNullCount: 0 };
    const vals = parsed[1]
      .filter(o => o.value !== null && o.value !== undefined)
      .map(o => ({ date: String(o.date), value: Number(o.value) }))
      .sort((a, b) => a.date.localeCompare(b.date));
    return { format: 'worldbank', values: vals, count: parsed[1].length, nonNullCount: vals.length };
  }

  // FRED
  if (parsed && Array.isArray(parsed.observations)) {
    const vals = parsed.observations
      .filter(o => o.value !== '.' && o.value !== null)
      .map(o => ({ date: o.date, value: Number(o.value) }))
      .sort((a, b) => a.date.localeCompare(b.date));
    return { format: 'fred', values: vals, count: parsed.observations.length, nonNullCount: vals.length };
  }

  // OONI aggregation: { v, db_stats, result: [{ measurement_start_day, ... }] }
  // db_stats is volatile (elapsed_seconds, row_count change every call) — excluded here.
  if (parsed && Array.isArray(parsed.result) && parsed.result.length > 0 && parsed.result[0]?.measurement_start_day !== undefined) {
    const vals = parsed.result
      .filter(x => x !== null && x !== undefined)
      .map(x => ({ date: x.measurement_start_day, value: x }));
    return { format: 'ooni', values: vals, count: parsed.result.length, nonNullCount: vals.length };
  }

  // UNHCR / generic data array
  if (parsed && Array.isArray(parsed.data)) {
    const vals = parsed.data.filter(x => x !== null && x !== undefined);
    return { format: 'generic_data', values: vals, count: parsed.data.length, nonNullCount: vals.length };
  }

  // Bare array
  if (Array.isArray(parsed)) {
    const vals = parsed.filter(x => x !== null && x !== undefined);
    return { format: 'array', values: vals, count: parsed.length, nonNullCount: vals.length };
  }

  // Object (fallthrough)
  if (typeof parsed === 'object') {
    const hasAny = Object.values(parsed).some(v => v !== null && v !== undefined);
    return { format: 'object', values: hasAny ? [parsed] : [], count: 1, nonNullCount: hasAny ? 1 : 0 };
  }

  return { format: 'primitive', values: [parsed], count: 1, nonNullCount: parsed !== null ? 1 : 0 };
}

// ── compareValues — exact copy from signal_census.cjs ────────────────────────
function compareValues(pVals, vVals) {
  if (pVals.length !== vVals.length)
    return { match: false, reason: 'count_mismatch', producer_count: pVals.length, verifier_count: vVals.length };
  if (pVals.length === 0) return { match: true, reason: 'both_empty' };
  const mismatches = [];
  for (let i = 0; i < pVals.length; i++) {
    if (JSON.stringify(pVals[i]) !== JSON.stringify(vVals[i]))
      mismatches.push({ idx: i, producer: pVals[i], verifier: vVals[i] });
  }
  if (mismatches.length === 0) return { match: true, reason: 'all_values_identical' };
  return { match: false, reason: 'values_differ', mismatch_count: mismatches.length, mismatch_indices: mismatches.map(m => m.idx), sample: mismatches.slice(0, 2) };
}

// ── divergenceLocation — exact copy from signal_census.cjs ───────────────────
function divergenceLocation(pVals, vVals) {
  const allDates = pVals.map(v => v.date).filter(Boolean).sort();
  if (allDates.length === 0) return 'historical';
  const recentDates = new Set(allDates.slice(-2));
  for (let i = 0; i < pVals.length; i++) {
    if (JSON.stringify(pVals[i]) === JSON.stringify(vVals[i])) continue;
    const date = pVals[i]?.date;
    if (!date || !recentDates.has(String(date))) return 'historical';
  }
  return 'recent';
}

// ── verdict — mirrors signal_census.cjs runVerifier logic ────────────────────
function verdict(pPayload, vPayload) {
  const countMatch = pPayload.nonNullCount === vPayload.nonNullCount;
  if (!countMatch) return 'CONTRADICTION (count mismatch)';
  const cmp = compareValues(pPayload.values, vPayload.values);
  if (cmp.match) return 'PASS';
  const loc = divergenceLocation(pPayload.values, vPayload.values);
  return loc === 'historical' ? 'CONTRADICTION (historical divergence)' : 'TEMPORAL_VARIANCE';
}

// ── plain https fetch ─────────────────────────────────────────────────────────
function plainFetch(url, extraHeaders = {}) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, port: 443,
      path: u.pathname + u.search, method: 'GET',
      headers: { 'Accept': 'application/json', 'Accept-Encoding': 'gzip, deflate, br', ...extraHeaders },
      timeout: 30000,
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const enc = res.headers['content-encoding'] || '';
        const buf = Buffer.concat(chunks);
        const body = _decompressBody(buf, enc);
        resolve({ status: res.statusCode, body });
      });
    });
    req.on('error', err => resolve({ status: 0, body: '', error: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: '', error: 'TIMEOUT' }); });
    req.end();
  });
}

// ── BEFORE-fix simulation: old extractPayload (Object fallthrough) ────────────
function extractPayloadBefore(bodyStr) {
  if (!bodyStr || !bodyStr.trim()) return { format: 'empty', values: [], count: 0, nonNullCount: 0 };
  let parsed;
  try { parsed = JSON.parse(bodyStr); } catch (e) { return { format: 'text', values: [{ raw: bodyStr }], count: 1, nonNullCount: 1 }; }
  if (typeof parsed === 'object' && !Array.isArray(parsed)) {
    const hasAny = Object.values(parsed).some(v => v !== null && v !== undefined);
    return { format: 'object', values: hasAny ? [parsed] : [], count: 1, nonNullCount: hasAny ? 1 : 0 };
  }
  return { format: 'primitive', values: [parsed], count: 1, nonNullCount: 1 };
}

// Use a country with stable, dense historical data (Iran)
const TEST_URL = 'https://api.ooni.io/api/v1/aggregation?probe_cc=IR&since=2012-01-01&until=' +
  new Date().toISOString().split('T')[0] + '&axis_x=measurement_start_day';

async function main() {
  const lines = [];
  const log = (...args) => { const s = args.join(' '); console.log(s); lines.push(s); };

  log('OONI CENSUS FIX VERIFICATION');
  log('Run at: ' + new Date().toISOString());
  log('URL: ' + TEST_URL);
  log('');

  log('Fetching call 1 (producer simulation)...');
  const r1 = await plainFetch(TEST_URL);
  log('Fetching call 2 (verifier simulation, ~2s later)...');
  await new Promise(r => setTimeout(r, 2000));
  const r2 = await plainFetch(TEST_URL);
  log('');

  if (r1.status !== 200 || r2.status !== 200) {
    log('FATAL: HTTP error. r1=' + r1.status + ' r2=' + r2.status);
    return;
  }

  // Parse both
  const p1 = JSON.parse(r1.body);
  const p2 = JSON.parse(r2.body);

  log('─── RAW RESPONSE COMPARISON ─────────────────────────────');
  log('  call1 result count:           ' + p1.result?.length);
  log('  call2 result count:           ' + p2.result?.length);
  log('  call1 db_stats.elapsed_secs:  ' + p1.db_stats?.elapsed_seconds);
  log('  call2 db_stats.elapsed_secs:  ' + p2.db_stats?.elapsed_seconds);
  log('  call1 db_stats.row_count:     ' + p1.db_stats?.row_count);
  log('  call2 db_stats.row_count:     ' + p2.db_stats?.row_count);
  log('  raw bodies identical:         ' + (r1.body === r2.body));
  log('');

  // BEFORE fix
  const before1 = extractPayloadBefore(r1.body);
  const before2 = extractPayloadBefore(r2.body);
  const vBefore = verdict(before1, before2);
  log('─── VERDICT BEFORE FIX (Object fallthrough) ─────────────');
  log('  payload format:    ' + before1.format);
  log('  payload count:     ' + before1.nonNullCount);
  log('  verdict:           ' + vBefore);
  log('');

  // AFTER fix
  const after1 = extractPayload(r1.body);
  const after2 = extractPayload(r2.body);
  const cmpAfter = compareValues(after1.values, after2.values);
  const vAfter = verdict(after1, after2);
  log('─── VERDICT AFTER FIX (OONI handler + db_stats excluded) ─');
  log('  payload format:    ' + after1.format);
  log('  payload count:     ' + after1.nonNullCount);
  log('  values match:      ' + cmpAfter.match);
  if (!cmpAfter.match) {
    log('  mismatch count:    ' + cmpAfter.mismatch_count);
    log('  mismatch reason:   ' + cmpAfter.reason);
    // Show which dates mismatched
    const mismatchDates = (cmpAfter.mismatch_indices || [])
      .map(i => after1.values[i]?.date).filter(Boolean);
    log('  mismatched dates:  ' + (mismatchDates.join(', ') || 'n/a'));
    const allDates = after1.values.map(v => v.date).filter(Boolean).sort();
    log('  recent zone dates: ' + allDates.slice(-2).join(', '));
  }
  log('  verdict:           ' + vAfter);
  log('');

  if (!vAfter.includes('CONTRADICTION')) {
    log('RESULT: FIX CONFIRMED — contradiction eliminated.');
    log('  db_stats excluded from comparison.');
    log('  Any measurement-count drift in recent days → TEMPORAL_VARIANCE (expected).');
    log('  Historical measurements unchanged → no false CONTRADICTION fired.');
  } else {
    log('RESULT: FIX NOT CONFIRMED — contradiction persists.');
    log('  Further investigation needed.');
  }

  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  fs.writeFileSync(LOG, lines.join('\n') + '\n');
  log('');
  log('Log written to: ' + LOG);
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
