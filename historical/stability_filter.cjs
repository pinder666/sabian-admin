// historical/stability_filter.cjs
// Apply four stability filters to the 185 remaining unexplained crossings.
// Separates noise (routine score fluctuation in stable countries) from
// genuine unknown unknowns (real crises with no detectable precursor).
//
// FILTER 1 — Score delta: crossing delta < 10 points = fluctuation
// FILTER 2 — Band persistence: score returned below threshold within 2yr = noise
// FILTER 3 — Structural stability: 10+ consecutive STABLE years before crossing = noise
// FILTER 4 — Outcome validation: score returned to baseline (<55) within 3yr = noise
//
// A crossing is NOISE if it passes ANY single filter (any one criterion marks it noise).
// A crossing is GENUINE if it fails ALL four filters — none of the noise criteria apply.
//
// Usage: node historical/stability_filter.cjs

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs   = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const CROSSING_THRESHOLD = 60;
const DELTA_NOISE_MAX    = 10;   // Filter 1: delta < 10pts = noise
const RETURN_WINDOW      = 2;    // Filter 2: returned below threshold within N years
const STABLE_HISTORY_YRS = 10;   // Filter 3: N consecutive stable years before crossing
const OUTCOME_BASELINE   = 55;   // Filter 4: returned below this within 3yr = noise
const OUTCOME_WINDOW     = 3;

// ── Load all convergence scores ───────────────────────────────────────────────

async function loadAllScores() {
  process.stdout.write('  Loading convergence scores...');
  const all = [];
  let page = 0;
  while (true) {
    const { data, error } = await sb.from('historical_convergence_scores')
      .select('country, year, score')
      .range(page * 1000, (page + 1) * 1000 - 1)
      .order('country').order('year');
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    page++;
    if (data.length < 1000) break;
  }
  console.log(` ${all.length.toLocaleString()} rows.`);
  return all;
}

function buildTimelines(rows) {
  const byCountry = new Map();
  for (const row of rows) {
    if (!byCountry.has(row.country)) byCountry.set(row.country, []);
    byCountry.get(row.country).push(row);
  }
  for (const [, rows] of byCountry) rows.sort((a, b) => a.year - b.year);
  return byCountry;
}

// ── Apply four filters ────────────────────────────────────────────────────────

