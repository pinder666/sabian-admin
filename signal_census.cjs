#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════
// SIGNAL CENSUS — DUAL-PATH VERIFICATION
// Producer (intercepted fetcher) vs Independent Verifier (clean raw re-fetch)
// Nothing self-certifies. Every number assumed false until checker fails to break it.
// ═══════════════════════════════════════════════════════════════════════════════

// ─── SUPABASE STUB — ABSOLUTE FIRST ───────────────────────────────────────────
const _blockedOps = [];

function _makeQuery(table) {
  const q = {
    // Every filter/modifier returns the same chainable object
    eq: () => q, neq: () => q, not: () => q, is: () => q,
    gte: () => q, lte: () => q, gt: () => q, lt: () => q,
    in: () => q, like: () => q, ilike: () => q,
    contains: () => q, overlaps: () => q,
    order: () => q, limit: () => q, range: () => q,
    // select() stays chainable
    select: () => q,
    // Terminals that return Promises directly
    single:      () => Promise.resolve({ data: null, error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    // Thenable so await works on chain
    then: (res, rej) => Promise.resolve({ data: [], error: null }).then(res, rej),
    catch: (rej)     => Promise.resolve({ data: [], error: null }).catch(rej),
    // Write ops — blocked, logged
    upsert: (d) => { _blockedOps.push({ op: 'upsert', table, rows: Array.isArray(d) ? d.length : 1 }); return Promise.resolve({ data: null, error: null }); },
    insert: (d) => { _blockedOps.push({ op: 'insert', table, rows: Array.isArray(d) ? d.length : 1 }); return Promise.resolve({ data: null, error: null }); },
    update: (d) => { _blockedOps.push({ op: 'update', table }); return q; },
    delete: ()  => { _blockedOps.push({ op: 'delete', table }); return q; },
  };
  return q;
}

const _Module = require('module');
const _origRequire = _Module.prototype.require;
_Module.prototype.require = function(id) {
  if (id === '@supabase/supabase-js') {
    return {
      createClient: () => ({
        from: (table) => _makeQuery(table),
        rpc: (fn) => { _blockedOps.push({ op: 'rpc', fn }); return Promise.resolve({ data: null, error: null }); },
      }),
    };
  }
  return _origRequire.apply(this, arguments);
};

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const fs   = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const zlib = require('zlib');
const { AsyncLocalStorage } = require('async_hooks');

// ─── SAVE ORIGINALS — BEFORE ANY PATCHING, USED BY VERIFIER ──────────────────
const ORIG_HTTP_REQ  = http.request.bind(http);
const ORIG_HTTPS_REQ = https.request.bind(https);
const ORIG_HTTP_GET  = http.get.bind(http);
const ORIG_HTTPS_GET = https.get.bind(https);
const ORIG_FETCH     = globalThis.fetch;

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const FETCHERS_DIR      = path.join(__dirname, 'historical', 'fetchers');
const LOG_DIR           = path.join(__dirname, 'shepherd_logs');
const CENSUS_JSON       = path.join(LOG_DIR, 'signal_census.json');
const CENSUS_TXT        = path.join(LOG_DIR, 'signal_census.txt');
const VERIFY_LOG        = path.join(LOG_DIR, 'verification_log.json');

const PRODUCER_TIMEOUT  = 300000;  // 5 min per fetcher
const VERIFIER_TIMEOUT  = 30000;   // 30s per re-fetch
const VERIFIER_RATE_MS  = 400;     // pause between verifier calls

// Per-country fetchers: try countries in order until calls are captured
const FALLBACK_COUNTRIES = ['Egypt', 'Sudan', 'Mali', 'Nigeria', 'Afghanistan'];

// ─── UTILITIES ────────────────────────────────────────────────────────────────
const ts = () => new Date().toISOString();

function sha256(str) {
  return crypto.createHash('sha256').update(typeof str === 'string' ? str : JSON.stringify(str)).digest('hex');
}

// ─── INTERCEPT INFRASTRUCTURE (producer only) ─────────────────────────────────
let _interceptEnabled  = false;
let _interceptedCalls  = [];
let _activeGeneration  = 0;
let _activeSignalKey   = '';
const _fetcherContext  = new AsyncLocalStorage();

function _decompressBody(buf, enc) {
  try {
    if (enc === 'gzip')    return zlib.gunzipSync(buf).toString('utf8');
    if (enc === 'deflate') return zlib.inflateSync(buf).toString('utf8');
    if (enc === 'br')      return zlib.brotliDecompressSync(buf).toString('utf8');
  } catch (e) {}
  return buf.toString('utf8');
}

function _patchFetch() {
  if (!ORIG_FETCH) return;
  globalThis.fetch = async function(input, init = {}) {
    if (!_interceptEnabled) return ORIG_FETCH(input, init);
    const _ctx = _fetcherContext.getStore();
    if (!_ctx || _ctx.gen !== _activeGeneration) return ORIG_FETCH(input, init);
    const url = typeof input === 'string' ? input : (input?.url || String(input));
    const rec = { url, headers_sent: init.headers || {}, method: (init.method || 'GET').toUpperCase(), source: 'fetch', timestamp: ts(), response: null, _gen: _activeGeneration, _fetcher: _activeSignalKey };
    _interceptedCalls.push(rec);
    try {
      const res = await ORIG_FETCH(input, init);
      const clone = res.clone();
      const body = await clone.text();
      if (rec._gen !== _activeGeneration) {
        process.stderr.write(`[CENSUS] DISCARDED_LATE_RESPONSE fetcher=${rec._fetcher} url=${url.slice(0,60)} gen=${rec._gen}→${_activeGeneration}\n`);
        return res;
      }
      rec.response = { status: res.status, statusMessage: res.statusText, headers: Object.fromEntries(res.headers.entries()), bodyRaw: body, bodyLength: body.length };
      return res;
    } catch (err) {
      if (rec._gen !== _activeGeneration) {
        process.stderr.write(`[CENSUS] DISCARDED_LATE_RESPONSE_ERR fetcher=${rec._fetcher} url=${url.slice(0,60)} gen=${rec._gen}→${_activeGeneration}\n`);
        throw err;
      }
      rec.response = { status: 0, statusMessage: err.message, headers: {}, bodyRaw: '', bodyLength: 0, error: true };
      throw err;
    }
  };
}

function _wrapReq(originalFn, proto) {
  return function(...args) {
    if (!_interceptEnabled) return originalFn(...args);
    const _ctx = _fetcherContext.getStore();
    if (!_ctx || _ctx.gen !== _activeGeneration) return originalFn(...args);
    let opts = args[0], cb = args[1];
    let url, headers = {};
    if (typeof opts === 'string')     url = opts;
    else if (opts instanceof URL)     url = opts.href;
    else if (typeof opts === 'object') {
      const host = opts.hostname || opts.host || 'unknown';
      const port = opts.port ? `:${opts.port}` : '';
      url = `${proto}://${host}${port}${opts.path || '/'}`;
      headers = { ...opts.headers };
    }
    const rec = { url, headers_sent: headers, method: (opts?.method || 'GET').toUpperCase(), source: 'http', timestamp: ts(), response: null, _gen: _activeGeneration, _fetcher: _activeSignalKey };
    _interceptedCalls.push(rec);
    // Find the actual callback — may be at args[1] (2-arg) or args[2] (3-arg url+opts+cb form)
    const _cbIdx = args.reduce((acc, a, i) => typeof a === 'function' ? i : acc, -1);
    const _origCb = _cbIdx !== -1 ? args[_cbIdx] : null;
    const wrapped = (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const body = _decompressBody(Buffer.concat(chunks), res.headers['content-encoding']);
        if (rec._gen !== _activeGeneration) {
          process.stderr.write(`[CENSUS] DISCARDED_LATE_RESPONSE fetcher=${rec._fetcher} url=${url.slice(0,60)} gen=${rec._gen}→${_activeGeneration}\n`);
          return;
        }
        rec.response = { status: res.statusCode, statusMessage: res.statusMessage, headers: res.headers, bodyRaw: body, bodyLength: body.length };
      });
      if (typeof _origCb === 'function') _origCb(res);
    };
    if (_cbIdx !== -1) args[_cbIdx] = wrapped; else args.push(wrapped);
    return originalFn(...args);
  };
}

