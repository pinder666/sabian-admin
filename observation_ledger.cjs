// observation_ledger.cjs
// Append-only ledger of every threshold crossing detected by the daily scan.
// New rows only — no deletes. Grade columns are filled by grading_pass.cjs when windows close.
//
// Run schema SQL once in Supabase SQL editor before first use:
// ---------------------------------------------------------------
// CREATE TABLE IF NOT EXISTS observations (
//   id                  BIGSERIAL PRIMARY KEY,
//   country             TEXT NOT NULL,
//   scan_date           DATE NOT NULL,
//   convergence_score   INTEGER NOT NULL,
//   risk_level          TEXT NOT NULL,
//   previous_risk_level TEXT,
//   direction           TEXT NOT NULL,
//   window_days         INTEGER NOT NULL,
//   window_closes_at    DATE NOT NULL,
//   graded_at           TIMESTAMPTZ,
//   grade               TEXT,
//   grade_notes         TEXT,
//   score_at_grade      INTEGER,
//   level_at_grade      TEXT,
//   created_at          TIMESTAMPTZ DEFAULT NOW()
// );
// CREATE INDEX IF NOT EXISTS idx_obs_country  ON observations(country);
// CREATE INDEX IF NOT EXISTS idx_obs_ungraded ON observations(window_closes_at) WHERE graded_at IS NULL;
// ---------------------------------------------------------------

require('dotenv').config({ path: './.env' });
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { logToHive } = require('./logger.cjs');
const { logAuditEvent } = require('./historical/audit_chain.cjs');

function computeRowHash(fields, prevHash) {
  const canonical = JSON.stringify(fields, Object.keys(fields).sort());
  return crypto.createHash('sha256').update(canonical + prevHash).digest('hex');
}

async function getLastObsHash(supabase) {
  const { data } = await supabase
    .from('observations')
    .select('row_hash')
    .not('row_hash', 'is', null)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.row_hash || 'genesis';
}

// Observation window in days, keyed by risk level at the crossing.
// Matches the threshold window stated in the score output:
//   CRITICAL: action window 0-30 days
//   WARNING:  55-day decision window
//   ELEVATED: 60-90 day monitor window
const WINDOW_DAYS = {
  CRITICAL: 30,
  WARNING:  55,
  ELEVATED: 90,
  STABLE:   90
};

let _client = null;
function getClient() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Insert a new threshold crossing record.
// Called by global_scan.cjs whenever a country's risk band changes.
async function createObservation({ country, scan_date, convergence_score, risk_level, previous_risk_level, direction }) {
  try {
    const supabase = getClient();
    const window_days      = WINDOW_DAYS[risk_level] || 90;
    const window_closes_at = addDays(scan_date, window_days);

    // Compute row hash for chain integrity
    const prevHash = await getLastObsHash(supabase);
    const rowFields = {
      convergence_score,
      country,
      direction,
      previous_risk_level: previous_risk_level || null,
      risk_level,
      scan_date,
      window_closes_at,
      window_days,
    };
    const rowHash = computeRowHash(rowFields, prevHash);

    const { data, error } = await supabase
      .from('observations')
      .insert({
        country,
        scan_date,
        convergence_score,
        risk_level,
        previous_risk_level: previous_risk_level || null,
        direction,
        window_days,
        window_closes_at,
        row_hash: rowHash,
        prev_hash: prevHash,
      })
      .select('id')
      .single();

    if (error) throw error;

    logToHive({
      source: 'observation_ledger',
      level: 'intel',
      event: 'observation_created',
      data: { id: data.id, country, scan_date, risk_level, previous_risk_level, direction, window_closes_at },
      tags: ['ledger', country, risk_level.toLowerCase(), direction.toLowerCase()]
    });

    logAuditEvent('threshold_crossing', country, {
      scan_date,
      score:            convergence_score,
      from_band:        previous_risk_level || null,
      to_band:          risk_level,
      direction,
      window_closes_at,
      observation_id:   data.id,
    }).catch(() => {});

    return { created: true, id: data.id, window_closes_at };
  } catch (err) {
    logToHive({
      source: 'observation_ledger',
      level: 'error',
      event: 'observation_create_failed',
      data: { country, scan_date, message: err.message },
      tags: ['ledger', 'error']
    });
    return { created: false, error: err.message };
  }
}

