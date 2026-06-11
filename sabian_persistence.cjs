// sabian_persistence.cjs
// FIXED: getLatestScores reads historical_convergence_scores (214 countries)
//        with honest data_age_years freshness flag.

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

    // Pull from historical_convergence_scores (the 214-country table).
    // 'days' is reinterpreted as 'years' here since this table is annual,
    // but we expose it as a synthetic daily scan_date for the dashboard.
    const yearsBack = Math.max(1, Math.ceil((days || 90) / 365));
    const currentYear = new Date().getFullYear();
    const sinceYear = currentYear - Math.max(yearsBack, 5);

    const { data, error } = await supabase
      .from('historical_convergence_scores')
      .select('year, score, breakdown')
      .eq('country', country)
      .gte('year', sinceYear)
      .lte('year', currentYear)
      .order('year', { ascending: true });

    if (error) throw error;

    // Map to dashboard shape
    const history = (data || []).map(row => {
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
        signals_available: Object.keys(bd).length,
        top_3_signals: Object.entries(bd)
          .filter(([, v]) => v && typeof v === 'object' && v.stress_z != null)
          .map(([name, v]) => ({ name, score: Math.round(Math.abs(+v.stress_z) * 30), stress_z: +v.stress_z }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 3)
      };
    });

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

    // Paginate to avoid Supabase 1000-row cap
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

    // Latest row per country
    const latestByCountry = {};
    for (const row of all) {
      if (!latestByCountry[row.country] || row.year > latestByCountry[row.country].year) {
        latestByCountry[row.country] = row;
      }
    }

    const results = Object.values(latestByCountry).map(row => {
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

      return {
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
      };
    });

    return results.sort((a, b) => (b.convergence_score || 0) - (a.convergence_score || 0));
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
