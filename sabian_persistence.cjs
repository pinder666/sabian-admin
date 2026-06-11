// sabian_persistence.cjs
// FIXED: getLatestScores reads historical_convergence_scores (214 countries)
//        with honest data_age_years freshness flag.

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

require('dotenv').config({ path: './.env' });
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { logToHive } = require('./logger.cjs');
const { logAuditEvent } = require('./historical/audit_chain.cjs');

function computeRowHash(fields, prevHash) {
  const canonical = JSON.stringify(fields, Object.keys(fields).sort());
  return crypto.createHash('sha256').update(canonical + prevHash).digest('hex');
}

async function getLastRowHash(supabase, tableName) {
  const { data } = await supabase
    .from(tableName)
    .select('row_hash')
    .not('row_hash', 'is', null)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.row_hash || 'genesis';
}

let _client = null;

function getClient() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  }
  _client = createClient(url, key, {
    auth: { persistSession: false }
  });
  return _client;
}

async function saveConvergenceScore(country, scanDate, result, theater) {
  try {
    const supabase = getClient();
    const prevHash = await getLastRowHash(supabase, 'convergence_scores');
    const rowFields = {
      country,
      convergence_score: result.convergence_score,
      freshness_pct:     result.freshness_pct ?? null,
      risk_level:        result.risk_level,
      scan_date:         scanDate,
      signals_available: result.signals_available,
      trajectory:        result.trajectory || 'STABLE',
    };
    const rowHash = computeRowHash(rowFields, prevHash);

    const { error } = await supabase
      .from('convergence_scores')
      .upsert({
        country,
        scan_date: scanDate,
        convergence_score: result.convergence_score,
        risk_level: result.risk_level,
        theater: theater || null,
        signals_available: result.signals_available,
        signals_failed: result.signals_failed || [],
        threshold_window: result.threshold_window,
        top_3_signals: result.top_3_signals || [],
        freshness_pct: result.freshness_pct ?? null,
        trajectory: result.trajectory || 'STABLE',
        row_hash: rowHash,
        prev_hash: prevHash,
      }, { onConflict: 'country,scan_date' });

    if (error) throw error;

    logToHive({
      source: 'sabian_persistence',
      level: 'intel',
      event: 'score_saved',
      data: { country, scan_date: scanDate, convergence_score: result.convergence_score },
      tags: ['persistence', 'supabase', country]
    });

    logAuditEvent('score_computed', country, {
      scan_date:        scanDate,
      score:            result.convergence_score,
      risk_level:       result.risk_level,
      trajectory:       result.trajectory || 'STABLE',
      signals_used:     result.signals_available,
      theater:          theater || null,
    }).catch(() => {});

    return { saved: true };
  } catch (err) {
    logToHive({
      source: 'sabian_persistence',
      level: 'error',
      event: 'score_save_failed',
      data: { country, scan_date: scanDate, message: err.message },
      tags: ['persistence', 'error']
    });
    return { saved: false, error: err.message };
  }
}

async function saveSignalReadings(country, scanDate, signals) {
  if (!signals || !signals.length) return { saved: false, error: 'No signals provided' };
  try {
    const supabase = getClient();
    await supabase
      .from('signal_readings')
      .delete()
      .eq('country', country)
      .eq('scan_date', scanDate);

    const rows = signals
      .filter(s => s.score !== null && s.score !== undefined)
      .map(s => ({
        country,
        scan_date: scanDate,
        signal_name: s.name,
        score: s.score,
        label: s.label || null,
        trend: s.trend || null,
        source: s.source || null,
        raw_data: { weight: s.weight, ...s }
      }));

    if (!rows.length) return { saved: true, rows_written: 0 };

    const { error } = await supabase.from('signal_readings').insert(rows);
    if (error) throw error;

    return { saved: true, rows_written: rows.length };
  } catch (err) {
    logToHive({
      source: 'sabian_persistence',
      level: 'error',
      event: 'signals_save_failed',
      data: { country, scan_date: scanDate, message: err.message },
      tags: ['persistence', 'error']
    });
    return { saved: false, error: err.message };
  }
}

