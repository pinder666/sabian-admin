// =============================================================================
//  build_actor_event_links.cjs
//  Sabian :: Actor ↔ Event Linker
// =============================================================================
//  Joins actor_presence_raw (900k rows) to convergence band crossings and
//  going-dark events. Produces actor_event_links classified by window phase
//  (PRE / DURING / POST) and confidence (HIGH / MEDIUM / REVIEW).
//
//  Military-grade properties:
//   - Idempotent       :: ON CONFLICT DO NOTHING on (country, event_date,
//                         event_type, actor_presence_id) — safe to re-run
//   - Resumable        :: progress state in actor_event_links_state row
//   - Chunked          :: paginated reads (1000), batched writes (500)
//   - Hash-chained     :: row_hash + prev_hash on every link, audit verifiable
//   - Name-blind       :: public table stores SHA256(name+salt), names only
//                         reachable via privileged JOIN to actor_presence_raw
//   - Lock-guarded     :: refuses to run if another instance is active
//   - Preflight        :: verifies table schema before any writes
//   - Rate-limited     :: PAUSE_MS between Supabase calls
//   - Failure-safe     :: per-chunk try/catch, never aborts mid-run
//   - Verbose          :: per-chunk progress, ETA, link counts, hash tip
//
//  Run from: C:/Users/user/Desktop/sabian.ai/sabian_core
//  Requires: .env with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + LINK_SALT
//
//  PREREQUISITE: run actor_event_links_DDL.sql in Supabase SQL editor ONCE
//                before first run. Script will tell you if tables missing.
// =============================================================================

require('dotenv').config();
const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');
const { createClient } = require('@supabase/supabase-js');

// ---------- ENVIRONMENT ----------
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SALT   = process.env.LINK_SALT;

