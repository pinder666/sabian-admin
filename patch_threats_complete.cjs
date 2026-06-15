// patch_threats_complete.cjs
// Complete Threats page fix based on actually reading current intel.html
// 1. Normalize risk_level uppercase on load
// 2. Filter comparisons case-safe
// 3. Dropdown options uppercased
// 4. HTML section titles uppercased
// 5. Last Scan shows full date not just year
// 6. Stats counts case-normalized
// Run: node patch_threats_complete.cjs

const fs = require('fs');
const path = require('path');
const INTEL = path.join(__dirname, 'dashboard', 'intel.html');

let html = fs.readFileSync(INTEL, 'utf8');
let changes = 0;

function tryReplace(label, oldStr, newStr) {
  if (html.includes(oldStr)) {
    html = html.split(oldStr).join(newStr);
    console.log('[ok] ' + label);
    changes++;
    return true;
  }
  console.log('[skip] ' + label + ' (not found, maybe already done)');
  return false;
}

// 1. NORMALIZE risk_level on load
tryReplace(
  'normalize risk_level uppercase on load',
  'allCountries = data.countries || [];',
  'allCountries = (data.countries || []).map(c => ({ ...c, risk_level: (c.risk_level || "STABLE").toUpperCase() }));'
);

// 2. FILTER threats — case safe
tryReplace(
  'filterThreats level case-safe',
  'if (lev) rows = rows.filter(c => c.risk_level === lev);',
  'if (lev) rows = rows.filter(c => (c.risk_level||"").toUpperCase() === lev.toUpperCase());'
);

// renderSparkGrid uses same line — already replaced above by split/join? No, identical text. Replace ran on both.

// 3. HEATMAP filter case-safe
tryReplace(
  'heatmap level filter case-safe',
  'if (level)   rows = rows.filter(c => c.risk_level === level);',
  'if (level)   rows = rows.filter(c => (c.risk_level||"").toUpperCase() === level.toUpperCase());'
);

// 4. Stats counts case-safe
tryReplace(
  'stat counts normalized',
  'allCountries.forEach(c => { counts[c.risk_level] = (counts[c.risk_level]||0)+1; });',
  'allCountries.forEach(c => { const rl = (c.risk_level||"STABLE").toUpperCase(); counts[rl] = (counts[rl]||0)+1; });'
);

// 5. LAST SCAN — show full date not just year
tryReplace(
  'last scan full date',
  "document.getElementById('stat-date').textContent = scanDate ? scanDate.slice(0,4) : '\u2014';",
  "document.getElementById('stat-date').textContent = scanDate || '\u2014';"
);

tryReplace(
  'last scan nav full date',
  "document.getElementById('scan-date-nav').textContent = scanDate ? scanDate.slice(0,4) : '\u2014';",
  "document.getElementById('scan-date-nav').textContent = scanDate || '\u2014';"
);

// 6. UPPERCASE tab labels in HTML
tryReplace('tab Threats', '>Threats <', '>THREATS <');
tryReplace('tab 90-Day Trends', '>90-Day Trends <', '>90-DAY TRENDS <');
tryReplace('tab Observation Ledger', '>Observation Ledger <', '>OBSERVATION LEDGER <');
tryReplace('tab Signal Freshness', '>Signal Freshness <', '>SIGNAL FRESHNESS <');
tryReplace('tab Signal Heatmap', '>Signal Heatmap<', '>SIGNAL HEATMAP<');
tryReplace('tab Mined Patterns', '>Mined Patterns <', '>MINED PATTERNS <');
tryReplace('tab Extraction Intelligence', '>Extraction Intelligence <', '>EXTRACTION INTELLIGENCE <');

// 7. UPPERCASE section titles
tryReplace('section Observation Ledger', '>Observation Ledger</span>', '>OBSERVATION LEDGER</span>');
tryReplace('section Signal Freshness', '>Signal Freshness</span>', '>SIGNAL FRESHNESS</span>');
tryReplace('section 90-Day Score Trajectories', '>90-Day Score Trajectories<', '>90-DAY SCORE TRAJECTORIES<');
tryReplace('section Unknown Unknowns', '>Unknown Unknowns</span>', '>UNKNOWN UNKNOWNS</span>');
tryReplace('section Going Dark Events', '>Going Dark Events</span>', '>GOING DARK EVENTS</span>');
tryReplace('section Lead Indicators', '>Lead Indicators</span>', '>LEAD INDICATORS</span>');
tryReplace('section Signal x Country Heatmap', '>Signal \u00d7 Country Heatmap<', '>SIGNAL \u00d7 COUNTRY HEATMAP<');
tryReplace('section Extraction Intelligence', '>Extraction Intelligence</div>', '>EXTRACTION INTELLIGENCE</div>');

