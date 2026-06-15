// patch_dashboard.cjs
// Patches sabian_api.cjs (adds 5 endpoints) and dashboard/intel.html (rips Extraction tab, adds Mined Patterns)
// Run from C:/Users/user/Desktop/sabian.ai/sabian_core
// Usage: node patch_dashboard.cjs

const fs = require('fs');
const path = require('path');

const API_FILE   = path.join(__dirname, 'sabian_api.cjs');
const INTEL_FILE = path.join(__dirname, 'dashboard', 'intel.html');

// ─── PATCH 1: sabian_api.cjs ─────────────────────────────────────────────────
const apiBlock = `
// ═══ MINED PATTERNS ENDPOINTS (added by patch_dashboard.cjs) ════════════════
app.get('/public-api/patterns/unknown-unknowns', async (req, res) => {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await sb
      .from('miner_findings')
      .select('id, category, payload, run_id, created_at')
      .in('category', ['unknown_unknown', 'signal_correlation'])
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    const filtered = (data || []).filter(row => {
      const p = row.payload || {};
      const r = p.r ?? p.spearman_r ?? p.correlation ?? null;
      const n = p.n ?? p.n_pairs ?? 0;
      return r !== null && Math.abs(r) >= 0.5 && n >= 30;
    }).sort((a, b) => {
      const ra = Math.abs(a.payload?.r ?? a.payload?.spearman_r ?? 0);
      const rb = Math.abs(b.payload?.r ?? b.payload?.spearman_r ?? 0);
      return rb - ra;
    }).slice(0, 50);
    res.json({ count: filtered.length, findings: filtered });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/public-api/patterns/going-dark', async (req, res) => {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await sb
      .from('miner_findings')
      .select('id, category, payload, run_id, created_at')
      .in('category', ['going_dark_event', 'going_dark_by_signal', 'going_dark_sequence', 'darkest_country', 'absence_as_signal'])
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) throw error;
    res.json({ count: (data || []).length, findings: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/public-api/patterns/lead-indicators', async (req, res) => {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await sb
      .from('miner_findings')
      .select('id, category, payload, run_id, created_at')
      .in('category', ['lead_indicator', 'signal_to_score', 'compound_amplification', 'first_mover', 'conditional_probability'])
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    const filtered = (data || []).filter(row => {
      const p = row.payload || {};
      const r = p.r ?? p.spearman_r ?? p.correlation ?? null;
      const n = p.n ?? p.n_pairs ?? 0;
      return r === null || (Math.abs(r) >= 0.4 && n >= 30);
    }).slice(0, 200);
    res.json({ count: filtered.length, findings: filtered });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/public-api/patterns/summary', async (req, res) => {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const all = [];
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await sb
        .from('miner_findings')
        .select('category, run_id, created_at')
        .order('created_at', { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      if (!data || !data.length) break;
      all.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
    const counts = {};
    let latestRun = null;
    let latestRunId = null;
    for (const row of all) {
      counts[row.category] = (counts[row.category] || 0) + 1;
      if (!latestRun || row.created_at > latestRun) {
        latestRun = row.created_at;
        latestRunId = row.run_id;
      }
    }
    res.json({ total: all.length, latest_run: latestRun, latest_run_id: latestRunId, by_category: counts });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/public-api/proof-seal', async (req, res) => {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await sb
      .from('chain_anchors')
      .select('id, anchor_date, anchor_hash, rfc3161_status, ots_status, ots_confirmed, created_at')
      .order('anchor_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.json({ sealed: false, message: 'No anchor sealed yet' });
    const ageDays = Math.floor((Date.now() - new Date(data.anchor_date).getTime()) / 86400000);
    let status = 'GREEN';
    if (ageDays > 14) status = 'RED';
    else if (ageDays > 7) status = 'YELLOW';
    res.json({
      sealed: true,
      anchor_id: data.id,
      anchor_date: data.anchor_date,
      anchor_hash: data.anchor_hash,
      age_days: ageDays,
      status,
      rfc3161_status: data.rfc3161_status,
      ots_status: data.ots_status,
      ots_confirmed: data.ots_confirmed
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// ═══ END MINED PATTERNS ENDPOINTS ════════════════════════════════════════════
`;

