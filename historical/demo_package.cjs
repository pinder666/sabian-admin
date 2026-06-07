// historical/demo_package.cjs
// Sabian Demo Asset Package Builder
// Usage: node historical/demo_package.cjs "Yemen"
//        node historical/demo_package.cjs "Yemen" --dashboard https://your-domain.com/terminal
//
// Output: data/demo/{country-slug}/
//   ├── dossier.pdf              — full 12-page intelligence dossier
//   ├── audio/                   — Host A + Sabian voice segments (mp3)
//   ├── package_manifest.json    — metadata, links, score, generated at
//   └── delivery.html            — branded one-page buyer delivery page

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs   = require('fs');
const path = require('path');

const { generateDossier, generateDossierPDF } = require('./dossier_generator.cjs');
const { generateDossierAudio }                = require('./dossier_audio.cjs');

// ── Parse args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const country = args.find(a => !a.startsWith('--'));
const dashIdx = args.indexOf('--dashboard');
const customDashboard = dashIdx !== -1 ? args[dashIdx + 1] : null;

if (!country) {
  console.error('Usage: node historical/demo_package.cjs "Country Name"');
  process.exit(1);
}

const DASHBOARD_BASE = customDashboard
  || process.env.DASHBOARD_URL
  || 'https://sabian-production.up.railway.app/terminal';

const LEDGER_BASE = process.env.LEDGER_URL
  || 'https://sabian-production.up.railway.app/ledger';

// ── Output paths ──────────────────────────────────────────────────────────────

const countrySlug = country.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
const OUTPUT_ROOT  = path.join(__dirname, '../data/demo', countrySlug);
const AUDIO_DIR    = path.join(OUTPUT_ROOT, 'audio');
const PDF_PATH     = path.join(OUTPUT_ROOT, 'dossier.pdf');
const MANIFEST_PATH = path.join(OUTPUT_ROOT, 'package_manifest.json');
const DELIVERY_PATH = path.join(OUTPUT_ROOT, 'delivery.html');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

// ── Delivery HTML ─────────────────────────────────────────────────────────────