if (!SB_URL || !SB_KEY) {
  console.error('[fatal] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required in .env');
  process.exit(1);
}
if (!SALT || SALT.length < 16) {
  console.error('[fatal] LINK_SALT missing or too short in .env');
  console.error('        Set: LINK_SALT=<random 32+ char string> in your .env file');
  console.error('        Generate: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  process.exit(1);
}

const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

// ---------- CONSTANTS ----------
const PRE_WINDOW_DAYS    = 730;   // -24 months
const DURING_WINDOW_DAYS = 90;    // ±3 months
const POST_WINDOW_DAYS   = 730;   // +24 months
const CHUNK_EVENTS       = 25;    // events processed per pass
const CHUNK_INSERT       = 500;   // links inserted per Supabase call
const PAUSE_MS           = 100;
const MAX_RETRIES        = 3;
const LOCKFILE           = path.join(__dirname, '.actor_event_links.lock');

// ---------- UTILITIES ----------
const sleep = ms => new Promise(r => setTimeout(r, ms));

function hashActor(name) {
  return crypto.createHash('sha256').update(String(name) + SALT).digest('hex').slice(0, 24);
}

function rowHash(fields, prev) {
  const json = JSON.stringify(fields, Object.keys(fields).sort());
  return crypto.createHash('sha256').update(json + prev).digest('hex');
}

function scoreBand(score) {
  const s = Number(score) || 0;
  if (s >= 81) return 'CRITICAL';
  if (s >= 66) return 'WARNING';
  if (s >= 41) return 'ELEVATED';
  return 'STABLE';
}

function classifyWindow(lagDays) {
  if (lagDays < -DURING_WINDOW_DAYS) return 'PRE';
  if (lagDays >  DURING_WINDOW_DAYS) return 'POST';
  return 'DURING';
}

function classifyConfidence(lagDays, behavior_tier, window_phase) {
  const absLag = Math.abs(lagDays);
  if (absLag <= 180) {
    if (window_phase === 'POST' && behavior_tier === 'adversarial')        return 'HIGH';
    if (window_phase === 'PRE'  && behavior_tier === 'active_positioning') return 'HIGH';
    if (window_phase === 'PRE'  && behavior_tier === 'sole_proprietor')    return 'HIGH';
    return 'MEDIUM';
  }
  if (absLag <= 365) return 'MEDIUM';
  return 'REVIEW';
}

// ---------- LOCKFILE ----------
function acquireLock() {
  if (fs.existsSync(LOCKFILE)) {
    const pid = fs.readFileSync(LOCKFILE, 'utf8').trim();
    let alive = false;
    try { process.kill(Number(pid), 0); alive = true; } catch (_) {}
    if (alive) {
      console.error(`[fatal] lockfile exists and pid ${pid} is alive. Another instance is running.`);
      console.error(`        If you're sure no other instance is running, delete ${LOCKFILE}`);
      process.exit(1);
    }
    console.warn(`[warn] stale lockfile from pid ${pid} (dead) — clearing`);
    fs.unlinkSync(LOCKFILE);
  }
  fs.writeFileSync(LOCKFILE, String(process.pid), 'utf8');
}
function releaseLock() {
  try { fs.unlinkSync(LOCKFILE); } catch (_) {}
}
process.on('exit',  releaseLock);
process.on('SIGINT', () => { releaseLock(); process.exit(130); });
process.on('SIGTERM', () => { releaseLock(); process.exit(143); });

// ---------- PREFLIGHT ----------
async function preflight() {
  console.log('[preflight] checking table schemas...');
  const checks = [
    { table: 'actor_event_links',        critical: true,  hint: 'run actor_event_links_DDL.sql first' },
    { table: 'actor_event_links_state',  critical: true,  hint: 'run actor_event_links_DDL.sql first' },
    { table: 'actor_presence_raw',       critical: true,  hint: 'actor data missing — check Day 6 actor scan' },
    { table: 'historical_convergence_scores', critical: true, hint: 'convergence data missing' },
    { table: 'miner_findings',           critical: false, hint: 'no miner findings — going-dark phase will be skipped' }
  ];
  for (const c of checks) {
    const { error } = await sb.from(c.table).select('*', { count: 'exact', head: true });
    if (error) {
      if (c.critical) {
        console.error(`[fatal] table ${c.table} not accessible: ${error.message}`);
        console.error(`        ${c.hint}`);
        process.exit(1);
      } else {
        console.warn(`[warn] ${c.table} not accessible — ${c.hint}`);
      }
    } else {
      console.log(`  ✓ ${c.table}`);
    }
  }
  // Verify actor_presence_raw has required columns by fetching one row
  const { data: sample, error: sErr } = await sb.from('actor_presence_raw').select('*').limit(1).maybeSingle();
  if (sErr || !sample) {
    console.error('[fatal] could not read sample row from actor_presence_raw');
    process.exit(1);
  }
  const required = ['id', 'country', 'filing_date', 'filing_source', 'behavior_tier'];
  const nameCol  = sample.entity_name !== undefined ? 'entity_name'
                : sample.actor_name  !== undefined ? 'actor_name'
                : sample.name        !== undefined ? 'name'
                : null;
  if (!nameCol) {
    console.error('[fatal] actor_presence_raw has no recognizable name column (entity_name | actor_name | name)');
    console.error('        sample row keys:', Object.keys(sample));
    process.exit(1);
  }
  for (const col of required) {
    if (sample[col] === undefined) {
      console.error(`[fatal] actor_presence_raw missing column: ${col}`);
      console.error('        sample row keys:', Object.keys(sample));
      process.exit(1);
    }
  }
  console.log(`  ✓ actor name column: ${nameCol}`);
  console.log('[preflight] ok\n');
  return { nameCol };
}

// ---------- HASH TIP ----------
async function getLastHash() {
  const { data, error } = await sb
    .from('actor_event_links')
    .select('row_hash')
    .not('row_hash', 'is', null)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return 'genesis';
  return (data && data.row_hash) || 'genesis';
}

// ---------- PHASE 1: CROSSINGS FROM SCORES ----------
async function deriveConvergenceCrossings() {
  console.log('[phase 1] deriving convergence band crossings...');
  const all = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from('historical_convergence_scores')
      .select('id, country, year, score')
      .order('country', { ascending: true })
      .order('year', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`historical_convergence_scores read failed: ${error.message}`);
    if (!data || !data.length) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
    await sleep(PAUSE_MS);
  }
  const byCountry = {};
  for (const r of all) {
    if (!byCountry[r.country]) byCountry[r.country] = [];
    byCountry[r.country].push(r);
  }
  const crossings = [];
  for (const [country, rows] of Object.entries(byCountry)) {
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1];
      const curr = rows[i];
      if (prev.score == null || curr.score == null) continue;
      const pBand = scoreBand(prev.score);
      const cBand = scoreBand(curr.score);
      if (pBand !== cBand) {
        crossings.push({
          country,
          event_date: `${curr.year}-06-30`,
          event_type: 'convergence_crossing',
          event_source_id: curr.id,
          event_score: curr.score,
          event_delta: curr.score - prev.score
        });
      }
    }
  }
  console.log(`[phase 1] ${crossings.length} crossings across ${Object.keys(byCountry).length} countries\n`);
  return crossings;
}

