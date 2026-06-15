// patch_shared_country.cjs
// Wires a shared selectedCountry across all tabs.
// When you click a country on ANY tab, every other tab will center on it when you switch.
// Run: node patch_shared_country.cjs

const fs = require('fs');
const path = require('path');
const INTEL = path.join(__dirname, 'dashboard', 'intel.html');

let html = fs.readFileSync(INTEL, 'utf8');

// ── 1. Add shared state variable after existing state block ──────────────────
const OLD_STATE = `let allCountries   = [];`;
const NEW_STATE = `let allCountries   = [];
let selectedCountry = null; // shared across all tabs`;

if (!html.includes('selectedCountry')) {
  if (html.includes(OLD_STATE)) {
    html = html.replace(OLD_STATE, NEW_STATE);
    console.log('[ok] added selectedCountry state');
  } else {
    console.log('[error] could not find state block');
    process.exit(1);
  }
} else {
  console.log('[skip] selectedCountry already present');
}

// ── 2. Add setSelectedCountry function before openDetail ─────────────────────
const OLD_OPEN = `async function openDetail(encodedCountry) {`;
const NEW_OPEN = `function setSelectedCountry(country) {
  selectedCountry = country;
  // Update ledger country dropdown if it exists
  const ldrop = document.getElementById('ledger-country');
  if (ldrop) {
    for (const opt of ldrop.options) {
      if (opt.value === country) { ldrop.value = country; break; }
    }
  }
}

async function openDetail(encodedCountry) {`;

if (!html.includes('function setSelectedCountry')) {
  if (html.includes(OLD_OPEN)) {
    html = html.replace(OLD_OPEN, NEW_OPEN);
    console.log('[ok] added setSelectedCountry function');
  } else {
    console.log('[error] could not find openDetail');
    process.exit(1);
  }
} else {
  console.log('[skip] setSelectedCountry already present');
}

// ── 3. Call setSelectedCountry inside openDetail ─────────────────────────────
const OLD_DECODE = `  const country = decodeURIComponent(encodedCountry);
  document.getElementById('dp-country').textContent = country;`;
const NEW_DECODE = `  const country = decodeURIComponent(encodedCountry);
  setSelectedCountry(country);
  document.getElementById('dp-country').textContent = country;`;

if (!html.includes('setSelectedCountry(country)')) {
  if (html.includes(OLD_DECODE)) {
    html = html.replace(OLD_DECODE, NEW_DECODE);
    console.log('[ok] openDetail now calls setSelectedCountry');
  } else {
    console.log('[warn] could not patch openDetail body — check manually');
  }
} else {
  console.log('[skip] setSelectedCountry call already in openDetail');
}