function buildDeliveryHTML(meta) {
  const riskColor = {
    'CRITICAL': '#ff3333',
    'HIGH':     '#ff6600',
    'ELEVATED': '#00b8d4',
    'MODERATE': '#888888',
    'STABLE':   '#00e676'
  }[meta.riskBand] || '#888888';

  const audioItems = meta.audioSegments.map((seg, i) =>
    `<li class="audio-item">
      <span class="speaker ${seg.speaker}">${seg.speaker === 'host_a' ? 'HOST A' : 'SABIAN'}</span>
      <audio controls src="audio/${path.basename(seg.path)}"></audio>
    </li>`
  ).join('\n');

  const signalRows = (meta.topSignals || []).map(s =>
    `<tr><td>${s.signal.replace(/_/g, ' ')}</td><td class="val">${s.z.toFixed(2)}</td></tr>`
  ).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sabian Intelligence — ${meta.country}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #060a14;
    color: #c8d8e8;
    font-family: 'Courier New', monospace;
    font-size: 14px;
    min-height: 100vh;
    padding: 40px 20px;
  }
  .container { max-width: 860px; margin: 0 auto; }

  .header {
    border-bottom: 1px solid #1a2840;
    padding-bottom: 24px;
    margin-bottom: 32px;
  }
  .brand {
    font-size: 11px;
    letter-spacing: 4px;
    color: #00b8d4;
    text-transform: uppercase;
    margin-bottom: 8px;
  }
  .country-name {
    font-size: 36px;
    font-family: 'Courier New', monospace;
    font-weight: bold;
    color: #e8f0f8;
    letter-spacing: 2px;
    text-transform: uppercase;
  }
  .meta-row {
    display: flex;
    gap: 32px;
    margin-top: 16px;
    font-size: 12px;
    color: #667788;
  }
  .meta-row span { color: #c8d8e8; }

  .score-block {
    display: inline-flex;
    align-items: center;
    gap: 16px;
    background: #0c1424;
    border: 1px solid #1a2840;
    border-left: 3px solid ${riskColor};
    padding: 16px 24px;
    margin-bottom: 32px;
  }
  .score-num {
    font-size: 48px;
    font-weight: bold;
    color: ${riskColor};
    line-height: 1;
  }
  .score-label { font-size: 11px; color: #667788; letter-spacing: 2px; }
  .risk-band {
    font-size: 13px;
    color: ${riskColor};
    letter-spacing: 3px;
    font-weight: bold;
  }

  .section {
    margin-bottom: 32px;
  }
  .section-title {
    font-size: 10px;
    letter-spacing: 3px;
    text-transform: uppercase;
    color: #00b8d4;
    border-bottom: 1px solid #1a2840;
    padding-bottom: 6px;
    margin-bottom: 16px;
  }

  .insight-text {
    color: #a0b4c8;
    line-height: 1.8;
    font-size: 13px;
  }

  table { width: 100%; border-collapse: collapse; }
  td { padding: 6px 8px; border-bottom: 1px solid #0c1424; font-size: 12px; }
  td.val { text-align: right; color: #00b8d4; font-weight: bold; }

  .btn-row { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 32px; }
  .btn {
    display: inline-block;
    padding: 10px 20px;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    letter-spacing: 2px;
    text-transform: uppercase;
    text-decoration: none;
    border: 1px solid;
    cursor: pointer;
    transition: all 0.15s;
  }
  .btn-primary { color: #00b8d4; border-color: #00b8d4; background: transparent; }
  .btn-primary:hover { background: #00b8d4; color: #060a14; }
  .btn-secondary { color: #667788; border-color: #1a2840; background: transparent; }
  .btn-secondary:hover { border-color: #667788; color: #c8d8e8; }
  .btn-doc { color: #e8a030; border-color: #e8a030; background: transparent; }
  .btn-doc:hover { background: #e8a030; color: #060a14; }

  .audio-list { list-style: none; }
  .audio-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 0;
    border-bottom: 1px solid #0c1424;
  }
  .speaker {
    font-size: 10px;
    letter-spacing: 2px;
    padding: 2px 8px;
    border: 1px solid;
    min-width: 70px;
    text-align: center;
  }
  .speaker.host_a { color: #00b8d4; border-color: #00b8d4; }
  .speaker.sabian { color: #00e676; border-color: #00e676; }
  audio { flex: 1; height: 32px; filter: invert(1) sepia(1) saturate(2) hue-rotate(180deg); }

  .footer {
    margin-top: 48px;
    padding-top: 16px;
    border-top: 1px solid #1a2840;
    font-size: 10px;
    color: #334455;
    letter-spacing: 1px;
  }
  .pulse {
    display: inline-block;
    width: 8px; height: 8px;
    background: #00e676;
    border-radius: 50%;
    margin-right: 6px;
    animation: pulse 2s infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }
</style>
</head>
<body>
<div class="container">

  <div class="header">
    <div class="brand">Sabian Intelligence Terminal · Country Risk Package</div>
    <div class="country-name">${meta.country}</div>
    <div class="meta-row">
      <div>Generated <span>${new Date(meta.generatedAt).toUTCString()}</span></div>
      <div>Classification <span>BUYER</span></div>
      <div>Depth <span>${meta.signalCount || 43} signals · 65yr historical</span></div>
    </div>
  </div>

  <div class="score-block">
    <div>
      <div class="score-label">Convergence Score</div>
      <div class="score-num">${meta.score ?? '—'}</div>
    </div>
    <div>
      <div class="score-label">Risk Band</div>
      <div class="risk-band">${meta.riskBand || '—'}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Quick Access</div>
    <div class="btn-row">
      <a class="btn btn-primary" href="${DASHBOARD_BASE}#sabian.country.${countrySlug}" target="_blank">
        Open Terminal
      </a>
      <a class="btn btn-doc" href="dossier.pdf" target="_blank">
        Download Dossier PDF
      </a>
      <a class="btn btn-secondary" href="${LEDGER_BASE}?country=${encodeURIComponent(meta.country)}" target="_blank">
        View Observation Ledger
      </a>
    </div>
  </div>

  ${meta.insight ? `
  <div class="section">
    <div class="section-title">Sabian Insight</div>
    <div class="insight-text">${meta.insight.replace(/\n/g, '<br>')}</div>
  </div>` : ''}

  ${signalRows ? `
  <div class="section">
    <div class="section-title">Top Active Signals (Stress Z-Score)</div>
    <table>
      <tbody>${signalRows}</tbody>
    </table>
  </div>` : ''}

  ${audioItems ? `
  <div class="section">
    <div class="section-title">Audio Intelligence Briefing</div>
    <ul class="audio-list">
      ${audioItems}
    </ul>
  </div>` : `
  <div class="section">
    <div class="section-title">Audio Intelligence Briefing</div>
    <div style="color:#667788; font-size:12px;">Audio segments not available — ElevenLabs key required.</div>
  </div>`}

  <div class="footer">
    <span class="pulse"></span>
    Sabian Intelligence Terminal · sabian.ai · Every sentence traces to data. ·
    Package generated ${new Date(meta.generatedAt).toUTCString()}
  </div>

</div>
</body>
</html>`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function buildDemoPackage(countryName) {
  console.log(`\n[DEMO_PACKAGE] Building package for: ${countryName}`);
  console.log(`[DEMO_PACKAGE] Output: ${OUTPUT_ROOT}\n`);

  ensureDir(OUTPUT_ROOT);
  ensureDir(AUDIO_DIR);

  // ── 1. Generate dossier ───────────────────────────────────────────────────

  console.log('[1/4] Generating intelligence dossier...');
  let dossier;
  try {
    dossier = await generateDossier(countryName);
    console.log(`      Score: ${dossier.pages?.[1]?.content?.score}  Band: ${dossier.pages?.[1]?.content?.riskBand}`);
  } catch (err) {
    console.error(`      FAILED: ${err.message}`);
    process.exit(1);
  }

  // ── 2. Generate PDF ───────────────────────────────────────────────────────

  console.log('[2/4] Generating PDF dossier...');
  let pdfResult;
  try {
    pdfResult = await generateDossierPDF(countryName, PDF_PATH);
    console.log(`      Saved: ${PDF_PATH}`);
  } catch (err) {
    console.error(`      FAILED: ${err.message}`);
    // Non-fatal — continue without PDF
    pdfResult = null;
  }

  // ── 3. Generate audio ─────────────────────────────────────────────────────

  console.log('[3/4] Generating audio briefing...');
  let audioResult = null;
  const audioScript = dossier?.insight?.audioScript;

  if (audioScript?.segments?.length) {
    try {
      const rawAudioResult = await generateDossierAudio(countryName, audioScript);

      if (rawAudioResult?.segments?.length) {
        // Copy successful segments to our audio/ dir
        const copiedSegments = [];
        for (const seg of rawAudioResult.segments) {
          if (seg.success && seg.path && fs.existsSync(seg.path)) {
            const destFile = path.join(AUDIO_DIR, path.basename(seg.path));
            fs.copyFileSync(seg.path, destFile);
            copiedSegments.push({ ...seg, path: destFile });
          }
        }
        audioResult = { ...rawAudioResult, segments: copiedSegments };
        const ok = copiedSegments.length;
        const fail = (rawAudioResult.segments.length) - ok;
        console.log(`      ${ok} segments saved${fail > 0 ? `, ${fail} failed` : ''}`);
      } else {
        console.log('      No audio segments generated (check ElevenLabs key)');
      }
    } catch (err) {
      console.log(`      Audio skipped: ${err.message}`);
    }
  } else {
    console.log('      No audio script in dossier — skipping audio');
  }

  // ── 4. Write manifest + delivery page ────────────────────────────────────

  console.log('[4/4] Writing manifest and delivery page...');

  const page1 = dossier.pages?.[1]?.content || {};
  const topSignals = Object.entries(dossier.pages?.[1]?.content?.breakdown || {})
    .map(([signal, val]) => ({
      signal,
      z: typeof val === 'object' ? (val.stress_z || 0) : val
    }))
    .filter(s => s.z > 0)
    .sort((a, b) => b.z - a.z)
    .slice(0, 8);

  const manifest = {
    country:       countryName,
    countrySlug,
    generatedAt:   new Date().toISOString(),
    score:         page1.score ?? null,
    riskBand:      page1.riskBand ?? null,
    signalCount:   43,
    insight:       dossier.insight?.narrative ?? null,
    topSignals,
    audioSegments: audioResult?.segments?.map(s => ({
      speaker: s.speaker,
      path:    path.relative(OUTPUT_ROOT, s.path)
    })) || [],
    assets: {
      pdf:      pdfResult ? 'dossier.pdf' : null,
      audio:    audioResult?.segments?.length ? 'audio/' : null,
      delivery: 'delivery.html'
    },
    links: {
      terminal: `${DASHBOARD_BASE}`,
      ledger:   `${LEDGER_BASE}?country=${encodeURIComponent(countryName)}`
    }
  };

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

  // Build delivery HTML with audio segment paths relative to OUTPUT_ROOT
  const htmlMeta = {
    ...manifest,
    audioSegments: audioResult?.segments?.map(s => ({
      speaker: s.speaker,
      path:    path.relative(OUTPUT_ROOT, s.path)
    })) || []
  };

  fs.writeFileSync(DELIVERY_PATH, buildDeliveryHTML(htmlMeta));

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log('\n── PACKAGE COMPLETE ─────────────────────────────────────');
  console.log(`   Country:      ${countryName}`);
  console.log(`   Score:        ${manifest.score ?? 'N/A'}`);
  console.log(`   Risk band:    ${manifest.riskBand ?? 'N/A'}`);
  console.log(`   PDF:          ${pdfResult ? 'YES' : 'NO'}`);
  console.log(`   Audio:        ${manifest.audioSegments.length} segments`);
  console.log(`   Folder:       ${OUTPUT_ROOT}`);
  console.log(`   Delivery:     ${DELIVERY_PATH}`);
  console.log('─────────────────────────────────────────────────────────\n');

  return manifest;
}

// ── Run ───────────────────────────────────────────────────────────────────────

buildDemoPackage(country).catch(err => {
  console.error('[DEMO_PACKAGE] Fatal:', err.message);
  process.exit(1);
});
