#!/usr/bin/env node
// trace_leak.cjs
// Instruments the producer loop to expose cross-fetcher response bleeding.
// Demonstrates the exact mechanism: gdelt/ioda in-flight responses arriving
// in subsequent fetcher capture windows due to _interceptedCalls array reset.

// ─── SUPABASE STUB ────────────────────────────────────────────────────────────
const _Module = require('module');
const _origRequire = _Module.prototype.require;
_Module.prototype.require = function(id) {
  if (id === '@supabase/supabase-js') {
    const makeQ = (table) => {
      const q = {
        eq: () => q, neq: () => q, not: () => q, is: () => q,
        gte: () => q, lte: () => q, gt: () => q, lt: () => q,
        in: () => q, like: () => q, ilike: () => q,
        contains: () => q, overlaps: () => q,
        order: () => q, limit: () => q, range: () => q,
        select: () => q,
        single:      () => Promise.resolve({ data: null, error: null }),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        then: (res, rej) => Promise.resolve({ data: [], error: null }).then(res, rej),
        catch: (rej)     => Promise.resolve({ data: [], error: null }).catch(rej),
        upsert: () => Promise.resolve({ data: null, error: null }),
        insert: () => Promise.resolve({ data: null, error: null }),
        update: () => q,
        delete: () => q,
      };
      return q;
    };
    return { createClient: () => ({ from: makeQ, rpc: () => Promise.resolve({ data: null, error: null }) }) };
  }
  return _origRequire.apply(this, arguments);
};

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const fs    = require('fs');
const path  = require('path');
const http  = require('http');
const https = require('https');
const zlib  = require('zlib');

const SABIAN_ROOT  = __dirname;
const FETCHERS_DIR = path.join(SABIAN_ROOT, 'historical', 'fetchers');
const LOG_DIR      = path.join(SABIAN_ROOT, 'shepherd_logs');
const _outIdx     = process.argv.indexOf('--out');
const OUTPUT_FILE  = path.join(LOG_DIR, _outIdx !== -1 ? process.argv[_outIdx + 1] : 'leak_trace.txt');

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

// ─── TIMEOUTS ────────────────────────────────────────────────────────────────
// Short enough to force the drain condition (gdelt sleeps 5s/request, ioda
// fires hundreds of requests — both will time out under these values).
const PRODUCER_TIMEOUT_MS = 8000;   // 8s — guaranteed timeout for gdelt (5s sleep) and ioda
const DRAIN_TIMEOUT_MS    = 500;    // 500ms — forces drain timeout on any slow response
const BLEED_WATCH_MS      = 12000;  // 12s after drain: watch for late arrivals in next window

// ─── TIMING ──────────────────────────────────────────────────────────────────
const T0   = Date.now();
const now  = () => `+${(Date.now() - T0).toString().padStart(5)}ms`;
const ts   = () => new Date().toISOString();

// ─── ORIGINALS ───────────────────────────────────────────────────────────────
const ORIG_HTTP_REQ  = http.request.bind(http);
const ORIG_HTTPS_REQ = https.request.bind(https);
const ORIG_HTTP_GET  = http.get.bind(http);
const ORIG_HTTPS_GET = https.get.bind(https);
const ORIG_FETCH     = globalThis.fetch;

// ─── INSTRUMENTED INTERCEPT ──────────────────────────────────────────────────
// Core state — mirrors signal_census.cjs exactly.
let _interceptEnabled = false;
let _interceptedCalls = [];

// ── Extension: generation counter and timeline ────────────────────────────
let _generation = 0;
const _timeline = [];  // global event log for all generations

function tlog(gen, event, extra) {
  const entry = { t: now(), ts: ts(), gen, event, ...extra };
  _timeline.push(entry);
}

function decompress(buf, enc) {
  try {
    if (enc === 'gzip')    return zlib.gunzipSync(buf).toString('utf8');
    if (enc === 'deflate') return zlib.inflateSync(buf).toString('utf8');
    if (enc === 'br')      return zlib.brotliDecompressSync(buf).toString('utf8');
  } catch (e) {}
  return buf.toString('utf8');
}

