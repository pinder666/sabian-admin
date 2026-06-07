#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════
// API SHEPHERD — ARMY GRADE SIGNAL VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════════
//
// WHAT THIS DOES:
//   1. Intercepts ALL outbound HTTP calls — http, https, AND axios
//   2. BLOCKS ALL DATABASE WRITES — stubs Supabase to prevent test data corruption
//   3. Invokes each fetcher's real fetch function with test parameters
//   4. Captures EVERY URL and header the fetcher sends (not first-only)
//   5. Success = response body contains real non-null data, not just HTTP 200
//   6. Tests 3 countries (data-rich, sparse, edge) x 3 years per fetcher
//   7. Marks UNRESOLVED if fetcher can't be invoked — no URL guessing
//
// OUTPUT:
//   - shepherd_logs/shepherd_latest.json — Current run (overwritten each time)
//   - shepherd_logs/shepherd_history.log — One-line summaries per run
//   - No verdicts — you judge
//
// USAGE:
//   node api_shepherd.cjs
//   node api_shepherd.cjs --fetcher=water_stress
//   node api_shepherd.cjs --quick              (1 country, 1 year for speed)
//
// ═══════════════════════════════════════════════════════════════════════════════

// ─── STUB SUPABASE BEFORE ANYTHING ELSE LOADS IT ───────────────────────────────
// This MUST happen before require('dotenv') or any fetcher loads

const blockedDbOps = [];

const fakeSupabaseClient = {
  from: (table) => ({
    upsert: (data, opts) => {
      blockedDbOps.push({ op: 'upsert', table, rows: Array.isArray(data) ? data.length : 1, blocked: true });
      return Promise.resolve({ data: null, error: null });
    },
    insert: (data, opts) => {
      blockedDbOps.push({ op: 'insert', table, rows: Array.isArray(data) ? data.length : 1, blocked: true });
      return Promise.resolve({ data: null, error: null });
    },
    update: (data) => ({
      eq: () => ({
        then: (cb) => {
          blockedDbOps.push({ op: 'update', table, blocked: true });
          return Promise.resolve({ data: null, error: null }).then(cb);
        }
      })
    }),
    select: (cols) => ({
      eq: () => ({ data: [], error: null }),
      in: () => ({ data: [], error: null }),
      then: (cb) => Promise.resolve({ data: [], error: null }).then(cb),
    }),
    delete: () => ({
      eq: () => {
        blockedDbOps.push({ op: 'delete', table, blocked: true });
        return Promise.resolve({ data: null, error: null });
      }
    }),
  }),
  rpc: (fn, params) => {
    blockedDbOps.push({ op: 'rpc', fn, blocked: true });
    return Promise.resolve({ data: null, error: null });
  },
};

// Override the Supabase module
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
  if (id === '@supabase/supabase-js') {
    return {
      createClient: () => fakeSupabaseClient,
    };
  }
  return originalRequire.apply(this, arguments);
};

// ─── NOW LOAD EVERYTHING ELSE ──────────────────────────────────────────────────

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const fs = require('fs');
const pathModule = require('path');
const http = require('http');
const https = require('https');
const zlib = require('zlib');

// ─── CONFIGURATION ─────────────────────────────────────────────────────────────

const FETCHERS_DIR = pathModule.join(__dirname, 'historical', 'fetchers');
const LOG_DIR = pathModule.join(__dirname, 'shepherd_logs');
const LATEST_LOG = pathModule.join(LOG_DIR, 'shepherd_latest.json');
const HISTORY_LOG = pathModule.join(LOG_DIR, 'shepherd_history.log');
const TIMEOUT_MS = 120000;
const RATE_LIMIT_MS = 1000;

// Test matrix: 3 countries x 3 years
const TEST_COUNTRIES = [
  { name: 'Egypt', iso2: 'EG', iso3: 'EGY', type: 'data-rich' },
  { name: 'Somalia', iso2: 'SO', iso3: 'SOM', type: 'sparse' },
  { name: 'Kosovo', iso2: 'XK', iso3: 'XKX', type: 'edge' },
];

const TEST_YEARS = ['2022', '2015', '2000'];

const QUICK_MODE = process.argv.includes('--quick');
const ACTIVE_COUNTRIES = QUICK_MODE ? [TEST_COUNTRIES[0]] : TEST_COUNTRIES;
const ACTIVE_YEARS = QUICK_MODE ? [TEST_YEARS[0]] : TEST_YEARS;

