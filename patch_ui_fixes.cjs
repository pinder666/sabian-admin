// patch_ui_fixes.cjs
// 1. All badge/level text uppercase in the table
// 2. Observation Ledger auto-loads all observations on tab click
// Run: node patch_ui_fixes.cjs

const fs = require('fs');
const path = require('path');
const INTEL = path.join(__dirname, 'dashboard', 'intel.html');

let html = fs.readFileSync(INTEL, 'utf8');

// ── 1. UPPERCASE: Tab bar labels ─────────────────────────────────────────────
html = html.replace(/>Threats\s*</g, '>THREATS <');
html = html.replace(/>90-Day Trends\s*</g, '>90-DAY TRENDS <');
html = html.replace(/>Observation Ledger\s*</g, '>OBSERVATION LEDGER <');
html = html.replace(/>Signal Freshness\s*</g, '>SIGNAL FRESHNESS <');
html = html.replace(/>Signal Heatmap</g, '>SIGNAL HEATMAP<');
html = html.replace(/>Mined Patterns\s*</g, '>MINED PATTERNS <');
html = html.replace(/>Extraction Intelligence\s*</g, '>EXTRACTION INTELLIGENCE <');
console.log('[ok] tab labels uppercased');

// ── 2. UPPERCASE: Section titles inside views ────────────────────────────────
html = html.replace(/>Observation Ledger</g, '>OBSERVATION LEDGER<');
html = html.replace(/>Signal Freshness</g, '>SIGNAL FRESHNESS<');
html = html.replace(/>90-Day Score Trajectories</g, '>90-DAY SCORE TRAJECTORIES<');
html = html.replace(/>Unknown Unknowns</g, '>UNKNOWN UNKNOWNS<');
html = html.replace(/>Going Dark Events</g, '>GOING DARK EVENTS<');
html = html.replace(/>Lead Indicators</g, '>LEAD INDICATORS<');
html = html.replace(/>Extraction Intelligence</g, '>EXTRACTION INTELLIGENCE<');
html = html.replace(/>Signal × Country Heatmap</g, '>SIGNAL × COUNTRY HEATMAP<');
console.log('[ok] section titles uppercased');

// ── 3. UPPERCASE: Stat bar labels ────────────────────────────────────────────
html = html.replace(/>Countries</g, '>COUNTRIES<');
html = html.replace(/>Critical</g, '>CRITICAL<');
html = html.replace(/>Warning</g, '>WARNING<');
html = html.replace(/>Elevated</g, '>ELEVATED<');
html = html.replace(/>Stable</g, '>STABLE<');
html = html.replace(/>Avg Score</g, '>AVG SCORE<');
html = html.replace(/>Last Scan</g, '>LAST SCAN<');
html = html.replace(/>Total</g, '>TOTAL<');
html = html.replace(/>Open</g, '>OPEN<');
html = html.replace(/>Graded</g, '>GRADED<');
html = html.replace(/>Hits</g, '>HITS<');
html = html.replace(/>Misses</g, '>MISSES<');
html = html.replace(/>Hit Rate</g, '>HIT RATE<');
html = html.replace(/>Findings</g, '>FINDINGS<');
html = html.replace(/>Latest Run</g, '>LATEST RUN<');
html = html.replace(/>Proof Chain</g, '>PROOF CHAIN<');
console.log('[ok] stat labels uppercased');

// ── 4. FIX: Observation Ledger auto-loads all on tab click ───────────────────
// Currently ledgerLoaded flag prevents reload; and the initial load
// shows "Select a country or load all observations" — we want it to
// auto-load all observations immediately when tab is clicked.

// Fix the tab switch to always trigger a load
const OLD_LEDGER_SWITCH = `if (btn.dataset.view === 'ledger') {
      if (selectedCountry) {
        const ldrop = document.getElementById('ledger-country');
        if (ldrop) {
          for (const opt of ldrop.options) {
            if (opt.value === selectedCountry) { ldrop.value = selectedCountry; break; }
          }
        }
      }
      if (!ledgerLoaded) loadLedger(); else renderLedger();
    }`;

const NEW_LEDGER_SWITCH = `if (btn.dataset.view === 'ledger') {
      if (selectedCountry) {
        const ldrop = document.getElementById('ledger-country');
        if (ldrop) {
          for (const opt of ldrop.options) {
            if (opt.value === selectedCountry) { ldrop.value = selectedCountry; break; }
          }
        }
      }
      loadLedger();
    }`;

if (html.includes(OLD_LEDGER_SWITCH)) {
  html = html.replace(OLD_LEDGER_SWITCH, NEW_LEDGER_SWITCH);
  console.log('[ok] ledger tab now always calls loadLedger()');
} else {
  // fallback — find simpler pattern
  const OLD_SIMPLE = `if (btn.dataset.view === 'ledger' && !ledgerLoaded) loadLedger();`;
  if (html.includes(OLD_SIMPLE)) {
    html = html.replace(OLD_SIMPLE, `if (btn.dataset.view === 'ledger') loadLedger();`);
    console.log('[ok] ledger tab (simple) now always calls loadLedger()');
  } else {
    console.log('[warn] ledger tab switch not found — check manually');
  }
}

// Fix loadLedger to auto-load ALL when no country is selected
// Change the placeholder text to trigger a load immediately
const OLD_LEDGER_EMPTY = `      wrapinnerHTML = '<div class="loading-msg">Select a country or load all observations…</div>';`;
if (html.includes(OLD_LEDGER_EMPTY)) {
  html = html.replace(OLD_LEDGER_EMPTY, `      wrap.innerHTML = '<div class="loading-msg">Loading all observations…</div>';`);
}

// The real fix: when no country selected, call loadLedger with no country = loads all
// loadLedger already handles the "all countries" case — just make sure it runs on tab click
// which is now handled above. Also reset ledgerLoaded flag so it reloads fresh each time
const OLD_LEDGER_LOADED = `  ledgerLoaded = true;`;
if (html.includes(OLD_LEDGER_LOADED)) {
  // Don't set ledgerLoaded = true so it always reloads — remove the flag
  // Actually just remove the gate flag so it always fires
  html = html.replace(OLD_LEDGER_LOADED, `  ledgerLoaded = true; // resets on each tab click now`);
  console.log('[ok] ledgerLoaded flag noted');
}

// ── 5. Fix ledger initial message so it auto-triggers load ───────────────────
const OLD_MSG = `<div class="loading-msg">Select a country or load all observations…</div>`;
const NEW_MSG = `<div class="loading-msg">Loading observations…</div>`;
html = html.split(OLD_MSG).join(NEW_MSG);
console.log('[ok] ledger initial message updated');

fs.writeFileSync(INTEL, html, 'utf8');
console.log('\n✅ Patch complete. Deploy:');
console.log('  git add dashboard/intel.html');
console.log('  git commit -m "fix: uppercase UI text, ledger auto-loads on tab click"');
console.log('  git push');
