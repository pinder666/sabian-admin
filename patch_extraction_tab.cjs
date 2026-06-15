// patch_extraction_tab.cjs
// Adds /public-api/extraction/signatures endpoint to sabian_api.cjs
// Adds Extraction Intelligence tab back to intel.html reading live data
// Run from sabian_core: node patch_extraction_tab.cjs

const fs   = require('fs');
const path = require('path');

const API_FILE   = path.join(__dirname, 'sabian_api.cjs');
const INTEL_FILE = path.join(__dirname, 'dashboard', 'intel.html');

// ─── PATCH 1: add endpoint to sabian_api.cjs ──────────────────────────────
const endpoint = `
// ═══ EXTRACTION SIGNATURES ENDPOINT ════════════════════════════════════════
app.get('/public-api/extraction/signatures', async (req, res) => {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const country    = req.query.country    || null;
    const pattern_id = req.query.pattern_id || null;
    const confidence = req.query.confidence || null;

    let q = sb
      .from('extraction_signatures')
      .select('id, country, event_date, event_type, date_range_start, date_range_end, pattern_id, actor_count, recurring_count, primary_window, confidence, detected_at')
      .order('confidence', { ascending: true })
      .order('detected_at', { ascending: false });

    if (country)    q = q.eq('country', country);
    if (pattern_id) q = q.eq('pattern_id', pattern_id);
    if (confidence) q = q.eq('confidence', confidence);

    const { data, error } = await q;
    if (error) throw error;

    // Summary counts
    const counts = { VULTURE_PLAY: 0, INSIDER_EXIT: 0, ACTIVE_POSITIONING: 0 };
    const conf   = { HIGH: 0, MEDIUM: 0, REVIEW: 0 };
    for (const r of (data || [])) {
      if (counts[r.pattern_id] !== undefined) counts[r.pattern_id]++;
      if (conf[r.confidence]   !== undefined) conf[r.confidence]++;
    }

    res.json({
      total: (data || []).length,
      by_pattern: counts,
      by_confidence: conf,
      signatures: data || []
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// ═══ END EXTRACTION SIGNATURES ENDPOINT ════════════════════════════════════
`;

let api = fs.readFileSync(API_FILE, 'utf8');
if (api.includes('EXTRACTION SIGNATURES ENDPOINT')) {
  console.log('[skip] sabian_api.cjs already has extraction endpoint');
} else {
  const anchor = 'cron.schedule';
  const idx = api.indexOf(anchor);
  if (idx < 0) { console.error('[error] anchor not found in sabian_api.cjs'); process.exit(1); }
  api = api.slice(0, idx) + endpoint + '\n' + api.slice(idx);
  fs.writeFileSync(API_FILE, api, 'utf8');
  console.log('[ok] extraction endpoint added to sabian_api.cjs');
}

// ─── PATCH 2: add Extraction tab to intel.html ────────────────────────────
let html = fs.readFileSync(INTEL_FILE, 'utf8');

if (html.includes('view-extraction-live')) {
  console.log('[skip] intel.html already has live extraction tab');
  process.exit(0);
}

// Add tab button after the patterns tab button
const patternsBtn = '<button class="tab-btn" data-view="patterns">Mined Patterns <span class="tab-label-num" id="tab-patterns-count"></span></button>';
const extractionBtn = patternsBtn + '\n    <button class="tab-btn" data-view="extraction-live">Extraction Intelligence <span class="tab-label-num" id="tab-extraction-count"></span></button>';
if (html.includes(patternsBtn)) {
  html = html.replace(patternsBtn, extractionBtn);
  console.log('[ok] extraction tab button added');
} else {
  console.log('[error] patterns tab button not found'); process.exit(1);
}

// Add view div before </main>
const mainClose = html.lastIndexOf('</main>');
if (mainClose < 0) { console.log('[error] </main> not found'); process.exit(1); }