// ─── WAIT FOR ALL IN-FLIGHT RESPONSES — no call may be PENDING after this ─────
async function waitForResponses(calls, maxMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (calls.every(c => c.response !== null)) return;
    await new Promise(r => setTimeout(r, 50));
  }
  // Mark any still-null: explicit drain timeout, not a silent PENDING
  for (const c of calls) {
    if (c.response === null) {
      c.response = { status: 0, statusMessage: 'RESPONSE_DRAIN_TIMEOUT', headers: {}, bodyRaw: '', bodyLength: 0, error: true, timedOut: true };
    }
  }
}

function enableIntercept(signalKey = '') {
  _activeGeneration += 1;
  _activeSignalKey   = signalKey;
  _interceptedCalls  = [];
  _interceptEnabled  = true;
  http.request  = _wrapReq(ORIG_HTTP_REQ,  'http');
  https.request = _wrapReq(ORIG_HTTPS_REQ, 'https');
  http.get      = _wrapReq(ORIG_HTTP_GET,  'http');
  https.get     = _wrapReq(ORIG_HTTPS_GET, 'https');
  _patchFetch();
}

function disableIntercept() {
  _interceptEnabled = false;
  http.request  = ORIG_HTTP_REQ;
  https.request = ORIG_HTTPS_REQ;
  http.get      = ORIG_HTTP_GET;
  https.get     = ORIG_HTTPS_GET;
  if (ORIG_FETCH) globalThis.fetch = ORIG_FETCH;
}