// All open (ungraded) observations for a country.
async function getOpenObservations(country) {
  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from('observations')
      .select('*')
      .eq('country', country)
      .is('graded_at', null)
      .order('scan_date', { ascending: false });
    if (error) throw error;
    return { country, open: data || [] };
  } catch (err) {
    return { country, open: [], error: err.message };
  }
}

// All observations whose window has closed and haven't been graded yet.
// Called by grading_pass.cjs on each daily run.
async function getObservationsDueForGrading() {
  try {
    const supabase = getClient();
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from('observations')
      .select('*')
      .is('graded_at', null)
      .lte('window_closes_at', today)
      .order('window_closes_at', { ascending: true });
    if (error) throw error;
    return { due: data || [] };
  } catch (err) {
    return { due: [], error: err.message };
  }
}

// Apply a grade to an observation once its window has closed.
// Called exclusively by grading_pass.cjs.
async function gradeObservation(id, { grade, grade_notes, score_at_grade, level_at_grade }) {
  try {
    const supabase = getClient();
    const { error } = await supabase
      .from('observations')
      .update({
        grade,
        grade_notes:    grade_notes    || null,
        score_at_grade: score_at_grade ?? null,
        level_at_grade: level_at_grade || null,
        graded_at:      new Date().toISOString()
      })
      .eq('id', id);
    if (error) throw error;

    logToHive({
      source: 'observation_ledger',
      level: 'intel',
      event: 'observation_graded',
      data: { id, grade, score_at_grade, level_at_grade },
      tags: ['ledger', 'grade', grade.toLowerCase()]
    });

    return { graded: true };
  } catch (err) {
    return { graded: false, error: err.message };
  }
}

// Full observation history for a country — graded and open.
async function getCountryLedger(country, limit) {
  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from('observations')
      .select('*')
      .eq('country', country)
      .order('scan_date', { ascending: false })
      .limit(limit || 200);
    if (error) throw error;
    return { country, observations: data || [] };
  } catch (err) {
    return { country, observations: [], error: err.message };
  }
}

// Global ledger stats — used to generate the 90-day dossier (Step 33).
async function getLedgerStats() {
  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from('observations')
      .select('grade, risk_level, direction, country');
    if (error) throw error;

    const total   = data.length;
    const graded  = data.filter(o => o.grade).length;
    const open    = total - graded;
    const hits    = data.filter(o => o.grade === 'HIT').length;
    const misses  = data.filter(o => o.grade === 'MISS').length;
    const partial = data.filter(o => o.grade === 'PARTIAL').length;
    const hit_rate = graded ? Math.round((hits / graded) * 100) : null;

    const byLevel = {};
    for (const o of data) {
      byLevel[o.risk_level] = byLevel[o.risk_level] || { total: 0, hits: 0 };
      byLevel[o.risk_level].total++;
      if (o.grade === 'HIT') byLevel[o.risk_level].hits++;
    }

    return { total, graded, open, hits, misses, partial, hit_rate, by_level: byLevel };
  } catch (err) {
    return { error: err.message };
  }
}

// Verify the observations table exists — called on startup.
async function testLedger() {
  try {
    const supabase = getClient();
    const { error } = await supabase.from('observations').select('id').limit(1);
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = {
  createObservation,
  getOpenObservations,
  getObservationsDueForGrading,
  gradeObservation,
  getCountryLedger,
  getLedgerStats,
  testLedger,
  WINDOW_DAYS
};

// Standalone test: node observation_ledger.cjs
if (require.main === module) {
  testLedger().then(r => {
    console.log('Ledger table check:', r.ok ? 'OK' : 'MISSING — run schema SQL in Supabase SQL editor');
    if (!r.ok) console.log('Error:', r.error);
  });
}