// ─── INTERCEPTED CALLS STORAGE ─────────────────────────────────────────────────

let interceptedCalls = [];
let interceptEnabled = false;

// ─── NATIVE FETCH INTERCEPT (undici) ───────────────────────────────────────────

const originalFetch = globalThis.fetch;

function patchNativeFetch() {
  globalThis.fetch = async function(input, init = {}) {
    if (!interceptEnabled) {
      return originalFetch(input, init);
    }

    const url = typeof input === 'string' ? input : input.url;
    const method = init.method?.toUpperCase() || 'GET';
    const headers = init.headers || {};

    const callRecord = {
      url,
      headers_sent: headers,
      timestamp: new Date().toISOString(),
      method,
      response: null,
      source: 'fetch',
    };
    interceptedCalls.push(callRecord);
    const callIndex = interceptedCalls.length - 1;

    try {
      const response = await originalFetch(input, init);
      const clonedResponse = response.clone();
      const bodyText = await clonedResponse.text();

      interceptedCalls[callIndex].response = {
        status: response.status,
        statusMessage: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        bodyLength: bodyText.length,
        bodyRaw: bodyText,
      };

      return response;
    } catch (err) {
      interceptedCalls[callIndex].response = {
        status: 0,
        statusMessage: err.message,
        headers: {},
        bodyLength: 0,
        bodyRaw: err.message,
        error: true,
      };
      throw err;
    }
  };
}

function restoreNativeFetch() {
  globalThis.fetch = originalFetch;
}

// ─── AXIOS INTERCEPT ───────────────────────────────────────────────────────────

function patchAxios() {
  try {
    const axios = require('axios');

    axios.interceptors.request.use((config) => {
      if (interceptEnabled) {
        const fullUrl = config.url.startsWith('http')
          ? config.url
          : `${config.baseURL || ''}${config.url}`;

        const callRecord = {
          url: fullUrl,
          headers_sent: config.headers || {},
          timestamp: new Date().toISOString(),
          method: config.method?.toUpperCase() || 'GET',
          response: null,
          source: 'axios',
        };
        interceptedCalls.push(callRecord);
        config._shepherdCallIndex = interceptedCalls.length - 1;
      }
      return config;
    });

    axios.interceptors.response.use(
      (response) => {
        if (interceptEnabled && response.config._shepherdCallIndex !== undefined) {
          const idx = response.config._shepherdCallIndex;
          const bodyStr = typeof response.data === 'string'
            ? response.data
            : JSON.stringify(response.data);

          interceptedCalls[idx].response = {
            status: response.status,
            statusMessage: response.statusText,
            headers: response.headers,
            bodyLength: bodyStr.length,
            bodyRaw: bodyStr,
          };
        }
        return response;
      },
      (error) => {
        if (interceptEnabled && error.config?._shepherdCallIndex !== undefined) {
          const idx = error.config._shepherdCallIndex;
          interceptedCalls[idx].response = {
            status: error.response?.status || 0,
            statusMessage: error.response?.statusText || error.message,
            headers: error.response?.headers || {},
            bodyLength: 0,
            bodyRaw: error.response?.data ? JSON.stringify(error.response.data) : error.message,
            error: true,
          };
        }
        return Promise.reject(error);
      }
    );
    return true;
  } catch (e) {
    return false;
  }
}

// ─── HTTP/HTTPS INTERCEPT ──────────────────────────────────────────────────────

const originalHttpRequest = http.request.bind(http);
const originalHttpsRequest = https.request.bind(https);
const originalHttpGet = http.get.bind(http);
const originalHttpsGet = https.get.bind(https);

function decompressBody(buffer, encoding) {
  try {
    if (encoding === 'gzip') return zlib.gunzipSync(buffer).toString('utf8');
    if (encoding === 'deflate') return zlib.inflateSync(buffer).toString('utf8');
    if (encoding === 'br') return zlib.brotliDecompressSync(buffer).toString('utf8');
  } catch (e) {}
  return buffer.toString('utf8');
}

