// historical/paperclip.cjs
// Phase 3 Step 7 — Paperclip.
//
// Assembles synthesis_scripts into formatted intelligence briefings.
// One template, one vertical (sabian) for now. Other verticals added later.
// Pure deterministic assembly — no LLM, no new analysis.
// Every sentence traces directly to a number in the data.
//
// Reads:  synthesis_scripts, hive_observations (for data integrity flags)
// Writes: country_briefings
//
// Usage: node historical/paperclip.cjs
//        node historical/paperclip.cjs --country Mali

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const { logToHive } = require('../logger.cjs');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const VERTICAL = 'sabian';

// ── Table check ───────────────────────────────────────────────────────────────

async function checkTable() {
  const { error } = await sb.from('country_briefings').select('*').limit(1);
  if (error) {
    console.error('\n❌ Missing table: country_briefings');
    console.error('  Run: historical/MIGRATION_BRIEFINGS.sql in Supabase SQL editor');
    console.error('  https://supabase.com/dashboard/project/qdxgcyawpqxhhjprqyas/sql\n');
    process.exit(1);
  }
}

// ── Load scripts ──────────────────────────────────────────────────────────────

async function loadScripts(targetCountry) {
  const out = [];
  let page = 0;
  process.stdout.write('  Loading synthesis scripts .');

  while (true) {
    let q = sb.from('synthesis_scripts').select('*').range(page * 1000, (page + 1) * 1000 - 1);
    if (targetCountry) q = q.eq('country', targetCountry);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < 1000) break;
    page++;
    if (page % 5 === 0) process.stdout.write('.');
  }

  console.log(` ${out.length} loaded.`);
  return out;
}

// ── Load hive observations ────────────────────────────────────────────────────

async function loadHiveObservations() {
  const { data, error } = await sb.from('hive_observations').select('country,signal_key,severity,finding');
  if (error) {
    console.warn('  ⚠️  Could not load hive_observations — data integrity flags will be omitted.');
    return {};
  }
  // Index by country
  const out = {};
  for (const r of (data || [])) {
    if (!r.country) continue;
    if (!out[r.country]) out[r.country] = [];
    out[r.country].push(r);
  }
  return out;
}

// ── Risk band ─────────────────────────────────────────────────────────────────

function riskBand(score) {
  if (score >= 75) return 'CRITICAL';
  if (score >= 60) return 'ELEVATED';
  if (score >= 45) return 'MODERATE';
  if (score >= 35) return 'LOW';
  return 'MINIMAL';
}

// ── Assemble brief ────────────────────────────────────────────────────────────

