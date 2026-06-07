// historical/script_cache.cjs
// Phase 2 Step 6 — The Script Cache.
//
// Reads synthesis_records and pre-generates structured narrative text per country.
// Each script is factual, grounded in data, and contains no prediction language.
// Sabian does not predict. It reads.
//
// Output per country:
//   headline        — one sentence: what this country's score position means
//   score_line      — score, baseline, delta, year
//   trajectory_line — direction and slope over the last 5 years
//   lead_lines      — one sentence per active leading indicator
//   dark_lines      — one sentence per going-dark signal
//   analog_line     — top historical analog, if any
//   full_script     — all lines assembled into a single readable block
//
// Written to synthesis_scripts (upsert on country, as_of_year).
// Feeds Phase 3 Paperclip without re-computation at serve time.
//
// Usage: node historical/script_cache.cjs
//        node historical/script_cache.cjs --country Mali

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const { logToHive } = require('../logger.cjs');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// ── Table check ───────────────────────────────────────────────────────────────

async function checkTable() {
  const { error } = await sb.from('synthesis_scripts').select('*').limit(1);
  if (error) {
    console.error('\n❌ Missing table: synthesis_scripts');
    console.error('  Run: historical/MIGRATION_SCRIPT_CACHE.sql in Supabase SQL editor');
    console.error('  https://supabase.com/dashboard/project/qdxgcyawpqxhhjprqyas/sql\n');
    process.exit(1);
  }
}

// ── Load synthesis records ────────────────────────────────────────────────────

async function loadSynthesisRecords(targetCountry) {
  const out = [];
  let page = 0;
  process.stdout.write('  Loading synthesis records .');

  while (true) {
    let query = sb
      .from('synthesis_records')
      .select('*')
      .range(page * 1000, (page + 1) * 1000 - 1);

    if (targetCountry) query = query.eq('country', targetCountry);

    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < 1000) break;
    page++;
    if (page % 5 === 0) process.stdout.write('.');
  }

  console.log(` ${out.length} records loaded.`);
  return out;
}

// ── Narrative builders ────────────────────────────────────────────────────────

function riskBand(score) {
  if (score >= 75) return 'critical stress';
  if (score >= 60) return 'elevated stress';
  if (score >= 45) return 'moderate stress';
  if (score >= 35) return 'low stress';
  return 'minimal stress';
}

function buildHeadline(r) {
  const band = riskBand(r.current_score);
  const delta = r.score_delta;
  const dir = delta > 3 ? 'above' : delta < -3 ? 'below' : 'near';
  const absDelta = Math.abs(delta !== null ? delta : 0);

  if (delta === null) {
    return `${r.country} is reading at ${band} (${r.current_score.toFixed(1)}) as of ${r.as_of_year}.`;
  }
  if (Math.abs(delta) <= 3) {
    return `${r.country} is reading at ${band} (${r.current_score.toFixed(1)}) as of ${r.as_of_year}, near its historical baseline.`;
  }
  return `${r.country} is reading at ${band} (${r.current_score.toFixed(1)}) as of ${r.as_of_year}, ${absDelta.toFixed(1)} points ${dir} its historical baseline.`;
}

function buildScoreLine(r) {
  const parts = [`Score: ${r.current_score.toFixed(1)}`];
  if (r.baseline_score !== null) parts.push(`baseline ${r.baseline_score.toFixed(1)}`);
  if (r.score_delta !== null) {
    const sign = r.score_delta >= 0 ? '+' : '';
    parts.push(`delta ${sign}${r.score_delta.toFixed(1)}`);
  }
  parts.push(`year ${r.as_of_year}`);
  if (r.signals_active) parts.push(`${r.signals_active} signals active`);
  return parts.join(' | ');
}

function buildTrajectoryLine(r) {
  if (r.trajectory === 'insufficient_data') {
    return `Trajectory: insufficient data.`;
  }
  const dir = r.trajectory === 'ascending'  ? 'rising'
            : r.trajectory === 'descending' ? 'falling'
            : 'stable';
  const slope = r.trajectory_slope !== null ? ` (${r.trajectory_slope > 0 ? '+' : ''}${r.trajectory_slope.toFixed(2)} pts/yr)` : '';
  return `Trajectory: stress has been ${dir} over the past 5 years${slope}.`;
}

function buildLeadLines(r) {
  const leads = r.active_leads || [];
  if (leads.length === 0) return [];
  return leads.map(l => {
    const dir = l.direction === 'elevated' ? 'elevated' : 'suppressed';
    const corr = l.correlation ? ` (r=${l.correlation.toFixed(2)})` : '';
    return `${l.signal} is ${dir} (z=${l.stress_z.toFixed(2)}) and historically leads ${l.leads} by ${l.lag_years} year${l.lag_years !== 1 ? 's' : ''}${corr}.`;
  });
}