// 8. UPPERCASE stat labels in HTML  
tryReplace('label Countries', '>Countries</div>', '>COUNTRIES</div>');
tryReplace('label Critical stat', '<div class="stat-label">Critical</div>', '<div class="stat-label">CRITICAL</div>');
tryReplace('label Warning stat', '<div class="stat-label">Warning</div>', '<div class="stat-label">WARNING</div>');
tryReplace('label Elevated stat', '<div class="stat-label">Elevated</div>', '<div class="stat-label">ELEVATED</div>');
tryReplace('label Stable stat', '<div class="stat-label">Stable</div>', '<div class="stat-label">STABLE</div>');
tryReplace('label Avg Score', '>Avg Score</div>', '>AVG SCORE</div>');
tryReplace('label Last Scan', '>Last Scan</div>', '>LAST SCAN</div>');
tryReplace('label Total stat', '<div class="ledger-stat-label">Total</div>', '<div class="ledger-stat-label">TOTAL</div>');
tryReplace('label Open stat', '<div class="ledger-stat-label">Open</div>', '<div class="ledger-stat-label">OPEN</div>');
tryReplace('label Graded stat', '<div class="ledger-stat-label">Graded</div>', '<div class="ledger-stat-label">GRADED</div>');
tryReplace('label Hits stat', '<div class="ledger-stat-label">Hits</div>', '<div class="ledger-stat-label">HITS</div>');
tryReplace('label Misses stat', '<div class="ledger-stat-label">Misses</div>', '<div class="ledger-stat-label">MISSES</div>');
tryReplace('label Hit Rate', '>Hit Rate</div>', '>HIT RATE</div>');
tryReplace('label Findings', '<div class="stat-label">Findings</div>', '<div class="stat-label">FINDINGS</div>');
tryReplace('label Latest Run', '<div class="stat-label">Latest Run</div>', '<div class="stat-label">LATEST RUN</div>');
tryReplace('label Proof Chain', '>Proof Chain</span>', '>PROOF CHAIN</span>');
tryReplace('label Unknown Unknowns stat', '<div class="stat-label">Unknown Unknowns</div>', '<div class="stat-label">UNKNOWN UNKNOWNS</div>');
tryReplace('label Going Dark stat', '<div class="stat-label">Going Dark</div>', '<div class="stat-label">GOING DARK</div>');
tryReplace('label Lead Indicators stat', '<div class="stat-label">Lead Indicators</div>', '<div class="stat-label">LEAD INDICATORS</div>');
tryReplace('label Total Signatures', '<div class="stat-label">Total Signatures</div>', '<div class="stat-label">TOTAL SIGNATURES</div>');
tryReplace('label Vulture Play', '<div class="stat-label">Vulture Play</div>', '<div class="stat-label">VULTURE PLAY</div>');
tryReplace('label Insider Exit', '<div class="stat-label">Insider Exit</div>', '<div class="stat-label">INSIDER EXIT</div>');
tryReplace('label Active Positioning', '<div class="stat-label">Active Positioning</div>', '<div class="stat-label">ACTIVE POSITIONING</div>');
tryReplace('label HIGH Confidence', '<div class="stat-label">HIGH Confidence</div>', '<div class="stat-label">HIGH CONFIDENCE</div>');

// 9. UPPERCASE legend band names
tryReplace('legend Critical', '>Critical &nbsp;81', '>CRITICAL &nbsp;81');
tryReplace('legend Warning', '>Warning &nbsp;66', '>WARNING &nbsp;66');
tryReplace('legend Elevated', '>Elevated &nbsp;41', '>ELEVATED &nbsp;41');
tryReplace('legend Stable', '>Stable &nbsp;0', '>STABLE &nbsp;0');

