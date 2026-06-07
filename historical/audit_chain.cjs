// historical/audit_chain.cjs
// Sabian Immutable Audit Chain
//
// Every significant system event is logged here with a SHA256 hash chain.
// Each row's payload_hash = SHA256(JSON.stringify(payload) + previous_hash).
// Tampering with any record breaks the chain from that point forward.
//
// Event types:
//   scan_complete       — daily global scan finished (153 countries)
//   score_computed      — single country convergence score saved
//   dossier_generated   — intelligence dossier built for a country
//   pattern_run         — nightly pattern matcher completed
//   alert_fired         — subscriber alert triggered and delivered
//   threshold_crossing  — country changed risk band
//
// All writes are fire-and-forget (non-blocking). Audit failures never
// interrupt primary system flows.
//
// Usage:
//   const { logAuditEvent, verifyChain, getAuditTrail, getEventByHash } = require('./audit_chain.cjs');
//   await logAuditEvent('score_computed', 'Yemen', { score: 78, band: 'WARNING', ... });

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

let _sb = null;
function getSb() {
  if (_sb) return _sb;
  _sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  return _sb;
}

// ── Hash computation ──────────────────────────────────────────────────────────

function computeHash(payload, previousHash) {
  const payloadStr = JSON.stringify(payload, Object.keys(payload).sort());
  return crypto.createHash('sha256').update(payloadStr + previousHash).digest('hex');
}

// ── Get previous hash (most recent row) ──────────────────────────────────────

async function getPreviousHash() {
  const { data, error } = await getSb()
    .from('immutable_audit_log')
    .select('payload_hash')
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return 'genesis';
  return data.payload_hash;
}

// ── Core log function ─────────────────────────────────────────────────────────

async function logAuditEvent(eventType, country, payload) {
  try {
    const previousHash = await getPreviousHash();
    const fullPayload  = {
      event_type: eventType,
      country:    country || null,
      logged_at:  new Date().toISOString(),
      ...payload
    };
    const payloadHash = computeHash(fullPayload, previousHash);

    const { error } = await getSb()
      .from('immutable_audit_log')
      .insert({
        event_type:    eventType,
        logged_at:     fullPayload.logged_at,
        country:       country || null,
        payload_hash:  payloadHash,
        previous_hash: previousHash,
        payload:       fullPayload,
      });

    if (error) throw error;
    return { logged: true, hash: payloadHash };
  } catch (err) {
    // Audit failures must never crash primary flows
    console.error(`[AUDIT] Log failed (${eventType}/${country}): ${err.message}`);
    return { logged: false, error: err.message };
  }
}

// ── Chain verification ────────────────────────────────────────────────────────

async function verifyChain(options = {}) {
  const limit  = options.limit || 10000;
  const offset = options.offset || 0;

  const { data, error } = await getSb()
    .from('immutable_audit_log')
    .select('id,event_type,logged_at,country,payload_hash,previous_hash,payload')
    .order('id', { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  if (!data || data.length === 0) {
    return { valid: true, records_verified: 0, chain_head: 'genesis', message: 'Chain is empty' };
  }

  let expectedPreviousHash = 'genesis';
  let broken_at = null;

  for (const row of data) {
    // Verify the chain link
    if (row.previous_hash !== expectedPreviousHash) {
      broken_at = { id: row.id, event_type: row.event_type, logged_at: row.logged_at };
      break;
    }

    // Recompute hash to verify payload hasn't been altered
    const recomputed = computeHash(row.payload, row.previous_hash);
    if (recomputed !== row.payload_hash) {
      broken_at = { id: row.id, event_type: row.event_type, logged_at: row.logged_at, reason: 'payload_tampered' };
      break;
    }

    expectedPreviousHash = row.payload_hash;
  }

  if (broken_at) {
    return {
      valid:            false,
      records_verified: data.indexOf(data.find(r => r.id === broken_at.id)),
      broken_at,
      chain_head:       expectedPreviousHash,
      total_checked:    data.length,
    };
  }

  return {
    valid:            true,
    records_verified: data.length,
    chain_head:       data[data.length - 1].payload_hash,
    oldest_record:    data[0]?.logged_at,
    newest_record:    data[data.length - 1]?.logged_at,
    total_checked:    data.length,
  };
}

// ── Get audit trail for a country ────────────────────────────────────────────

async function getAuditTrail(country, options = {}) {
  const limit = Math.min(options.limit || 100, 1000);

  const { data, error } = await getSb()
    .from('immutable_audit_log')
    .select('id,event_type,logged_at,payload_hash,previous_hash,payload')
    .eq('country', country)
    .order('id', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

// ── Get single event by hash ──────────────────────────────────────────────────

async function getEventByHash(hash) {
  const { data, error } = await getSb()
    .from('immutable_audit_log')
    .select('*')
    .eq('payload_hash', hash)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

// ── Get summary stats ─────────────────────────────────────────────────────────

async function getChainStats() {
  const { count } = await getSb()
    .from('immutable_audit_log')
    .select('*', { count: 'exact', head: true });

  const { data: newest } = await getSb()
    .from('immutable_audit_log')
    .select('id,event_type,logged_at,country,payload_hash')
    .order('id', { ascending: false })
    .limit(5);

  const { data: oldest } = await getSb()
    .from('immutable_audit_log')
    .select('id,event_type,logged_at,country,payload_hash')
    .order('id', { ascending: true })
    .limit(1);

  return {
    total_records:  count || 0,
    genesis_record: oldest?.[0] || null,
    recent_events:  newest || [],
  };
}

module.exports = {
  logAuditEvent,
  verifyChain,
  getAuditTrail,
  getEventByHash,
  getChainStats,
};
