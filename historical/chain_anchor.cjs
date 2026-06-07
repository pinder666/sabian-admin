// historical/chain_anchor.cjs
// Sabian External Hash Chain Anchor
//
// Runs weekly (Sunday 03:00 UTC). Reads the current chain heads for all sealed
// tables, builds a canonical anchor payload, hashes it, then submits to two
// independent external timestamping services:
//
//   1. RFC 3161 (FreeTSA.org) — PKI-signed timestamp token (TSR).
//      Verifiable with standard OpenSSL, no special tools needed.
//      Command: openssl ts -verify -in tsr.der -digest <anchor_hash> -CAfile freetsa.crt
//
//   2. OpenTimestamps (Bitcoin) — hash embedded in Bitcoin blockchain.
//      Immutable once confirmed (~1 hour). Verifiable at opentimestamps.org.
//      Command: ots verify proof.ots (requires ots CLI)
//
// Both proofs are stored in chain_anchors. Buyers download from:
//   GET /api/verify/anchor/:date/tsr    — RFC 3161 TSR (binary)
//   GET /api/verify/anchor/:date/ots    — OTS proof (binary)
//   GET /api/verify/anchors             — All anchor records
//
// Run manually: node historical/chain_anchor.cjs [--run-now]

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const crypto  = require('crypto');
const https   = require('https');
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Chain head readers ────────────────────────────────────────────────────────

async function getTableChainState(tableName) {
  const { data: head } = await sb
    .from(tableName)
    .select('row_hash')
    .not('row_hash', 'is', null)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { count } = await sb
    .from(tableName)
    .select('*', { count: 'exact', head: true });

  return { chain_head: head?.row_hash || 'genesis', row_count: count || 0 };
}

async function getAuditChainState() {
  const { data: head } = await sb
    .from('immutable_audit_log')
    .select('payload_hash')
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { count } = await sb
    .from('immutable_audit_log')
    .select('*', { count: 'exact', head: true });

  return { chain_head: head?.payload_hash || 'genesis', row_count: count || 0 };
}

// ── Anchor payload and hash ───────────────────────────────────────────────────

function buildAnchorPayload(anchorDate, csState, obsState, auditState) {
  return {
    anchor_date:   anchorDate,
    created_at:    new Date().toISOString(),
    system:        'Sabian Intelligence',
    chains: {
      convergence_scores:  { head: csState.chain_head,    row_count: csState.row_count },
      observations:        { head: obsState.chain_head,   row_count: obsState.row_count },
      immutable_audit_log: { head: auditState.chain_head, row_count: auditState.row_count },
    },
  };
}

function computeAnchorHash(payload) {
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

// ── RFC 3161 timestamp request builder (no external deps) ─────────────────────
// Manually encodes the minimal ASN.1 TimeStampReq for SHA-256.
//
// Structure:
//   TimeStampReq SEQUENCE {
//     version  INTEGER  v1(1)
//     messageImprint SEQUENCE {
//       hashAlgorithm  AlgorithmIdentifier { SHA-256 OID, NULL }
//       hashedMessage  OCTET STRING (32 bytes)
//     }
//     certReq  BOOLEAN TRUE
//   }

function buildRFC3161TSQ(hashHex) {
  // SHA-256 OID: 2.16.840.1.101.3.4.2.1
  // AlgorithmIdentifier: SEQUENCE(OID, NULL)  = 30 0d 06 09 60 86 48 01 65 03 04 02 01 05 00
  // MessageImprint: SEQUENCE(AlgId, OCTET STRING) = 30 31 [AlgId][04 20 hash]
  // TimeStampReq: SEQUENCE(version, msgImprint, certReq) = 30 39 [02 01 01][msgImprint][01 01 ff]

  const hashBytes  = Buffer.from(hashHex, 'hex'); // 32 bytes
  const prefix     = Buffer.from('30390201013031300d060960864801650304020105000420', 'hex');
  const suffix     = Buffer.from('0101ff', 'hex');
  return Buffer.concat([prefix, hashBytes, suffix]); // 59 bytes total
}

// ── RFC 3161 submission (FreeTSA.org) ─────────────────────────────────────────

async function submitRFC3161(tsq, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('RFC3161 request timed out')), timeoutMs);
    const req = https.request({
      hostname: 'freetsa.org',
      path:     '/tsr',
      method:   'POST',
      headers:  {
        'Content-Type':   'application/timestamp-query',
        'Content-Length': tsq.length,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        clearTimeout(timer);
        const body = Buffer.concat(chunks);
        if (res.statusCode === 200) {
          resolve(body);
        } else {
          reject(new Error(`FreeTSA HTTP ${res.statusCode} — ${body.slice(0, 80).toString('utf8', 0, 80)}`));
        }
      });
    });
    req.on('error', (e) => { clearTimeout(timer); reject(e); });
    req.write(tsq);
    req.end();
  });
}

