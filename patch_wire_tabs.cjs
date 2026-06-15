// patch_wire_tabs.cjs
// Wires patterns and extraction-live tabs into the tab switching forEach
// Run: node patch_wire_tabs.cjs

const fs = require('fs');
const path = require('path');
const INTEL = path.join(__dirname, 'dashboard', 'intel.html');

let html = fs.readFileSync(INTEL, 'utf8');

const OLD = `    if (btn.dataset.view === 'sparklines' && !sparkloaded) loadSparklines();
    if (btn.dataset.view === 'ledger' && !ledgerLoaded) loadLedger();
    if (btn.dataset.view === 'freshness' && !freshnessLoaded) loadFreshness();
    if (btn.dataset.view === 'heatmap' && !heatmapLoaded) loadHeatmap();`;

const NEW = `    if (btn.dataset.view === 'sparklines' && !sparkloaded) loadSparklines();
    if (btn.dataset.view === 'ledger' && !ledgerLoaded) loadLedger();
    if (btn.dataset.view === 'freshness' && !freshnessLoaded) loadFreshness();
    if (btn.dataset.view === 'heatmap' && !heatmapLoaded) loadHeatmap();
    if (btn.dataset.view === 'patterns' && !patternsLoaded) loadPatterns();
    if (btn.dataset.view === 'extraction-live' && !extractionLoaded) loadExtractionSignatures();`;

if (html.includes(OLD)) {
  html = html.replace(OLD, NEW);
  console.log('[ok] patterns + extraction-live tabs wired');
} else {
  // Try to find any variant
  const idx = html.indexOf("btn.dataset.view === 'heatmap'");
  if (idx > 0) {
    const lineEnd = html.indexOf('\n', idx);
    const insertPoint = lineEnd + 1;
    const addition = `    if (btn.dataset.view === 'patterns' && !patternsLoaded) loadPatterns();\n    if (btn.dataset.view === 'extraction-live' && !extractionLoaded) loadExtractionSignatures();\n`;
    // Check if already wired
    if (html.includes("btn.dataset.view === 'patterns'")) {
      console.log('[skip] patterns already wired');
    } else {
      html = html.slice(0, insertPoint) + addition + html.slice(insertPoint);
      console.log('[ok] tabs wired (loose insert after heatmap line)');
    }
  } else {
    console.error('[fail] could not find insertion point');
    process.exit(1);
  }
}

fs.writeFileSync(INTEL, html, 'utf8');
console.log('\n[ok] Written. Deploy:');
console.log('   git add dashboard/intel.html');
console.log('   git commit -m "fix: wire patterns and extraction-live tabs"');
console.log('   git push');