// ── 4. Wire tab switching to use selectedCountry ─────────────────────────────
// When switching to ledger: if selectedCountry is set, load that country
const OLD_LEDGER_TAB = `if (btn.dataset.view === 'ledger' && !ledgerLoaded) loadLedger();`;
const NEW_LEDGER_TAB = `if (btn.dataset.view === 'ledger') {
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

if (html.includes(OLD_LEDGER_TAB)) {
  html = html.replace(OLD_LEDGER_TAB, NEW_LEDGER_TAB);
  console.log('[ok] ledger tab wired to selectedCountry');
} else {
  console.log('[warn] ledger tab line not found — may already be patched');
}

// When switching to freshness: filter to selected country
const OLD_FRESH_TAB = `if (btn.dataset.view === 'freshness' && !freshnessLoaded) loadFreshness();`;
const NEW_FRESH_TAB = `if (btn.dataset.view === 'freshness') {
      if (selectedCountry) {
        const fsearch = document.getElementById('fresh-search');
        if (fsearch) fsearch.value = selectedCountry;
      }
      if (!freshnessLoaded) loadFreshness(); else filterFreshness();
    }`;

if (html.includes(OLD_FRESH_TAB)) {
  html = html.replace(OLD_FRESH_TAB, NEW_FRESH_TAB);
  console.log('[ok] freshness tab wired to selectedCountry');
} else {
  console.log('[warn] freshness tab line not found');
}

// When switching to sparklines: filter to selected country
const OLD_SPARK_TAB = `if (btn.dataset.view === 'sparklines' && !sparkloaded) loadSparklines();`;
const NEW_SPARK_TAB = `if (btn.dataset.view === 'sparklines') {
      if (selectedCountry) {
        const ssearch = document.getElementById('spark-search');
        if (ssearch) ssearch.value = selectedCountry;
      }
      if (!sparkloaded) loadSparklines(); else filterSparklines();
    }`;

if (html.includes(OLD_SPARK_TAB)) {
  html = html.replace(OLD_SPARK_TAB, NEW_SPARK_TAB);
  console.log('[ok] sparklines tab wired to selectedCountry');
} else {
  console.log('[warn] sparklines tab line not found');
}

// When switching to heatmap: filter to selected theater or highlight country
const OLD_HEAT_TAB = `if (btn.dataset.view === 'heatmap' && !heatmapLoaded) loadHeatmap();`;
const NEW_HEAT_TAB = `if (btn.dataset.view === 'heatmap') {
      if (!heatmapLoaded) loadHeatmap(); else renderHeatmap();
    }`;

if (html.includes(OLD_HEAT_TAB)) {
  html = html.replace(OLD_HEAT_TAB, NEW_HEAT_TAB);
  console.log('[ok] heatmap tab normalized');
} else {
  console.log('[warn] heatmap tab line not found');
}

// ── 5. Add selected country banner to each view ──────────────────────────────
// After tab switch, show a subtle "Focused on: [country] × " strip that clears filter
const OLD_SWITCH_END = `    if (btn.dataset.view === 'patterns' && !patternsLoaded) loadPatterns();`;
const NEW_SWITCH_END = `    if (btn.dataset.view === 'patterns' && !patternsLoaded) loadPatterns();
    // Show/update selected country indicator
    updateSelectedBanner();`;

if (!html.includes('updateSelectedBanner')) {
  if (html.includes(OLD_SWITCH_END)) {
    html = html.replace(OLD_SWITCH_END, NEW_SWITCH_END);
    console.log('[ok] updateSelectedBanner call added to tab switch');
  } else {
    console.log('[warn] could not inject updateSelectedBanner call');
  }
}

// Add the banner function before loadThreats
const OLD_LOAD_THREATS = `async function loadThreats() {`;
const BANNER_FN = `function updateSelectedBanner() {
  const existing = document.getElementById('selected-country-banner');
  if (existing) existing.remove();
  if (!selectedCountry) return;
  const activeView = document.querySelector('.view.active');
  if (!activeView) return;
  const banner = document.createElement('div');
  banner.id = 'selected-country-banner';
  banner.style.cssText = 'display:flex;align-items:center;gap:10px;padding:7px 14px;background:rgba(26,111,255,0.08);border:1px solid rgba(26,111,255,0.2);border-radius:6px;margin-bottom:14px;font-family:var(--mono);font-size:0.72rem;';
  banner.innerHTML = '<span style="color:var(--dim);letter-spacing:0.08em;text-transform:uppercase">Focused on</span>'
    + '<span style="color:var(--bright);font-weight:700">' + selectedCountry + '</span>'
    + '<button onclick="clearSelectedCountry()" style="margin-left:auto;background:none;border:none;color:var(--dim);cursor:pointer;font-size:0.9rem;padding:0 4px" title="Clear filter">×</button>';
  activeView.insertBefore(banner, activeView.firstChild);
}

function clearSelectedCountry() {
  selectedCountry = null;
  // Clear all search inputs
  ['search-input','spark-search','fresh-search'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const ldrop = document.getElementById('ledger-country');
  if (ldrop) ldrop.value = '';
  const existing = document.getElementById('selected-country-banner');
  if (existing) existing.remove();
  // Re-render current view
  const activeBtn = document.querySelector('.tab-btn.active');
  if (activeBtn) {
    const view = activeBtn.dataset.view;
    if (view === 'threats') filterThreats();
    if (view === 'sparklines') filterSparklines();
    if (view === 'freshness') filterFreshness();
    if (view === 'ledger') loadLedger();
    if (view === 'heatmap') renderHeatmap();
  }
}

async function loadThreats() {`;

if (!html.includes('function updateSelectedBanner')) {
  if (html.includes(OLD_LOAD_THREATS)) {
    html = html.replace(OLD_LOAD_THREATS, BANNER_FN);
    console.log('[ok] updateSelectedBanner + clearSelectedCountry functions added');
  } else {
    console.log('[warn] could not inject banner functions');
  }
} else {
  console.log('[skip] banner functions already present');
}

fs.writeFileSync(INTEL, html, 'utf8');
console.log('\n✅ Patch complete. Deploy:');
console.log('  git add dashboard/intel.html');
console.log('  git commit -m "feat: shared selectedCountry across all tabs + focus banner"');
console.log('  git push');