const extractionView = `
<div class="view" id="view-extraction-live">

  <!-- Header -->
  <div style="margin-bottom:1.5rem">
    <div style="font-family:var(--mono);font-size:0.68rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--dim);margin-bottom:0.4rem">Extraction Intelligence</div>
    <div style="font-size:0.82rem;color:var(--dim);max-width:760px;line-height:1.6">
      Structural patterns detected across 214 countries where actor filing clusters correlate with convergence band crossings.
      Actor identities are redacted — structure visible, names restricted to counsel review.
      Patterns are classified by window phase (pre-event positioning, active, post-event extraction) and recurring seat presence.
    </div>
  </div>

  <!-- Summary bar -->
  <div class="status-bar" id="ext-summary-bar">
    <div class="stat-cell"><div class="stat-label">Total Signatures</div><div class="stat-value" id="ext-total">—</div><div class="stat-sub">detected</div></div>
    <div class="stat-cell"><div class="stat-label">Vulture Play</div><div class="stat-value critical" id="ext-vulture">—</div><div class="stat-sub">post-event extraction</div></div>
    <div class="stat-cell"><div class="stat-label">Insider Exit</div><div class="stat-value warning" id="ext-insider">—</div><div class="stat-sub">pre-event positioning</div></div>
    <div class="stat-cell"><div class="stat-label">Active Positioning</div><div class="stat-value elevated" id="ext-active">—</div><div class="stat-sub">pre-event accumulation</div></div>
    <div class="stat-cell"><div class="stat-label">HIGH Confidence</div><div class="stat-value" id="ext-high">—</div><div class="stat-sub">recurring seats + tight lag</div></div>
  </div>

  <!-- Filters -->
  <div style="display:flex;gap:10px;margin-bottom:1rem;flex-wrap:wrap">
    <select id="ext-filter-pattern" style="background:var(--panel);border:1px solid var(--border);color:var(--text);padding:6px 10px;border-radius:4px;font-size:0.8rem">
      <option value="">All Patterns</option>
      <option value="VULTURE_PLAY">Vulture Play</option>
      <option value="INSIDER_EXIT">Insider Exit</option>
      <option value="ACTIVE_POSITIONING">Active Positioning</option>
    </select>
    <select id="ext-filter-confidence" style="background:var(--panel);border:1px solid var(--border);color:var(--text);padding:6px 10px;border-radius:4px;font-size:0.8rem">
      <option value="">All Confidence</option>
      <option value="HIGH">HIGH</option>
      <option value="MEDIUM">MEDIUM</option>
      <option value="REVIEW">REVIEW</option>
    </select>
    <input id="ext-filter-country" placeholder="Filter country..." style="background:var(--panel);border:1px solid var(--border);color:var(--text);padding:6px 10px;border-radius:4px;font-size:0.8rem;width:160px">
    <button onclick="applyExtFilters()" style="background:var(--accent);border:none;color:#000;padding:6px 14px;border-radius:4px;font-size:0.8rem;cursor:pointer;font-weight:700">Filter</button>
  </div>

  <!-- Signatures table -->
  <div id="ext-signatures-wrap"><div class="loading-msg">Loading extraction signatures…</div></div>

  <!-- Methodology -->
  <div style="padding:1rem 1.25rem;background:var(--panel);border:1px solid var(--border);border-radius:6px;margin-top:2rem">
    <div style="font-family:var(--mono);font-size:0.68rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--dim);margin-bottom:0.5rem">Pattern Definitions</div>
    <ul style="font-size:0.8rem;color:var(--dim);line-height:1.8;padding-left:1.2rem">
      <li><strong style="color:var(--text)">Vulture Play</strong> — Litigation-track actor filings in the POST window (0–730 days after a CRITICAL crossing). Recurring seat presence elevates to HIGH confidence.</li>
      <li><strong style="color:var(--text)">Insider Exit</strong> — Operational actor cluster (5+ entities) filing in the PRE window (0–180 days before a significant crossing). Indicates local knowledge of deterioration.</li>
      <li><strong style="color:var(--text)">Active Positioning</strong> — Financial actor 13F filings concentrating in the PRE window (30–365 days before a crossing). Indicates portfolio repositioning ahead of event.</li>
      <li><strong style="color:var(--text)">Recurring Seat</strong> — Actor hash appearing in event windows across 3+ different countries. Same structural player, different theater.</li>
      <li>Actor names are never stored in this view. Click any row for restricted dossier access — counsel review required before name disclosure.</li>
    </ul>
  </div>

</div>
`;

html = html.slice(0, mainClose) + extractionView + '\n' + html.slice(mainClose);
console.log('[ok] extraction view div added');