// ─── DATA PAYLOAD EXTRACTOR — strips envelope, returns clean values[] ─────────
function extractPayload(bodyStr) {
  if (!bodyStr || !bodyStr.trim()) return { format: 'empty', values: [], count: 0, nonNullCount: 0 };

  let parsed;
  try { parsed = JSON.parse(bodyStr); }
  catch (e) {
    const lines = bodyStr.split('\n').filter(l => l.trim() && !l.startsWith('#'));
    return { format: 'text', values: lines.map(l => ({ raw: l })), count: lines.length, nonNullCount: lines.length };
  }

  // World Bank: [metadata, data_array]
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

  // GDELT
  if (parsed && parsed.articles !== undefined) {
    const arts = parsed.articles || [];
    return { format: 'gdelt', values: arts.map(a => ({ url: a.url, title: a.title })), count: arts.length, nonNullCount: arts.length };
  }

  // IMF DataMapper: { values: { INDICATOR: { ISO3: { year: value } } } }
  if (parsed && parsed.values && typeof parsed.values === 'object') {
    const indicators = Object.values(parsed.values);
    if (indicators.length > 0) {
      const countries = Object.values(indicators[0]);
      if (countries.length > 0) {
        const yearMap = countries[0];
        const vals = Object.entries(yearMap)
          .filter(([, v]) => v !== null && v !== '' && !isNaN(Number(v)))
          .map(([year, v]) => ({ date: year, value: Number(v) }))
          .sort((a, b) => a.date.localeCompare(b.date));
        return { format: 'imf_datamapper', values: vals, count: vals.length, nonNullCount: vals.length };
      }
    }
    return { format: 'imf_datamapper', values: [], count: 0, nonNullCount: 0 };
  }

  // USGS count endpoint: { count: N }
  if (parsed && typeof parsed.count === 'number' && Object.keys(parsed).length <= 4) {
    return { format: 'usgs_count', values: [{ count: parsed.count }], count: 1, nonNullCount: parsed.count > 0 ? 1 : 0 };
  }

  // WHO GHO OData: { "@odata.context": "...", "value": [{ TimeDim, NumericValue, SpatialDim }] }
  // Standard OData envelope — 'value' key holds the data array, TimeDim is the year field.
  // Must appear before the IMF check (which looks for parsed.values, not parsed.value).
  if (parsed && typeof parsed['@odata.context'] === 'string' && Array.isArray(parsed.value)
      && parsed.value.length > 0 && parsed.value[0]?.TimeDim !== undefined) {
    const vals = parsed.value
      .filter(x => x !== null && x !== undefined && x.NumericValue !== undefined)
      .map(x => ({ date: String(x.TimeDim), value: x.NumericValue, spatial: x.SpatialDim }));
    return { format: 'odata_gho', values: vals, count: parsed.value.length, nonNullCount: vals.length };
  }

  // OONI aggregation: { v, db_stats, result: [{ measurement_start_day, anomaly_count, ... }] }
  // db_stats (elapsed_seconds, row_count, bytes) is volatile — changes on every call.
  // Unwrap result[] only; db_stats is excluded so volatile fields never reach comparator.
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

  // Object
  if (typeof parsed === 'object') {
    const hasAny = Object.values(parsed).some(v => v !== null && v !== undefined);
    return { format: 'object', values: hasAny ? [parsed] : [], count: 1, nonNullCount: hasAny ? 1 : 0 };
  }

  return { format: 'primitive', values: [parsed], count: 1, nonNullCount: parsed !== null ? 1 : 0 };
}

// ─── VALUES COMPARATOR — element-wise ─────────────────────────────────────────
function compareValues(pVals, vVals) {
  if (pVals.length !== vVals.length) {
    return { match: false, reason: 'count_mismatch', producer_count: pVals.length, verifier_count: vVals.length };
  }
  if (pVals.length === 0) return { match: true, reason: 'both_empty' };
  const mismatches = [];
  for (let i = 0; i < pVals.length; i++) {
    if (JSON.stringify(pVals[i]) !== JSON.stringify(vVals[i])) {
      mismatches.push({ idx: i, producer: pVals[i], verifier: vVals[i] });
    }
  }
  if (mismatches.length === 0) return { match: true, reason: 'all_values_identical' };
  return { match: false, reason: 'values_differ', mismatch_count: mismatches.length, mismatch_indices: mismatches.map(m => m.idx), sample: mismatches.slice(0, 5) };
}

// ─── DIVERGENCE LOCATION — determines if value mismatch is historical or recent ─
// Historical data does not change. Any changed historical value = CONTRADICTION.
// Only last 2 datapoints may legitimately differ (API updated between producer/verifier).
function divergenceLocation(pVals, vVals) {
  const allDates = pVals.map(v => v.date).filter(Boolean).sort();

  // If no date fields at all, treat all positions as historical — unknown format, flag it
  if (allDates.length === 0) return 'historical';

  // Identify the "recent" zone: last 2 unique dates
  const recentDates = new Set(allDates.slice(-2));

  for (let i = 0; i < pVals.length; i++) {
    if (JSON.stringify(pVals[i]) === JSON.stringify(vVals[i])) continue;
    const date = pVals[i]?.date;
    // No date on this entry, or date predates recent zone → historical change → CONTRADICTION
    if (!date || !recentDates.has(String(date))) return 'historical';
  }

  // All divergence confined to the last 2 date positions
  return 'recent';
}