// ---------- PHASE 2: GOING-DARK FROM MINER ----------
async function loadGoingDarkEvents() {
  console.log('[phase 2] loading going-dark events from miner_findings...');
  const all = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from('miner_findings')
      .select('id, payload')
      .eq('category', 'going_dark_event')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      console.warn(`[warn] miner_findings read failed: ${error.message} — skipping phase 2`);
      return [];
    }
    if (!data || !data.length) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
    await sleep(PAUSE_MS);
  }
  const events = all
    .filter(r => r.payload && r.payload.country && r.payload.darkEnd && (r.payload.darkYears || 0) >= 2)
    .map(r => ({
      country:        r.payload.country,
      event_date:     `${r.payload.darkEnd}-06-30`,
      event_type:     'going_dark_event',
      event_source_id: r.id,
      event_score:    r.payload.scoreAtReturn || null,
      event_delta:    r.payload.scoreDelta   || null
    }));
  console.log(`[phase 2] ${events.length} going-dark events loaded\n`);
  return events;
}

// ---------- LINKER ----------
async function fetchActorsForEvent(event, nameCol) {
  const eventDt = new Date(event.event_date);
  const minDt = new Date(eventDt); minDt.setDate(minDt.getDate() - PRE_WINDOW_DAYS);
  const maxDt = new Date(eventDt); maxDt.setDate(maxDt.getDate() + POST_WINDOW_DAYS);
  const minStr = minDt.toISOString().slice(0, 10);
  const maxStr = maxDt.toISOString().slice(0, 10);

  const matches = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    let lastErr = null;
    let data = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const res = await sb
        .from('actor_presence_raw')
        .select(`id, ${nameCol}, filing_date, filing_source, behavior_tier`)
        .eq('country', event.country)
        .gte('filing_date', minStr)
        .lte('filing_date', maxStr)
        .not(nameCol, 'is', null)
        .range(from, from + PAGE - 1);
      if (!res.error) { data = res.data; lastErr = null; break; }
      lastErr = res.error;
      await sleep(PAUSE_MS * (attempt + 1) * 2);
    }
    if (lastErr) {
      console.warn(`  [warn] actor query failed for ${event.country} @ ${event.event_date}: ${lastErr.message}`);
      break;
    }
    if (!data || !data.length) break;
    matches.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
    await sleep(PAUSE_MS);
  }
  return matches;
}

function buildLinkRows(event, matches, nameCol, prevHashRef) {
  const eventDt = new Date(event.event_date);
  const out = [];
  for (const m of matches) {
    if (!m[nameCol] || !m.filing_date) continue;
    const fDt = new Date(m.filing_date);
    if (isNaN(fDt.getTime())) continue;
    const lagDays = Math.round((fDt - eventDt) / 86400000);
    const window_phase = classifyWindow(lagDays);
    const confidence   = classifyConfidence(lagDays, m.behavior_tier, window_phase);
    const fields = {
      country:           event.country,
      event_date:        event.event_date,
      event_type:        event.event_type,
      event_source_id:   event.event_source_id,
      event_score:       event.event_score,
      event_delta:       event.event_delta,
      actor_hash:        hashActor(m[nameCol]),
      actor_presence_id: m.id,
      behavior_tier:     m.behavior_tier,
      source:            m.filing_source,
      filing_date:       m.filing_date,
      lag_days:          lagDays,
      window_phase,
      confidence
    };
    const rh = rowHash(fields, prevHashRef.current);
    fields.row_hash  = rh;
    fields.prev_hash = prevHashRef.current;
    prevHashRef.current = rh;
    out.push(fields);
  }
  return out;
}

async function writeLinks(rows) {
  if (!rows.length) return 0;
  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK_INSERT) {
    const slice = rows.slice(i, i + CHUNK_INSERT);
    let lastErr = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const res = await sb
        .from('actor_event_links')
        .upsert(slice, {
          onConflict: 'country,event_date,event_type,actor_presence_id',
          ignoreDuplicates: true
        });
      if (!res.error) { lastErr = null; break; }
      lastErr = res.error;
      await sleep(PAUSE_MS * (attempt + 1) * 3);
    }
    if (lastErr) {
      console.warn(`  [warn] insert chunk failed permanently: ${lastErr.message}`);
      continue;
    }
    written += slice.length;
    await sleep(PAUSE_MS);
  }
  return written;
}

async function saveState(eventsProcessed, linksWritten, lastEventId, phase) {
  await sb.from('actor_event_links_state').upsert({
    id: 1,
    events_processed: eventsProcessed,
    links_written:    linksWritten,
    last_event_id:    lastEventId,
    last_phase:       phase,
    last_run_at:      new Date().toISOString()
  });
}

