require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const JSON_PATH = path.join(__dirname, 'deep_pattern_findings_v2.json');
async function main() {
  if (!fs.existsSync(JSON_PATH)) { console.error('No findings file - run miner first.'); process.exit(1); }
  const f = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  const RUN_ID = f.meta?.generatedAt || new Date().toISOString();
  const rows = [];
  const push = (category, payload) => rows.push({ run_id: RUN_ID, category, payload });
  for (const p of (f.allPairs || [])) push('signal_correlation', p);
  for (const p of (f.extendedLags || [])) push('lead_indicator', p);
  for (const p of (f.signalToScore || [])) push('signal_to_score', p);
  for (const e of (f.goingDark?.events || [])) push('going_dark_event', e);
  for (const s of (f.goingDark?.bySignal || [])) push('going_dark_by_signal', s);
  for (const s of (f.goingDarkSequences || [])) push('going_dark_sequence', s);
  for (const c of (f.darkestCountries || [])) push('darkest_country', c);
  if (f.silenceVsScore) push('silence_vs_score', f.silenceVsScore);
  for (const c of (f.threeSigClusters || [])) push('three_signal_cluster', c);
  for (const p of (f.conditionalProb || [])) push('conditional_probability', p);
  for (const p of (f.coActivation || [])) push('co_activation', p);
  for (const [sig, d] of Object.entries(f.recoveryCurves || {})) push('recovery_curve', { signal: sig, ...d });
  for (const m of (f.firstMover?.firstMovers || [])) push('first_mover', m);
  for (const d of (f.regionalDivergence || [])) push('regional_divergence', d);
  for (const c of (f.compoundAmplification || [])) push('compound_amplification', c);
  for (const p of (f.unknownUnknowns || [])) push('unknown_unknown', p);
  for (const a of (f.asymmetry || [])) push('asymmetry', a);
  for (const s of (f.absenceAsSignal || [])) push('absence_as_signal', s);
  for (const b of (f.bootstrap || [])) push('bootstrap_ci', b);
  console.log(`Loading ${rows.length} findings (run ${RUN_ID})...`);
  const BATCH = 200; let written = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    let attempts = 0;
    while (attempts < 5) {
      try { const { error } = await sb.from('miner_findings').insert(chunk); if (error) throw error; break; }
      catch (err) { attempts++; if (attempts >= 5) { console.error('Chunk failed:', err.message); process.exit(1); } await new Promise(r => setTimeout(r, 1000 * attempts)); }
    }
    written += chunk.length; process.stdout.write(`\r  ${written}/${rows.length}`);
  }
  console.log(`\nDone. ${written} findings written.`);
}
main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
