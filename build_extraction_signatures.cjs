// build_extraction_signatures.cjs
// Sabian :: Extraction Pattern Classifier
// =============================================================================
// Reads actor_event_links (1M rows), detects provable extraction patterns,
// writes to extraction_signatures. Names never touched — all logic on hashes.
//
// Three patterns detected (provable from current data):
//
//   VULTURE_PLAY      — COURTLISTENER actors filing POST a CRITICAL crossing
//                       with 2+ recurring seats (same hash in 3+ countries)
//
//   INSIDER_EXIT      — SEC_EDGAR_FULLTEXT or UK_COMPANIES_HOUSE actors filing
//                       PRE a CRITICAL or WARNING crossing within 180 days,
//                       high volume (5+ actors), cluster pattern
//
//   ACTIVE_POSITIONING — SEC_EDGAR_13F actors filing PRE a crossing with
//                        meaningful lag concentration (-365 to -30 days)
//
// Confidence:
//   HIGH   — pattern matches + recurring seats present + tight lag window
//   MEDIUM — pattern matches + no recurring seats or wider lag
//   REVIEW — partial match only
//
// Run: node build_extraction_signatures.cjs
// Safe to re-run: ON CONFLICT DO NOTHING on extraction_signatures
// =============================================================================

require('dotenv').config();
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const PAGE = 1000;

// ---------- HASH CHAIN ----------
async function getLastHash() {
  const { data } = await sb
    .from('extraction_signatures')
    .select('row_hash')
    .not('row_hash', 'is', null)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data && data.row_hash) || 'genesis';
}

function rowHash(fields, prev) {
  const json = JSON.stringify(fields, Object.keys(fields).sort());
  return crypto.createHash('sha256').update(json + prev).digest('hex');
}

// ---------- LOAD ALL LINKS ----------
async function loadLinks() {
  console.log('[load] reading actor_event_links...');
  const all = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from('actor_event_links')
      .select('id, country, event_date, event_type, event_score, event_delta, actor_hash, source, filing_date, lag_days, window_phase, confidence')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`load failed: ${error.message}`);
    if (!data || !data.length) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
    if (from % 50000 === 0) console.log(`  loaded ${from}...`);
    await sleep(50);
  }
  console.log(`[load] ${all.length} links loaded\n`);
  return all;
}

// ---------- BUILD RECURRING SEAT INDEX ----------
function buildRecurringIndex(links) {
  // actor_hash -> Set of countries where they appear near ANY event
  const hashCountries = {};
  for (const l of links) {
    if (!hashCountries[l.actor_hash]) hashCountries[l.actor_hash] = new Set();
    hashCountries[l.actor_hash].add(l.country);
  }
  // Only actors in 3+ countries are "recurring seats"
  const recurring = new Set();
  for (const [hash, countries] of Object.entries(hashCountries)) {
    if (countries.size >= 3) recurring.add(hash);
  }
  console.log(`[index] ${recurring.size} recurring seat actors (3+ countries)\n`);
  return recurring;
}

// ---------- GROUP BY EVENT ----------
function groupByEvent(links) {
  const events = {};
  for (const l of links) {
    const key = `${l.country}|${l.event_date}|${l.event_type}`;
    if (!events[key]) events[key] = {
      country: l.country,
      event_date: l.event_date,
      event_type: l.event_type,
      event_score: l.event_score,
      event_delta: l.event_delta,
      links: []
    };
    events[key].links.push(l);
  }
  return Object.values(events);
}

// ---------- CLASSIFIERS ----------

function detectVulturePlay(event, recurring) {
  // POST window, COURTLISTENER source, CRITICAL crossing
  const postLinks = event.links.filter(l =>
    l.window_phase === 'POST' &&
    l.source === 'COURTLISTENER' &&
    l.lag_days >= 0 && l.lag_days <= 730
  );
  if (!postLinks.length) return null;
  const isCritical = (event.event_score || 0) >= 66 || Math.abs(event.event_delta || 0) >= 15;
  if (!isCritical) return null;

  const actorHashes = [...new Set(postLinks.map(l => l.actor_hash))];
  const recurringCount = actorHashes.filter(h => recurring.has(h)).length;
  const linkIds = postLinks.map(l => l.id);

  const tightLinks = postLinks.filter(l => l.lag_days <= 365);
  let confidence = 'REVIEW';
  if (recurringCount >= 2 && tightLinks.length >= 2) confidence = 'HIGH';
  else if (recurringCount >= 1 || tightLinks.length >= 3) confidence = 'MEDIUM';

  const dates = postLinks.map(l => new Date(l.filing_date)).sort((a,b) => a-b);
  return {
    pattern_id: 'VULTURE_PLAY',
    actor_count: actorHashes.length,
    recurring_count: recurringCount,
    primary_window: 'POST',
    confidence,
    evidence_link_ids: linkIds,
    date_range_start: event.event_date,
    date_range_end: dates[dates.length-1]?.toISOString().slice(0,10) || event.event_date
  };
}