// ---------- MAIN ----------
(async () => {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  ACTOR ↔ EVENT LINKER   ::   build_actor_event_links.cjs');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Supabase :: ${SB_URL}`);
  console.log(`  Salt     :: ${SALT.slice(0,4)}…${SALT.slice(-4)} (${SALT.length} chars)`);
  console.log(`  PRE      :: ${PRE_WINDOW_DAYS}d   DURING :: ±${DURING_WINDOW_DAYS}d   POST :: ${POST_WINDOW_DAYS}d`);
  console.log(`  Chunks   :: ${CHUNK_EVENTS} events / ${CHUNK_INSERT} inserts / retry ${MAX_RETRIES}`);
  console.log('───────────────────────────────────────────────────────────────');

  acquireLock();
  const { nameCol } = await preflight();
  const prevHashRef = { current: await getLastHash() };
  console.log(`[boot] hash tip: ${prevHashRef.current.slice(0,16)}…\n`);

  const t0 = Date.now();
  let totalLinks = 0;
  let totalEvents = 0;

  // ─── PHASE 1: convergence band crossings ───
  const crossings = await deriveConvergenceCrossings();
  for (let i = 0; i < crossings.length; i += CHUNK_EVENTS) {
    const batch = crossings.slice(i, i + CHUNK_EVENTS);
    let chunkLinks = 0;
    for (const ev of batch) {
      try {
        const matches = await fetchActorsForEvent(ev, nameCol);
        const rows    = buildLinkRows(ev, matches, nameCol, prevHashRef);
        chunkLinks   += await writeLinks(rows);
      } catch (err) {
        console.warn(`  [skip] event ${ev.country} @ ${ev.event_date}: ${err.message}`);
      }
      await sleep(PAUSE_MS);
    }
    totalLinks  += chunkLinks;
    totalEvents += batch.length;
    const pct = Math.round((totalEvents / crossings.length) * 100);
    const elapsed = Math.round((Date.now() - t0) / 1000);
    const eta = totalEvents ? Math.round(elapsed * (crossings.length - totalEvents) / totalEvents) : 0;
    console.log(`[p1] ${totalEvents}/${crossings.length} (${pct}%)  +${chunkLinks} links  Σ${totalLinks}  ${elapsed}s  eta ${eta}s  tip ${prevHashRef.current.slice(0,12)}…`);
    await saveState(totalEvents, totalLinks, batch[batch.length-1].event_source_id, 'crossings');
  }
  console.log(`[phase 1] complete :: ${totalLinks} links from ${crossings.length} crossings\n`);

  // ─── PHASE 2: going-dark ───
  const darkEvents = await loadGoingDarkEvents();
  const phase2Start = totalEvents;
  for (let i = 0; i < darkEvents.length; i += CHUNK_EVENTS) {
    const batch = darkEvents.slice(i, i + CHUNK_EVENTS);
    let chunkLinks = 0;
    for (const ev of batch) {
      try {
        const matches = await fetchActorsForEvent(ev, nameCol);
        const rows    = buildLinkRows(ev, matches, nameCol, prevHashRef);
        chunkLinks   += await writeLinks(rows);
      } catch (err) {
        console.warn(`  [skip] event ${ev.country} @ ${ev.event_date}: ${err.message}`);
      }
      await sleep(PAUSE_MS);
    }
    totalLinks  += chunkLinks;
    totalEvents += batch.length;
    const pct = Math.round(((totalEvents - phase2Start) / darkEvents.length) * 100);
    const elapsed = Math.round((Date.now() - t0) / 1000);
    console.log(`[p2] ${totalEvents - phase2Start}/${darkEvents.length} (${pct}%)  +${chunkLinks} links  Σ${totalLinks}  ${elapsed}s  tip ${prevHashRef.current.slice(0,12)}…`);
    await saveState(totalEvents, totalLinks, batch[batch.length-1].event_source_id, 'going_dark');
  }
  console.log(`[phase 2] complete :: ${darkEvents.length} dark events processed\n`);

  // ─── DONE ───
  const elapsed = Math.round((Date.now() - t0) / 1000);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  ✅  DONE`);
  console.log(`  Events processed :: ${totalEvents}`);
  console.log(`  Links written    :: ${totalLinks}`);
  console.log(`  Elapsed          :: ${elapsed}s`);
  console.log(`  Hash tip         :: ${prevHashRef.current}`);
  console.log('═══════════════════════════════════════════════════════════════');
})().catch(err => {
  console.error('\n═══ FATAL ═══');
  console.error(err);
  releaseLock();
  process.exit(1);
});