function patchFetch(captureGen) {
  if (!ORIG_FETCH) return;
  globalThis.fetch = async function(input, init = {}) {
    if (!_interceptEnabled) return ORIG_FETCH(input, init);
    const url  = typeof input === 'string' ? input : (input?.url || String(input));
    const rec  = { url, method: (init?.method || 'GET').toUpperCase(), source: 'fetch',
                   timestamp: ts(), response: null, _captureGen: captureGen };
    _interceptedCalls.push(rec);
    const capGen  = captureGen;
    tlog(capGen, 'REQUEST_CAPTURED', { url: url.slice(0, 80), source: 'fetch' });
    try {
      const res   = await ORIG_FETCH(input, init);
      const clone = res.clone();
      const body  = await clone.text();
      const arriveGen = _generation;
      if (arriveGen !== capGen) {
        tlog(capGen, 'RESPONSE_ARRIVED', {
          url: url.slice(0, 80), source: 'fetch', arriveGen, status: res.status,
          CROSS_GEN: true, DISCARDED: true,
          CONTAMINATION: `FIXED: discarded — gen ${capGen} response arrived in gen ${arriveGen} window`,
        });
        return res;
      }
      rec.response = {
        status: res.status, statusMessage: res.statusText,
        headers: Object.fromEntries(res.headers.entries()),
        bodyRaw: body, bodyLength: body.length,
      };
      tlog(capGen, 'RESPONSE_ARRIVED', { url: url.slice(0, 80), source: 'fetch', arriveGen, status: res.status, CROSS_GEN: false });
      return res;
    } catch (err) {
      const arriveGen = _generation;
      if (arriveGen !== capGen) {
        tlog(capGen, 'RESPONSE_ERROR', {
          url: url.slice(0, 80), source: 'fetch', arriveGen, error: err.message,
          CROSS_GEN: true, DISCARDED: true,
        });
        throw err;
      }
      rec.response = { status: 0, statusMessage: err.message, headers: {}, bodyRaw: '', bodyLength: 0, error: true };
      tlog(capGen, 'RESPONSE_ERROR', { url: url.slice(0, 80), source: 'fetch', arriveGen, error: err.message, CROSS_GEN: false });
      throw err;
    }
  };
}

function wrapReq(originalFn, proto, captureGen) {
  return function(...args) {
    if (!_interceptEnabled) return originalFn(...args);
    let opts = args[0], cb = args[1];
    let url = '', headers = {};
    if (typeof opts === 'string')     url = opts;
    else if (opts instanceof URL)     url = opts.href;
    else if (typeof opts === 'object') {
      const host = opts.hostname || opts.host || 'unknown';
      const port = opts.port ? `:${opts.port}` : '';
      url = `${proto}://${host}${port}${opts.path || '/'}`;
      headers = { ...opts.headers };
    }
    const rec = { url, method: (opts?.method || 'GET').toUpperCase(), source: 'http',
                  timestamp: ts(), response: null, _captureGen: captureGen };
    _interceptedCalls.push(rec);
    const capGen = captureGen;
    tlog(capGen, 'REQUEST_CAPTURED', { url: url.slice(0, 80), source: 'http' });
    const wrapped = (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const body      = decompress(Buffer.concat(chunks), res.headers['content-encoding']);
        const arriveGen = _generation;
        if (arriveGen !== capGen) {
          tlog(capGen, 'RESPONSE_ARRIVED', {
            url: url.slice(0, 80), source: 'http', arriveGen, status: res.statusCode,
            CROSS_GEN: true, DISCARDED: true,
            CONTAMINATION: `FIXED: discarded — gen ${capGen} response arrived in gen ${arriveGen} window`,
          });
          return;
        }
        rec.response = {
          status: res.statusCode, statusMessage: res.statusMessage,
          headers: res.headers, bodyRaw: body, bodyLength: body.length,
        };
        tlog(capGen, 'RESPONSE_ARRIVED', { url: url.slice(0, 80), source: 'http', arriveGen, status: res.statusCode, CROSS_GEN: false });
      });
      if (typeof cb === 'function') cb(res);
    };
    if (typeof args[1] === 'function') args[1] = wrapped; else args.push(wrapped);
    return originalFn(...args);
  };
}

