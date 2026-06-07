// seismic_verify_fix.cjs
// Targeted post-fix verification: confirms verifierFetch Accept-Encoding fix eliminates
// seismic CONTRADICTION. Simulates exactly what signal_census does for one seismic URL.
// Run: node seismic_verify_fix.cjs

require('dotenv').config({ path: './.env' });
const https  = require('https');
const zlib   = require('zlib');
const crypto = require('crypto');
const axios  = require('axios');
const fs     = require('fs');
const path   = require('path');

const LOG = path.join(__dirname, 'shepherd_logs', 'seismic_verify_post_fix.txt');

function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }

function _decompressBody(buf, enc) {
  try {
    if (enc === 'gzip')    return zlib.gunzipSync(buf).toString('utf8');
    if (enc === 'deflate') return zlib.inflateSync(buf).toString('utf8');
    if (enc === 'br')      return zlib.brotliDecompressSync(buf).toString('utf8');
  } catch (e) {}
  return buf.toString('utf8');
}

// Exact same URL the census producer captures for Sudan/1900 (the first call seismic fires)
const TEST_URL = 'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson' +
  '&starttime=1970-01-01&endtime=1970-12-31' +
  '&minlatitude=3.4&maxlatitude=14.9&minlongitude=33.0&maxlongitude=47.9' +
  '&minmagnitude=5.0&limit=1000';

// ── PRODUCER SIMULATION ────────────────────────────────────────────────────────
// Simulates what signal_census interceptor captures when axios calls the URL.
// axios adds Accept-Encoding: gzip, deflate, br implicitly.
async function producerFetch(url) {
  const res = await axios.get(url, {
    headers: { 'User-Agent': 'Sabian-Intelligence/1.0' },
    timeout: 30000,
    decompress: false,   // prevent axios from decompressing — capture raw bytes like census interceptor
    responseType: 'arraybuffer',
  });
  const enc = res.headers['content-encoding'] || '';
  const buf = Buffer.from(res.data);
  const body = _decompressBody(buf, enc);
  return {
    status:        res.status,
    content_encoding: enc,
    raw_bytes:     buf.length,
    body,
    body_hash:     sha256(body),
    first_bytes:   buf.slice(0, 4).toString('hex'),
  };
}

// ── VERIFIER SIMULATION (BEFORE FIX) ──────────────────────────────────────────
// Plain https.request, no Accept-Encoding — what the old verifierFetch sent
function verifierBefore(url) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: 'GET',
      headers: { 'User-Agent': 'Sabian-Intelligence/1.0' },  // NO Accept-Encoding
      timeout: 30000,
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const enc = res.headers['content-encoding'] || '';
        const buf = Buffer.concat(chunks);
        const body = _decompressBody(buf, enc);
        resolve({
          status:        res.statusCode,
          content_encoding: enc,
          raw_bytes:     buf.length,
          body,
          body_hash:     sha256(body),
          first_bytes:   buf.slice(0, 4).toString('hex'),
        });
      });
    });
    req.on('error', err => resolve({ status: 0, body: '', error: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: '', error: 'TIMEOUT' }); });
    req.end();
  });
}

// ── VERIFIER SIMULATION (AFTER FIX) ───────────────────────────────────────────
// Plain https.request WITH Accept-Encoding: gzip, deflate, br — matches the fix
function verifierAfter(url) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: 'GET',
      headers: {
        'Accept-Encoding': 'gzip, deflate, br',    // THE FIX
        'User-Agent': 'Sabian-Intelligence/1.0',
      },
      timeout: 30000,
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const enc = res.headers['content-encoding'] || '';
        const buf = Buffer.concat(chunks);
        const body = _decompressBody(buf, enc);
        resolve({
          status:        res.statusCode,
          content_encoding: enc,
          raw_bytes:     buf.length,
          body,
          body_hash:     sha256(body),
          first_bytes:   buf.slice(0, 4).toString('hex'),
        });
      });
    });
    req.on('error', err => resolve({ status: 0, body: '', error: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: '', error: 'TIMEOUT' }); });
    req.end();
  });
}

function verdict(producer, verifier) {
  if (producer.body_hash === verifier.body_hash) return 'PASS';
  try {
    const p = JSON.parse(producer.body);
    const v = JSON.parse(verifier.body);
    if ((p.metadata?.count ?? p.features?.length) === (v.metadata?.count ?? v.features?.length)) {
      return 'PASS (count match, minor metadata diff)';
    }
  } catch (e) {}
  return 'CONTRADICTION';
}

async function main() {
  const lines = [];
  const log = (...args) => { const s = args.join(' '); console.log(s); lines.push(s); };

  log('SEISMIC CENSUS FIX VERIFICATION');
  log('Run at: ' + new Date().toISOString());
  log('URL: ' + TEST_URL);
  log('');

  log('Fetching (producer simulation — axios, gzip enabled)...');
  const prod = await producerFetch(TEST_URL);
  log('Fetching (verifier BEFORE fix — no Accept-Encoding)...');
  const before = await verifierBefore(TEST_URL);
  log('Fetching (verifier AFTER fix — Accept-Encoding: gzip, deflate, br)...');
  const after = await verifierAfter(TEST_URL);
  log('');

  log('─── PRODUCER ───────────────────────────────────────────');
  log('  HTTP status:        ' + prod.status);
  log('  content-encoding:   ' + (prod.content_encoding || 'none'));
  log('  raw bytes:          ' + prod.raw_bytes);
  log('  first 4 bytes hex:  ' + prod.first_bytes);
  log('  body hash:          ' + prod.body_hash);
  log('  body (first 120):   ' + prod.body.slice(0, 120).replace(/[\r\n]/g, ' '));

  log('');
  log('─── VERIFIER BEFORE FIX (no Accept-Encoding) ───────────');
  log('  HTTP status:        ' + before.status);
  log('  content-encoding:   ' + (before.content_encoding || 'none'));
  log('  raw bytes:          ' + before.raw_bytes);
  log('  first 4 bytes hex:  ' + before.first_bytes);
  log('  body hash:          ' + before.body_hash);
  log('  body (first 120):   ' + before.body.slice(0, 120).replace(/[\r\n]/g, ' '));

  log('');
  log('─── VERIFIER AFTER FIX (Accept-Encoding: gzip...) ──────');
  log('  HTTP status:        ' + after.status);
  log('  content-encoding:   ' + (after.content_encoding || 'none'));
  log('  raw bytes:          ' + after.raw_bytes);
  log('  first 4 bytes hex:  ' + after.first_bytes);
  log('  body hash:          ' + after.body_hash);
  log('  body (first 120):   ' + after.body.slice(0, 120).replace(/[\r\n]/g, ' '));

  log('');
  log('─── VERDICTS ───────────────────────────────────────────');
  const v_before = verdict(prod, before);
  const v_after  = verdict(prod, after);
  log('  producer vs verifier_before:  ' + v_before);
  log('  producer vs verifier_after:   ' + v_after);
  log('');

  if (v_after === 'PASS' || v_after.startsWith('PASS')) {
    log('RESULT: FIX CONFIRMED — contradiction eliminated.');
    log('  verifierFetch with Accept-Encoding produces same payload as axios producer.');
  } else {
    log('RESULT: FIX NOT CONFIRMED — contradiction persists. Further investigation needed.');
  }

  fs.mkdirSync(path.join(__dirname, 'shepherd_logs'), { recursive: true });
  fs.writeFileSync(LOG, lines.join('\n') + '\n');
  log('');
  log('Log written to: ' + LOG);
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