// Inject JS before loadThreats()
const jsBlock = `
// ═══ EXTRACTION INTELLIGENCE LOADER ══════════════════════════════════════
let extractionLoaded = false;
let allSignatures = [];

async function loadExtractionSignatures(filters) {
  extractionLoaded = true;
  let url = '/public-api/extraction/signatures';
  const params = [];
  if (filters && filters.pattern)    params.push('pattern_id=' + filters.pattern);
  if (filters && filters.confidence) params.push('confidence=' + filters.confidence);
  if (filters && filters.country)    params.push('country=' + encodeURIComponent(filters.country));
  if (params.length) url += '?' + params.join('&');

  document.getElementById('ext-signatures-wrap').innerHTML = '<div class="loading-msg">Loading…</div>';
  const data = await apiFetch(url);
  if (!data || data.error) {
    document.getElementById('ext-signatures-wrap').innerHTML = '<div class="error-msg">Failed to load signatures.</div>';
    return;
  }
  allSignatures = data.signatures || [];

  // Summary bar
  document.getElementById('ext-total').textContent   = data.total || 0;
  document.getElementById('ext-vulture').textContent = data.by_pattern.VULTURE_PLAY || 0;
  document.getElementById('ext-insider').textContent = data.by_pattern.INSIDER_EXIT || 0;
  document.getElementById('ext-active').textContent  = data.by_pattern.ACTIVE_POSITIONING || 0;
  document.getElementById('ext-high').textContent    = data.by_confidence.HIGH || 0;
  document.getElementById('tab-extraction-count').textContent = '(' + (data.total || 0) + ')';

  renderSignatures(allSignatures);
}

function renderSignatures(sigs) {
  if (!sigs.length) {
    document.getElementById('ext-signatures-wrap').innerHTML = '<div class="loading-msg">No signatures match current filters.</div>';
    return;
  }
  const patternLabel = { VULTURE_PLAY: 'Vulture Play', INSIDER_EXIT: 'Insider Exit', ACTIVE_POSITIONING: 'Active Positioning' };
  const patternColor = { VULTURE_PLAY: 'var(--critical)', INSIDER_EXIT: 'var(--warning)', ACTIVE_POSITIONING: 'var(--elevated)' };
  const confColor    = { HIGH: 'var(--stable)', MEDIUM: 'var(--warning)', REVIEW: 'var(--dim)' };

  let html = '<table class="threat-table"><thead><tr>'
    + '<th>#</th><th>Country</th><th>Pattern</th><th>Window</th>'
    + '<th>Actors</th><th>Recurring Seats</th><th>Confidence</th><th>Date Range</th><th></th>'
    + '</tr></thead><tbody>';

  sigs.forEach((s, i) => {
    const pc = patternColor[s.pattern_id] || 'var(--text)';
    const cc = confColor[s.confidence]    || 'var(--dim)';
    const label = patternLabel[s.pattern_id] || s.pattern_id;
    html += '<tr>'
      + '<td style="font-family:var(--mono);font-size:0.72rem;color:var(--dim)">' + (i+1) + '</td>'
      + '<td><span class="country-name">' + s.country + '</span></td>'
      + '<td><span style="color:' + pc + ';font-weight:700;font-size:0.78rem">' + label + '</span></td>'
      + '<td><span class="signal-chip">' + s.primary_window + '</span></td>'
      + '<td style="font-family:var(--mono);font-size:0.9rem;font-weight:700">' + s.actor_count + '</td>'
      + '<td style="font-family:var(--mono);font-size:0.9rem;font-weight:700;color:' + (s.recurring_count > 0 ? 'var(--critical)' : 'var(--dim)') + '">' + s.recurring_count + '</td>'
      + '<td><span style="color:' + cc + ';font-family:var(--mono);font-size:0.78rem;font-weight:700">' + s.confidence + '</span></td>'
      + '<td style="font-family:var(--mono);font-size:0.72rem;color:var(--dim)">' + (s.date_range_start || '').slice(0,7) + ' → ' + (s.date_range_end || '').slice(0,7) + '</td>'
      + '<td><span class="restricted-badge" onclick="showRestricted()" style="cursor:pointer;font-family:var(--mono);font-size:0.65rem;color:var(--dim);border:1px solid var(--border);padding:2px 6px;border-radius:3px">RESTRICTED</span></td>'
      + '</tr>';
  });
  html += '</tbody></table>';
  document.getElementById('ext-signatures-wrap').innerHTML = html;
}

function applyExtFilters() {
  loadExtractionSignatures({
    pattern:    document.getElementById('ext-filter-pattern').value,
    confidence: document.getElementById('ext-filter-confidence').value,
    country:    document.getElementById('ext-filter-country').value.trim()
  });
}

function showRestricted() {
  alert('RESTRICTED — Actor identification requires counsel review. Contact the Sabian team to initiate disclosure procedures.');
}
// ═══ END EXTRACTION INTELLIGENCE LOADER ══════════════════════════════════
`;

const bootMarker = 'loadThreats();';
const bootIdx = html.lastIndexOf(bootMarker);
if (bootIdx > 0) {
  html = html.slice(0, bootIdx) + jsBlock + '\n' + html.slice(bootIdx);
  console.log('[ok] extraction JS injected');
}

// Wire tab switching
const patternsSwitchOld = `if (btn.dataset.view === 'patterns') {
        if (!patternsLoaded) loadPatterns();
        return;
      }`;
const patternsSwitchNew = `if (btn.dataset.view === 'patterns') {
        if (!patternsLoaded) loadPatterns();
        return;
      }
      if (btn.dataset.view === 'extraction-live') {
        if (!extractionLoaded) loadExtractionSignatures();
        return;
      }`;
if (html.includes(patternsSwitchOld)) {
  html = html.replace(patternsSwitchOld, patternsSwitchNew);
  console.log('[ok] tab switching wired for extraction-live');
}

fs.writeFileSync(INTEL_FILE, html, 'utf8');
console.log('\n✅ Both files patched.');
console.log('   git add sabian_api.cjs dashboard/intel.html');
console.log('   git commit -m "feat: live Extraction Intelligence tab reading extraction_signatures"');
console.log('   git push');
