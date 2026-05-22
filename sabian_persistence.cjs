// sabian_persistence.cjs
// Sabian Supabase persistence layer
// Stores convergence scores, signal readings, and global scan results
// 90-day accumulation enables latent pattern discovery -- this is the memory that makes Sabian worth billions
//
// Required .env vars:
//   SUPABASE_URL=https://qdxgcyawpqxhhjprqyas.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY=<service_role_key from Supabase dashboard>
//
// Run schema SQL once in Supabase SQL editor before first use:
// -----------------------------------------------------------
// CREATE TABLE IF NOT EXISTS convergence_scores (
//   id                BIGSERIAL PRIMARY KEY,
//   country           TEXT NOT NULL,
//   scan_date         DATE NOT NULL,
//   convergence_score INTEGER,
//   risk_level        TEXT,
//   theater           TEXT,
//   signals_available INTEGER,
//   signals_failed    TEXT[],
//   threshold_window  TEXT,
//   top_3_signals     JSONB,
//   freshness_pct     INTEGER,
//   created_at        TIMESTAMPTZ DEFAULT NOW()
// );
// CREATE UNIQUE INDEX IF NOT EXISTS idx_convergence_country_date ON convergence_scores(country, scan_date);
//
// If upgrading an existing table, run once in Supabase SQL editor:
//   ALTER TABLE convergence_scores ADD COLUMN IF NOT EXISTS freshness_pct INTEGER;
//
// CREATE TABLE IF NOT EXISTS signal_readings (
//   id            BIGSERIAL PRIMARY KEY,
//   country       TEXT NOT NULL,
//   scan_date     DATE NOT NULL,
//   signal_name   TEXT NOT NULL,
//   score         INTEGER,
//   label         TEXT,
//   trend         TEXT,
//   source        TEXT,
//   raw_data      JSONB,
//   created_at    TIMESTAMPTZ DEFAULT NOW()
// );
// CREATE INDEX IF NOT EXISTS idx_signals_country_date ON signal_readings(country, scan_date);
// CREATE INDEX IF NOT EXISTS idx_signals_signal_date ON signal_readings(signal_name, scan_date);
//
// CREATE TABLE IF NOT EXISTS global_scans (
//   id            BIGSERIAL PRIMARY KEY,
//   scan_date     DATE NOT NULL UNIQUE,
//   countries_scored INTEGER,
//   critical_count INTEGER,
//   warning_count  INTEGER,
//   elevated_count INTEGER,
//   stable_count   INTEGER,
//   failed_count   INTEGER,
//   patterns       TEXT[],
//   top_5          JSONB,
//   elapsed_seconds NUMERIC,
//   full_results   JSONB,
//   created_at    TIMESTAMPTZ DEFAULT NOW()
// );
// -----------------------------------------------------------

require('dotenv').config({ path: './.env' });
const { createClient } = require('@supabase/supabase-js');
const { logToHive } = require('./logger.cjs');

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

// Save or update a single country convergence score for a given date
// Uses upsert -- safe to call repeatedly on the same country+date
async function saveConvergenceScore(country, scanDate, result, theater) {
  try {
    const supabase = getClient();
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
        freshness_pct: result.freshness_pct ?? null
      }, { onConflict: 'country,scan_date' });

    if (error) throw error;

    logToHive({
      source: 'sabian_persistence',
      level: 'intel',
      event: 'score_saved',
      data: { country, scan_date: scanDate, convergence_score: result.convergence_score },
      tags: ['persistence', 'supabase', country]
    });

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

// Save individual signal readings for a country+date (all 8 signals)
// Deletes existing readings for this country+date first, then inserts fresh
async function saveSignalReadings(country, scanDate, signals) {
  if (!signals || !signals.length) return { saved: false, error: 'No signals provided' };
  try {
    const supabase = getClient();

    // Delete old readings for this country+date before insert
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

// Save a full global scan summary (called once per global_scan.cjs run)
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

    logToHive({
      source: 'sabian_persistence',
      level: 'intel',
      event: 'global_scan_saved',
      data: { scan_date: scanDate, countries_scored: results.length },
      tags: ['persistence', 'global_scan']
    });

    return { saved: true };
  } catch (err) {
    logToHive({
      source: 'sabian_persistence',
      level: 'error',
      event: 'global_scan_save_failed',
      data: { scan_date: scanDate, message: err.message },
      tags: ['persistence', 'error']
    });
    return { saved: false, error: err.message };
  }
}

// Get historical convergence scores for a country (last N days)
// Used to detect trend acceleration, plot 90-day arc
async function getHistory(country, days) {
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
}

// Get latest score for every country in the watch list (dashboard view)
async function getLatestScores() {
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
}

// Get the most dangerous signal pattern across all countries on a given date
// Supports the latent pattern discovery that runs after 90 days
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

// Test connection -- call on startup to verify Supabase is reachable
async function testConnection() {
  try {
    const supabase = getClient();
    const { error } = await supabase.from('convergence_scores').select('id').limit(1);
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

// Standalone test: node sabian_persistence.cjs
if (require.main === module) {
  testConnection()
    .then(r => {
      console.log('Supabase connection test:', JSON.stringify(r, null, 2));
      if (r.connected) {
        console.log('\nConnection OK -- Sabian persistence layer is live.');
        console.log('Run the SQL schema in Supabase SQL editor if tables do not exist yet.');
      }
    })
    .catch(console.error);
}
