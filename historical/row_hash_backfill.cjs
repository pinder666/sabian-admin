// historical/row_hash_backfill.cjs
// One-time backfill: seal all existing rows in convergence_scores and observations
// with SHA256 row-level hash chains.
//
// Run after MIGRATION_ROW_HASH_CHAIN.sql has been applied:
//   node historical/row_hash_backfill.cjs
//
// Hash formula (consistent with ongoing writes):
//   row_hash = SHA256(JSON.stringify(canonical_fields, sorted_keys) + prev_hash)
//   prev_hash of first row = 'genesis'
//   prev_hash of row N = row_hash of row N-1 (ordered ascending by id)

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function computeRowHash(fields, prevHash) {
  const canonical = JSON.stringify(fields, Object.keys(fields).sort());
  return crypto.createHash('sha256').update(canonical + prevHash).digest('hex');
}

// ── Fields hashed per table (deterministic, sorted) ──────────────────────────

function csFields(row) {
  return {
    country:           row.country,
    convergence_score: row.convergence_score,
    created_at:        row.created_at,
    freshness_pct:     row.freshness_pct ?? null,
    id:                row.id,
    risk_level:        row.risk_level,
    scan_date:         row.scan_date,
    signals_available: row.signals_available,
    trajectory:        row.trajectory || 'STABLE',
  };
}

function obsFields(row) {
  return {
    convergence_score:   row.convergence_score,
    country:             row.country,
    created_at:          row.created_at,
    direction:           row.direction,
    id:                  row.id,
    previous_risk_level: row.previous_risk_level || null,
    risk_level:          row.risk_level,
    scan_date:           row.scan_date,
    window_closes_at:    row.window_closes_at,
    window_days:         row.window_days,
  };
}

// ── Backfill one table ────────────────────────────────────────────────────────

async function backfillTable(tableName, fieldsFn, batchSize = 200) {
  console.log(`\n[${tableName}] Fetching rows...`);

  // Fetch all rows ordered by id ascending
  let allRows = [];
  let offset = 0;
  while (true) {
    const { data, error } = await sb
      .from(tableName)
      .select('*')
      .order('id', { ascending: true })
      .range(offset, offset + batchSize - 1);
    if (error) throw new Error(`${tableName} fetch error: ${error.message}`);
    if (!data || data.length === 0) break;
    allRows = allRows.concat(data);
    if (data.length < batchSize) break;
    offset += batchSize;
  }

  console.log(`[${tableName}] ${allRows.length} rows to seal`);

  // Skip rows already sealed
  const unsealed = allRows.filter(r => !r.row_hash);
  const alreadySealed = allRows.length - unsealed.length;
  if (alreadySealed > 0) console.log(`[${tableName}] ${alreadySealed} already sealed, skipping`);
  if (unsealed.length === 0) { console.log(`[${tableName}] All rows already sealed.`); return 0; }

  // Build hash chain starting from the last sealed row
  let prevHash = 'genesis';
  const lastSealed = allRows.slice().reverse().find(r => r.row_hash);
  if (lastSealed) prevHash = lastSealed.row_hash;

  // Process unsealed rows in id order
  let written = 0;
  for (const row of unsealed) {
    const fields = fieldsFn(row);
    const rowHash = computeRowHash(fields, prevHash);

    const { error } = await sb
      .from(tableName)
      .update({ row_hash: rowHash, prev_hash: prevHash })
      .eq('id', row.id);

    if (error) {
      console.error(`[${tableName}] Failed row id=${row.id}: ${error.message}`);
      continue;
    }
    prevHash = rowHash;
    written++;

    if (written % 100 === 0) process.stdout.write(`  ${written}/${unsealed.length}\r`);
  }

  console.log(`[${tableName}] Sealed ${written}/${unsealed.length} rows. Chain head: ${prevHash.slice(0, 16)}...`);
  return written;
}

// ── Verify chain after backfill ───────────────────────────────────────────────

async function verifyTable(tableName, fieldsFn) {
  const { data, error } = await sb
    .from(tableName)
    .select('id,row_hash,prev_hash,' + Object.keys(fieldsFn({ id:0, country:'', scan_date:'', convergence_score:0, risk_level:'', trajectory:'', signals_available:0, freshness_pct:null, created_at:'', direction:'', previous_risk_level:'', window_closes_at:'', window_days:0 })).join(','))
    .order('id', { ascending: true });

  if (error) { console.error(`Verify fetch error: ${error.message}`); return false; }

  let expectedPrev = 'genesis';
  let broken = null;

  for (const row of data) {
    if (!row.row_hash) { broken = { id: row.id, reason: 'missing_hash' }; break; }
    if (row.prev_hash !== expectedPrev) { broken = { id: row.id, reason: 'chain_broken', expected: expectedPrev, got: row.prev_hash }; break; }
    const fields = fieldsFn(row);
    const recomputed = computeRowHash(fields, row.prev_hash);
    if (recomputed !== row.row_hash) { broken = { id: row.id, reason: 'hash_mismatch' }; break; }
    expectedPrev = row.row_hash;
  }

  if (broken) {
    console.log(`[${tableName}] CHAIN BROKEN at id=${broken.id} — reason: ${broken.reason}`);
    return false;
  }
  console.log(`[${tableName}] Chain VERIFIED — ${data.length} rows, head: ${expectedPrev.slice(0, 16)}...`);
  return true;
}

// ── Main ──────────────────────────────────────────────────────────────────────

(async () => {
  try {
    console.log('=== Sabian Row Hash Chain Backfill ===');
    console.log('Sealing convergence_scores and observations...\n');

    await backfillTable('convergence_scores', csFields);
    await backfillTable('observations', obsFields);

    console.log('\n=== Verification ===');

    // Simplified verify — re-fetch and check chain integrity
    const { data: cs, error: cse } = await sb
      .from('convergence_scores')
      .select('id,row_hash,prev_hash')
      .order('id', { ascending: true });
    if (cse) throw cse;

    let csValid = true;
    let prev = 'genesis';
    for (const r of cs) {
      if (!r.row_hash || r.prev_hash !== prev) { csValid = false; break; }
      prev = r.row_hash;
    }
    console.log(`convergence_scores: ${csValid ? 'VERIFIED' : 'BROKEN'} — ${cs.length} rows, head: ${prev.slice(0, 16)}...`);

    const { data: obs, error: obe } = await sb
      .from('observations')
      .select('id,row_hash,prev_hash')
      .order('id', { ascending: true });
    if (obe) throw obe;

    let obsValid = true;
    prev = 'genesis';
    for (const r of obs) {
      if (!r.row_hash || r.prev_hash !== prev) { obsValid = false; break; }
      prev = r.row_hash;
    }
    console.log(`observations: ${obsValid ? 'VERIFIED' : 'BROKEN'} — ${obs.length} rows, head: ${prev.slice(0, 16)}...`);

    if (csValid && obsValid) {
      console.log('\n✓ Both tables sealed and verified. Hash chain is live.');
    } else {
      console.log('\n✗ Verification failed — check individual table logs above.');
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal error:', err.message);
    process.exit(1);
  }
})();