async function saveGlobalScan(scanDate, summary, results, patterns, elapsed) {
  try {
    const supabase = getClient();
    const top5 = results
      .sort((a, b) => (b.convergence_score || 0) - (a.convergence_score || 0))
      .slice(0, 5)
      .map(r => ({ country: r.country, score: r.convergence_score, level: r.risk_level }));

    const { error } = await supabase
      .from('global_scans')
      .upsert({
        scan_date: scanDate,
        countries_scored: summary.countries_scored || results.length,
        critical_count: summary.critical || 0,
        warning_count: summary.warning || 0,
        elevated_count: summary.elevated || 0,
        stable_count: summary.stable || 0,
        failed_count: summary.failed || 0,
        patterns: patterns || [],
        top_5: top5,
        elapsed_seconds: elapsed || null,
        full_results: results
      }, { onConflict: 'scan_date' });

    if (error) throw error;
    return { saved: true };
  } catch (err) {
    return { saved: false, error: err.message };
  }
}

async function getHistory(country, days) {
  try {
    const supabase = getClient();

    // 1. FOUNDATION: full annual arc from historical_convergence_scores.
    //    This is the decades-deep truth — Luxembourg in the 1970s shows real.
    const yearsBack = Math.max(5, Math.ceil((days || 90) / 365));
    const currentYear = new Date().getFullYear();
    const sinceYear = currentYear - yearsBack;

    const { data: annual, error } = await supabase
      .from('historical_convergence_scores')
      .select('year, score, breakdown, country')
      .in('country', rawSpellings(resolveCanonical(country))) // __HIST_CANON__
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
        scan_date: `${row.year}-12-31`,
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

// ═══════════════════════════════════════════════════════════════════
// FIXED: 214 countries, honest scan_date, data_age_years flag.
// ═══════════════════════════════════════════════════════════════════
async function getLatestScores() {
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
        scan_date: `${row.year}-12-31`,
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

    // 1. CANONICAL COLLAPSE: fold name fragments into one country (Ivory Coast etc.)
    const collapsed = {};
    for (const row of Object.values(latest)) {
      const canon = (typeof resolveCanonical === 'function') ? resolveCanonical(row.country) : row.country;
      const def = (typeof isDefunct === 'function') ? isDefunct(row.country) : false;
      const cur = collapsed[canon];
      const rowYear = row.year || 0;
      const better = !cur
        || (row.is_live && !cur.is_live)
        || (row.is_live === cur.is_live && rowYear > (cur.year || 0));
      if (better) collapsed[canon] = { ...row, country: canon, defunct: def };
    }

    // 2. DEFUNCT DROP: defunct states never appear on the LIVE board (still searchable in archive endpoint)
    const liveBoard = Object.values(collapsed).filter(r => !r.defunct);

    // 3. LIVE-FIRST SORT: today's eyes rank above historical foundation, then by score
    return liveBoard.sort((a, b) => {
      const aLive = a.is_live ? 1 : 0;
      const bLive = b.is_live ? 1 : 0;
      if (aLive !== bLive) return bLive - aLive;
      return (b.convergence_score || 0) - (a.convergence_score || 0);
    });
  } catch (err) {
    console.error('[getLatestScores]', err.message);
    return { error: err.message };
  }
}

async function getSignalPatterns(signalName, scoreThreshold, days) {
  try {
    const supabase = getClient();
    const since = new Date();
    since.setDate(since.getDate() - (days || 90));
    const sinceStr = since.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from('signal_readings')
      .select('country, scan_date, score, trend, label')
      .eq('signal_name', signalName)
      .gte('score', scoreThreshold || 70)
      .gte('scan_date', sinceStr)
      .order('scan_date', { ascending: false });

    if (error) throw error;
    return { signal: signalName, threshold: scoreThreshold, days, matches: data || [] };
  } catch (err) {
    return { error: err.message };
  }
}

async function testConnection() {
  try {
    const supabase = getClient();
    const { error } = await supabase.from('historical_convergence_scores').select('country').limit(1);
    if (error) throw error;
    return { connected: true, url: process.env.SUPABASE_URL };
  } catch (err) {
    return { connected: false, error: err.message };
  }
}

module.exports = {
  saveConvergenceScore,
  saveSignalReadings,
  saveGlobalScan,
  getHistory,
  getLatestScores,
  getSignalPatterns,
  testConnection
};

if (require.main === module) {
  testConnection()
    .then(r => {
      console.log('Supabase connection test:', JSON.stringify(r, null, 2));
    })
    .catch(console.error);
}