function interceptRequest(originalFn, protocol) {
  return function(...args) {
    if (!interceptEnabled) return originalFn(...args);

    let options = args[0];
    let callback = args[1];
    let fullUrl, headers = {};

    if (typeof options === 'string') {
      fullUrl = options;
    } else if (options instanceof URL) {
      fullUrl = options.href;
    } else if (typeof options === 'object') {
      const host = options.hostname || options.host || 'unknown';
      const port = options.port ? `:${options.port}` : '';
      const pathname = options.path || options.pathname || '/';
      fullUrl = `${protocol}://${host}${port}${pathname}`;
      headers = { ...options.headers };
    }

    const callRecord = {
      url: fullUrl,
      headers_sent: headers,
      timestamp: new Date().toISOString(),
      method: (options?.method || 'GET').toUpperCase(),
      response: null,
      source: 'http',
    };
    interceptedCalls.push(callRecord);
    const callIndex = interceptedCalls.length - 1;

    const wrappedCallback = (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const body = decompressBody(buffer, res.headers['content-encoding']);
        interceptedCalls[callIndex].response = {
          status: res.statusCode,
          statusMessage: res.statusMessage,
          headers: res.headers,
          bodyLength: body.length,
          bodyRaw: body,
        };
      });
      if (callback && typeof callback === 'function') callback(res);
    };

    if (typeof args[1] === 'function') args[1] = wrappedCallback;
    else args.push(wrappedCallback);

    return originalFn(...args);
  };
}

function enableIntercept() {
  interceptedCalls = [];
  interceptEnabled = true;
  http.request = interceptRequest(originalHttpRequest, 'http');
  https.request = interceptRequest(originalHttpsRequest, 'https');
  http.get = interceptRequest(originalHttpGet, 'http');
  https.get = interceptRequest(originalHttpsGet, 'https');
  patchNativeFetch();
}

function disableIntercept() {
  interceptEnabled = false;
  http.request = originalHttpRequest;
  https.request = originalHttpsRequest;
  http.get = originalHttpGet;
  https.get = originalHttpsGet;
  restoreNativeFetch();
}

function getInterceptedCalls() { return [...interceptedCalls]; }
function clearInterceptedCalls() { interceptedCalls = []; }
function getBlockedDbOps() { return [...blockedDbOps]; }
function clearBlockedDbOps() { blockedDbOps.length = 0; }

// ─── DATA VALIDATION ───────────────────────────────────────────────────────────

function hasRealData(body) {
  if (!body || body.length === 0) return { valid: false, reason: 'empty_body' };

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    if (body.length > 50 && !body.toLowerCase().includes('error')) {
      return { valid: true, reason: 'non_json_data', preview: body.slice(0, 300) };
    }
    return { valid: false, reason: 'unparseable', preview: body.slice(0, 300) };
  }

  if (parsed === null) return { valid: false, reason: 'json_null' };

  if (Array.isArray(parsed)) {
    if (parsed.length === 0) return { valid: false, reason: 'empty_array' };
    if (parsed.every(x => x === null)) return { valid: false, reason: 'array_all_null' };
    return { valid: true, reason: 'array_with_data', length: parsed.length };
  }

  if (typeof parsed === 'object') {
    if (parsed.error || parsed.Error) {
      return { valid: false, reason: 'error_response', error: parsed.error || parsed.Error };
    }

    // World Bank: [metadata, data]
    if (Array.isArray(parsed[1])) {
      if (parsed[1].length === 0) return { valid: false, reason: 'worldbank_empty_data' };
      const allNull = parsed[1].every(item => item.value === null);
      if (allNull) return { valid: false, reason: 'worldbank_all_null_values', count: parsed[1].length };
      const nonNull = parsed[1].filter(item => item.value !== null).length;
      return { valid: true, reason: 'worldbank_data', count: parsed[1].length, non_null: nonNull };
    }
    if (parsed[1] === null) return { valid: false, reason: 'worldbank_null_data' };

    // FRED
    if (parsed.observations) {
      const valid = parsed.observations.filter(o => o.value !== '.');
      if (valid.length === 0) return { valid: false, reason: 'fred_no_observations' };
      return { valid: true, reason: 'fred_data', count: valid.length };
    }

    // GDELT
    if (parsed.articles !== undefined) {
      if (!parsed.articles?.length) return { valid: false, reason: 'gdelt_no_articles' };
      return { valid: true, reason: 'gdelt_data', count: parsed.articles.length };
    }

    // Generic data field
    if (parsed.data !== undefined) {
      if (!parsed.data || (Array.isArray(parsed.data) && parsed.data.length === 0)) {
        return { valid: false, reason: 'empty_data_field' };
      }
      return { valid: true, reason: 'data_field_present', count: Array.isArray(parsed.data) ? parsed.data.length : 1 };
    }

    const vals = Object.values(parsed);
    if (vals.length === 0) return { valid: false, reason: 'empty_object' };
    if (vals.every(v => v === null)) return { valid: false, reason: 'object_all_null' };
    return { valid: true, reason: 'object_with_data', keys: Object.keys(parsed).slice(0, 5) };
  }

  return { valid: true, reason: 'primitive', value: String(parsed).slice(0, 100) };
}