// 10. UPPERCASE dropdown option text (values already uppercase)
tryReplace('opt All Levels 1', '<option value="">All Levels</option>', '<option value="">ALL LEVELS</option>');
tryReplace('opt Critical 1', '<option value="CRITICAL">Critical</option>', '<option value="CRITICAL">CRITICAL</option>');
tryReplace('opt Warning 1', '<option value="WARNING">Warning</option>', '<option value="WARNING">WARNING</option>');
tryReplace('opt Elevated 1', '<option value="ELEVATED">Elevated</option>', '<option value="ELEVATED">ELEVATED</option>');
tryReplace('opt Stable 1', '<option value="STABLE">Stable</option>', '<option value="STABLE">STABLE</option>');
tryReplace('opt All Theaters 1', '<option value="">All Theaters</option>', '<option value="">ALL THEATERS</option>');
tryReplace('opt All Countries 1', '<option value="">All Countries</option>', '<option value="">ALL COUNTRIES</option>');
tryReplace('opt All Status 1', '<option value="">All Status</option>', '<option value="">ALL STATUS</option>');
tryReplace('opt Open', '<option value="OPEN">Open</option>', '<option value="OPEN">OPEN</option>');
tryReplace('opt Hit', '<option value="HIT">Hit</option>', '<option value="HIT">HIT</option>');
tryReplace('opt Miss', '<option value="MISS">Miss</option>', '<option value="MISS">MISS</option>');
tryReplace('opt Partial', '<option value="PARTIAL">Partial</option>', '<option value="PARTIAL">PARTIAL</option>');
tryReplace('opt All Directions', '<option value="">All Directions</option>', '<option value="">ALL DIRECTIONS</option>');
tryReplace('opt Ascending', '<option value="ASCENDING">Ascending (Worsening)</option>', '<option value="ASCENDING">ASCENDING (WORSENING)</option>');
tryReplace('opt Descending', '<option value="DESCENDING">Descending (Improving)</option>', '<option value="DESCENDING">DESCENDING (IMPROVING)</option>');
tryReplace('opt All Patterns', '<option value="">All Patterns</option>', '<option value="">ALL PATTERNS</option>');
tryReplace('opt Vulture Play', '<option value="VULTURE_PLAY">Vulture Play</option>', '<option value="VULTURE_PLAY">VULTURE PLAY</option>');
tryReplace('opt Insider Exit', '<option value="INSIDER_EXIT">Insider Exit</option>', '<option value="INSIDER_EXIT">INSIDER EXIT</option>');
tryReplace('opt Active Positioning', '<option value="ACTIVE_POSITIONING">Active Positioning</option>', '<option value="ACTIVE_POSITIONING">ACTIVE POSITIONING</option>');
tryReplace('opt All Confidence', '<option value="">All Confidence</option>', '<option value="">ALL CONFIDENCE</option>');

// 11. Section meta lines uppercase
tryReplace('meta immutable', '>Immutable threshold-crossing record<', '>IMMUTABLE THRESHOLD-CROSSING RECORD<');
tryReplace('meta live signal', '>Live signal coverage per country<', '>LIVE SIGNAL COVERAGE PER COUNTRY<');
tryReplace('meta top-3', '>Top-3 dominant signals per country<', '>TOP-3 DOMINANT SIGNALS PER COUNTRY<');
tryReplace('meta click card', '>Click any card to view detail<', '>CLICK ANY CARD TO VIEW DETAIL<');
tryReplace('meta signal correlations', '>Signal correlations the miner found blind<', '>SIGNAL CORRELATIONS THE MINER FOUND BLIND<');
tryReplace('meta countries silent', '>Countries whose signals went silent', '>COUNTRIES WHOSE SIGNALS WENT SILENT');
tryReplace('meta signal A predicts', '>Signal A at year T predicts Signal B at year T+lag<', '>SIGNAL A AT YEAR T PREDICTS SIGNAL B AT YEAR T+LAG<');

fs.writeFileSync(INTEL, html, 'utf8');
console.log('\n\u2705 Patch complete. ' + changes + ' changes applied.');
console.log('Deploy:');
console.log('  git add dashboard/intel.html');
console.log('  git commit -m "fix: uppercase normalize risk_level, fix filters, uppercase all UI text"');
console.log('  git push');
