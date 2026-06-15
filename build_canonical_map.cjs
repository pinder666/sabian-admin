// build_canonical_map.cjs
// Figures out the name-match automatically and shows you the result BEFORE building.
//
// Logic:
//  1. LIVE names (from convergence_scores, the daily scan) are canonical/current.
//  2. Foundation names that normalize to the same key as a live name -> fold into live name.
//  3. Foundation-only names that DON'T match any live name -> kept as-is, flagged.
//     Defunct successor states get an explicit map (Czechoslovakia, East Germany, etc.)
//
// Output: a country_canonical.json map + a printed report of every fold.
// Run: node build_canonical_map.cjs

require('dotenv').config({ path: './.env' });
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Normalize: de-accent, fix stray combining marks, collapse spaces, lowercase
function norm(s) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // strip combining accents
    .replace(/[\u2018\u2019\u02bc\u0027]/g, '') // strip all apostrophe variants
    .replace(/[^a-z0-9]+/gi, ' ')      // non-alphanumeric -> space
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

// Explicit successor / alias map for names that don't normalize cleanly to a live name.
// Defunct states are NOT folded into a modern country (they are real distinct history) —
// they are just flagged defunct. Aliases that ARE the same country get folded.
const ALIASES = {
  // alias normalized form -> canonical live name
  'cote d ivoire': 'Ivory Coast',
  'cote divoire': 'Ivory Coast',
  'ivory coast': 'Ivory Coast',
};

// Known defunct states — kept distinct, tagged, never folded into a modern country.
const DEFUNCT = new Set([
  'Czechoslovakia', 'East Germany', 'Republic of Vietnam',
  'South Yemen', 'Yugoslavia',
  // Puerto Rico is a territory not a defunct state — handled below
]);

(async () => {
  // Live names
  const wk = new Date(); wk.setDate(wk.getDate() - 14);
  const { data: live } = await sb
    .from('convergence_scores')
    .select('country')
    .gte('scan_date', wk.toISOString().slice(0, 10));
  const liveNames = [...new Set((live || []).map(r => r.country))];

  // Foundation names
  const all = [];
  let from = 0;
  while (true) {
    const { data } = await sb
      .from('historical_convergence_scores')
      .select('country, year')
      .order('country').range(from, from + 999);
    if (!data || !data.length) break;
    all.push(...data); if (data.length < 1000) break; from += 1000;
  }
  const newestYear = {};
  for (const r of all) if (!newestYear[r.country] || r.year > newestYear[r.country]) newestYear[r.country] = r.year;
  const foundationNames = Object.keys(newestYear);

  // Build live lookup by normalized form
  const liveByNorm = {};
  for (const n of liveNames) liveByNorm[norm(n)] = n;

  // Resolve every foundation name to a canonical
  const map = {};        // rawName -> { canonical, defunct, lastYear }
  const folds = [];      // report rows
  const currentYear = new Date().getFullYear();

  for (const raw of foundationNames) {
    const key = norm(raw);
    let canonical = null;
    let reason = '';

    if (ALIASES[key]) { canonical = ALIASES[key]; reason = 'alias'; }
    else if (liveByNorm[key]) { canonical = liveByNorm[key]; reason = 'normalized->live'; }
    else if (DEFUNCT.has(raw)) { canonical = raw; reason = 'defunct (kept)'; }
    else { canonical = raw; reason = 'no live match (kept as-is)'; }

    const isDefunct = DEFUNCT.has(raw) || (currentYear - newestYear[raw] >= 11 && !liveByNorm[key] && !ALIASES[key]);
    map[raw] = { canonical, defunct: isDefunct, last_year: newestYear[raw] };
    if (raw !== canonical || isDefunct) {
      folds.push({ raw, canonical, reason, defunct: isDefunct, last_year: newestYear[raw] });
    }
  }

  console.log('=== CANONICAL RESOLUTION REPORT ===\n');
  console.log('Live countries:', liveNames.length);
  console.log('Foundation names:', foundationNames.length, '\n');

  console.log('--- FOLDS (raw -> canonical) ---');
  folds.filter(f => f.raw !== f.canonical).forEach(f =>
    console.log('  "' + f.raw + '"  ->  "' + f.canonical + '"   [' + f.reason + ']'));
  console.log('');

  console.log('--- DEFUNCT (kept distinct, tagged) ---');
  folds.filter(f => f.defunct).forEach(f =>
    console.log('  ' + f.canonical + '  (last ' + f.last_year + ')'));
  console.log('');

  fs.writeFileSync('country_canonical.json', JSON.stringify(map, null, 2));
  console.log('[ok] Wrote country_canonical.json (' + Object.keys(map).length + ' entries)');
  console.log('Review the folds above. If correct, next step wires this into the API read layer.');
})();