function assembleBrief(script, hiveFlags) {
  const score = script.signal_count > 0 ? parseFloat(script.score_line?.match(/Score:\s*([\d.]+)/)?.[1] || '0') : 0;
  const band  = riskBand(score);
  const lines = [];

  lines.push('SABIAN INTELLIGENCE BRIEF');
  lines.push('─'.repeat(60));
  lines.push(`COUNTRY:  ${script.country}`);
  lines.push(`YEAR:     ${script.as_of_year}`);
  lines.push(`READING:  ${script.score_line || 'N/A'}`);
  lines.push(`BAND:     ${band}`);
  lines.push('─'.repeat(60));

  lines.push('');
  lines.push('SITUATION');
  lines.push(script.headline || '');

  lines.push('');
  lines.push('TRAJECTORY');
  lines.push(script.trajectory_line || '');

  const leads = script.lead_lines || [];
  if (leads.length > 0) {
    lines.push('');
    lines.push('SIGNAL INTELLIGENCE — ACTIVE LEADS');
    for (const l of leads) lines.push(`  • ${l}`);
  }

  const darks = script.dark_lines || [];
  if (darks.length > 0) {
    lines.push('');
    lines.push('SIGNAL INTELLIGENCE — GOING DARK');
    for (const d of darks) lines.push(`  • ${d}`);
  }

  if (script.analog_line) {
    lines.push('');
    lines.push('HISTORICAL CONTEXT');
    lines.push(`  ${script.analog_line}`);
  }

  // Data integrity — hive flags for this country
  const flags = hiveFlags[script.country] || [];
  const warnFlags = flags.filter(f => f.severity === 'warn' || f.severity === 'critical');
  if (warnFlags.length > 0) {
    lines.push('');
    lines.push('DATA INTEGRITY');
    for (const f of warnFlags) lines.push(`  ⚠  ${f.finding}`);
  }

  lines.push('');
  lines.push('─'.repeat(60));
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Vertical:  ${VERTICAL}`);
  lines.push(`Sabian Historical Intelligence | Data through ${script.as_of_year}`);

  return {
    briefing_text:  lines.join('\n'),
    headline:       script.headline,
    risk_band:      band,
    current_score:  score,
    signals_active: script.signal_count || 0,
    has_leads:      leads.length > 0,
    has_dark:       darks.length > 0,
    has_analog:     !!script.analog_line,
    has_hive_flags: warnFlags.length > 0,
  };
}

// ── Write ─────────────────────────────────────────────────────────────────────

async function writeBriefings(rows) {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb
      .from('country_briefings')
      .upsert(rows.slice(i, i + 500), { onConflict: 'country,as_of_year,vertical' });
    if (error) throw error;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const targetCountry = args.includes('--country') ? args[args.indexOf('--country') + 1] : null;

  console.log('\n🛰️  Phase 3 Step 7 — Paperclip');
  console.log('   Assembling intelligence briefings from synthesis scripts.\n');

  await checkTable();

  const [scripts, hiveFlags] = await Promise.all([
    loadScripts(targetCountry),
    loadHiveObservations(),
  ]);

  if (scripts.length === 0) {
    console.error('  No synthesis scripts found. Run script_cache.cjs first.');
    process.exit(1);
  }

  console.log(`\n  Assembling briefings for ${scripts.length} countries...\n`);

  const rows = [];
  for (const script of scripts) {
    const assembled = assembleBrief(script, hiveFlags);
    rows.push({
      country:        script.country,
      as_of_year:     script.as_of_year,
      vertical:       VERTICAL,
      generated_at:   new Date().toISOString(),
      ...assembled,
    });
  }

  // Sample print
  const sample = rows.find(r => r.country === (targetCountry || 'Ukraine')) || rows[0];
  if (sample) {
    console.log('  ── Sample brief ───────────────────────────────────────────────');
    console.log(sample.briefing_text.split('\n').map(l => `  ${l}`).join('\n'));
    console.log('  ───────────────────────────────────────────────────────────────\n');
  }

  const withLeads  = rows.filter(r => r.has_leads).length;
  const withDark   = rows.filter(r => r.has_dark).length;
  const withFlags  = rows.filter(r => r.has_hive_flags).length;
  const byBand     = {};
  for (const r of rows) byBand[r.risk_band] = (byBand[r.risk_band] || 0) + 1;

  console.log('  Risk band distribution:');
  for (const [band, count] of Object.entries(byBand).sort((a,b) => b[1]-a[1])) {
    console.log(`    ${band.padEnd(10)} ${count}`);
  }
  console.log(`\n  With active leads:    ${withLeads}`);
  console.log(`  With dark signals:    ${withDark}`);
  console.log(`  With hive flags:      ${withFlags}\n`);

  console.log('  Writing to Supabase...');
  await writeBriefings(rows);
  console.log(`  country_briefings: ${rows.length} rows written.\n`);

  logToHive({
    source: 'paperclip',
    level: 'intel',
    event: 'briefings_generated',
    data: { countries: rows.length, with_leads: withLeads, with_dark: withDark, with_hive_flags: withFlags, band_distribution: byBand },
  });

  console.log('═'.repeat(60));
  console.log('✅ Phase 3 Step 7 — Paperclip complete.');
  console.log(`   Briefings generated: ${rows.length}`);
  console.log(`   Vertical:            ${VERTICAL}`);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
