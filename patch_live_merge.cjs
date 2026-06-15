// patch_live_merge.cjs
// THE FIX: every country shows. Live daily countries show today's date and move daily.
// Countries the daily scan skips fall back to annual foundation data — honestly dated
// with the real year (never a fake 2026-12-31) and flagged is_live:false.
//
// Patches sabian_persistence.cjs:
//   getLatestScores() -> merge daily live + annual foundation, dedup, flag is_live
//   getHistory()      -> if no daily history, return annual trajectory with real year dates
//
// Run: node patch_live_merge.cjs

const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, 'sabian_persistence.cjs');

let src = fs.readFileSync(FILE, 'utf8');

// ── REPLACE getLatestScores() ────────────────────────────────────────────────
const OLD_LATEST = `async function getLatestScores() {
  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from('convergence_scores')
      .select('country, scan_date, convergence_score, risk_level, theater, top_3_signals')
      .order('scan_date', { ascending: false })
      .limit(500); // enough for 50 countries * 10 recent scans

    if (error) throw error;

    // Deduplicate -- keep latest per country
    const latest = {};
    for (const row of (data || [])) {
      if (!latest[row.country]) latest[row.country] = row;
    }

    return Object.values(latest).sort((a, b) => (b.convergence_score || 0) - (a.convergence_score || 0));
  } catch (err) {
    return { error: err.message };
  }
}`;

const NEW_LATEST = `async function getLatestScores() {
  try {
    const supabase = getClient();

    // 1. LIVE layer: newest daily rows from convergence_scores (high-risk countries scanned daily)
    const { data: daily, error: e1 } = await supabase
      .from('convergence_scores')
      .select('country, scan_date, convergence_score, risk_level, theater, top_3_signals, signals_available')
      .order('scan_date', { ascending: false })
      .limit(5000);
    if (e1) throw e1;

    const latest = {};
    for (const row of (daily || [])) {
      if (!latest[row.country]) {
        latest[row.country] = { ...row, is_live: true };
      }
    }

    // 2. FOUNDATION layer: annual rows for every country (fills the ones daily scan skips)
    //    Pull newest year per country from historical_convergence_scores.
    const { data: annual, error: e2 } = await supabase
      .from('historical_convergence_scores')
      .select('country, year, score, breakdown')
      .order('year', { ascending: false })
      .limit(20000);
    if (e2) throw e2;

    const annualLatest = {};
    for (const row of (annual || [])) {
      if (!annualLatest[row.country]) annualLatest[row.country] = row;
    }

    // Merge: live wins; otherwise use annual foundation, dated honestly with the real year.
    for (const [country, row] of Object.entries(annualLatest)) {
      if (latest[country]) continue; // already have a live row
      const score = Math.round(row.score || 0);
      const lvl = score >= 81 ? 'CRITICAL' : score >= 66 ? 'WARNING' : score >= 41 ? 'ELEVATED' : 'STABLE';
      // Top-3 signals from the annual breakdown (stress_z per signal)
      let top3 = [];
      if (row.breakdown && typeof row.breakdown === 'object') {
        top3 = Object.entries(row.breakdown)
          .map(([name, v]) => ({ name, score: Math.round(((v && v.stress_z) || 0) * 20 + 50) }))
          .filter(s => s.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3);
      }
      latest[country] = {
        country,
        scan_date: row.year + '-12-31',   // honest: this IS the year-end annual reading
        year: row.year,                   // explicit year so the UI can label it correctly
        convergence_score: score,
        risk_level: lvl,
        theater: null,
        top_3_signals: top3,
        is_live: false                    // FOUNDATION, not live — UI flags it
      };
    }

    return Object.values(latest).sort((a, b) => (b.convergence_score || 0) - (a.convergence_score || 0));
  } catch (err) {
    return { error: err.message };
  }
}`;

if (src.includes(OLD_LATEST)) {
  src = src.replace(OLD_LATEST, NEW_LATEST);
  console.log('[ok] getLatestScores() merged: live daily + annual foundation, is_live flag');
} else {
  console.log('[FAIL] getLatestScores() not found verbatim — aborting so nothing breaks');
  process.exit(1);
}

// ── REPLACE getHistory() ─────────────────────────────────────────────────────
const OLD_HIST = `async function getHistory(country, days) {
  try {
    const supabase = getClient();
    const since = new Date();
    since.setDate(since.getDate() - (days || 90));
    const sinceStr = since.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from('convergence_scores')
      .select('scan_date, convergence_score, risk_level, signals_available, top_3_signals')
      .eq('country', country)
      .gte('scan_date', sinceStr)
      .order('scan_date', { ascending: true });

    if (error) throw error;
    return { country, days, history: data || [] };
  } catch (err) {
    return { country, days, history: [], error: err.message };
  }
}`;

const NEW_HIST = `async function getHistory(country, days) {
  try {
    const supabase = getClient();
    const since = new Date();
    since.setDate(since.getDate() - (days || 90));
    const sinceStr = since.toISOString().slice(0, 10);

    // 1. LIVE daily history
    const { data, error } = await supabase
      .from('convergence_scores')
      .select('scan_date, convergence_score, risk_level, signals_available, top_3_signals')
      .eq('country', country)
      .gte('scan_date', sinceStr)
      .order('scan_date', { ascending: true });
    if (error) throw error;

    if (data && data.length >= 2) {
      return { country, days, history: data, source: 'live' };
    }

    // 2. FOUNDATION fallback: annual trajectory, honestly dated by year.
    //    This is the multi-year structural arc — labeled as annual, never faked as daily.
    const { data: annual, error: e2 } = await supabase
      .from('historical_convergence_scores')
      .select('year, score')
      .eq('country', country)
      .order('year', { ascending: true })
      .limit(70);
    if (e2) throw e2;

    const annualHistory = (annual || []).map(r => ({
      scan_date: r.year + '-12-31',
      year: r.year,
      convergence_score: Math.round(r.score || 0),
      is_live: false
    }));

    // If we have a live point today, append it so the arc ends on the live reading
    if (data && data.length === 1) {
      annualHistory.push({ ...data[0], is_live: true });
    }

    return { country, days, history: annualHistory, source: 'foundation_annual' };
  } catch (err) {
    return { country, days, history: [], error: err.message };
  }
}`;

if (src.includes(OLD_HIST)) {
  src = src.replace(OLD_HIST, NEW_HIST);
  console.log('[ok] getHistory() merged: live daily history, annual foundation fallback');
} else {
  console.log('[FAIL] getHistory() not found verbatim — aborting');
  process.exit(1);
}

fs.writeFileSync(FILE, src, 'utf8');
console.log('');
console.log('[ok] sabian_persistence.cjs patched. Deploy:');
console.log('   git add sabian_persistence.cjs');
console.log('   git commit -m "fix: merge live daily + annual foundation, honest dating, is_live flag"');
console.log('   git push');
