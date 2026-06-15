// diagnose_countries.cjs
// Finds the real data problem: defunct states + duplicate country names
// in historical_convergence_scores, and which countries are actually live today.
// Run: node diagnose_countries.cjs

require('dotenv').config({ path: './.env' });
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  console.log('=== COUNTRY DATA INTEGRITY CHECK ===\n');

  // 1. All distinct country names in the foundation table
  const all = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from('historical_convergence_scores')
      .select('country, year')
      .order('country', { ascending: true })
      .range(from, from + 999);
    if (error) { console.log('ERR', error.message); break; }
    if (!data || !data.length) break;
    all.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }

  // distinct names + newest year each
  const newestYear = {};
  for (const r of all) {
    if (!newestYear[r.country] || r.year > newestYear[r.country]) newestYear[r.country] = r.year;
  }
  const names = Object.keys(newestYear).sort();
  console.log('Total distinct country names in foundation:', names.length);
  console.log('');

  // 2. Defunct / archive states (newest year well in the past)
  const currentYear = new Date().getFullYear();
  const defunct = names.filter(n => (currentYear - newestYear[n]) >= 11);
  console.log('--- DEFUNCT / ANCIENT (no data in 11+ years) ---');
  defunct.forEach(n => console.log(`  ${n}  (last year ${newestYear[n]})`));
  console.log(`  [${defunct.length} countries]`);
  console.log('');

  // 3. Suspected duplicates: names that match after trim/lowercase/de-accent
  const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const byNorm = {};
  for (const n of names) {
    const k = norm(n);
    if (!byNorm[k]) byNorm[k] = [];
    byNorm[k].push(n);
  }
  console.log('--- SUSPECTED DUPLICATE NAMES (same country, different spelling) ---');
  let dupCount = 0;
  for (const [k, variants] of Object.entries(byNorm)) {
    if (variants.length > 1) {
      dupCount++;
      console.log(`  ${variants.map(v => `"${v}" (${newestYear[v]})`).join('  vs  ')}`);
    }
  }
  if (!dupCount) console.log('  none found by accent/case/space');
  console.log('');

  // 4. Which countries are LIVE today (in convergence_scores recent)
  const wk = new Date(); wk.setDate(wk.getDate() - 7);
  const { data: live } = await sb
    .from('convergence_scores')
    .select('country, scan_date')
    .gte('scan_date', wk.toISOString().slice(0,10));
  const liveSet = new Set((live || []).map(r => r.country));
  console.log('--- LIVE today/this week ---');
  console.log('  Distinct live countries:', liveSet.size);
  console.log('');

  // 5. Côte d'Ivoire specifically
  console.log('--- Côte d\\'Ivoire name variants in foundation ---');
  names.filter(n => norm(n).includes('ivoire') || norm(n).includes('ivory'))
    .forEach(n => console.log(`  "${n}"  last year ${newestYear[n]}  ${liveSet.has(n) ? 'LIVE' : 'foundation-only'}`));
})();