// ── OpenTimestamps submission ──────────────────────────────────────────────────
// Submits 32-byte SHA256 hash to OTS Bitcoin calendar.
// Returns partial proof (Bitcoin confirmation typically takes ~1 hour).

// OTS calendar servers — try multiple paths per host since the API varies by server version
const OTS_TARGETS = [
  { host: 'alice.btc.calendar.opentimestamps.org', path: '/digest' },
  { host: 'alice.btc.calendar.opentimestamps.org', path: '/timestamp' },
  { host: 'bob.btc.calendar.opentimestamps.org',   path: '/digest' },
  { host: 'bob.btc.calendar.opentimestamps.org',   path: '/timestamp' },
  { host: 'finney.calendar.eternitywall.com',       path: '/digest' },
];

async function submitOTS(hashHex, timeoutMs = 15000) {
  const hashBytes = Buffer.from(hashHex, 'hex');
  const errors = [];

  for (const { host, path } of OTS_TARGETS) {
    try {
      const proof = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('OTS request timed out')), timeoutMs);
        const req = https.request({
          hostname: host,
          path,
          method:   'POST',
          headers:  {
            'Content-Type':   'application/octet-stream',
            'Content-Length': hashBytes.length,
            'Accept':         'application/octet-stream',
          },
        }, (res) => {
          const chunks = [];
          res.on('data', c => chunks.push(c));
          res.on('end', () => {
            clearTimeout(timer);
            const body = Buffer.concat(chunks);
            if (res.statusCode === 200) {
              resolve(body);
            } else {
              reject(new Error(`HTTP ${res.statusCode} — ${body.slice(0, 60).toString('ascii')}`));
            }
          });
        });
        req.on('error', (e) => { clearTimeout(timer); reject(e); });
        req.write(hashBytes);
        req.end();
      });
      return { proof, calendar: `${host}${path}` };
    } catch (err) {
      errors.push(`${host}${path}: ${err.message}`);
    }
  }

  throw new Error('All OTS endpoints failed: ' + errors.join('; '));
}

// ── Main anchor run ───────────────────────────────────────────────────────────