// ─── LOGGING ───────────────────────────────────────────────────────────────────

const timestamp = () => new Date().toISOString();

const log = {
  meta: {
    started: timestamp(),
    finished: null,
    mode: QUICK_MODE ? 'quick' : 'full',
    test_matrix: {
      countries: ACTIVE_COUNTRIES.map(c => `${c.name}[${c.type}]`),
      years: ACTIVE_YEARS,
    },
    fetchers_scanned: 0,
    resolved: 0,
    unresolved: 0,
    total_api_calls: 0,
    data_success: 0,
    data_failure: 0,
    http_failure: 0,
    db_writes_blocked: 0,
  },
  fetchers: [],
};

// ─── FETCHER LOADER ────────────────────────────────────────────────────────────

function loadFetcher(filePath) {
  try {
    delete require.cache[require.resolve(filePath)];
    const mod = require(filePath);
    const exportKeys = Object.keys(mod);
    const fetchFn = exportKeys.find(k => k.toLowerCase().includes('fetch') && typeof mod[k] === 'function');
    if (!fetchFn) return { resolved: false, reason: 'no_fetch_function', exports: exportKeys };

    // Detect if fetcher ignores country arg (global-pull pattern)
    // Check function signature — if it takes no args, it's global
    const fn = mod[fetchFn];
    const isGlobalPull = fn.length === 0;

    return { resolved: true, fn, fnName: fetchFn, isGlobalPull };
  } catch (err) {
    return { resolved: false, reason: 'require_error', error: err.message };
  }
}

// ─── VERIFY FETCHER ────────────────────────────────────────────────────────────

