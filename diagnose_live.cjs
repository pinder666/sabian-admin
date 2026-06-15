// diagnose_live.cjs
// Tells us the TRUTH about why dates are 2026-12-31 instead of today.
// Checks: what's in convergence_scores, what dates, how stale, does the daily scan write.
// Run: node diagnose_live.cjs

require('dotenv').config({ path: './.env' });
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  console.log('=== SABIAN LIVE DIAGNOSIS ===');
  console.log('Today:', new Date().toISOString().slice(0,10));
  console.log('');

  // 1. What's the newest scan_date in the daily table?
  const { data: newest, error: e1 } = await sb
    .from('convergence_scores')
    .select('country, scan_date, convergence_score')
    .order('scan_date', { ascending: false })
    .limit(5);
  if (e1) { console.log('convergence_scores ERROR:', e1.message); }
  else {
    console.log('--- convergence_scores (DAILY table) newest 5 rows ---');
    newest.forEach(r => console.log(`  ${r.scan_date}  ${r.country}  score=${r.convergence_score}`));
    console.log(`  Newest scan_date: ${newest[0]?.scan_date || 'EMPTY TABLE'}`);
  }
  console.log('');

  // 2. How many total rows in daily table, how many distinct dates
  const { count: dailyCount } = await sb
    .from('convergence_scores')
    .select('*', { count: 'exact', head: true });
  console.log(`  Total rows in convergence_scores: ${dailyCount}`);

  // 3. How many countries have a row dated in the last 7 days?
  const wk = new Date(); wk.setDate(wk.getDate() - 7);
  const { count: freshCount } = await sb
    .from('convergence_scores')
    .select('*', { count: 'exact', head: true })
    .gte('scan_date', wk.toISOString().slice(0,10));
  console.log(`  Rows dated in last 7 days: ${freshCount}`);
  console.log('');

  // 4. Check Luxembourg specifically (the one showing 2026-12-31)
  const { data: lux } = await sb
    .from('convergence_scores')
    .select('scan_date, convergence_score, risk_level')
    .eq('country', 'Luxembourg')
    .order('scan_date', { ascending: false })
    .limit(5);
  console.log('--- Luxembourg in convergence_scores ---');
  if (!lux || !lux.length) console.log('  NO ROWS — this is why it falls back to annual data');
  else lux.forEach(r => console.log(`  ${r.scan_date}  score=${r.convergence_score}  ${r.risk_level}`));
  console.log('');

  // 5. Is the dashboard maybe reading historical_convergence_scores? Check that table's newest
  const { data: hist } = await sb
    .from('historical_convergence_scores')
    .select('country, year, score')
    .eq('country', 'Luxembourg')
    .order('year', { ascending: false })
    .limit(3);
  console.log('--- Luxembourg in historical_convergence_scores (ANNUAL) ---');
  if (hist) hist.forEach(r => console.log(`  year=${r.year}  score=${r.score}`));
  console.log('');

  console.log('=== VERDICT ===');
  if (!dailyCount || dailyCount === 0) {
    console.log('convergence_scores is EMPTY. The daily scan has NEVER successfully written.');
    console.log('FIX: run the global scan now -> node global_scan.cjs');
  } else if (freshCount === 0) {
    console.log('convergence_scores has rows but NONE in last 7 days. Daily cron is NOT running.');
    console.log('FIX: run scan now + verify Railway cron fires.');
  } else {
    console.log('Daily table HAS fresh rows. The dashboard date bug is a READ-PATH problem, not data.');
  }
})();