function detectInsiderExit(event, recurring) {
  // PRE window, operational sources, within 180 days, 5+ actors
  const preLinks = event.links.filter(l =>
    l.window_phase === 'PRE' &&
    (l.source === 'SEC_EDGAR_FULLTEXT' || l.source === 'UK_COMPANIES_HOUSE') &&
    l.lag_days >= -180 && l.lag_days < 0
  );
  if (preLinks.length < 5) return null;
  const isMeaningful = Math.abs(event.event_delta || 0) >= 10;
  if (!isMeaningful) return null;

  const actorHashes = [...new Set(preLinks.map(l => l.actor_hash))];
  const recurringCount = actorHashes.filter(h => recurring.has(h)).length;
  const linkIds = preLinks.map(l => l.id);

  let confidence = 'REVIEW';
  if (recurringCount >= 2 && actorHashes.length >= 10) confidence = 'HIGH';
  else if (actorHashes.length >= 7 || recurringCount >= 1) confidence = 'MEDIUM';

  const dates = preLinks.map(l => new Date(l.filing_date)).sort((a,b) => a-b);
  return {
    pattern_id: 'INSIDER_EXIT',
    actor_count: actorHashes.length,
    recurring_count: recurringCount,
    primary_window: 'PRE',
    confidence,
    evidence_link_ids: linkIds,
    date_range_start: dates[0]?.toISOString().slice(0,10) || event.event_date,
    date_range_end: event.event_date
  };
}

function detectActivePositioning(event, recurring) {
  // PRE window, SEC_EDGAR_13F, -365 to -30 days
  const preLinks = event.links.filter(l =>
    l.window_phase === 'PRE' &&
    l.source === 'SEC_EDGAR_13F' &&
    l.lag_days >= -365 && l.lag_days <= -30
  );
  if (preLinks.length < 3) return null;

  const actorHashes = [...new Set(preLinks.map(l => l.actor_hash))];
  const recurringCount = actorHashes.filter(h => recurring.has(h)).length;
  const linkIds = preLinks.map(l => l.id);

  let confidence = 'REVIEW';
  if (recurringCount >= 2 && actorHashes.length >= 5) confidence = 'HIGH';
  else if (actorHashes.length >= 3 || recurringCount >= 1) confidence = 'MEDIUM';

  const dates = preLinks.map(l => new Date(l.filing_date)).sort((a,b) => a-b);
  return {
    pattern_id: 'ACTIVE_POSITIONING',
    actor_count: actorHashes.length,
    recurring_count: recurringCount,
    primary_window: 'PRE',
    confidence,
    evidence_link_ids: linkIds,
    date_range_start: dates[0]?.toISOString().slice(0,10) || event.event_date,
    date_range_end: event.event_date
  };
}

// ---------- WRITE SIGNATURES ----------
async function writeSignatures(sigs) {
  if (!sigs.length) return 0;
  const CHUNK = 100;
  let written = 0;
  for (let i = 0; i < sigs.length; i += CHUNK) {
    const slice = sigs.slice(i, i + CHUNK);
    const { error } = await sb
      .from('extraction_signatures')
      .upsert(slice, {
        onConflict: 'country,date_range_start,date_range_end,pattern_id',
        ignoreDuplicates: true
      });
    if (error) console.warn(`  [warn] write failed: ${error.message}`);
    else written += slice.length;
    await sleep(100);
  }
  return written;
}

// ---------- MAIN ----------
(async () => {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  EXTRACTION PATTERN CLASSIFIER :: build_extraction_signatures');
  console.log('  Patterns: VULTURE_PLAY | INSIDER_EXIT | ACTIVE_POSITIONING');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const t0 = Date.now();
  const prevHashRef = { current: await getLastHash() };
  console.log(`[boot] hash tip: ${prevHashRef.current.slice(0,16)}…\n`);

  const links    = await loadLinks();
  const recurring = buildRecurringIndex(links);
  const events   = groupByEvent(links);
  console.log(`[classify] ${events.length} events to classify\n`);

  const signatures = [];

  for (const event of events) {
    const detectors = [detectVulturePlay, detectInsiderExit, detectActivePositioning];
    for (const detect of detectors) {
      const result = detect(event, recurring);
      if (!result) continue;
      const fields = {
        country:          event.country,
        event_date:       event.event_date,
        event_type:       event.event_type,
        date_range_start: result.date_range_start,
        date_range_end:   result.date_range_end,
        pattern_id:       result.pattern_id,
        actor_count:      result.actor_count,
        recurring_count:  result.recurring_count,
        primary_window:   result.primary_window,
        confidence:       result.confidence,
        evidence_link_ids: result.evidence_link_ids
      };
      const rh = rowHash(fields, prevHashRef.current);
      fields.row_hash  = rh;
      fields.prev_hash = prevHashRef.current;
      prevHashRef.current = rh;
      signatures.push(fields);
    }
  }

  console.log(`[classify] ${signatures.length} signatures detected`);

  // Summary by pattern + confidence
  const summary = {};
  for (const s of signatures) {
    const k = `${s.pattern_id}::${s.confidence}`;
    summary[k] = (summary[k] || 0) + 1;
  }
  for (const [k, v] of Object.entries(summary).sort()) {
    console.log(`  ${k}: ${v}`);
  }

  console.log('\n[write] writing to extraction_signatures...');
  const written = await writeSignatures(signatures);

  const elapsed = Math.round((Date.now() - t0) / 1000);
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  ✅  DONE`);
  console.log(`  Signatures detected :: ${signatures.length}`);
  console.log(`  Written to DB       :: ${written}`);
  console.log(`  Elapsed             :: ${elapsed}s`);
  console.log(`  Hash tip            :: ${prevHashRef.current}`);
  console.log('═══════════════════════════════════════════════════════════════');
})().catch(err => { console.error(err); process.exit(1); });
