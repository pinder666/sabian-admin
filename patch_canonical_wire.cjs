// patch_canonical_wire.cjs
// Wires country_canonical.json into sabian_persistence.cjs read layer.
//  - resolveCanonical(name) folds raw names -> canonical live name
//  - getLatestScores: dedupes folded names (Ivory Coast = 3 fragments -> 1), attaches defunct flag
//  - getHistory: resolves the requested name + pulls all fragment spellings so the arc is complete
// Read-layer only. No stored rows changed.
// Run: node patch_canonical_wire.cjs

const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, 'sabian_persistence.cjs');
let src = fs.readFileSync(FILE, 'utf8');

// ── 1. Inject the canonical loader near the top (after the getClient definition or first require) ──
if (!src.includes('__CANONICAL_LOADED__')) {
  const inject = `
// __CANONICAL_LOADED__ canonical country name resolver
let __CANON = null;
let __CANON_REVERSE = null;
function __loadCanon() {
  if (__CANON) return;
  try {
    __CANON = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'country_canonical.json'), 'utf8'));
  } catch (e) { __CANON = {}; }
  // reverse: canonical -> [all raw spellings]
  __CANON_REVERSE = {};
  for (const [raw, info] of Object.entries(__CANON)) {
    const c = (info && info.canonical) || raw;
    if (!__CANON_REVERSE[c]) __CANON_REVERSE[c] = [];
    __CANON_REVERSE[c].push(raw);
  }
}
function resolveCanonical(name) {
  __loadCanon();
  const info = __CANON[name];
  return (info && info.canonical) || name;
}
function isDefunct(name) {
  __loadCanon();
  const info = __CANON[name];
  return !!(info && info.defunct);
}
function rawSpellings(canonical) {
  __loadCanon();
  return (__CANON_REVERSE && __CANON_REVERSE[canonical]) || [canonical];
}
`;
  // insert after the first 'const supabase' helper or first line after requires
  const anchor = src.indexOf('\n');
  // put it after the initial require block: find first blank line after a require
  const reqEnd = src.indexOf('\n\n');
  const at = reqEnd > 0 ? reqEnd + 1 : anchor + 1;
  src = src.slice(0, at) + inject + src.slice(at);
  console.log('[ok] canonical resolver injected');
} else {
  console.log('[skip] canonical resolver already present');
}

// ── 2. getLatestScores: resolve + dedupe folded names ──
// After building latest{} from daily and annual, collapse by canonical name.
const MARKER = 'return Object.values(latest).sort((a, b) => {';
if (src.includes(MARKER) && !src.includes('__CANON_COLLAPSE__')) {
  const collapse = `// __CANON_COLLAPSE__ fold raw spellings into canonical, keep newest/live
    const collapsed = {};
    for (const row of Object.values(latest)) {
      const canon = resolveCanonical(row.country);
      const cur = collapsed[canon];
      const rowYear = row.year || 0;
      // prefer live; then newest year
      const better = !cur
        || (row.is_live && !cur.is_live)
        || (row.is_live === cur.is_live && rowYear > (cur.year || 0));
      if (better) {
        collapsed[canon] = { ...row, country: canon, defunct: isDefunct(row.country) };
      }
    }
    Object.assign(latest, {});
    for (const k of Object.keys(latest)) delete latest[k];
    Object.values(collapsed).forEach(r => { latest[r.country] = r; });

    return Object.values(latest).sort((a, b) => {`;
  src = src.replace(MARKER, collapse);
  console.log('[ok] getLatestScores: canonical collapse wired');
} else {
  console.log('[skip] getLatestScores collapse already present or marker missing');
}

// ── 3. getHistory: pull all fragment spellings for a complete arc ──
const HIST_QUERY = `      .from('historical_convergence_scores')
      .select('year, score, breakdown')
      .eq('country', country)`;
const HIST_QUERY_NEW = `      .from('historical_convergence_scores')
      .select('year, score, breakdown, country')
      .in('country', rawSpellings(resolveCanonical(country)))`;
if (src.includes(HIST_QUERY) && !src.includes('__HIST_CANON__')) {
  src = src.replace(HIST_QUERY, HIST_QUERY_NEW + ' // __HIST_CANON__');
  console.log('[ok] getHistory: pulls all fragment spellings');
} else {
  console.log('[skip] getHistory already canonical or query shape changed');
}

fs.writeFileSync(FILE, src, 'utf8');
console.log('\n[ok] Written. Deploy:');
console.log('   git add sabian_persistence.cjs country_canonical.json');
console.log('   git commit -m "feat: canonical country name resolution, fold fragments, flag defunct"');
console.log('   git push');
