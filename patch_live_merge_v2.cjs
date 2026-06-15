// patch_live_merge_v2.cjs
// Matches the ACTUAL current sabian_persistence.cjs (annual-only version).
// Flips priority back to LIVE-FIRST with annual foundation as the deep backbone.
//
// getLatestScores(): daily convergence_scores wins (today's date, is_live:true);
//                    annual historical_convergence_scores fills countries with no daily row
//                    (real year date, is_live:false). Every country shows.
// getHistory():      full annual arc from foundation (Luxembourg 1970s shows true) +
//                    live daily tail appended. The complete picture.
//
// Run: node patch_live_merge_v2.cjs

const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, 'sabian_persistence.cjs');
let src = fs.readFileSync(FILE, 'utf8');

// ── REPLACE getHistory() ─────────────────────────────────────────────────────
const OLD_HIST_START = 'async function getHistory(country, days) {';
const OLD_HIST_END_MARKER = '// ═══════════════════════════════════════════════════════════════════\n// FIXED: 214 countries, honest scan_date, data_age_years flag.';

const hStart = src.indexOf(OLD_HIST_START);
const hEnd = src.indexOf(OLD_HIST_END_MARKER);
if (hStart === -1 || hEnd === -1) {
  console.log('[FAIL] could not locate getHistory block — aborting');
  process.exit(1);
}

const NEW_HIST = `async function getHistory(country, days) {
  try {
    const supabase = getClient();

    // 1. FOUNDATION: full annual arc from historical_convergence_scores.
    //    This is the decades-deep truth — Luxembourg in the 1970s shows real.
    const yearsBack = Math.max(5, Math.ceil((days || 90) / 365));
    const currentYear = new Date().getFullYear();
    const sinceYear = currentYear - yearsBack;

    const { data: annual, error } = await supabase
      .from('historical_convergence_scores')
      .select('year, score, breakdown')
      .eq('country', country)
      .gte('year', sinceYear)
      .lte('year', currentYear)
      .order('year', { ascending: true });
    if (error) throw error;

    const history = (annual || []).map(row => {
      const score = row.score || 0;
      let risk_level = 'STABLE';
      if (score >= 81)      risk_level = 'CRITICAL';
      else if (score >= 66) risk_level = 'WARNING';
      else if (score >= 41) risk_level = 'ELEVATED';
      const bd = row.breakdown || {};
      return {
        scan_date: \`\${row.year}-12-31\`,
        year: row.year,
        convergence_score: score,
        risk_level,
        is_live: false,
        signals_available: Object.keys(bd).length,
        top_3_signals: Object.entries(bd)
          .filter(([, v]) => v && typeof v === 'object' && v.stress_z != null)
          .map(([name, v]) => ({ name, score: Math.round(Math.abs(+v.stress_z) * 30), stress_z: +v.stress_z }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 3)
      };
    });

    // 2. LIVE TAIL: append daily convergence_scores points (today's eyes).
    const since = new Date();
    since.setDate(since.getDate() - (days || 90));
    const { data: daily } = await supabase
      .from('convergence_scores')
      .select('scan_date, convergence_score, risk_level, signals_available, top_3_signals')
      .eq('country', country)
      .gte('scan_date', since.toISOString().slice(0, 10))
      .order('scan_date', { ascending: true });

    if (daily && daily.length) {
      for (const d of daily) {
        history.push({ ...d, year: +d.scan_date.slice(0, 4), is_live: true });
      }
    }

    return { country, days, history };
  } catch (err) {
    return { country, days, history: [], error: err.message };
  }
}

`;

src = src.slice(0, hStart) + NEW_HIST + src.slice(hEnd);
console.log('[ok] getHistory() rebuilt: full annual arc + live daily tail');

