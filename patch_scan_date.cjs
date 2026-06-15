// patch_scan_date.cjs
// Fixes scan_date display in the Threats tab:
//   - Shows year only (not 2010-12-31)
//   - Adds STALE/ANCIENT badge for old data
//   - Sorts by score descending by default (already correct in API, verify in render)
// Run from sabian_core: node patch_scan_date.cjs

const fs   = require('fs');
const path = require('path');
const INTEL = path.join(__dirname, 'dashboard', 'intel.html');

let html = fs.readFileSync(INTEL, 'utf8');

// ── Fix 1: scan_date column in renderThreatsTable ──────────────────────────
// Old: <td style="...">${ c.scan_date||'—'}</td>
// New: shows year + freshness badge
const OLD_DATE_COL = `      <td style="font-family:var(--mono);font-size:0.72rem;color:var(--dim)">\${c.scan_date||'—'}</td>`;
const NEW_DATE_COL = `      <td style="font-family:var(--mono);font-size:0.72rem;color:var(--dim)">
        \${(()=>{
          const yr = c.year || (c.scan_date ? c.scan_date.slice(0,4) : null);
          const age = yr ? (new Date().getFullYear() - parseInt(yr)) : null;
          let badge = '';
          if (age === null) return '—';
          if (age >= 11) badge = '<span style="margin-left:4px;font-size:0.6rem;color:var(--critical);border:1px solid rgba(255,60,60,0.3);padding:1px 4px;border-radius:2px">ANCIENT</span>';
          else if (age >= 6) badge = '<span style="margin-left:4px;font-size:0.6rem;color:var(--warning);border:1px solid rgba(255,170,0,0.3);padding:1px 4px;border-radius:2px">STALE</span>';
          else if (age >= 2) badge = '<span style="margin-left:4px;font-size:0.6rem;color:var(--dim);border:1px solid var(--border);padding:1px 4px;border-radius:2px">AGING</span>';
          return yr + badge;
        })()}
      </td>`;

if (html.includes(OLD_DATE_COL)) {
  html = html.replace(OLD_DATE_COL, NEW_DATE_COL);
  console.log('[ok] scan_date column patched');
} else {
  // Try alternate whitespace
  const alt = `      <td style="font-family:var(--mono);font-size:0.72rem;color:var(--dim)">${'${'}c.scan_date||'—'${'}'}</td>`;
  if (html.includes(alt)) {
    html = html.replace(alt, NEW_DATE_COL);
    console.log('[ok] scan_date column patched (alt match)');
  } else {
    console.log('[warn] scan_date column not found — searching for partial match...');
    // Find it by searching for the unique surrounding context
    const idx = html.indexOf("c.scan_date||'—'");
    if (idx > 0) {
      // Find the enclosing <td> start
      const tdStart = html.lastIndexOf('<td', idx);
      const tdEnd = html.indexOf('</td>', idx) + '</td>'.length;
      const oldCell = html.slice(tdStart, tdEnd);
      console.log('[info] found cell:', oldCell.slice(0, 80));
      html = html.slice(0, tdStart) + NEW_DATE_COL + html.slice(tdEnd);
      console.log('[ok] scan_date column patched (search)');
    } else {
      console.log('[error] scan_date column not found at all — check intel.html manually');
      process.exit(1);
    }
  }
}

// ── Fix 2: nav scan date — show most recent year, not a date string ─────────
// The nav badge shows the first country's scan_date — patch to show year only
const OLD_NAV = `document.getElementById('scan-date-nav').textContent = scanDate;`;
const NEW_NAV = `document.getElementById('scan-date-nav').textContent = scanDate ? scanDate.slice(0,4) : '—';`;
if (html.includes(OLD_NAV)) {
  html = html.replace(OLD_NAV, NEW_NAV);
  console.log('[ok] nav scan date patched');
} else {
  console.log('[warn] nav scan date not found — skipping');
}

// ── Fix 3: stat-date — show year only ───────────────────────────────────────
const OLD_STAT = `document.getElementById('stat-date').textContent     = scanDate;`;
const NEW_STAT = `document.getElementById('stat-date').textContent = scanDate ? scanDate.slice(0,4) : '—';`;
if (html.includes(OLD_STAT)) {
  html = html.replace(OLD_STAT, NEW_STAT);
  console.log('[ok] stat-date patched');
} else {
  console.log('[warn] stat-date not found — skipping');
}

fs.writeFileSync(INTEL, html, 'utf8');
console.log('\n✅ Patched. Deploy:');
console.log('   git add dashboard/intel.html');
console.log('   git commit -m "fix: show year not fake date in threats tab"');
console.log('   git push');