let apiSrc = fs.readFileSync(API_FILE, 'utf8');
if (apiSrc.includes('MINED PATTERNS ENDPOINTS')) {
  console.log('[skip] sabian_api.cjs already patched.');
} else {
  // Insert before the cron/scheduler block (anchor: '// CRON' or fallback to before app.listen)
  let inserted = false;
  for (const anchor of ['// CRON', 'cron.schedule', 'app.listen']) {
    const idx = apiSrc.indexOf(anchor);
    if (idx > 0) {
      apiSrc = apiSrc.slice(0, idx) + apiBlock + '\n' + apiSrc.slice(idx);
      inserted = true;
      console.log(`[ok] sabian_api.cjs patched at "${anchor}"`);
      break;
    }
  }
  if (!inserted) {
    // Last resort: append to end
    apiSrc += '\n' + apiBlock;
    console.log('[ok] sabian_api.cjs patched (appended to end)');
  }
  fs.writeFileSync(API_FILE, apiSrc, 'utf8');
}

// ─── PATCH 2: dashboard/intel.html ───────────────────────────────────────────
let html = fs.readFileSync(INTEL_FILE, 'utf8');

if (html.includes('view-patterns')) {
  console.log('[skip] intel.html already patched.');
  process.exit(0);
}

// 2a. Replace the tab button
const oldTabBtn = '<button class="tab-btn" data-view="extraction">Extraction Intelligence</button>';
const newTabBtn = '<button class="tab-btn" data-view="patterns">Mined Patterns <span class="tab-label-num" id="tab-patterns-count"></span></button>';
if (html.includes(oldTabBtn)) {
  html = html.replace(oldTabBtn, newTabBtn);
  console.log('[ok] tab button replaced');
} else {
  console.log('[warn] could not find old tab button — searching loosely');
  const looseRegex = /<button class="tab-btn"[^>]*data-view="extraction"[^>]*>[^<]*<\/button>/;
  if (looseRegex.test(html)) {
    html = html.replace(looseRegex, newTabBtn);
    console.log('[ok] tab button replaced (loose match)');
  } else {
    console.log('[error] tab button not found — aborting');
    process.exit(1);
  }
}

// 2b. Replace the entire view-extraction div
// Find from `<div class="view" id="view-extraction">` to its matching closing `</div>` before `</main>`
const viewStart = html.indexOf('<div class="view" id="view-extraction">');
const mainClose = html.indexOf('</main>', viewStart);
if (viewStart < 0 || mainClose < 0) {
  console.log('[error] view-extraction div not found — aborting');
  process.exit(1);
}
// Walk backwards from mainClose to find the closing </div> of the view-extraction block
const beforeMain = html.slice(viewStart, mainClose);
const lastDivClose = beforeMain.lastIndexOf('</div>');
if (lastDivClose < 0) {
  console.log('[error] closing div not found — aborting');
  process.exit(1);
}
const viewEnd = viewStart + lastDivClose + '</div>'.length;