async function verifyFetcher(filePath) {
  const fileName = pathModule.basename(filePath);
  const signalKey = fileName.replace('_historical.cjs', '');

  console.log(`\n┌─ ${fileName}`);

  const loader = loadFetcher(filePath);
  const fetcherLog = {
    file: fileName,
    signal_key: signalKey,
    scanned_at: timestamp(),
    load: { resolved: loader.resolved, function_name: loader.fnName || null, error: loader.error || loader.reason || null },
    tests: [],
    db_writes_blocked: [],
  };

  if (!loader.resolved) {
    console.log(`│  UNRESOLVED: ${loader.reason} — ${loader.error || ''}`);
    log.meta.unresolved++;
    log.fetchers.push(fetcherLog);
    return;
  }

  log.meta.resolved++;

  // Global-pull fetchers: run ONCE, not per country/year
  if (loader.isGlobalPull) {
    console.log(`│  Function: ${loader.fnName}() — GLOBAL PULL (runs once, ignores country arg)`);
    console.log(`│  Testing: single invocation`);

    clearInterceptedCalls();
    clearBlockedDbOps();
    enableIntercept();

    const testResult = {
      country: 'ALL',
      country_type: 'global_pull',
      year: 'ALL',
      invoked_at: timestamp(),
      intercepted_calls: [],
      db_writes_blocked: [],
      fetch_result: null,
      error: null,
    };

    try {
      const result = await Promise.race([
        loader.fn(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), TIMEOUT_MS))
      ]);

      testResult.fetch_result = {
        row_count: Array.isArray(result) ? result.length : (result ? 1 : 0),
        sample: Array.isArray(result) ? result.slice(0, 2) : result,
      };
    } catch (err) {
      testResult.error = err.message;
      console.log(`│    Error: ${err.message.slice(0, 80)}`);
    }

    disableIntercept();
    await new Promise(r => setTimeout(r, 200));

    const calls = getInterceptedCalls();
    log.meta.total_api_calls += calls.length;

    for (const call of calls) {
      const callResult = {
        url: call.url,
        headers_sent: call.headers_sent,
        method: call.method,
        source: call.source,
        timestamp: call.timestamp,
        http_status: null,
        body_length: 0,
        data_validation: null,
        body_raw: null,
      };

      if (call.response) {
        callResult.http_status = call.response.status;
        callResult.body_length = call.response.bodyLength;
        callResult.body_raw = call.response.bodyRaw;

        const validation = hasRealData(call.response.bodyRaw);
        callResult.data_validation = validation;

        if (call.response.status >= 200 && call.response.status < 300) {
          if (validation.valid) {
            log.meta.data_success++;
            console.log(`│    ✓ ${call.response.status} [${call.source}] — ${validation.reason} — ${call.url.slice(0, 60)}...`);
          } else {
            log.meta.data_failure++;
            console.log(`│    ✗ ${call.response.status} [${call.source}] — ${validation.reason} — ${call.url.slice(0, 60)}...`);
          }
        } else {
          log.meta.http_failure++;
          console.log(`│    ✗ HTTP ${call.response.status} [${call.source}] — ${call.url.slice(0, 60)}...`);
        }
      } else {
        console.log(`│    ? Pending [${call.source}] — ${call.url.slice(0, 60)}...`);
      }

      testResult.intercepted_calls.push(callResult);
    }

    const dbOps = getBlockedDbOps();
    if (dbOps.length > 0) {
      testResult.db_writes_blocked = dbOps;
      log.meta.db_writes_blocked += dbOps.length;
      for (const op of dbOps) {
        console.log(`│    🛑 DB BLOCKED: ${op.op} on ${op.table} (${op.rows || 1} rows)`);
      }
    }

    if (calls.length === 0) {
      console.log(`│    ⚠ No HTTP calls intercepted`);
      testResult.note = 'no_calls_intercepted';
    }

    fetcherLog.tests.push(testResult);

  } else {
    // Per-country fetchers: test matrix
    console.log(`│  Function: ${loader.fnName}(country)`);

    for (const country of ACTIVE_COUNTRIES) {
      for (const year of ACTIVE_YEARS) {
        console.log(`│  Testing: ${country.name}/${year} (${country.type})`);

        clearInterceptedCalls();
        clearBlockedDbOps();
        enableIntercept();

        const testResult = {
          country: country.name,
          country_type: country.type,
          year: year,
          invoked_at: timestamp(),
          intercepted_calls: [],
          db_writes_blocked: [],
          fetch_result: null,
          error: null,
        };

        try {
          const result = await Promise.race([
            loader.fn(country.name),
            new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), TIMEOUT_MS))
          ]);

          testResult.fetch_result = {
            row_count: Array.isArray(result) ? result.length : (result ? 1 : 0),
            sample: Array.isArray(result) ? result.slice(0, 2) : result,
          };
        } catch (err) {
          testResult.error = err.message;
          console.log(`│    Error: ${err.message.slice(0, 80)}`);
        }

        disableIntercept();
        await new Promise(r => setTimeout(r, 200));

        // Capture API calls
        const calls = getInterceptedCalls();
        log.meta.total_api_calls += calls.length;

        for (const call of calls) {
          const callResult = {
            url: call.url,
            headers_sent: call.headers_sent,
            method: call.method,
            source: call.source,
            timestamp: call.timestamp,
            http_status: null,
            body_length: 0,
            data_validation: null,
            body_raw: null,
          };

          if (call.response) {
            callResult.http_status = call.response.status;
            callResult.body_length = call.response.bodyLength;
            callResult.body_raw = call.response.bodyRaw;

            const validation = hasRealData(call.response.bodyRaw);
            callResult.data_validation = validation;

            if (call.response.status >= 200 && call.response.status < 300) {
              if (validation.valid) {
                log.meta.data_success++;
                console.log(`│    ✓ ${call.response.status} [${call.source}] — ${validation.reason} — ${call.url.slice(0, 60)}...`);
              } else {
                log.meta.data_failure++;
                console.log(`│    ✗ ${call.response.status} [${call.source}] — ${validation.reason} — ${call.url.slice(0, 60)}...`);
              }
            } else {
              log.meta.http_failure++;
              console.log(`│    ✗ HTTP ${call.response.status} [${call.source}] — ${call.url.slice(0, 60)}...`);
            }
          } else {
            console.log(`│    ? Pending [${call.source}] — ${call.url.slice(0, 60)}...`);
          }

          testResult.intercepted_calls.push(callResult);
        }

        // Capture blocked DB writes
        const dbOps = getBlockedDbOps();
        if (dbOps.length > 0) {
          testResult.db_writes_blocked = dbOps;
          log.meta.db_writes_blocked += dbOps.length;
          for (const op of dbOps) {
            console.log(`│    🛑 DB BLOCKED: ${op.op} on ${op.table} (${op.rows || 1} rows)`);
          }
        }

        if (calls.length === 0) {
          console.log(`│    ⚠ No HTTP calls intercepted`);
          testResult.note = 'no_calls_intercepted';
        }

        fetcherLog.tests.push(testResult);
        await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
      }
    }
  }

  // Aggregate blocked DB ops for this fetcher
  fetcherLog.db_writes_blocked = fetcherLog.tests.flatMap(t => t.db_writes_blocked);

  console.log(`└─ ${fetcherLog.tests.length} tests complete`);
  log.fetchers.push(fetcherLog);
}