// ─── VERIFIER FETCH — raw https only, no interceptor, no fetcher code ─────────
// capturedHeaders: replayed verbatim from the producer's intercepted request,
// so keyed/header-sensitive APIs see exactly the same question the fetcher asked.
async function verifierFetch(url, capturedHeaders = {}) {
  return new Promise((resolve) => {
    let urlObj;
    try { urlObj = new URL(url); } catch (e) { return resolve({ status: 0, body: '', error: `bad_url: ${e.message}` }); }
    const isHttps = urlObj.protocol === 'https:';
    const reqFn = isHttps ? ORIG_HTTPS_REQ : ORIG_HTTP_REQ;
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      timeout: VERIFIER_TIMEOUT,
      // Replay producer headers verbatim, plus Accept-Encoding to match axios implicit header.
      // Without this, axios producers get gzip from USGS; verifier gets plain JSON → false CONTRADICTION.
      headers: { 'Accept-Encoding': 'gzip, deflate, br', ...capturedHeaders },
    };
    const req = reqFn(options, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const body = _decompressBody(Buffer.concat(chunks), res.headers['content-encoding']);
        resolve({ status: res.statusCode, body, error: null });
      });
    });
    req.on('error', err => resolve({ status: 0, body: '', error: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: '', error: 'TIMEOUT' }); });
    req.end();
  });
}

// ─── GREP ─────────────────────────────────────────────────────────────────────
function grepDir(rootDir, needle, exts = ['.cjs', '.js', '.json']) {
  const skip = new Set(['node_modules', '.git', 'shepherd_logs']);
  const results = [];
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir); } catch (e) { return; }
    for (const e of entries) {
      if (skip.has(e)) continue;
      const full = path.join(dir, e);
      let stat;
      try { stat = fs.statSync(full); } catch (e) { continue; }
      if (stat.isDirectory()) { walk(full); continue; }
      if (!exts.some(ext => e.endsWith(ext))) continue;
      try {
        // Word-boundary regex: matches standalone "47", not "147", "470", "1947", timestamps
        const re = needle instanceof RegExp ? needle : new RegExp(`\\b${needle}\\b`);
        fs.readFileSync(full, 'utf8').split('\n').forEach((line, i) => {
          if (re.test(line)) results.push({ file: path.relative(rootDir, full), line: i + 1, content: line.trimEnd() });
        });
      } catch (e) {}
    }
  }
  walk(rootDir);
  return results;
}

// ─── SIGNAL MAP HELPERS ───────────────────────────────────────────────────────

// Extract the indicator/dataset code from a real captured URL
function extractIndicatorFromUrl(rawUrl) {
  let u;
  try { u = new URL(rawUrl); } catch (e) { return null; }
  const p = u.pathname;

  // World Bank: /v2/country/{iso}/indicator/{CODE}
  const wb = p.match(/\/indicator\/([A-Z0-9_.]+)/i);
  if (wb) return wb[1];

  // FRED: ?series_id=XXXX
  const fred = u.searchParams.get('series_id');
  if (fred) return fred;

  // IMF DataMapper: /external/datamapper/api/v1/{INDICATOR}/{COUNTRY}
  const imf = p.match(/\/datamapper\/api\/v1\/([^/]+)/);
  if (imf) return imf[1];

  // USGS: /fdsnws/event/1/{endpoint}  e.g. count, query
  const usgs = p.match(/\/fdsnws\/event\/\d+\/(\w+)/);
  if (usgs) return `usgs:${usgs[1]}`;

  // GDELT: ?query=... (first 40 chars of the search term)
  const gdelt = u.searchParams.get('query');
  if (gdelt) return `gdelt:"${gdelt.slice(0, 40)}"`;

  // UCDP API: path often ends with dataset name
  if (u.hostname.includes('ucdp')) {
    const seg = p.split('/').filter(Boolean).pop();
    return seg ? `ucdp:${seg}` : null;
  }

  // UNHCR / generic: last non-numeric path segment
  const segs = p.split('/').filter(s => s && !/^\d+$/.test(s));
  return segs.length ? segs[segs.length - 1] : null;
}