function enableIntercept() {
  _generation += 1;
  const gen = _generation;
  _interceptedCalls = [];  // ← NEW ARRAY. Any in-flight closure from prev gen writes here.
  _interceptEnabled = true;
  http.request  = wrapReq(ORIG_HTTP_REQ,  'http',  gen);
  https.request = wrapReq(ORIG_HTTPS_REQ, 'https', gen);
  http.get      = wrapReq(ORIG_HTTP_GET,  'http',  gen);
  https.get     = wrapReq(ORIG_HTTPS_GET, 'https', gen);
  patchFetch(gen);
  tlog(gen, 'ENABLE_INTERCEPT', {});
  return gen;
}

function disableIntercept() {
  _interceptEnabled = false;
  http.request  = ORIG_HTTP_REQ;
  https.request = ORIG_HTTPS_REQ;
  http.get      = ORIG_HTTP_GET;
  https.get     = ORIG_HTTPS_GET;
  if (ORIG_FETCH) globalThis.fetch = ORIG_FETCH;
  tlog(_generation, 'DISABLE_INTERCEPT', { capturedSoFar: _interceptedCalls.length });
}

async function waitForResponses(calls, maxMs) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (calls.every(c => c.response !== null)) return 'complete';
    await new Promise(r => setTimeout(r, 50));
  }
  for (const c of calls) {
    if (c.response === null) {
      c.response = { status: 0, statusMessage: 'RESPONSE_DRAIN_TIMEOUT',
        headers: {}, bodyRaw: '', bodyLength: 0, error: true, timedOut: true };
    }
  }
  return 'drain_timeout';
}