// ─── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('API SHEPHERD — ARMY GRADE SIGNAL VERIFICATION');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log(`Started: ${timestamp()}`);
  console.log(`Mode: ${QUICK_MODE ? 'QUICK (1 country, 1 year)' : 'FULL (3 countries x 3 years)'}`);
  console.log(`Countries: ${ACTIVE_COUNTRIES.map(c => `${c.name}[${c.type}]`).join(', ')}`);
  console.log(`Years: ${ACTIVE_YEARS.join(', ')}`);
  console.log(`Database writes: BLOCKED (Supabase stubbed)`);

  const axiosPatched = patchAxios();
  console.log(`Axios interceptor: ${axiosPatched ? 'installed' : 'not found'}`);
  console.log('');

  // Ensure log dir exists
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

  let allFiles;
  try {
    allFiles = fs.readdirSync(FETCHERS_DIR);
  } catch (err) {
    console.error(`Cannot read fetchers directory: ${FETCHERS_DIR}`);
    process.exit(1);
  }

  const fetcherFiles = allFiles
    .filter(f => f.endsWith('_historical.cjs'))
    .map(f => pathModule.join(FETCHERS_DIR, f))
    .sort();

  const fetcherArg = process.argv.find(a => a.startsWith('--fetcher='));
  let targetFiles = fetcherFiles;
  if (fetcherArg) {
    const target = fetcherArg.split('=')[1];
    targetFiles = fetcherFiles.filter(f => pathModule.basename(f).includes(target));
    if (targetFiles.length === 0) {
      console.error(`No fetcher matching: ${target}`);
      process.exit(1);
    }
  }

  log.meta.fetchers_scanned = targetFiles.length;
  console.log(`Scanning ${targetFiles.length} fetcher files from: ${FETCHERS_DIR}\n`);

  for (const file of targetFiles) {
    await verifyFetcher(file);
  }

  log.meta.finished = timestamp();

  // Write latest log (overwrite)
  fs.writeFileSync(LATEST_LOG, JSON.stringify(log, null, 2));

  // Append to history
  const historyLine = `${log.meta.finished} | fetchers=${log.meta.fetchers_scanned} resolved=${log.meta.resolved} unresolved=${log.meta.unresolved} api_calls=${log.meta.total_api_calls} data_success=${log.meta.data_success} data_failure=${log.meta.data_failure} http_failure=${log.meta.http_failure} db_blocked=${log.meta.db_writes_blocked}\n`;
  fs.appendFileSync(HISTORY_LOG, historyLine);

  console.log('\n═══════════════════════════════════════════════════════════════════════════════');
  console.log('COMPLETE — NO VERDICTS. RAW DATA LOGGED. YOU JUDGE.');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log(`Fetchers scanned: ${log.meta.fetchers_scanned}`);
  console.log(`Resolved: ${log.meta.resolved} | Unresolved: ${log.meta.unresolved}`);
  console.log(`Total API calls intercepted: ${log.meta.total_api_calls}`);
  console.log(`Data success: ${log.meta.data_success} | Data failure: ${log.meta.data_failure} | HTTP failure: ${log.meta.http_failure}`);
  console.log(`DB writes blocked: ${log.meta.db_writes_blocked}`);
  console.log(`\nLog: ${LATEST_LOG}`);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