async function runAnchor(forceDate = null) {
  const anchorDate = forceDate || new Date().toISOString().slice(0, 10);
  console.log(`[ANCHOR] Running for ${anchorDate}`);

  // Skip if anchor already exists for today
  const { data: existing } = await sb
    .from('chain_anchors')
    .select('id,anchor_hash')
    .eq('anchor_date', anchorDate)
    .maybeSingle();

  if (existing && !forceDate) {
    console.log(`[ANCHOR] Anchor already exists for ${anchorDate} (id=${existing.id}). Skipping.`);
    return { skipped: true, anchor_date: anchorDate, anchor_hash: existing.anchor_hash };
  }

  // Read chain states
  console.log('[ANCHOR] Reading chain states...');
  const [csState, obsState, auditState] = await Promise.all([
    getTableChainState('convergence_scores'),
    getTableChainState('observations'),
    getAuditChainState(),
  ]);

  console.log(`  convergence_scores: ${csState.row_count} rows, head: ${csState.chain_head.slice(0, 16)}...`);
  console.log(`  observations:       ${obsState.row_count} rows, head: ${obsState.chain_head.slice(0, 16)}...`);
  console.log(`  audit_log:          ${auditState.row_count} rows, head: ${auditState.chain_head.slice(0, 16)}...`);

  // Build anchor payload and hash
  const payload    = buildAnchorPayload(anchorDate, csState, obsState, auditState);
  const anchorHash = computeAnchorHash(payload);
  console.log(`[ANCHOR] Anchor hash: ${anchorHash}`);

  // Insert anchor record (without proofs yet — update after external submissions)
  const anchorRow = {
    anchor_date:    anchorDate,
    anchor_hash:    anchorHash,
    anchor_payload: payload,
    cs_chain_head:  csState.chain_head,
    obs_chain_head: obsState.chain_head,
    audit_chain_head: auditState.chain_head,
    cs_row_count:   csState.row_count,
    obs_row_count:  obsState.row_count,
    audit_row_count: auditState.row_count,
    rfc3161_status: 'pending',
    ots_status:     'pending',
  };

  const { data: inserted, error: insertErr } = await sb
    .from('chain_anchors')
    .upsert(anchorRow, { onConflict: 'anchor_date' })
    .select('id')
    .single();

  if (insertErr) throw new Error(`Failed to insert anchor: ${insertErr.message}`);
  const anchorId = inserted.id;
  console.log(`[ANCHOR] Anchor record created (id=${anchorId})`);

  // ── RFC 3161 submission ──────────────────────────────────────────────────────
  let rfc3161Update = {};
  try {
    console.log('[ANCHOR] Submitting to FreeTSA (RFC 3161)...');
    const tsq = buildRFC3161TSQ(anchorHash);
    const tsr = await submitRFC3161(tsq);
    rfc3161Update = {
      rfc3161_tsr_b64:      tsr.toString('base64'),
      rfc3161_submitted_at: new Date().toISOString(),
      rfc3161_status:       'submitted',
    };
    console.log(`[ANCHOR] RFC 3161 TSR received (${tsr.length} bytes)`);
  } catch (err) {
    rfc3161Update = { rfc3161_status: 'failed' };
    console.error(`[ANCHOR] RFC 3161 failed: ${err.message}`);
  }

  // ── OpenTimestamps submission ────────────────────────────────────────────────
  let otsUpdate = {};
  try {
    console.log('[ANCHOR] Submitting to OpenTimestamps (Bitcoin)...');
    const { proof, calendar } = await submitOTS(anchorHash);
    otsUpdate = {
      ots_proof_b64:      proof.toString('base64'),
      ots_submitted_at:   new Date().toISOString(),
      ots_status:         'submitted',
    };
    console.log(`[ANCHOR] OTS proof received from ${calendar} (${proof.length} bytes) — Bitcoin confirmation pending (~1hr)`);
  } catch (err) {
    otsUpdate = { ots_status: 'failed' };
    console.error(`[ANCHOR] OpenTimestamps failed: ${err.message}`);
  }

  // Update anchor record with proofs
  const { error: updateErr } = await sb
    .from('chain_anchors')
    .update({ ...rfc3161Update, ...otsUpdate })
    .eq('id', anchorId);

  if (updateErr) console.error(`[ANCHOR] Failed to update proofs: ${updateErr.message}`);

  const finalRfc = rfc3161Update.rfc3161_status || 'failed';
  const finalOts = otsUpdate.ots_status || 'failed';

  console.log(`\n[ANCHOR] Complete.`);
  console.log(`  anchor_date:  ${anchorDate}`);
  console.log(`  anchor_hash:  ${anchorHash}`);
  console.log(`  RFC 3161:     ${finalRfc}`);
  console.log(`  OTS Bitcoin:  ${finalOts}`);

  return {
    anchor_date:   anchorDate,
    anchor_hash:   anchorHash,
    anchor_id:     anchorId,
    rfc3161:       finalRfc,
    ots:           finalOts,
  };
}

// ── Retry OTS for a specific anchor date ─────────────────────────────────────

async function retryOTS(anchorDate) {
  const { data, error } = await sb
    .from('chain_anchors')
    .select('id,anchor_hash,ots_status')
    .eq('anchor_date', anchorDate)
    .maybeSingle();

  if (error || !data) throw new Error(`No anchor found for ${anchorDate}`);
  if (data.ots_status === 'submitted') {
    console.log(`[ANCHOR] OTS already submitted for ${anchorDate}`);
    return { skipped: true };
  }

  console.log(`[ANCHOR] Retrying OTS for ${anchorDate}, hash: ${data.anchor_hash}`);
  try {
    const { proof, calendar } = await submitOTS(data.anchor_hash);
    await sb.from('chain_anchors').update({
      ots_proof_b64:    proof.toString('base64'),
      ots_submitted_at: new Date().toISOString(),
      ots_status:       'submitted',
    }).eq('id', data.id);
    console.log(`[ANCHOR] OTS proof received from ${calendar} (${proof.length} bytes)`);
    return { submitted: true, calendar };
  } catch (err) {
    console.error(`[ANCHOR] OTS retry failed: ${err.message}`);
    return { submitted: false, error: err.message };
  }
}

module.exports = { runAnchor, retryOTS };

// CLI entry point
if (require.main === module) {
  const retryFlag = process.argv.indexOf('--retry-ots');
  if (retryFlag !== -1) {
    const date = process.argv[retryFlag + 1] || new Date().toISOString().slice(0, 10);
    retryOTS(date)
      .then(r => { console.log(JSON.stringify(r, null, 2)); process.exit(0); })
      .catch(err => { console.error('FATAL:', err.message); process.exit(1); });
  } else {
    runAnchor()
      .then(r => {
        if (!r.skipped) console.log('\n✓ Anchor run complete:', JSON.stringify(r, null, 2));
        process.exit(0);
      })
      .catch(err => {
        console.error('FATAL:', err.message);
        process.exit(1);
      });
  }
}