function buildDarkLines(r) {
  const darks = r.dark_signals || [];
  if (darks.length === 0) return [];
  return darks.map(d => {
    if (!d.patterns || d.patterns.length === 0) {
      return `${d.signal} reporting has gone dark as of ${d.went_dark_at}.`;
    }
    const top = d.patterns[0];
    const pct = top.spike_pct ? ` — historically precedes a ${top.spike_pct.toFixed(0)}% stress spike within ${top.lag} year${top.lag !== 1 ? 's' : ''}` : '';
    return `${d.signal} reporting has gone dark as of ${d.went_dark_at}${pct}.`;
  });
}

function buildAnalogLine(r) {
  const analogs = r.top_analogs || [];
  if (analogs.length === 0) return null;
  const top = analogs[0];
  const diff = top.score_diff !== undefined ? ` (Δ${top.score_diff.toFixed(1)} pts, ${top.shared_signals} shared signals)` : '';
  return `Closest historical analog: ${top.country} ${top.year} at ${top.score.toFixed(1)}${diff}.`;
}

function buildFullScript(r, headline, scoreLine, trajectoryLine, leadLines, darkLines, analogLine) {
  const parts = [headline, '', scoreLine, trajectoryLine];

  if (leadLines.length > 0) {
    parts.push('');
    parts.push('Active leading indicators:');
    for (const l of leadLines) parts.push(`  • ${l}`);
  }

  if (darkLines.length > 0) {
    parts.push('');
    parts.push('Going-dark signals:');
    for (const d of darkLines) parts.push(`  • ${d}`);
  }

  if (analogLine) {
    parts.push('');
    parts.push(analogLine);
  }

  return parts.join('\n');
}

// ── Generate one script ───────────────────────────────────────────────────────

function generateScript(r) {
  const headline       = buildHeadline(r);
  const scoreLine      = buildScoreLine(r);
  const trajectoryLine = buildTrajectoryLine(r);
  const leadLines      = buildLeadLines(r);
  const darkLines      = buildDarkLines(r);
  const analogLine     = buildAnalogLine(r);
  const fullScript     = buildFullScript(r, headline, scoreLine, trajectoryLine, leadLines, darkLines, analogLine);

  return {
    country:         r.country,
    as_of_year:      r.as_of_year,
    headline,
    score_line:      scoreLine,
    trajectory_line: trajectoryLine,
    lead_lines:      leadLines,
    dark_lines:      darkLines,
    analog_line:     analogLine,
    full_script:     fullScript,
    signal_count:    r.signals_active || 0,
    generated_at:    new Date().toISOString(),
  };
}

// ── Write ─────────────────────────────────────────────────────────────────────

async function writeScripts(rows) {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb
      .from('synthesis_scripts')
      .upsert(rows.slice(i, i + 500), { onConflict: 'country,as_of_year' });
    if (error) throw error;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const targetCountry = args.includes('--country') ? args[args.indexOf('--country') + 1] : null;

  console.log('\n🛰️  Phase 2 Step 6 — The Script Cache');
  console.log('   Pre-generating structured narrative from synthesis records.\n');

  await checkTable();

  const records = await loadSynthesisRecords(targetCountry);
  if (records.length === 0) {
    console.error('  No synthesis records found. Run the synthesizer first.');
    process.exit(1);
  }

  console.log(`\n  Generating scripts for ${records.length} countries...\n`);

  const scripts = records.map(generateScript);

  // Print sample
  const sample = scripts.find(s => s.country === (targetCountry || 'Mali')) || scripts[0];
  if (sample) {
    console.log('  ── Sample script ──────────────────────────────────────────────');
    console.log(sample.full_script.split('\n').map(l => `  ${l}`).join('\n'));
    console.log('  ───────────────────────────────────────────────────────────────\n');
  }

  // Stats
  const withLeads = scripts.filter(s => s.lead_lines.length > 0).length;
  const withDark  = scripts.filter(s => s.dark_lines.length > 0).length;
  const withAnalog = scripts.filter(s => s.analog_line !== null).length;

  console.log(`  Scripts with active lead indicators: ${withLeads}`);
  console.log(`  Scripts with going-dark alerts:      ${withDark}`);
  console.log(`  Scripts with historical analogs:     ${withAnalog}\n`);

  console.log('  Writing to Supabase...');
  await writeScripts(scripts);
  console.log(`  synthesis_scripts: ${scripts.length} rows written.\n`);

  logToHive({
    source: 'script_cache',
    level: 'intel',
    event: 'script_cache_complete',
    data: { countries: scripts.length, with_leads: withLeads, with_dark: withDark, with_analogs: withAnalog },
  });

  console.log('═'.repeat(60));
  console.log('✅ Phase 2 Step 6 — Script cache complete.');
  console.log(`   Scripts generated: ${scripts.length}`);
  console.log(`   Active leads:      ${withLeads} countries`);
  console.log(`   Dark signals:      ${withDark} countries`);
  console.log(`   Analogs found:     ${withAnalog} countries`);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