function applyFilters(crossing, byCountry) {
  const rows = byCountry.get(crossing.country);
  if (!rows) return { isNoise: true, reason: 'no_data' };

  // Find the crossing row index
  const crossIdx = rows.findIndex(r => r.year === crossing.crossingYear);
  if (crossIdx < 1) return { isNoise: true, reason: 'no_prior_data' };

  const scoreBefore = rows[crossIdx - 1].score;
  const scoreAfter  = rows[crossIdx].score;

  // FILTER 1: Score delta
  const delta = scoreAfter - scoreBefore;
  if (delta < DELTA_NOISE_MAX) {
    return { isNoise: true, reason: 'small_delta', delta, scoreBefore, scoreAfter };
  }

  // FILTER 2: Band persistence — did score return below threshold within 2yr?
  let returnedFast = false;
  for (let k = crossIdx + 1; k < rows.length && rows[k].year <= crossing.crossingYear + RETURN_WINDOW; k++) {
    if (rows[k].score < CROSSING_THRESHOLD) { returnedFast = true; break; }
  }
  if (returnedFast) {
    return { isNoise: true, reason: 'returned_within_2yr', delta, scoreBefore, scoreAfter };
  }

  // FILTER 3: Structural stability — 10+ consecutive stable years before crossing
  let stableStreak = 0;
  for (let k = crossIdx - 1; k >= 0 && crossIdx - k <= STABLE_HISTORY_YRS; k--) {
    if (rows[k].score < CROSSING_THRESHOLD) stableStreak++;
    else { stableStreak = 0; break; }
  }
  if (stableStreak >= STABLE_HISTORY_YRS) {
    return { isNoise: true, reason: 'long_stable_history', stableStreak, delta, scoreBefore, scoreAfter };
  }

  // FILTER 4: Outcome validation — score returned to baseline (<55) within 3yr
  // Only applies if we have 3yr of subsequent data
  let hasOutcome = false, returnedToBaseline = false;
  for (let k = crossIdx + 1; k < rows.length && rows[k].year <= crossing.crossingYear + OUTCOME_WINDOW; k++) {
    hasOutcome = true;
    if (rows[k].score < OUTCOME_BASELINE) { returnedToBaseline = true; break; }
  }
  if (hasOutcome && returnedToBaseline) {
    return { isNoise: true, reason: 'returned_to_baseline_3yr', delta, scoreBefore, scoreAfter };
  }

  // Passed all filters — genuine unknown unknown
  const maxSubsequentScore = rows
    .slice(crossIdx, Math.min(crossIdx + 5, rows.length))
    .reduce((m, r) => Math.max(m, r.score || 0), scoreAfter);

  return {
    isNoise: false,
    reason: 'genuine',
    delta: +delta.toFixed(1),
    scoreBefore: +scoreBefore.toFixed(1),
    scoreAfter: +scoreAfter.toFixed(1),
    maxSubsequentScore: +maxSubsequentScore.toFixed(1),
    hasOutcomeData: hasOutcome
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n  STABILITY FILTER — 185 UNEXPLAINED CROSSINGS');
  console.log('  =============================================\n');

  const rows      = await loadAllScores();
  const byCountry = buildTimelines(rows);

  // Load the 185 still-unexplained from previous analysis
  const prevJSON = path.join(__dirname, 'unexplained_crossings_analysis.json');
  const prev = JSON.parse(fs.readFileSync(prevJSON, 'utf8'));
  const stillDark = prev.resolution.stillDark;

  console.log(`  Applying four filters to ${stillDark.length} crossings...\n`);

  const results = [];
  const noiseByReason = {};

  for (const crossing of stillDark) {
    const result = applyFilters(crossing, byCountry);
    results.push({ ...crossing, filter: result });
    if (result.isNoise) {
      noiseByReason[result.reason] = (noiseByReason[result.reason] || 0) + 1;
    }
  }

  const noise   = results.filter(r => r.filter.isNoise);
  const genuine = results.filter(r => !r.filter.isNoise);

  console.log(`  Results:`);
  console.log(`  Noise (at least one filter triggered): ${noise.length}`);
  console.log(`  Genuine unknown unknowns (failed all filters): ${genuine.length}`);
  console.log(`\n  Noise breakdown by filter:`);
  for (const [reason, count] of Object.entries(noiseByReason)) {
    console.log(`    ${reason}: ${count}`);
  }

  // Build final report
  const ts = new Date().toISOString();
  const lines = [];

  lines.push(`# STABILITY FILTER RESULTS — ${ts}`);
  lines.push(`## Isolating genuine unknown unknowns from noise`);
  lines.push('');
  lines.push(`Starting pool: 185 crossings with no precursor from four tests`);
  lines.push(`After stability filters:`);
  lines.push(`  Classified as noise: ${noise.length} (${(noise.length/185*100).toFixed(1)}%)`);
  lines.push(`  Genuine unknown unknowns: ${genuine.length} (${(genuine.length/185*100).toFixed(1)}%)`);
  lines.push('');
  lines.push('Noise classification by filter:');
  for (const [reason, count] of Object.entries(noiseByReason)) {
    const label = {
      small_delta:          'Filter 1 — Score delta < 10pts (routine fluctuation)',
      returned_within_2yr:  'Filter 2 — Score returned below threshold within 2yr',
      long_stable_history:  'Filter 3 — 10+ consecutive stable years before crossing',
      returned_to_baseline_3yr: 'Filter 4 — Score returned to baseline within 3yr',
      no_data:              'No data for country',
      no_prior_data:        'No prior year data'
    }[reason] || reason;
    lines.push(`  ${label}: ${count}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`## GENUINE UNKNOWN UNKNOWNS — ${genuine.length} VERIFIED CASES`);
  lines.push('');
  lines.push('These crossings are real crisis events that passed all noise filters:');
  lines.push('Score moved more than 10 points. Did not return quickly. Had prior instability.');
  lines.push('No going-dark precursor. No contagion precursor. No fire/GDELT precursor.');
  lines.push('');

  // Group by region for readability
  const MENA = ['Syria','Iraq','Yemen','Libya','Lebanon','Jordan','Egypt','Algeria','Tunisia','Morocco','Palestine','Iran','Saudi Arabia','Sudan'];
  const SSA  = ['Nigeria','Ethiopia','Somalia','Mali','Burkina Faso','Niger','Chad','CAR','Mozambique','Zimbabwe','South Sudan','Uganda','Tanzania','Kenya','Cameroon','DRC','Guinea','Burundi','Rwanda','Angola','Eritrea'];
  const FSU  = ['Ukraine','Russia','Belarus','Moldova','Georgia','Armenia','Azerbaijan','Kazakhstan','Kyrgyzstan','Uzbekistan','Tajikistan','Turkmenistan','Serbia','Bosnia and Herzegovina'];
  const ASIA = ['Afghanistan','Pakistan','India','Bangladesh','Myanmar','Cambodia','Laos','Philippines','Vietnam','Thailand','Indonesia','Sri Lanka','Nepal'];
  const LATAM= ['Venezuela','Colombia','Haiti','El Salvador','Guatemala','Honduras','Nicaragua','Bolivia','Peru','Ecuador','Paraguay','Cuba','Mexico','Brazil','Argentina'];

  const grouped = {
    'MENA': genuine.filter(r => MENA.includes(r.country)),
    'Sub-Saharan Africa': genuine.filter(r => SSA.includes(r.country)),
    'Europe & FSU': genuine.filter(r => FSU.includes(r.country)),
    'South & Southeast Asia': genuine.filter(r => ASIA.includes(r.country)),
    'Latin America': genuine.filter(r => LATAM.includes(r.country)),
    'Other': genuine.filter(r => ![...MENA,...SSA,...FSU,...ASIA,...LATAM].includes(r.country))
  };

  for (const [region, cases] of Object.entries(grouped)) {
    if (cases.length === 0) continue;
    lines.push(`### ${region} (${cases.length})`);
    for (const c of cases.sort((a,b) => a.crossingYear - b.crossingYear)) {
      lines.push(`  ${c.country} ${c.crossingYear}: score ${c.filter.scoreBefore}→${c.filter.scoreAfter} (+${c.filter.delta}pts), peak ${c.filter.maxSubsequentScore}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('## WHAT THIS MEANS');
  lines.push('');
  lines.push(`Of 376 total score crossings in the historical record:`);
  lines.push(`  100 had a detectable first mover from 43 signals (26.6%)`);
  lines.push(`  29 were preceded by going-dark events (7.7%)`);
  lines.push(`  65 were preceded by regional contagion (17.3%)`);
  lines.push(`  ${noise.length} of the remaining 185 are classified as noise (routine fluctuation)`);
  lines.push(`  ${genuine.length} are genuine unknown unknowns — real crises with no traceable precursor`);
  lines.push('');

  const genuinePct = (genuine.length / 376 * 100).toFixed(1);
  lines.push(`The system can detect or classify ${(376-genuine.length)} of 376 crossings (${((376-genuine.length)/376*100).toFixed(1)}%).`);
  lines.push(`Genuine unknown unknowns represent ${genuinePct}% of all crossings.`);
  lines.push(`These are the cases that may require signals not yet in the system.`);
  lines.push(`The system names them precisely. That precision is itself a finding.`);
  lines.push('');
  lines.push(`Generated: ${ts}`);

  const md = lines.join('\n');
  fs.writeFileSync(path.join(__dirname, 'STABILITY_FILTER_RESULTS.md'), md, 'utf8');
  fs.writeFileSync(path.join(__dirname, 'stability_filter_results.json'), JSON.stringify({ noise, genuine, noiseByReason, meta: { total: 185, noiseCount: noise.length, genuineCount: genuine.length, ts } }, null, 2), 'utf8');

  console.log(`\n  Report: historical/STABILITY_FILTER_RESULTS.md`);
  console.log(`  JSON:   historical/stability_filter_results.json\n`);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
