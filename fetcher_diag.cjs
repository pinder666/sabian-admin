#!/usr/bin/env node
// fetcher_diag.cjs — runs a single fetcher through the signal_census intercept
// and writes a full shepherd log entry: URL, headers sent, HTTP status, raw body.
// Usage: node fetcher_diag.cjs <fetcher_name> [country]
//   e.g. node fetcher_diag.cjs gdelt Sudan
//        node fetcher_diag.cjs ioda
//        node fetcher_diag.cjs usda_food Afghanistan

// ─── SUPABASE STUB ────────────────────────────────────────────────────────────
const _Module = require('module');
const _origReq = _Module.prototype.require;
_Module.prototype.require = function(id) {
  if (id === '@supabase/supabase-js') {
    const q = (t) => {
      const o = {
        eq:()=>o,neq:()=>o,not:()=>o,is:()=>o,gte:()=>o,lte:()=>o,gt:()=>o,lt:()=>o,
        in:()=>o,like:()=>o,ilike:()=>o,contains:()=>o,overlaps:()=>o,
        order:()=>o,limit:()=>o,range:()=>o,select:()=>o,
        single:()=>Promise.resolve({data:null,error:null}),
        maybeSingle:()=>Promise.resolve({data:null,error:null}),
        then:(r,j)=>Promise.resolve({data:[],error:null}).then(r,j),
        catch:(j)=>Promise.resolve({data:[],error:null}).catch(j),
        upsert:()=>Promise.resolve({data:null,error:null}),
        insert:()=>Promise.resolve({data:null,error:null}),
        update:()=>o,delete:()=>o,
      };
      return o;
    };
    return { createClient: () => ({ from: q, rpc: () => Promise.resolve({data:null,error:null}) }) };
  }
  return _origReq.apply(this, arguments);
};

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const fs   = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const zlib  = require('zlib');
const { AsyncLocalStorage } = require('async_hooks');

const FETCHERS_DIR = path.join(__dirname, 'historical', 'fetchers');
const LOG_DIR      = path.join(__dirname, 'shepherd_logs', 'census_diag');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const ORIG_HTTP_REQ  = http.request.bind(http);
const ORIG_HTTPS_REQ = https.request.bind(https);
const ORIG_HTTP_GET  = http.get.bind(http);
const ORIG_HTTPS_GET = https.get.bind(https);
const ORIG_FETCH     = globalThis.fetch;

let _interceptEnabled = false;
let _interceptedCalls = [];
let _activeGeneration = 0;
let _activeSignalKey  = '';
const _ctx            = new AsyncLocalStorage();

const ts = () => new Date().toISOString();

function decompress(buf, enc) {
  try {
    if (enc === 'gzip')    return zlib.gunzipSync(buf).toString('utf8');
    if (enc === 'deflate') return zlib.inflateSync(buf).toString('utf8');
    if (enc === 'br')      return zlib.brotliDecompressSync(buf).toString('utf8');
  } catch (e) {}
  return buf.toString('utf8');
}

function patchFetch() {
  if (!ORIG_FETCH) return;
  globalThis.fetch = async function(input, init = {}) {
    if (!_interceptEnabled) return ORIG_FETCH(input, init);
    const store = _ctx.getStore();
    if (!store || store.gen !== _activeGeneration) return ORIG_FETCH(input, init);
    const url = typeof input === 'string' ? input : (input?.url || String(input));
    const rec = { url, method: (init?.method||'GET').toUpperCase(), headers_sent: init?.headers||{},
                  source: 'fetch', timestamp: ts(), response: null,
                  _gen: _activeGeneration, _fetcher: _activeSignalKey };
    _interceptedCalls.push(rec);
    try {
      const res = await ORIG_FETCH(input, init);
      const clone = res.clone();
      const body = await clone.text();
      if (rec._gen !== _activeGeneration) return res;
      rec.response = { status: res.status, statusMessage: res.statusText,
        headers: Object.fromEntries(res.headers.entries()), bodyRaw: body };
      return res;
    } catch (err) {
      if (rec._gen === _activeGeneration)
        rec.response = { status: 0, statusMessage: err.message, headers: {}, bodyRaw: '' };
      throw err;
    }
  };
}

function wrapReq(orig, proto) {
  return function(...args) {
    if (!_interceptEnabled) return orig(...args);
    const store = _ctx.getStore();
    if (!store || store.gen !== _activeGeneration) return orig(...args);
    let opts = args[0], url = '', headers = {};
    if (typeof opts === 'string') {
      url = opts;
      // Headers may be in the options object at args[1]
      if (args[1] && typeof args[1] === 'object' && !Array.isArray(args[1]) && typeof args[1] !== 'function') {
        headers = { ...args[1].headers };
      }
    } else if (opts instanceof URL) {
      url = opts.href;
    } else if (opts) {
      const h = opts.hostname || opts.host || 'unknown';
      const p = opts.port ? `:${opts.port}` : '';
      url = `${proto}://${h}${p}${opts.path||'/'}`;
      headers = { ...opts.headers };
    }
    const rec = { url, method: (opts?.method||'GET').toUpperCase(), headers_sent: headers,
                  source: 'http', timestamp: ts(), response: null,
                  _gen: _activeGeneration, _fetcher: _activeSignalKey };
    _interceptedCalls.push(rec);
    // Find the actual callback — may be at args[1] (2-arg form) or args[2] (3-arg url+opts+cb form)
    const cbIdx = args.reduce((acc, a, i) => typeof a === 'function' ? i : acc, -1);
    const origCb = cbIdx !== -1 ? args[cbIdx] : null;
    const wrapped = (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        if (rec._gen !== _activeGeneration) return;
        const body = decompress(Buffer.concat(chunks), res.headers['content-encoding']);
        rec.response = { status: res.statusCode, statusMessage: res.statusMessage,
          headers: res.headers, bodyRaw: body };
      });
      if (typeof origCb === 'function') origCb(res);
    };
    if (cbIdx !== -1) args[cbIdx] = wrapped; else args.push(wrapped);
    return orig(...args);
  };
}