const newView = `<div class="view" id="view-patterns">
  <div id="proof-seal-bar" style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--panel);border:1px solid var(--border);border-radius:6px;margin-bottom:1.5rem;font-family:var(--mono);font-size:0.72rem">
    <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--dim)" id="proof-seal-dot"></span>
    <span style="color:var(--dim);letter-spacing:0.08em;text-transform:uppercase">Proof Chain</span>
    <span id="proof-seal-status" style="color:var(--text)">checking…</span>
    <span style="flex:1"></span>
    <span id="proof-seal-meta" style="color:var(--dim);font-size:0.65rem"></span>
  </div>
  <div class="status-bar" id="patterns-summary-bar">
    <div class="stat-cell"><div class="stat-label">Findings</div><div class="stat-value" id="ps-total">—</div><div class="stat-sub">in this run</div></div>
    <div class="stat-cell"><div class="stat-label">Unknown Unknowns</div><div class="stat-value critical" id="ps-unknown">—</div><div class="stat-sub">r ≥ 0.5, n ≥ 30</div></div>
    <div class="stat-cell"><div class="stat-label">Going Dark</div><div class="stat-value warning" id="ps-dark">—</div><div class="stat-sub">signal silence events</div></div>
    <div class="stat-cell"><div class="stat-label">Lead Indicators</div><div class="stat-value elevated" id="ps-lead">—</div><div class="stat-sub">precursor correlations</div></div>
    <div class="stat-cell"><div class="stat-label">Latest Run</div><div class="stat-value" id="ps-run" style="font-size:0.9rem">—</div><div class="stat-sub">UTC</div></div>
  </div>
  <div class="section-hdr"><span class="section-title">Unknown Unknowns</span><span class="section-meta">Signal correlations the miner found blind</span></div>
  <p style="font-size:0.8rem;color:var(--dim);margin-bottom:1rem;line-height:1.6;max-width:760px">Pairs of signals that move together at strength r ≥ 0.5 across n ≥ 30 country-year observations. No analyst told the system to look for these — the miner ran a full lag-0 correlation sweep across all signal pairs and these surfaced above noise.</p>
  <div id="unknown-unknowns-wrap"><div class="loading-msg">Loading unknown unknowns…</div></div>
  <div class="section-hdr" style="margin-top:2rem"><span class="section-title">Going Dark Events</span><span class="section-meta">Countries whose signals went silent for 2+ years — silence as a signal</span></div>
  <p style="font-size:0.8rem;color:var(--dim);margin-bottom:1rem;line-height:1.6;max-width:760px">A country's data stops appearing in normal feeds before something happens. The miner identifies multi-year windows where a signal flatlines, then measures score delta over the dark period. Large negative deltas signal undetected deterioration.</p>
  <div id="going-dark-wrap"><div class="loading-msg">Loading going-dark events…</div></div>
  <div class="section-hdr" style="margin-top:2rem"><span class="section-title">Lead Indicators</span><span class="section-meta">Signal A at year T predicts Signal B at year T+lag</span></div>
  <p style="font-size:0.8rem;color:var(--dim);margin-bottom:1rem;line-height:1.6;max-width:760px">Lagged correlations across all signal pairs for lags 1–10 years. Where correlation strengthens at lag, signal A is treated as a precursor to signal B. The strongest — health crisis → refugee outflows at 4–8 year lag, r &gt; 0.83 — is a clear precursor chain.</p>
  <div id="lead-indicators-wrap"><div class="loading-msg">Loading lead indicators…</div></div>
  <div style="padding:1rem 1.25rem;background:var(--panel);border:1px solid var(--border);border-radius:6px;margin-top:2rem">
    <div style="font-family:var(--mono);font-size:0.68rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--dim);margin-bottom:0.5rem">Methodology</div>
    <ul style="font-size:0.8rem;color:var(--dim);line-height:1.8;padding-left:1.2rem">
      <li>Findings persist to a hash-chained miner_findings table. Every row is timestamped and sealed weekly into a Bitcoin OpenTimestamps proof anchor.</li>
      <li>Correlations are Spearman rank, computed across all country-year pairs where both signals have data. Minimum n = 30 to surface.</li>
      <li>Going-dark windows are 2+ consecutive years where a signal value held flat at baseline, with score delta measured dark-start vs dark-end.</li>
      <li>Lead indicators sweep lags 1–10 years. Where correlation strengthens at lag, signal A is treated as a precursor.</li>
      <li>The miner runs nightly. Every claim is provable from a row ID against a sealed anchor.</li>
    </ul>
  </div>
</div>`;

html = html.slice(0, viewStart) + newView + html.slice(viewEnd);
console.log('[ok] view-extraction replaced with view-patterns');

// 2c. Replace the JS tab switching extraction handler
const oldTabHandler = `// Extraction view requires buyer key
      if (btn.dataset.view === 'extraction') {`;
const newTabHandler = `// Patterns view loads live miner findings
      if (btn.dataset.view === 'patterns') {
        if (!patternsLoaded) loadPatterns();
        return;
      }
      if (false && btn.dataset.view === 'extraction') {`;
if (html.includes(oldTabHandler)) {
  html = html.replace(oldTabHandler, newTabHandler);
  console.log('[ok] tab switching handler updated');
}

