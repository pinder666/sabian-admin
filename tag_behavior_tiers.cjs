// tag_behavior_tiers.cjs
// Tags behavior_tier on actor_presence_raw by filing_source.
// Run from sabian_core: node tag_behavior_tiers.cjs

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const sleep = ms => new Promise(r => setTimeout(r, ms));

const RULES = [
  { filing_source: 'COURTLISTENER',      behavior_tier: 'adversarial' },
  { filing_source: 'SEC_EDGAR_13F',      behavior_tier: 'active_positioning' },
  { filing_source: 'SEC_EDGAR_FULLTEXT', behavior_tier: 'operational' },
  { filing_source: 'UK_COMPANIES_HOUSE', behavior_tier: 'operational' },
];

// GLEIF handled separately: fund/sole_proprietor/operational based on filing_type
const GLEIF_RULES = [
  { match: 'fund',            tier: 'fund' },
  { match: 'sole',            tier: 'sole_proprietor' },
];

(async () => {
  console.log('[tag_behavior_tiers] starting...');

  // Step 1: tag by filing_source (non-GLEIF)
  for (const rule of RULES) {
    console.log(`  tagging ${rule.filing_source} -> ${rule.behavior_tier}...`);
    let from = 0;
    const PAGE = 1000;
    let total = 0;
    while (true) {
      const { data, error } = await sb
        .from('actor_presence_raw')
        .select('id')
        .eq('filing_source', rule.filing_source)
        .is('behavior_tier', null)
        .range(from, from + PAGE - 1);
      if (error) { console.error(`  [error] ${error.message}`); break; }
      if (!data || !data.length) break;
      const ids = data.map(r => r.id);
      const { error: uErr } = await sb
        .from('actor_presence_raw')
        .update({ behavior_tier: rule.behavior_tier })
        .in('id', ids);
      if (uErr) console.error(`  [error] update failed: ${uErr.message}`);
      else total += ids.length;
      if (data.length < PAGE) break;
      from += PAGE;
      await sleep(100);
    }
    console.log(`  ${rule.filing_source}: ${total} rows tagged`);
  }

  // Step 2: tag GLEIF by filing_type
  console.log('  tagging GLEIF by filing_type...');
  for (const rule of GLEIF_RULES) {
    let from = 0;
    const PAGE = 1000;
    let total = 0;
    while (true) {
      const { data, error } = await sb
        .from('actor_presence_raw')
        .select('id')
        .eq('filing_source', 'GLEIF')
        .ilike('filing_type', `%${rule.match}%`)
        .is('behavior_tier', null)
        .range(from, from + PAGE - 1);
      if (error) { console.error(`  [error] ${error.message}`); break; }
      if (!data || !data.length) break;
      const ids = data.map(r => r.id);
      const { error: uErr } = await sb
        .from('actor_presence_raw')
        .update({ behavior_tier: rule.tier })
        .in('id', ids);
      if (uErr) console.error(`  [error] update failed: ${uErr.message}`);
      else total += ids.length;
      if (data.length < PAGE) break;
      from += PAGE;
      await sleep(100);
    }
    console.log(`  GLEIF ${rule.match}: ${total} rows tagged`);
  }

  // Step 3: tag remaining GLEIF as operational
  console.log('  tagging remaining GLEIF as operational...');
  let from = 0;
  const PAGE = 1000;
  let total = 0;
  while (true) {
    const { data, error } = await sb
      .from('actor_presence_raw')
      .select('id')
      .eq('filing_source', 'GLEIF')
      .is('behavior_tier', null)
      .range(from, from + PAGE - 1);
    if (error) { console.error(`  [error] ${error.message}`); break; }
    if (!data || !data.length) break;
    const ids = data.map(r => r.id);
    const { error: uErr } = await sb
      .from('actor_presence_raw')
      .update({ behavior_tier: 'operational' })
      .in('id', ids);
    if (uErr) console.error(`  [error] update failed: ${uErr.message}`);
    else total += ids.length;
    if (data.length < PAGE) break;
    from += PAGE;
    await sleep(100);
  }
  console.log(`  GLEIF remaining: ${total} rows tagged operational`);

  // Verify
  console.log('\n[verify]');
  const { data: check } = await sb
    .from('actor_presence_raw')
    .select('behavior_tier, filing_source')
    .limit(5000);
  const counts = {};
  for (const r of (check || [])) {
    const k = `${r.filing_source}::${r.behavior_tier || 'NULL'}`;
    counts[k] = (counts[k] || 0) + 1;
  }
  for (const [k, v] of Object.entries(counts).sort()) {
    console.log(`  ${k}: ${v}`);
  }
  console.log('\n✅ done');
})().catch(err => { console.error(err); process.exit(1); });