// Parse all signal_key values declared in fetcher source code
function parseSourceSignalKeys(src) {
  const found = new Set();
  // Matches: signal_key: 'foo'  or  signal_key: "foo"  or  signal_key: `foo`
  const re = /signal_key\s*:\s*['"`]([^'"`\s]+)['"`]/g;
  let m;
  while ((m = re.exec(src)) !== null) found.add(m[1]);
  return [...found];
}

// Build one row per fetcher for signal_map.txt
function buildSignalMap(producerResults, fetcherFiles) {
  const _mapOutIdx = process.argv.indexOf('--map-out');
  const SIGNAL_MAP_FILE = path.join(LOG_DIR, _mapOutIdx !== -1 ? process.argv[_mapOutIdx + 1] : 'signal_map.txt');

  const rows = [];
  for (const pr of producerResults) {
    const filePath = fetcherFiles.find(f =>
      path.basename(f).replace('_historical.cjs', '') === pr.signal_key
    );
    const fileName = filePath ? path.basename(filePath) : `${pr.signal_key}_historical.cjs`;
    const fileKey  = pr.signal_key;

    // Parse declared signal_keys from source
    let src = '';
    if (filePath) { try { src = fs.readFileSync(filePath, 'utf8'); } catch (e) {} }
    const declaredKeys = parseSourceSignalKeys(src);

    // Collect unique API hosts and indicator codes from captured URLs
    const hosts = [], indicators = [];
    const realCalls = (pr.calls || []).filter(c => c.url && c.state !== 'NEVER_FIRED');
    for (const call of realCalls) {
      try {
        const host = new URL(call.url).hostname;
        if (!hosts.includes(host)) hosts.push(host);
      } catch (e) {}
      const ind = extractIndicatorFromUrl(call.url);
      if (ind && !indicators.includes(ind)) indicators.push(ind);
    }

    // Flags
    const flags = [];
    if (!pr.load_ok)               flags.push('LOAD_FAIL');
    if (pr.uses_external_process)  flags.push('EXTERNAL_PROCESS');
    if (realCalls.length === 0)    flags.push('NEVER_FIRED');
    if (declaredKeys.length === 0) flags.push('NO_DECLARED_KEY');
    if (declaredKeys.length > 1)   flags.push('MULTI_SIGNAL');

    // MISMATCH: fileKey not found in any declared signal_key
    if (declaredKeys.length > 0 && !declaredKeys.includes(fileKey)) {
      flags.push('MISMATCH');
    }

    rows.push({
      filename:       fileName,
      file_key:       fileKey,
      declared_keys:  declaredKeys.join(',') || 'n/a',
      api_hosts:      hosts.join(',') || 'n/a',
      indicators:     indicators.join(',') || 'n/a',
      flags:          flags.join(' ') || '',
    });
  }

  // Format as aligned text table
  const COL = [52, 32, 38, 42, 0];
  const pad = (s, n) => n ? String(s).padEnd(n) : String(s);
  const header = [
    pad('filename',      COL[0]),
    pad('declared_keys', COL[1]),
    pad('api_host',      COL[2]),
    pad('indicators',    COL[3]),
    'flags',
  ].join(' | ');
  const divLine = '-'.repeat(header.length);

  const lines = [
    `SIGNAL MAP  ${ts()}`,
    divLine,
    header,
    divLine,
    ...rows.map(r => [
      pad(r.filename,      COL[0]),
      pad(r.declared_keys, COL[1]),
      pad(r.api_hosts,     COL[2]),
      pad(r.indicators,    COL[3]),
      r.flags,
    ].join(' | ')),
    divLine,
    `${rows.length} fetchers  |  mismatches: ${rows.filter(r => r.flags.includes('MISMATCH')).length}  |  multi_signal: ${rows.filter(r => r.flags.includes('MULTI_SIGNAL')).length}  |  never_fired: ${rows.filter(r => r.flags.includes('NEVER_FIRED')).length}`,
  ];

  fs.writeFileSync(SIGNAL_MAP_FILE, lines.join('\n') + '\n');
  return SIGNAL_MAP_FILE;
}

// ─── HASH CHAIN ───────────────────────────────────────────────────────────────
let _chainHead = 'GENESIS';
const _chainEntries = [];

function chainRecord(data) {
  const entry = { seq: _chainEntries.length, prev_hash: _chainHead, data };
  entry.entry_hash = sha256(JSON.stringify(entry));
  _chainHead = entry.entry_hash;
  _chainEntries.push(entry);
}

// ─── LOAD FETCHER ─────────────────────────────────────────────────────────────
function loadFetcher(filePath) {
  const src = (() => { try { return fs.readFileSync(filePath, 'utf8'); } catch (e) { return ''; } })();
  const usesExternalProcess = /execSync|exec\(|spawn\(|child_process/.test(src);
  try {
    delete require.cache[require.resolve(filePath)];
    const mod = require(filePath);
    const fnName = Object.keys(mod).find(k => k.toLowerCase().includes('fetch') && typeof mod[k] === 'function');
    if (!fnName) return { ok: false, reason: 'no_fetch_fn', exports: Object.keys(mod), usesExternalProcess };
    const fn = mod[fnName];
    return { ok: true, fn, fnName, isGlobalPull: fn.length === 0, usesExternalProcess };
  } catch (err) {
    return { ok: false, reason: err.message, usesExternalProcess };
  }
}

// ─── CLASSIFY CALL STATE ──────────────────────────────────────────────────────
function classifyCall(call) {
  if (!call.response) return 'PENDING_NO_RESPONSE';
  const s = call.response.status;
  if (s < 200 || s >= 300) return `HTTP_FAIL_${s}`;
  const payload = extractPayload(call.response.bodyRaw);
  return payload.nonNullCount > 0 ? 'NON_NULL_DATA' : 'EMPTY_200';
}

// ─── PRODUCER: run one fetcher ────────────────────────────────────────────────
async function runProducer(filePath) {
  const signalKey = path.basename(filePath).replace('_historical.cjs', '');

  // Stub process.exit for the entire fetcher lifecycle.
  // Some fetchers (e.g. structural_pressure) call process.exit(0) at module level
  // without a require.main guard — this would kill the census mid-run.
  const _origExit = process.exit;
  process.exit = (code) => {
    process.stderr.write(`[CENSUS] blocked process.exit(${code}) from ${signalKey}\n`);
  };

  let loader;
  try {
    loader = loadFetcher(filePath);
  } finally {
    // Keep exit stubbed through the invocation below; restored in the outer finally
  }

  if (!loader.ok) {
    process.exit = _origExit;
    return { signal_key: signalKey, load_ok: false, reason: loader.reason, usesExternalProcess: loader.usesExternalProcess, calls: [] };
  }

  try {
    // For per-country fetchers: try fallback countries until calls fire
    const countriesToTry = loader.isGlobalPull ? [null] : FALLBACK_COUNTRIES;

    for (const country of countriesToTry) {
      _blockedOps.length = 0;
      enableIntercept(signalKey);

      let resultRows = null, runError = null;
      const t0 = Date.now();

      try {
        resultRows = await Promise.race([
          _fetcherContext.run({ gen: _activeGeneration, fetcher: signalKey }, () =>
            loader.fn(country === null ? undefined : country)
          ),
          new Promise((_, rej) => setTimeout(() => rej(new Error(`TIMEOUT_${Math.round((Date.now()-t0)/1000)}s`)), PRODUCER_TIMEOUT))
        ]);
      } catch (err) {
        runError = err.message;
      }

      disableIntercept();
      // Await all in-flight response bodies before snapshotting — no PENDING_NO_RESPONSE
      await waitForResponses(_interceptedCalls);

      const rawCalls   = [..._interceptedCalls];
      const dbOps      = [..._blockedOps];
      const firedCalls = rawCalls.filter(c => c.url);

      if (firedCalls.length > 0 || loader.isGlobalPull || runError) {
        const calls = firedCalls.length === 0
          ? [{ url: null, state: 'NEVER_FIRED', signal_key: signalKey }]
          : firedCalls.map(c => {
              const payload = c.response ? extractPayload(c.response.bodyRaw) : { format: 'none', values: [], count: 0, nonNullCount: 0 };
              return {
                url:                  c.url,
                method:               c.method,
                source:               c.source,
                http_status:          c.response?.status ?? null,
                state:                classifyCall(c),
                raw_byte_count:       c.response?.bodyLength ?? 0,
                raw_hash:             c.response ? sha256(c.response.bodyRaw) : null,
                payload_hash:         sha256(JSON.stringify(payload.values)),
                payload_value_count:  payload.nonNullCount,
                payload_format:       payload.format,
                payload_values:       payload.values,
                producer_timestamp:   c.timestamp,
              };
            });

        return {
          signal_key:            signalKey,
          fn_name:               loader.fnName,
          is_global_pull:        loader.isGlobalPull,
          uses_external_process: loader.usesExternalProcess,
          load_ok:               true,
          test_country:          country,
          run_error:             runError,
          result_row_count:      Array.isArray(resultRows) ? resultRows.length : null,
          calls,
          db_writes_blocked:     dbOps,
        };
      }
      // No calls fired with this country — try next
    }

    // All countries tried, nothing fired
    return {
      signal_key:            signalKey,
      fn_name:               loader.fnName,
      is_global_pull:        loader.isGlobalPull,
      uses_external_process: loader.usesExternalProcess,
      load_ok:               true,
      test_country:          FALLBACK_COUNTRIES[FALLBACK_COUNTRIES.length - 1],
      run_error:             null,
      result_row_count:      0,
      calls:                 [{ url: null, state: 'NEVER_FIRED', signal_key: signalKey }],
      db_writes_blocked:     [],
    };
  } finally {
    // Always restore process.exit — even if the fetcher called it
    process.exit = _origExit;
  }
}

// ─── VERIFIER: independently re-fetch a captured URL ─────────────────────────
async function runVerifier(producerCall) {
  if (!producerCall.url || producerCall.state === 'NEVER_FIRED') {
    return { ...producerCall, verdict: 'SKIP_NO_URL', verifier_timestamp: ts() };
  }

  await new Promise(r => setTimeout(r, VERIFIER_RATE_MS));

  let vResult;
  try {
    // Fix 1: replay producer's captured headers verbatim
    vResult = await Promise.race([
      verifierFetch(producerCall.url, producerCall.headers_sent || {}),
      new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), VERIFIER_TIMEOUT + 5000))
    ]);
  } catch (err) {
    const record = { ...producerCall, verdict: `UNRESOLVED:${err.message}`, verifier_timestamp: ts(), consistency: 'CONSISTENT' };
    chainRecord({ fetcher: producerCall._fetcher, url: producerCall.url, verdict: record.verdict });
    return record;
  }

  const vPayload     = extractPayload(vResult.body || '');
  const vRawHash     = sha256(vResult.body || '');
  const vPayloadHash = sha256(JSON.stringify(vPayload.values));

  const rawHashMatch   = producerCall.raw_hash === vRawHash;
  const countMatch     = producerCall.payload_value_count === vPayload.nonNullCount;
  const valComparison  = compareValues(producerCall.payload_values, vPayload.values);

  // ── Verdict (Design C) ───────────────────────────────────────────────────
  let verdict;
  if (vResult.error && vResult.status === 0) {
    verdict = `UNRESOLVED:${vResult.error}`;
  } else if (vResult.status < 200 || vResult.status >= 300) {
    verdict = `HTTP_FAIL_${vResult.status}`;
  } else if (!countMatch) {
    verdict = 'CONTRADICTION';
  } else if (valComparison.match) {
    verdict = 'PASS';
  } else {
    // Fix 2: same count but values differ — check WHERE the divergence is.
    // Historical data never changes. Any changed historical value = CONTRADICTION, not timing.
    const divLoc = divergenceLocation(producerCall.payload_values, vPayload.values);
    verdict = divLoc === 'historical' ? 'CONTRADICTION' : 'TEMPORAL_VARIANCE';
  }

  // ── Cross-dimension check ────────────────────────────────────────────────
  // Invariant: if payload_hash matches, count MUST match (same hash = same content)
  let consistency = 'CONSISTENT';
  let inconsistencyDetail = null;
  if (vPayloadHash === producerCall.payload_hash && !countMatch) {
    consistency = 'INTERNAL_INCONSISTENCY';
    inconsistencyDetail = 'payload_hash_match=true but count_match=false — extractor bug or hash collision';
  }
  if (rawHashMatch && !countMatch) {
    consistency = 'INTERNAL_INCONSISTENCY';
    inconsistencyDetail = 'raw_hash_match=true but count_match=false — impossible unless extractor non-deterministic';
  }

  const result = {
    ...producerCall,
    verifier_http_status:        vResult.status,
    verifier_raw_byte_count:     (vResult.body || '').length,
    verifier_raw_hash:           vRawHash,
    verifier_payload_hash:       vPayloadHash,
    verifier_payload_value_count: vPayload.nonNullCount,
    verifier_payload_values:     vPayload.values,
    verifier_timestamp:          ts(),
    raw_hash_match:              rawHashMatch,
    value_count_match:           countMatch,
    values_comparison:           valComparison,
    verdict,
    consistency,
    inconsistency_detail:        inconsistencyDetail,
  };

  chainRecord({ fetcher: producerCall._fetcher, url: producerCall.url, verdict, raw_hash_match: rawHashMatch, count_match: countMatch });
  return result;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

  // ── Files on disk ────────────────────────────────────────────────────────
  const fetcherFiles = fs.readdirSync(FETCHERS_DIR)
    .filter(f => f.endsWith('_historical.cjs'))
    .sort()
    .map(f => path.join(FETCHERS_DIR, f));
  const filesOnDisk = fetcherFiles.length;

  process.stderr.write(`Census: ${filesOnDisk} files on disk\n`);

  // ── PRODUCER PASS ────────────────────────────────────────────────────────
  const producerResults = [];
  let loadedCount = 0;

  for (const filePath of fetcherFiles) {
    const key = path.basename(filePath).replace('_historical.cjs', '');
    process.stderr.write(`P ${key}... `);
    const result = await runProducer(filePath);
    if (result.load_ok) loadedCount++;
    producerResults.push(result);
    const callCount = result.calls.filter(c => c.state !== 'NEVER_FIRED').length;
    process.stderr.write(`${callCount} calls captured\n`);
  }

  // ── SIGNAL MAP — written after producer pass; verifier not required ──────
  const signalMapFile = buildSignalMap(producerResults, fetcherFiles);

  // --map-only: skip verifier, output file path, exit
  if (process.argv.includes('--map-only')) {
    console.log(signalMapFile);
    return;
  }

  // ── Flatten all producer calls for verifier ───────────────────────────────
  const allProducerCalls = [];
  for (const pr of producerResults) {
    for (const call of pr.calls) {
      allProducerCalls.push({ ...call, _fetcher: pr.signal_key });
    }
  }

  // ── VERIFIER PASS — 100% of captured URLs ─────────────────────────────────
  const verifiedCalls = [];

  for (const call of allProducerCalls) {
    const label = `${call._fetcher}/${(call.url || 'NEVER_FIRED').slice(0, 40)}`;
    process.stderr.write(`V ${label}... `);
    const result = await runVerifier(call);
    verifiedCalls.push(result);
    process.stderr.write(`${result.verdict}\n`);
  }

  // ── Count reconciliation ──────────────────────────────────────────────────
  const verifiedFetcherKeys = new Set(
    verifiedCalls
      .filter(c => c.verdict && !c.verdict.startsWith('SKIP'))
      .map(c => c._fetcher)
  );
  const fetchersWithVerifiedRow = verifiedFetcherKeys.size;

  // ── Meta-check: any fetcher not processed by verifier? ────────────────────
  const uncheckedFetchers = producerResults
    .map(p => p.signal_key)
    .filter(k => !verifiedFetcherKeys.has(k));

  // ── Summary counts ────────────────────────────────────────────────────────
  const passes              = verifiedCalls.filter(c => c.verdict === 'PASS').length;
  const temporalVariances   = verifiedCalls.filter(c => c.verdict === 'TEMPORAL_VARIANCE').length;
  const contradictions      = verifiedCalls.filter(c => c.verdict === 'CONTRADICTION').length;
  const httpFails           = verifiedCalls.filter(c => c.verdict && c.verdict.startsWith('HTTP_FAIL')).length;
  const unresolved          = verifiedCalls.filter(c => c.verdict && c.verdict.startsWith('UNRESOLVED')).length;
  const neverFired          = verifiedCalls.filter(c => c.state === 'NEVER_FIRED').length;
  const internalInconsist   = verifiedCalls.filter(c => c.consistency === 'INTERNAL_INCONSISTENCY').length;
  const skipped             = verifiedCalls.filter(c => c.verdict && c.verdict.startsWith('SKIP')).length;

  // ── Grep for "47" ─────────────────────────────────────────────────────────
  const grep47 = grepDir(__dirname, '47');

  // ── Fetchers missing from load ────────────────────────────────────────────
  const loadFailed = producerResults.filter(p => !p.load_ok).map(p => p.signal_key);

  // ── BUILD CENSUS JSON ────────────────────────────────────────────────────
  const censusData = {
    run_at: ts(),
    count_reconciliation: {
      files_on_disk:              filesOnDisk,
      fetchers_loaded:            loadedCount,
      fetchers_with_verified_row: fetchersWithVerifiedRow,
      load_failed:                loadFailed,
    },
    summary: {
      total_api_calls:       allProducerCalls.filter(c => c.state !== 'NEVER_FIRED').length,
      pass:                  passes,
      temporal_variance:     temporalVariances,
      contradiction:         contradictions,
      http_fail:             httpFails,
      unresolved:            unresolved,
      never_fired:           neverFired,
      internal_inconsistency: internalInconsist,
      skipped,
    },
    meta_check: {
      verification_records: verifiedCalls.length,
      fetcher_count:        filesOnDisk,
      unchecked_fetchers:   uncheckedFetchers,
    },
    grep_47:  grep47,
    fetchers: producerResults.map(pr => ({
      ...pr,
      calls: (pr.calls || []).map(({ payload_values, ...c }) => c),
    })),
    verified_calls: verifiedCalls.map(({ payload_values, verifier_payload_values, ...c }) => c),
  };

  fs.writeFileSync(CENSUS_JSON, JSON.stringify(censusData, null, 2));

  // ── BUILD VERIFICATION LOG (hash-chained) ─────────────────────────────────
  fs.writeFileSync(VERIFY_LOG, JSON.stringify({
    run_at:     ts(),
    genesis:    'GENESIS',
    final_hash: _chainHead,
    entries:    _chainEntries,
  }, null, 2));

  // ── BUILD TXT REPORT ──────────────────────────────────────────────────────
  const divider = '═'.repeat(80);
  const contLines = [
    `SIGNAL CENSUS  ${ts()}`,
    divider,
    '',
    'COUNT RECONCILIATION',
    `  Files on disk:              ${filesOnDisk}`,
    `  Fetchers loaded:            ${loadedCount}`,
    `  Fetchers with verified row: ${fetchersWithVerifiedRow}`,
    `  Load failures:              ${loadFailed.length > 0 ? loadFailed.join(', ') : 'none'}`,
    '',
    `VERIFICATION RESULTS  (${allProducerCalls.filter(c=>c.state!=='NEVER_FIRED').length} total API calls)`,
    `  PASS:                   ${passes}`,
    `  TEMPORAL_VARIANCE:      ${temporalVariances}`,
    `  CONTRADICTION:          ${contradictions}`,
    `  HTTP_FAIL:              ${httpFails}`,
    `  UNRESOLVED (timeout):   ${unresolved}`,
    `  NEVER_FIRED:            ${neverFired}`,
    `  INTERNAL_INCONSISTENCY: ${internalInconsist}`,
    `  SKIPPED (no URL):       ${skipped}`,
    '',
    'META-CHECK',
    `  Verification records: ${verifiedCalls.length}`,
    `  Fetcher count:        ${filesOnDisk}`,
    `  Unchecked:            ${uncheckedFetchers.length === 0 ? 'none' : uncheckedFetchers.join(', ')}`,
    '',
    `GREP "47"  — ${grep47.length} matches`,
    ...grep47.map(g => `  ${g.file}:${g.line}  ${g.content}`),
    '',
    'CONTRADICTIONS',
    ...(contradictions === 0 ? ['  none'] : verifiedCalls
      .filter(c => c.verdict === 'CONTRADICTION')
      .map(c => `  ${c._fetcher}  producer_count=${c.payload_value_count}  verifier_count=${c.verifier_payload_value_count}\n    URL: ${c.url}`)),
    '',
    'TEMPORAL_VARIANCES',
    ...(temporalVariances === 0 ? ['  none'] : verifiedCalls
      .filter(c => c.verdict === 'TEMPORAL_VARIANCE')
      .map(c => `  ${c._fetcher}  ${c.url}`)),
    '',
    'NEVER_FIRED',
    ...(neverFired === 0 ? ['  none'] : producerResults
      .filter(p => p.calls.some(c => c.state === 'NEVER_FIRED'))
      .map(p => `  ${p.signal_key}${p.uses_external_process ? ' [external_process]' : ''}`)),
    '',
    'LOAD FAILURES',
    ...(loadFailed.length === 0 ? ['  none'] : producerResults.filter(p => !p.load_ok).map(p => `  ${p.signal_key}: ${p.reason}`)),
    '',
    `CHAIN FINAL HASH: ${_chainHead}`,
    '',
  ];

  fs.writeFileSync(CENSUS_TXT, contLines.join('\n'));

  // ── ONE-LINE SUMMARY (stdout only) ────────────────────────────────────────
  const uncheckedNames = uncheckedFetchers.length > 0 ? uncheckedFetchers.join(',') : 'none';
  console.log(`census: files:${filesOnDisk} loaded:${loadedCount} verified:${fetchersWithVerifiedRow} contradictions:${contradictions} unchecked:[${uncheckedNames}]`);
}

main().catch(err => {
  process.stderr.write(`FATAL: ${err.stack}\n`);
  process.exit(1);
});