// 2d. Inject the loadPatterns + render functions before `loadThreats();`
const newJS = `
// ═══ MINED PATTERNS LOADER ════════════════════════════════════════════════
let patternsLoaded = false;

async function loadPatterns() {
  patternsLoaded = true;
  const [sealRes, summaryRes, uuRes, gdRes, leadRes] = await Promise.allSettled([
    apiFetch('/public-api/proof-seal'),
    apiFetch('/public-api/patterns/summary'),
    apiFetch('/public-api/patterns/unknown-unknowns'),
    apiFetch('/public-api/patterns/going-dark'),
    apiFetch('/public-api/patterns/lead-indicators')
  ]);

  if (sealRes.status === 'fulfilled' && sealRes.value.sealed) {
    const s = sealRes.value;
    const color = s.status === 'GREEN' ? 'var(--stable)' : s.status === 'YELLOW' ? 'var(--warning)' : 'var(--critical)';
    document.getElementById('proof-seal-dot').style.background = color;
    document.getElementById('proof-seal-dot').style.boxShadow = '0 0 8px ' + color;
    document.getElementById('proof-seal-status').textContent = 'SEALED ' + s.anchor_date + ' · anchor #' + s.anchor_id + ' · ' + s.age_days + 'd ago';
    document.getElementById('proof-seal-status').style.color = color;
    document.getElementById('proof-seal-meta').textContent = 'OTS ' + (s.ots_status || 'pending') + ' · RFC3161 ' + (s.rfc3161_status || 'pending');
  } else {
    document.getElementById('proof-seal-dot').style.background = 'var(--critical)';
    document.getElementById('proof-seal-status').textContent = 'NO ANCHOR — chain may have died';
    document.getElementById('proof-seal-status').style.color = 'var(--critical)';
  }

  if (summaryRes.status === 'fulfilled') {
    const s = summaryRes.value;
    const c = s.by_category || {};
    document.getElementById('ps-total').textContent = s.total != null ? s.total : '—';
    document.getElementById('ps-unknown').textContent = (c.unknown_unknown || 0) + (c.signal_correlation || 0);
    document.getElementById('ps-dark').textContent = (c.going_dark_event || 0) + (c.going_dark_by_signal || 0) + (c.going_dark_sequence || 0) + (c.darkest_country || 0);
    document.getElementById('ps-lead').textContent = (c.lead_indicator || 0) + (c.signal_to_score || 0) + (c.compound_amplification || 0) + (c.first_mover || 0);
    document.getElementById('ps-run').textContent = s.latest_run ? s.latest_run.slice(0, 16).replace('T', ' ') : '—';
    document.getElementById('tab-patterns-count').textContent = '(' + (s.total || 0) + ')';
  }

  if (uuRes.status === 'fulfilled' && uuRes.value.findings) renderUnknownUnknowns(uuRes.value.findings);
  else document.getElementById('unknown-unknowns-wrap').innerHTML = '<div class="error-msg">Failed to load.</div>';

  if (gdRes.status === 'fulfilled' && gdRes.value.findings) renderGoingDark(gdRes.value.findings);
  else document.getElementById('going-dark-wrap').innerHTML = '<div class="error-msg">Failed to load.</div>';

  if (leadRes.status === 'fulfilled' && leadRes.value.findings) renderLeadIndicators(leadRes.value.findings);
  else document.getElementById('lead-indicators-wrap').innerHTML = '<div class="error-msg">Failed to load.</div>';
}

function renderUnknownUnknowns(findings) {
  if (!findings.length) { document.getElementById('unknown-unknowns-wrap').innerHTML = '<div class="loading-msg">None at current threshold.</div>'; return; }
  let html = '<table class="threat-table"><thead><tr><th>#</th><th>Signal A</th><th>Signal B</th><th>r</th><th>n</th><th>Lag</th></tr></thead><tbody>';
  findings.forEach((f, i) => {
    const p = f.payload || {};
    const r = p.r != null ? p.r : (p.spearman_r != null ? p.spearman_r : 0);
    const absR = Math.abs(r);
    const color = absR >= 0.8 ? 'var(--critical)' : absR >= 0.65 ? 'var(--warning)' : 'var(--elevated)';
    const sigA = (p.sigA || p.signal_a || '').replace(/_/g, ' ');
    const sigB = (p.sigB || p.signal_b || '').replace(/_/g, ' ');
    html += '<tr><td style="font-family:var(--mono);font-size:0.72rem;color:var(--dim)">' + (i+1) + '</td>'
         + '<td><span class="country-name">' + sigA + '</span></td>'
         + '<td><span class="country-name">' + sigB + '</span></td>'
         + '<td><span class="score-num" style="color:' + color + '">' + r.toFixed(3) + '</span><div class="score-bar-wrap" style="margin-top:3px"><div class="score-bar"><div class="score-bar-fill" style="width:' + (absR*100) + '%;background:' + color + '"></div></div></div></td>'
         + '<td style="font-family:var(--mono);font-size:0.82rem">' + (p.n || '—') + '</td>'
         + '<td style="font-family:var(--mono);font-size:0.72rem;color:var(--dim)">' + (p.lag === 0 ? 'same-year' : (p.lag || 0) + 'y') + '</td></tr>';
  });
  html += '</tbody></table>';
  document.getElementById('unknown-unknowns-wrap').innerHTML = html;
}

function renderGoingDark(findings) {
  if (!findings.length) { document.getElementById('going-dark-wrap').innerHTML = '<div class="loading-msg">None surfaced.</div>'; return; }
  const filtered = findings.filter(f => f.payload && (f.payload.darkYears || 0) >= 2).sort((a,b) => (a.payload.scoreDelta||0)-(b.payload.scoreDelta||0)).slice(0, 60);
  let html = '<table class="threat-table"><thead><tr><th>#</th><th>Country</th><th>Signal</th><th>Dark Window</th><th>Years</th><th>Score Δ</th><th>Score at Return</th></tr></thead><tbody>';
  filtered.forEach((f, i) => {
    const p = f.payload || {};
    const delta = p.scoreDelta || 0;
    const dc = delta < -20 ? 'var(--critical)' : delta < -5 ? 'var(--warning)' : delta > 5 ? 'var(--stable)' : 'var(--dim)';
    const sig = (p.signal || '').replace(/_/g, ' ');
    html += '<tr><td style="font-family:var(--mono);font-size:0.72rem;color:var(--dim)">' + (i+1) + '</td>'
         + '<td><span class="country-name">' + (p.country || '—') + '</span></td>'
         + '<td><span class="signal-chip">' + sig + '</span></td>'
         + '<td style="font-family:var(--mono);font-size:0.78rem">' + p.darkStart + '—' + p.darkEnd + '</td>'
         + '<td style="font-family:var(--mono);font-size:0.82rem;font-weight:700">' + p.darkYears + 'y</td>'
         + '<td><span class="score-num" style="color:' + dc + '">' + (delta > 0 ? '+' : '') + delta.toFixed(1) + '</span></td>'
         + '<td style="font-family:var(--mono);font-size:0.78rem">' + (p.scoreAtReturn || 0).toFixed(1) + '</td></tr>';
  });
  html += '</tbody></table>';
  document.getElementById('going-dark-wrap').innerHTML = html;
}

function renderLeadIndicators(findings) {
  if (!findings.length) { document.getElementById('lead-indicators-wrap').innerHTML = '<div class="loading-msg">None surfaced.</div>'; return; }
  const byPair = {};
  findings.forEach(f => {
    const p = f.payload || {};
    const sigA = p.sigA || p.signal_a || p.signal;
    const sigB = p.sigB || p.signal_b;
    if (!sigA) return;
    const key = sigB ? sigA + '|' + sigB : sigA;
    const absR = Math.abs(p.r || 0);
    if (!byPair[key] || absR > Math.abs(byPair[key].payload.r || 0)) byPair[key] = f;
  });
  const pairs = Object.values(byPair).filter(f => Math.abs(f.payload.r || 0) >= 0.4).sort((a,b) => Math.abs(b.payload.r||0)-Math.abs(a.payload.r||0)).slice(0, 40);
  let html = '<table class="threat-table"><thead><tr><th>#</th><th>Predictor (Signal A)</th><th>Outcome (Signal B)</th><th>Best Lag</th><th>r</th><th>n</th></tr></thead><tbody>';
  pairs.forEach((f, i) => {
    const p = f.payload || {};
    const r = p.r || 0;
    const absR = Math.abs(r);
    const color = absR >= 0.7 ? 'var(--critical)' : absR >= 0.5 ? 'var(--warning)' : 'var(--elevated)';
    const sigA = (p.sigA || p.signal_a || p.signal || '').replace(/_/g, ' ');
    const sigB = (p.sigB || p.signal_b || 'convergence score').replace(/_/g, ' ');
    html += '<tr><td style="font-family:var(--mono);font-size:0.72rem;color:var(--dim)">' + (i+1) + '</td>'
         + '<td><span class="country-name">' + sigA + '</span></td>'
         + '<td><span class="country-name">' + sigB + '</span></td>'
         + '<td style="font-family:var(--mono);font-size:0.82rem;font-weight:700">' + (p.lag === 0 ? 'same-year' : (p.lag || 0) + 'y') + '</td>'
         + '<td><span class="score-num" style="color:' + color + '">' + r.toFixed(3) + '</span><div class="score-bar-wrap" style="margin-top:3px"><div class="score-bar"><div class="score-bar-fill" style="width:' + (absR*100) + '%;background:' + color + '"></div></div></div></td>'
         + '<td style="font-family:var(--mono);font-size:0.82rem">' + (p.n || '—') + '</td></tr>';
  });
  html += '</tbody></table>';
  document.getElementById('lead-indicators-wrap').innerHTML = html;
}
// ═══ END MINED PATTERNS LOADER ═══════════════════════════════════════════════

`;

// Inject before the `loadThreats();` call near the end
const bootMarker = 'loadThreats();';
const bootIdx = html.lastIndexOf(bootMarker);
if (bootIdx > 0) {
  html = html.slice(0, bootIdx) + newJS + '\n' + html.slice(bootIdx);
  console.log('[ok] loadPatterns + renderers injected');
} else {
  console.log('[error] could not find loadThreats(); boot marker');
  process.exit(1);
}

fs.writeFileSync(INTEL_FILE, html, 'utf8');
console.log('\n✅ Both files patched. Commit and push:');
console.log('   git add sabian_api.cjs dashboard/intel.html');
console.log('   git commit -m "feat: replace Extraction tab with live Mined Patterns + proof seal"');
console.log('   git push');
