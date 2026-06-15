// patch_threats_spark.cjs
// Bug: threats table only draws a spark if history is already in historyCache,
// but the table never fetches history -> only South Sudan (cached elsewhere) shows a line.
// Fix: after renderThreatsTable, fetch history for every visible country (data exists,
// 20 pts each), cache it, and redraw each spark cell in place. Every live country gets its line.
// Run: node patch_threats_spark.cjs

const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, 'dashboard', 'intel.html');
let html = fs.readFileSync(FILE, 'utf8');

// 1. Give each spark cell a stable id so we can fill it after async fetch.
const OLD_CELL = `    const cached = historyCache[c.country];
    const sparkHtml = cached
      ? makeSparkSVG(cached, 100, 28, c.risk_level)
      : \`<span class="spark-no-data">—</span>\`;`;

const NEW_CELL = `    const cached = historyCache[c.country];
    const sparkCellId = 'spark-cell-' + i;
    const sparkHtml = (cached && cached.length >= 2)
      ? makeSparkSVG(cached, 100, 28, c.risk_level)
      : \`<span class="spark-no-data">…</span>\`;`;

if (html.includes(OLD_CELL)) {
  html = html.replace(OLD_CELL, NEW_CELL);
  console.log('[ok] spark cell id added');
} else {
  console.log('[FAIL] spark cell block not found verbatim — aborting');
  process.exit(1);
}

// 2. Add id to the spark <td> so we can target it.
const OLD_TD = `      <td>${'$'}{sparkHtml}</td>`;
// We must match the literal in the file: <td>${sparkHtml}</td>
const OLD_TD_LITERAL = '      <td>${sparkHtml}</td>';
const NEW_TD_LITERAL = '      <td id="${sparkCellId}">${sparkHtml}</td>';
if (html.includes(OLD_TD_LITERAL)) {
  html = html.replace(OLD_TD_LITERAL, NEW_TD_LITERAL);
  console.log('[ok] spark td given target id');
} else {
  console.log('[FAIL] spark td not found verbatim — aborting');
  process.exit(1);
}

// 3. After the table is injected, fetch history for all rows and fill sparks.
const OLD_INJECT = `  html += '</tbody></table>';
  document.getElementById('threat-table-wrap').innerHTML = html;
}`;

const NEW_INJECT = `  html += '</tbody></table>';
  document.getElementById('threat-table-wrap').innerHTML = html;

  // Fill sparklines: fetch history for each visible country (cached after first load),
  // then redraw its spark cell in place. Concurrency-limited so we don't hammer the API.
  (async () => {
    const queue = rows.map((c, i) => ({ country: c.country, level: c.risk_level, cellId: 'spark-cell-' + i }));
    const CONCURRENCY = 6;
    let idx = 0;
    async function worker() {
      while (idx < queue.length) {
        const job = queue[idx++];
        try {
          let hist = historyCache[job.country];
          if (!hist) {
            const r = await fetch('/public-api/country/' + encodeURIComponent(job.country) + '?days=90');
            const d = await r.json();
            hist = d.history || [];
            historyCache[job.country] = hist;
          }
          const cell = document.getElementById(job.cellId);
          if (cell) {
            cell.innerHTML = (hist && hist.length >= 2)
              ? makeSparkSVG(hist, 100, 28, job.level)
              : '<span class="spark-no-data">—</span>';
          }
        } catch (e) {
          const cell = document.getElementById(job.cellId);
          if (cell) cell.innerHTML = '<span class="spark-no-data">—</span>';
        }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  })();
}`;

if (html.includes(OLD_INJECT)) {
  html = html.replace(OLD_INJECT, NEW_INJECT);
  console.log('[ok] async spark fill wired after table render');
} else {
  console.log('[FAIL] table inject block not found verbatim — aborting');
  process.exit(1);
}

fs.writeFileSync(FILE, html, 'utf8');
console.log('');
console.log('[ok] Written. Deploy:');
console.log('   git add dashboard/intel.html');
console.log('   git commit -m "fix: threats board fetches history so every country draws its spark"');
console.log('   git push');