// ── REPLACE getLatestScores() ────────────────────────────────────────────────
const OLD_LATEST_START = 'async function getLatestScores() {';
// find end: the next "module.exports" or next "// Get the most dangerous" marker
const lStart = src.indexOf(OLD_LATEST_START);
if (lStart === -1) { console.log('[FAIL] getLatestScores not found — aborting'); process.exit(1); }
// end is the closing of the function — find the next "\n}\n" after a "return results.sort" or the catch
const lTailMarker = src.indexOf('\n}\n', src.indexOf('console.error(\'[getLatestScores]\'', lStart));
if (lTailMarker === -1) { console.log('[FAIL] getLatestScores end not found — aborting'); process.exit(1); }
const lEnd = lTailMarker + 3;

const NEW_LATEST = `async function getLatestScores() {
  try {
    const supabase = getClient();
    const currentYear = new Date().getFullYear();
    const today = new Date().toISOString().slice(0, 10);

    // 1. LIVE: newest daily rows from convergence_scores (the countries scanned today).
    const { data: daily, error: dErr } = await supabase
      .from('convergence_scores')
      .select('country, scan_date, convergence_score, risk_level, theater, top_3_signals, signals_available')
      .order('scan_date', { ascending: false })
      .limit(5000);
    if (dErr) throw dErr;

    const latest = {};
    for (const row of (daily || [])) {
      if (!latest[row.country]) {
        const dataAge = currentYear - (+String(row.scan_date).slice(0, 4) || currentYear);
        latest[row.country] = {
          ...row,
          year: +String(row.scan_date).slice(0, 4),
          data_age_years: dataAge,
          freshness: 'CURRENT',
          is_live: true
        };
      }
    }

    // 2. FOUNDATION: newest annual row per country, for every country the daily scan skipped.
    const all = [];
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from('historical_convergence_scores')
        .select('country, year, score, breakdown')
        .lte('year', currentYear)
        .order('country', { ascending: true })
        .order('year', { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      if (!data || !data.length) break;
      all.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
    }

    const annualLatest = {};
    for (const row of all) {
      if (!annualLatest[row.country] || row.year > annualLatest[row.country].year) {
        annualLatest[row.country] = row;
      }
    }

    for (const row of Object.values(annualLatest)) {
      if (latest[row.country]) continue; // live row already wins
      const score = row.score || 0;
      let risk_level = 'STABLE';
      if (score >= 81)      risk_level = 'CRITICAL';
      else if (score >= 66) risk_level = 'WARNING';
      else if (score >= 41) risk_level = 'ELEVATED';

      const bd = row.breakdown || {};
      const top_3_signals = Object.entries(bd)
        .filter(([, v]) => v && typeof v === 'object' && v.stress_z != null)
        .map(([name, v]) => ({ name, score: Math.round(Math.abs(+v.stress_z) * 30), stress_z: +v.stress_z }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

      const dataAge = currentYear - row.year;
      let freshness = 'CURRENT';
      if (dataAge >= 11)     freshness = 'ANCIENT';
      else if (dataAge >= 6) freshness = 'STALE';
      else if (dataAge >= 2) freshness = 'AGING';

      latest[row.country] = {
        country: row.country,
        scan_date: \`\${row.year}-12-31\`,
        year: row.year,
        data_age_years: dataAge,
        freshness,
        convergence_score: score,
        risk_level,
        theater: null,
        top_3_signals,
        signals_available: Object.keys(bd).length,
        is_live: false
      };
    }

    return Object.values(latest).sort((a, b) => (b.convergence_score || 0) - (a.convergence_score || 0));
  } catch (err) {
    console.error('[getLatestScores]', err.message);
    return { error: err.message };
  }
}
`;

src = src.slice(0, lStart) + NEW_LATEST + src.slice(lEnd);
console.log('[ok] getLatestScores() rebuilt: live daily first, annual foundation fills the rest');

fs.writeFileSync(FILE, src, 'utf8');
console.log('');
console.log('[ok] Written. Deploy:');
console.log('   git add sabian_persistence.cjs');
console.log('   git commit -m "fix: live-first merge, annual foundation backbone, is_live flag"');
console.log('   git push');
