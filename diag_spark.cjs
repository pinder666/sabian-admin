// diag_spark.cjs
// Why does only South Sudan have a trend spark? Check daily row counts per top country.
// Run: node diag_spark.cjs

require('dotenv').config({ path: './.env' });
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const TOP = ['South Sudan','Sudan','Yemen','Niger','Zimbabwe','Ethiopia','Lebanon','Egypt','Pakistan','CAR','Central African Republic'];

(async () => {
  console.log('=== DAILY ROW COUNTS PER COUNTRY (convergence_scores) ===\n');
  for (const c of TOP) {
    const { data, error } = await sb
      .from('convergence_scores')
      .select('scan_date, convergence_score')
      .eq('country', c)
      .order('scan_date', { ascending: true });
    if (error) { console.log(c, 'ERR', error.message); continue; }
    const dates = (data || []).map(r => r.scan_date);
    const uniqueDates = [...new Set(dates)];
    console.log(c.padEnd(28) + ' rows=' + (data||[]).length + '  distinct_dates=' + uniqueDates.length);
    if (uniqueDates.length) {
      console.log('     dates: ' + uniqueDates.slice(0,10).join(', ') + (uniqueDates.length>10?' ...':''));
      console.log('     scores: ' + (data||[]).slice(0,10).map(r=>r.convergence_score).join(', '));
    }
  }
  console.log('\n=== HOW MANY TOTAL DISTINCT SCAN DATES EXIST? ===');
  const { data: allDates } = await sb
    .from('convergence_scores')
    .select('scan_date')
    .order('scan_date', { ascending: false })
    .limit(5000);
  const u = [...new Set((allDates||[]).map(r=>r.scan_date))].sort().reverse();
  console.log('Distinct scan_dates in table:', u.length);
  console.log('Most recent 15:', u.slice(0,15).join(', '));
  console.log('\nVERDICT: if countries have only 1 distinct date, the scan has run once,');
  console.log('not daily-accumulated, so only countries scanned on multiple days get a spark.');
})();