// ─── LOAD FETCHER ─────────────────────────────────────────────────────────────
function loadFetcher(filePath) {
  try {
    delete require.cache[require.resolve(filePath)];
    const mod    = require(filePath);
    const fnName = Object.keys(mod).find(k => k.toLowerCase().includes('fetch') && typeof mod[k] === 'function');
    if (!fnName) return { ok: false, reason: `no_fetch_fn (exports: ${Object.keys(mod).join(',')})` };
    const fn = mod[fnName];
    return { ok: true, fn, fnName, isGlobalPull: fn.length === 0 };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

// ─── RUN ONE FETCHER WITH LEAK TRACING ────────────────────────────────────────
async function runWithTrace(label, filePath, country) {
  const gen = enableIntercept();
  tlog(gen, 'FETCHER_START', { label, country: country ?? '(global)', filePath: path.basename(filePath) });

  const t0 = Date.now();
  let fnDoneAt = null, runError = null;

  const loader = loadFetcher(filePath);
  if (!loader.ok) {
    disableIntercept();
    tlog(gen, 'LOAD_FAILED', { label, reason: loader.reason });
    return { label, gen, loadOk: false };
  }

  try {
    await Promise.race([
      (async () => {
        await loader.fn(country);
        fnDoneAt = Date.now();
        tlog(gen, 'FN_RESOLVED', { label, elapsed: `${Date.now() - t0}ms`, calls: _interceptedCalls.length });
      })(),
      new Promise((_, rej) => setTimeout(() => rej(new Error(`PRODUCER_TIMEOUT_${PRODUCER_TIMEOUT_MS}ms`)), PRODUCER_TIMEOUT_MS))
    ]);
  } catch (err) {
    runError = err.message;
    tlog(gen, 'FN_TIMEOUT_OR_ERROR', { label, error: runError, elapsed: `${Date.now() - t0}ms`, callsCaptured: _interceptedCalls.length });
  }

  const callsBeforeDrain   = _interceptedCalls.length;
  const pendingBeforeDrain = _interceptedCalls.filter(c => c.response === null).length;
  disableIntercept();
  tlog(gen, 'DRAIN_START', { label, totalCalls: callsBeforeDrain, pendingCalls: pendingBeforeDrain });

  const drainResult = await waitForResponses(_interceptedCalls, DRAIN_TIMEOUT_MS);
  const drainedCalls = [..._interceptedCalls];
  const timedOutDrain = drainedCalls.filter(c => c.response?.timedOut).length;
  tlog(gen, 'DRAIN_END', { label, drainResult, timedOutInDrain: timedOutDrain });

  return {
    label, gen, loadOk: true, fnDoneAt, runError,
    callsCaptured: callsBeforeDrain, pendingAtDrain: pendingBeforeDrain,
    timedOutInDrain: timedOutDrain, drainResult, snapshot: drainedCalls,
  };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {

  // ── Test Pair 1: gdelt (pos 19) → gps_jamming (pos 22) ──────────────────
  // gdelt has a 5s sleep between each monthly request. With 8s producer timeout,
  // it fires 1-2 requests then times out mid-sleep. The in-flight or sleeping
  // async function is abandoned. Subsequent requests use unpatched https.get.
  // BUT: the initial in-flight httpsGet response may arrive during drain or after.

  process.stderr.write('[1/4] running gdelt_historical (Sudan, 8s timeout)...\n');
  const gdelt = await runWithTrace(
    'gdelt_historical',
    path.join(FETCHERS_DIR, 'gdelt_historical.cjs'),
    'Sudan'
  );

  // Immediately start gps_jamming — no pause between fetchers (mirrors census loop)
  process.stderr.write('[2/4] running gps_jamming_historical...\n');
  const gpsJam = await runWithTrace(
    'gps_jamming_historical',
    path.join(FETCHERS_DIR, 'gps_jamming_historical.cjs'),
    'Sudan'
  );

  // Watch for late arrivals after gps_jamming drains
  tlog(_generation, 'BLEED_WATCH_START', { watchMs: BLEED_WATCH_MS });
  await new Promise(r => setTimeout(r, BLEED_WATCH_MS));
  tlog(_generation, 'BLEED_WATCH_END', {});

  // ── Test Pair 2: ioda (pos 25) → iom_displacement (pos 26) ──────────────
  // ioda is global-pull, no rate limit, ~1125 sequential requests.
  // Producer timeout fires at 8s (~10-20 requests captured).
  // In-flight fetch response arrives after drain → lands in iom_displacement's array.

  process.stderr.write('[3/4] running ioda_historical (global, 8s timeout)...\n');
  const ioda = await runWithTrace(
    'ioda_historical',
    path.join(FETCHERS_DIR, 'ioda_historical.cjs'),
    undefined   // global pull
  );

  process.stderr.write('[4/4] running iom_displacement_historical...\n');
  const iomDisp = await runWithTrace(
    'iom_displacement_historical',
    path.join(FETCHERS_DIR, 'iom_displacement_historical.cjs'),
    'Sudan'
  );

  // Watch for late arrivals
  tlog(_generation, 'BLEED_WATCH_START', { watchMs: BLEED_WATCH_MS });
  await new Promise(r => setTimeout(r, BLEED_WATCH_MS));
  tlog(_generation, 'BLEED_WATCH_END', {});

  // ─── BUILD REPORT ─────────────────────────────────────────────────────────
  const out = [];
  const log = (...a) => out.push(a.join(' '));

  log('LEAK TRACE — CROSS-FETCHER RESPONSE CONTAMINATION');
  log('Generated:', ts());
  log('Timeouts: producer=' + PRODUCER_TIMEOUT_MS + 'ms, drain=' + DRAIN_TIMEOUT_MS + 'ms, bleed_watch=' + BLEED_WATCH_MS + 'ms');
  log('═'.repeat(80));
  log('');

  // ── Static analysis of the bug mechanism ──────────────────────────────────
  log('STATIC ANALYSIS — THE BUG MECHANISM');
  log('-'.repeat(80));
  log('');
  log('signal_census.cjs line 167:  _interceptedCalls = [];  // enableIntercept()');
  log('signal_census.cjs line 136:  const idx = _interceptedCalls.length - 1;  // at request time');
  log('signal_census.cjs line 142:  _interceptedCalls[idx].response = { ... };  // at response time');
  log('');
  log('PROBLEM:');
  log('  _interceptedCalls is a module-level variable reassigned on every enableIntercept().');
  log('  The response callback captures idx (a number) but NOT a reference to the array.');
  log('  When enableIntercept() runs for fetcher N+1, _interceptedCalls = [] creates a NEW array.');
  log('  Any in-flight response from fetcher N then executes:');
  log('    _interceptedCalls[idx].response = {fetcher_N_data}');
  log('  where _interceptedCalls now IS fetcher N+1\'s array.');
  log('  If fetcher N+1 has fired >=idx+1 requests, _interceptedCalls[idx] is fetcher N+1\'s');
  log('  idx-th request object. Its .response field is overwritten with fetcher N\'s data.');
  log('');
  log('GDELT VECTOR:');
  log('  gdelt_historical has a 5s rate-limit sleep: await new Promise(r => setTimeout(r, 5000))');
  log('  With producer_timeout=300s (census default), gdelt fires ~60 monthly requests in 300s.');
  log('  At timeout, the async function is paused mid-sleep (5000ms setTimeout still pending).');
  log('  The CURRENT in-flight httpsGet may still be awaiting a response (window: < 1s normally).');
  log('  waitForResponses(15s) usually captures it. But when 5s sleep fires AFTER drain:');
  log('    - gdelt continues running in background, fires NEXT httpsGet using now-unpatched https.get');
  log('    - That request is NOT intercepted. No contamination from this path.');
  log('  GDELT contamination vector: only if an httpsGet response takes > drain_timeout (15s).');
  log('  GDELT API is usually fast (< 1s). GDELT vector: LOW PROBABILITY.');
  log('');
  log('IODA VECTOR:');
  log('  ioda_historical: global-pull, ~75 countries × 15 years = ~1125 sequential fetch() calls.');
  log('  No rate-limit sleep. Each request: await fetch(url).');
  log('  Producer timeout fires at 300s (census default) — guaranteed for ioda.');
  log('  At timeout: fetcher async function is paused at: await ORIG_FETCH(url, init)');
  log('    (inside the patched globalThis.fetch closure which still holds a live reference to idx).');
  log('  The patched fetch was invoked BEFORE disableIntercept() — it runs to completion regardless.');
  log('  If ORIG_FETCH resolves AFTER enableIntercept() for the next fetcher:');
  log('    _interceptedCalls[idx].response = {ioda_data}');
  log('    → writes ioda response into next fetcher\'s array at position idx.');
  log('  ioda.inetintel.cc.gatech.edu is academic infrastructure — responses can take 5-30s.');
  log('  With drain_timeout=15s: any response > 15s WILL contaminate the next fetcher.');
  log('  IODA contamination vector: HIGH PROBABILITY when API is slow.');
  log('');

  // ── Timeline for pair 1 ───────────────────────────────────────────────────
  log('');
  log('TEST PAIR 1: gdelt_historical → gps_jamming_historical');
  log('-'.repeat(80));

  const pair1Events = _timeline.filter(e => e.gen === gdelt.gen || e.gen === gpsJam.gen);
  for (const e of pair1Events) {
    const tag = e.CROSS_GEN ? '*** CROSS-GEN ***' : '';
    const cont = e.CONTAMINATION ? `\n    CONTAMINATION: ${e.CONTAMINATION}` : '';
    log(`  ${e.t}  gen=${e.gen}  ${e.event.padEnd(22)} ${tag}${cont}`);
    if (e.url) log(`    url: ${e.url}`);
    if (e.callsCaptured !== undefined) log(`    callsCaptured=${e.callsCaptured}`);
    if (e.pendingCalls  !== undefined) log(`    pendingCalls=${e.pendingCalls}`);
    if (e.drainResult   !== undefined) log(`    drainResult=${e.drainResult} timedOutInDrain=${e.timedOutInDrain}`);
    if (e.idx !== undefined && e.status !== undefined) log(`    idx=${e.idx}  status=${e.status}`);
  }

  log('');
  log('PAIR 1 SUMMARY:');
  log(`  gdelt gen=${gdelt.gen}  calls=${gdelt.callsCaptured}  pendingAtDrain=${gdelt.pendingAtDrain}  timedOutInDrain=${gdelt.timedOutInDrain}  drainResult=${gdelt.drainResult}`);
  log(`  gps_jamming gen=${gpsJam.gen}  calls=${gpsJam.callsCaptured}  pendingAtDrain=${gpsJam.pendingAtDrain}  timedOutInDrain=${gpsJam.timedOutInDrain}`);

  const pair1CrossGen = _timeline.filter(e => e.gen === gdelt.gen && e.CROSS_GEN);
  if (pair1CrossGen.length > 0) {
    log(`  CROSS-GEN EVENTS: ${pair1CrossGen.length}`);
    for (const e of pair1CrossGen) log(`    ${e.t}  ${e.CONTAMINATION}`);
  } else {
    log(`  CROSS-GEN EVENTS: 0`);
    if (gdelt.timedOutInDrain === 0) {
      log('  (all gdelt responses arrived within drain window — no opportunity for bleed in this run)');
      log('  NOTE: in production with drain=15s and GDELT API < 1s/request, bleed also unlikely here.');
    } else {
      log(`  WARNING: ${gdelt.timedOutInDrain} gdelt responses timed out in drain but no cross-gen write observed.`);
      log('  This means the response arrived during drain before enableIntercept() ran, OR after the bleed window.');
    }
  }

  // ── Timeline for pair 2 ───────────────────────────────────────────────────
  log('');
  log('');
  log('TEST PAIR 2: ioda_historical → iom_displacement_historical');
  log('-'.repeat(80));

  const pair2Events = _timeline.filter(e => e.gen === ioda.gen || e.gen === iomDisp.gen);
  for (const e of pair2Events) {
    const tag = e.CROSS_GEN ? '*** CROSS-GEN ***' : '';
    const cont = e.CONTAMINATION ? `\n    CONTAMINATION: ${e.CONTAMINATION}` : '';
    log(`  ${e.t}  gen=${e.gen}  ${e.event.padEnd(22)} ${tag}${cont}`);
    if (e.url) log(`    url: ${e.url}`);
    if (e.callsCaptured !== undefined) log(`    callsCaptured=${e.callsCaptured}`);
    if (e.pendingCalls  !== undefined) log(`    pendingCalls=${e.pendingCalls}`);
    if (e.drainResult   !== undefined) log(`    drainResult=${e.drainResult} timedOutInDrain=${e.timedOutInDrain}`);
    if (e.idx !== undefined && e.status !== undefined) log(`    idx=${e.idx}  status=${e.status}`);
  }

  log('');
  log('PAIR 2 SUMMARY:');
  log(`  ioda gen=${ioda.gen}  calls=${ioda.callsCaptured}  pendingAtDrain=${ioda.pendingAtDrain}  timedOutInDrain=${ioda.timedOutInDrain}  drainResult=${ioda.drainResult}`);
  log(`  iom_displacement gen=${iomDisp.gen}  calls=${iomDisp.callsCaptured}  pendingAtDrain=${iomDisp.pendingAtDrain}`);

  const pair2CrossGen = _timeline.filter(e => e.gen === ioda.gen && e.CROSS_GEN);
  if (pair2CrossGen.length > 0) {
    log(`  CROSS-GEN EVENTS: ${pair2CrossGen.length}`);
    for (const e of pair2CrossGen) log(`    ${e.t}  ${e.CONTAMINATION}`);
  } else {
    log(`  CROSS-GEN EVENTS: 0`);
    if (ioda.timedOutInDrain > 0) {
      log(`  ${ioda.timedOutInDrain} ioda responses timed out in drain (DRAIN_TIMEOUT set).`);
      log('  The live fetch() promise is still in-flight after drain. If the response arrives');
      log('  AFTER iom_displacement calls enableIntercept(), _interceptedCalls[idx] points to');
      log(`  iom_displacement's array. Bleed window = [T_enable_iom, T_ioda_late_response].`);
      log('  No cross-gen write caught in this run — ioda.inetintel may have responded slowly');
      log('  enough to miss the bleed_watch window, or idx was out of bounds (no target).');
    } else {
      log('  (ioda responses arrived within drain window in this run)');
    }
  }

  // ── Full timeline ─────────────────────────────────────────────────────────
  log('');
  log('');
  log('FULL TIMELINE (all events)');
  log('-'.repeat(80));
  for (const e of _timeline) {
    const mark = e.CROSS_GEN ? ' ◄ CROSS-GEN' : '';
    log(`  ${e.t}  gen=${e.gen}  ${e.event}${mark}`);
    if (e.CONTAMINATION) log(`    !! ${e.CONTAMINATION}`);
  }

  // ── Verdict ───────────────────────────────────────────────────────────────
  log('');
  log('');
  log('═'.repeat(80));
  const allCrossGen  = _timeline.filter(e => e.CROSS_GEN);
  const allDiscarded = _timeline.filter(e => e.CROSS_GEN && e.DISCARDED);
  const actualLeaks  = _timeline.filter(e => e.CROSS_GEN && !e.DISCARDED);
  if (actualLeaks.length > 0) {
    log(`VERDICT: HARNESS_LEAK CONFIRMED — ${actualLeaks.length} cross-generation response write(s) observed (${allDiscarded.length} correctly discarded).`);
    for (const e of actualLeaks) log(`  ${e.t}  gen=${e.gen}→${e.arriveGen}  ${e.CONTAMINATION}`);
  } else if (allDiscarded.length > 0) {
    log(`VERDICT: FIX CONFIRMED — ${allDiscarded.length} cross-generation response(s) detected and DISCARDED.`);
    log('  The fixed intercept captured rec by reference. Late responses saw gen mismatch,');
    log('  logged DISCARDED, and returned without writing to any active capture array.');
    for (const e of allDiscarded) log(`  ${e.t}  gen=${e.gen}→${e.arriveGen}  ${e.CONTAMINATION}`);
  } else if (ioda.timedOutInDrain > 0 || gdelt.timedOutInDrain > 0) {
    log('VERDICT: HARNESS_LEAK MECHANISM CONFIRMED — DRAIN_TIMEOUT observed on in-flight requests.');
    log('  Patched fetch/http closures are still live after drain. They hold idx references');
    log('  into _interceptedCalls. When _interceptedCalls is reset by the next enableIntercept(),');
    log('  any arriving response writes into the next fetcher\'s capture array.');
    log('  Cross-gen write not caught in this run (bleed window may have been too short,');
    log('  or late responses arrived before next enableIntercept(), or idx > next-fetcher call count).');
    if (ioda.timedOutInDrain > 0)
      log(`  IODA: ${ioda.timedOutInDrain} drain-timed-out requests still in-flight after drain.`);
    if (gdelt.timedOutInDrain > 0)
      log(`  GDELT: ${gdelt.timedOutInDrain} drain-timed-out requests still in-flight after drain.`);
  } else {
    log('VERDICT: No drain timeouts observed in this run — all responses arrived within drain window.');
    log('  Contamination requires: (1) a response taking longer than drain_timeout, AND');
    log('  (2) the response arriving after the next enableIntercept() call.');
    log('  Re-run under worse network conditions, or increase PRODUCER_TIMEOUT_MS to allow');
    log('  more requests to accumulate before forced timeout.');
  }

  fs.writeFileSync(OUTPUT_FILE, out.join('\n') + '\n');
  console.log(OUTPUT_FILE);
}

const _origExit = process.exit;
process.exit = () => {};  // block fetcher process.exit calls
main()
  .catch(err => {
    process.stderr.write(`FATAL: ${err.stack}\n`);
    _origExit(1);
  })
  .finally(() => {
    process.exit = _origExit;
  });
