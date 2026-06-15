require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const TAGS = [
  { tier: 'fund',               match: { filing_source: 'GLEIF', filing_type: 'FUND' } },
  { tier: 'sole_proprietor',    match: { filing_source: 'GLEIF', filing_type: 'SOLE_PROPRIETOR' } },
  { tier: 'adversarial',        match: { filing_source: 'COURTLISTENER' } },
  { tier: 'active_positioning', match: { filing_source: 'SEC_EDGAR_13F' } },
  { tier: 'operational',        match: { filing_source: 'SEC_EDGAR_FULLTEXT' } },
  { tier: 'operational_gleif',  match: { filing_source: 'GLEIF', filing_type: 'GENERAL' } },
];

async function tag(tier, match) {
  console.log(`\n${tier}:`, JSON.stringify(match));
  let total = 0;
  while (true) {
    let q = sb.from('actor_presence_raw').select('id').is('behavior_tier', null);
    for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
    const { data, error } = await q.limit(5000);
    if (error) { console.error('  select error:', error.message); break; }
    if (!data || data.length === 0) break;
    const ids = data.map(r => r.id);
    const { error: uerr } = await sb.from('actor_presence_raw').update({ behavior_tier: tier }).in('id', ids);
    if (uerr) { console.error('  update error:', uerr.message); await new Promise(r => setTimeout(r, 2000)); continue; }
    total += ids.length;
    process.stdout.write(`\r  ${total} tagged`);
  }
  console.log(`\n  done ${tier}: ${total}`);
}

(async () => {
  for (const t of TAGS) await tag(t.tier, t.match);
  console.log('\nALL DONE');
})();