function enableIntercept(key) {
  _activeGeneration += 1;
  _activeSignalKey   = key;
  _interceptedCalls  = [];
  _interceptEnabled  = true;
  http.request  = wrapReq(ORIG_HTTP_REQ,  'http');
  https.request = wrapReq(ORIG_HTTPS_REQ, 'https');
  http.get      = wrapReq(ORIG_HTTP_GET,  'http');
  https.get     = wrapReq(ORIG_HTTPS_GET, 'https');
  patchFetch();
}

function disableIntercept() {
  _interceptEnabled = false;
  http.request  = ORIG_HTTP_REQ;  https.request = ORIG_HTTPS_REQ;
  http.get      = ORIG_HTTP_GET;  https.get     = ORIG_HTTPS_GET;
  if (ORIG_FETCH) globalThis.fetch = ORIG_FETCH;
}

async function waitForResponses(calls, maxMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (calls.every(c => c.response !== null)) return;
    await new Promise(r => setTimeout(r, 100));
  }
  for (const c of calls) {
    if (!c.response) c.response = { status: 0, statusMessage: 'DRAIN_TIMEOUT', headers: {}, bodyRaw: '' };
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  const fetcherName = process.argv[2];
  const country     = process.argv[3] || null;
  if (!fetcherName) { console.error('Usage: node fetcher_diag.cjs <fetcher_name> [country]'); process.exit(1); }

  const filePath = path.join(FETCHERS_DIR, `${fetcherName}_historical.cjs`);
  if (!fs.existsSync(filePath)) { console.error(`Not found: ${filePath}`); process.exit(1); }

  const outFile = path.join(LOG_DIR, `${fetcherName}_shepherd.txt`);
  const lines = [];
  const log = (...a) => lines.push(a.join(' '));

  log(`SHEPHERD DIAG — ${fetcherName}`);
  log(`run_at: ${ts()}`);
  log(`country: ${country || '(global pull)'}`);
  log(`fetcher: ${filePath}`);
  log('═'.repeat(80));

  process.exit = () => {};  // block fetcher process.exit

  let mod;
  try {
    delete require.cache[require.resolve(filePath)];
    mod = require(filePath);
  } catch (e) { log(`LOAD_ERROR: ${e.message}`); fs.writeFileSync(outFile, lines.join('\n')); console.log(outFile); return; }

  const fnName = Object.keys(mod).find(k => k.toLowerCase().includes('fetch') && typeof mod[k] === 'function');
  if (!fnName) { log('NO_FETCH_FN'); fs.writeFileSync(outFile, lines.join('\n')); console.log(outFile); return; }

  log(`fn: ${fnName}  isGlobalPull: ${mod[fnName].length === 0}`);
  log('');

  enableIntercept(fetcherName);

  const t0 = Date.now();
  let runError = null;
  try {
    const _ptMs = parseInt(process.env.DIAG_TIMEOUT_MS || '120000', 10);
    await Promise.race([
      _ctx.run({ gen: _activeGeneration }, () => mod[fnName](country || undefined)),
      new Promise((_, rej) => setTimeout(() => rej(new Error(`PRODUCER_TIMEOUT_${_ptMs}ms`)), _ptMs))
    ]);
  } catch (e) { runError = e.message; }

  disableIntercept();
  await waitForResponses(_interceptedCalls, 15000);

  const elapsed = Date.now() - t0;
  log(`elapsed: ${elapsed}ms  run_error: ${runError || 'none'}`);
  log(`calls_captured: ${_interceptedCalls.length}`);
  log('');

  for (let i = 0; i < _interceptedCalls.length; i++) {
    const c = _interceptedCalls[i];
    const r = c.response;
    log(`── CALL ${i + 1} ──────────────────────────────────────────────────────────`);
    log(`URL:     ${c.url}`);
    log(`METHOD:  ${c.method}  SOURCE: ${c.source}`);
    log(`HEADERS_SENT: ${JSON.stringify(c.headers_sent)}`);
    log(`T:       ${c.timestamp}`);
    if (r) {
      log(`STATUS:  ${r.status} ${r.statusMessage || ''}`);
      log(`RESP_HEADERS: ${JSON.stringify(r.headers)}`);
      const body = r.bodyRaw || '';
      log(`BODY (first 2000 chars):`);
      log(body.slice(0, 2000));
      if (body.length > 2000) log(`... [${body.length} total bytes]`);
    } else {
      log('STATUS:  NO_RESPONSE');
    }
    log('');
  }

  if (_interceptedCalls.length === 0) {
    log('NO_CALLS_CAPTURED — fetcher may use external process or no country match');
  }

  fs.writeFileSync(outFile, lines.join('\n') + '\n');
  console.log(outFile);
}

main().catch(e => { console.error('FATAL:', e.stack); process.exit(1); });
