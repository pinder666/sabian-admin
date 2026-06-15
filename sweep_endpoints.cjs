// sweep_endpoints.cjs
// One-shot health sweep of EVERY Sabian endpoint: public, buyer-tier, pattern,
// extraction, audit-chain. Reports status, whether real data came back, row counts,
// and errors. This is the trillion-dollar-fund harness: hit everything, one report.
//
// Run: node sweep_endpoints.cjs
// Optional: node sweep_endpoints.cjs https://sabian-admin-production.up.railway.app

require('dotenv').config({ path: './.env' });

const BASE = process.argv[2] || 'https://sabian-admin-production.up.railway.app';
const BUYER_KEY = process.env.BUYER_API_KEY || '';
const SAMPLE = ['Sudan', 'Yemen', 'Ivory Coast', 'Luxembourg', 'Argentina'];
const SAMPLE_YEAR = 2001;

// Each entry: [label, path, needsAuth]
const ENDPOINTS = [
  // ── PUBLIC ──
  ['threats',                 '/public-api/threats', false],
  ['summary',                 '/public-api/summary', false],
  ['global',                  '/public-api/global', false],
  ['findings',                '/public-api/findings', false],
  ['observations stats',      '/public-api/observations/stats', false],
  ['country (Sudan)',         '/public-api/country/Sudan?days=90', false],
  ['country (Ivory Coast)',   '/public-api/country/Ivory%20Coast?days=90', false],
  ['theater (Sudan)',         '/public-api/theater/Sudan', false],
  ['observations (Sudan)',    '/public-api/observations/Sudan', false],
  ['signals (Sudan)',         '/public-api/signals/Sudan', false],
  ['signal (Sudan/conflict)', '/public-api/signal/Sudan/conflict', false],
  ['intelligence (Sudan)',    '/public-api/intelligence/Sudan', false],
  ['cluster (Sudan)',         '/public-api/cluster/Sudan', false],
  ['timemachine (Argentina/2001)', '/public-api/timemachine/Argentina/2001', false],
  // ── PATTERN ──
  ['patterns/summary',        '/public-api/patterns/summary', false],
  ['unknown-unknowns',        '/public-api/unknown-unknowns', false],
  ['going-dark',              '/public-api/going-dark', false],
  ['lead-indicators',         '/public-api/lead-indicators', false],
  ['proof-seal',              '/public-api/proof-seal', false],
  // ── EXTRACTION ──
  ['extraction/signatures',   '/public-api/extraction/signatures', false],
  // ── BUYER TIER ──
  ['api/dossier (Sudan)',     '/api/dossier/Sudan', true],
  ['api/temporal (Sudan)',    '/api/temporal/Sudan', true],
  ['api/contagion (Sudan)',   '/api/contagion/Sudan', true],
  ['api/portfolio',           '/api/portfolio', true],
  ['api/audit-chain',         '/api/audit-chain', true],
  ['api/anchors',             '/api/anchors', true],
  ['api/extraction/events',   '/api/extraction/events', true],
];

function rowCount(d) {
  if (Array.isArray(d)) return d.length;
  if (!d || typeof d !== 'object') return null;
  for (const k of ['history','threats','results','matches','findings','signatures','events','data','rows','anchors','observations','countries','patterns','items']) {
    if (Array.isArray(d[k])) return d[k].length;
  }
  return Object.keys(d).length ? 'obj' : 0;
}

(async () => {
  console.log('=== SABIAN ENDPOINT SWEEP ===');
  console.log('Base:', BASE);
  console.log('Buyer key:', BUYER_KEY ? 'present' : 'MISSING');
  console.log('');
  const fails = [];
  const empties = [];

  for (const [label, pathStr, needsAuth] of ENDPOINTS) {
    const url = BASE + pathStr;
    const headers = needsAuth ? { 'x-api-key': BUYER_KEY } : {};
    let line = '';
    try {
      const t0 = Date.now();
      const r = await fetch(url, { headers });
      const ms = Date.now() - t0;
      let body = null;
      try { body = await r.json(); } catch { body = null; }
      const rc = body ? rowCount(body) : null;
      const ok = r.ok;
      const isEmpty = rc === 0 || rc === null;
      const tag = !ok ? 'FAIL ' + r.status : (isEmpty ? 'EMPTY' : 'OK   ');
      line = tag.padEnd(9) + label.padEnd(32) + 'rows=' + String(rc).padEnd(6) + ms + 'ms';
      if (!ok) { fails.push(label + ' -> ' + r.status); if (body && body.error) line += '  err=' + body.error; }
      else if (isEmpty) empties.push(label);
    } catch (e) {
      line = 'ERROR    ' + label.padEnd(32) + e.message;
      fails.push(label + ' -> ' + e.message);
    }
    console.log(line);
  }

  console.log('\n=== SUMMARY ===');
  console.log('Total endpoints:', ENDPOINTS.length);
  console.log('FAILED:', fails.length);
  fails.forEach(f => console.log('   X ' + f));
  console.log('EMPTY (responded but no data):', empties.length);
  empties.forEach(e => console.log('   - ' + e));
  if (!fails.length && !empties.length) console.log('All endpoints returned data.');
})();
