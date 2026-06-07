require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const findings = [];
  const v2 = JSON.parse(fs.readFileSync(path.join(__dirname, 'historical/deep_pattern_findings_v2.json'), 'utf8'));
  for (const pair of (v2.allPairs || [])) {
    findings.push({
      finding_type: 'signal_correlation',
      signal_a: pair.sigA,
      signal_b: pair.sigB,
      correlation: pair.r,
      lag_years: pair.lag || 0,
      n_observations: pair.n,
      description: `${pair.sigA} correlates with ${pair.sigB} at r=${pair.r} (n=${pair.n}, lag=${pair.lag}yr)`,
      confidence: pair.n >= 50 ? 'high' : pair.n >= 20 ? 'medium' : 'low',
      raw_data: pair,
      source_file: 'deep_pattern_findings_v2.json'
    });
  }
  console.log(`Loading ${findings.length} findings...`);
  let loaded = 0;
  for (let i = 0; i < findings.length; i += 100) {
    const batch = findings.slice(i, i + 100);
    const { error } = await sb.from('historical_findings').insert(batch);
    if (error) console.error(`Batch ${i} error:`, error.message);
    else { loaded += batch.length; console.log(`Loaded ${loaded}/${findings.length}`); }
  }
  const { count } = await sb.from('historical_findings').select('*', { count: 'exact', head: true });
  console.log(`Done. ${count} rows in database.`);
}
run().catch(console.error);
