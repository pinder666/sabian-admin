// historical/load_latent_findings.cjs
// Reads deep_pattern_findings_v2.json and inserts gated findings
// into latent_findings table.
// Gate: n >= 30 AND CI not crossing zero (where CI available)
// Run: node historical/load_latent_findings.cjs

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs   = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const raw      = fs.readFileSync(path.join(__dirname, 'deep_pattern_findings_v2.json'), 'utf8');
  const findings = JSON.parse(raw);
  const rows     = [];

  // allPairs — signal correlations (n on the pair itself)
  for (const f of (findings.allPairs || [])) {
    if (!f.n || f.n < 30) continue;
    rows.push({
      finding_type: 'signal_correlation',
      signal_a:     f.sigA,
      signal_b:     f.sigB,
      statistic:    `r=${f.r} lag=${f.lag}`,
      n:            f.n,
      ci_low:       null,
      ci_high:      null,
      query:        `allPairs sigA='${f.sigA}' sigB='${f.sigB}'`
    });
  }

  // bootstrap — same pairs but with CI bounds (n comes from allPairs match)
  for (const f of (findings.bootstrap || [])) {
    if (!f.ci) continue;
    const ci_low  = parseFloat(f.ci.lo95);
    const ci_high = parseFloat(f.ci.hi95);
    if (ci_low <= 0 && ci_high >= 0) continue; // CI crosses zero — skip
    const pair = (findings.allPairs || []).find(p => p.sigA === f.sigA && p.sigB === f.sigB);
    const n = pair ? pair.n : null;
    if (!n || n < 30) continue;
    rows.push({
      finding_type: 'bootstrap_correlation',
      signal_a:     f.sigA,
      signal_b:     f.sigB,
      statistic:    `r=${f.r} CI[${ci_low},${ci_high}]`,
      n:            n,
      ci_low:       ci_low,
      ci_high:      ci_high,
      query:        `bootstrap sigA='${f.sigA}' sigB='${f.sigB}'`
    });
  }

  // conditionalProb — lift findings
  for (const f of (findings.conditionalProb || [])) {
    if (!f.n_elevated || f.n_elevated < 30) continue;
    rows.push({
      finding_type: 'conditional_probability',
      signal_a:     f.signal,
      signal_b:     null,
      statistic:    `lift=${f.lift} P_elevated=${f.P_scoreHigh_given_sigElevated} P_base=${f.P_scoreHigh_given_sigBaseline}`,
      n:            f.n_elevated,
      ci_low:       null,
      ci_high:      null,
      query:        `conditionalProb signal='${f.signal}'`
    });
  }

  // asymmetry — no n field, use sentinel 1 (n column is NOT NULL)
  for (const f of (findings.asymmetry || [])) {
    rows.push({
      finding_type: 'asymmetry',
      signal_a:     f.signal,
      signal_b:     null,
      statistic:    `collapse=${f.avgCollapseYears}yr recovery=${f.avgRecoveryYears}yr ratio=${f.asymmetryRatio}`,
      n:            1,
      ci_low:       null,
      ci_high:      null,
      query:        `asymmetry signal='${f.signal}'`
    });
  }

  // firstMover — nested under firstMover.firstMovers[]
  for (const f of ((findings.firstMover || {}).firstMovers || [])) {
    if (!f.count || f.count < 30) continue;
    rows.push({
      finding_type: 'first_mover',
      signal_a:     f.signal,
      signal_b:     null,
      statistic:    `crossings=${f.count} pct=${f.pct}`,
      n:            f.count,
      ci_low:       null,
      ci_high:      null,
      query:        `firstMover signal='${f.signal}'`
    });
  }

  console.log(`Total gated findings to insert: ${rows.length}`);

  const CHUNK = 100;
  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await sb
      .from('latent_findings')
      .upsert(chunk, { ignoreDuplicates: false });
    if (error) console.error(`[ERROR chunk ${i}]`, error.message);
    else written += chunk.length;
  }

  console.log(`Inserted ${written} findings into latent_findings`);
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
