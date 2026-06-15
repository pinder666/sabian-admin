// patch_actor_event_links.cjs
// One-shot patch: fix column name 'source' -> 'filing_source' in build_actor_event_links.cjs
// Run from sabian_core: node patch_actor_event_links.cjs

const fs = require('fs');
const path = require('path');
const f = path.join(__dirname, 'build_actor_event_links.cjs');
let src = fs.readFileSync(f, 'utf8');

if (src.includes('filing_source')) {
  console.log('[skip] already patched.');
  process.exit(0);
}

// 1. The required-columns check
src = src.replace(
  `const required = ['id', 'country', 'filing_date', 'source', 'behavior_tier'];`,
  `const required = ['id', 'country', 'filing_date', 'filing_source', 'behavior_tier'];`
);

// 2. The actor query select
src = src.replace(
  '.select(`id, ${nameCol}, filing_date, source, behavior_tier`)',
  '.select(`id, ${nameCol}, filing_date, filing_source, behavior_tier`)'
);

// 3. The link row builder (read m.source -> m.filing_source)
src = src.replace(
  `source:            m.source,`,
  `source:            m.filing_source,`
);

fs.writeFileSync(f, src, 'utf8');
console.log('✅ patched build_actor_event_links.cjs');
console.log('Now run: node build_actor_event_links.cjs');
