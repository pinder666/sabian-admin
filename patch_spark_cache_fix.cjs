// patch_spark_cache_fix.cjs
// Bug: spark fill skips refetch when historyCache holds an EMPTY array (poisoned by
// earlier code paths that set historyCache[country] = [] on failure). An empty array
// is not falsy, so `if (!hist)` is false -> no refetch -> draws a dash.
// Fix: refetch when history is missing OR shorter than 2 points.
// Run: node patch_spark_cache_fix.cjs

const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, 'dashboard', 'intel.html');
let html = fs.readFileSync(FILE, 'utf8');

const OLD = `          let hist = historyCache[job.country];
          if (!hist) {
            const r = await fetch('/public-api/country/' + encodeURIComponent(job.country) + '?days=90');
            const d = await r.json();
            hist = d.history || [];
            historyCache[job.country] = hist;
          }`;

const NEW = `          let hist = historyCache[job.country];
          if (!hist || hist.length < 2) {
            const r = await fetch('/public-api/country/' + encodeURIComponent(job.country) + '?days=90');
            const d = await r.json();
            hist = d.history || [];
            historyCache[job.country] = hist;
          }`;

if (html.includes(OLD)) {
  html = html.replace(OLD, NEW);
  fs.writeFileSync(FILE, html, 'utf8');
  console.log('[ok] spark fill now refetches when cache is empty or too short');
  console.log('');
  console.log('Deploy:');
  console.log('   git add dashboard/intel.html');
  console.log('   git commit -m "fix: refetch spark history when cache poisoned with empty array"');
  console.log('   git push');
} else {
  console.log('[FAIL] fill block not found verbatim — aborting');
  process.exit(1);
}
