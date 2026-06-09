// historical/actor_presence_scan.cjs
// Raw presence scan — for every extraction event, pull every entity
// that filed anything mentioning that country on SEC EDGAR.
// No date windows. No name filters. No pattern assumptions.
// Everything raw into actor_presence_raw.
// Repetition across events decides who matters — not this script.
//
// Sources:
//   A. SEC EDGAR full-text search (efts.sec.gov) — all form types
//   B. SEC EDGAR 13F specifically — institutional holdings
//   C. CourtListener — SDNY sovereign litigation
//
// Usage: node historical/actor_presence_scan.cjs

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const https = require('https');
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const EDGAR_HEADERS = {
  'User-Agent': 'SabianBrain/1.0 (contact@sabian.ai)',
  'Accept': 'application/json'
};

const CL_KEY = process.env.COURTLISTENER_API_KEY;
const CH_KEY = process.env.CH_API_KEY;
const DELAY_MS = 1200; // SEC rate limit: max 10 req/sec, we stay well under

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function fetchJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = { headers: { ...EDGAR_HEADERS, ...headers } };
    https.get(url, opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve(null); }
      });
    }).on('error', reject);
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Load all extraction events ────────────────────────────────────────────────

async function loadEvents() {
  const { data, error } = await sb
    .from('extraction_events')
    .select('id,country,year,pattern_type,confidence,signal_snapshot')
    .order('year', { ascending: true });
  if (error) throw error;
  return data;
}

// ── Source A: SEC EDGAR full-text search ──────────────────────────────────────
// Searches all filings mentioning the country name.
// Returns every unique filer entity found.

async function scanEdgarFullText(country, year, eventId, signalSnapshot) {
  const rows = [];
  const query = encodeURIComponent('"' + country + '"');
  const url = `https://efts.sec.gov/LATEST/search-index?q=${query}&hits.hits._source=display_names,file_num,form_type,file_date`;
  const result = await fetchJson(url);
  if (!result || !result.hits || !result.hits.hits) return rows;
  for (const hit of result.hits.hits) {
    const src = hit._source || {};
    const entityName = src.display_names?.[0]?.replace(/\s*\(CIK[^)]*\)/,'').trim() || null;
    if (!entityName) continue;
    rows.push({
      event_id:        eventId,
      country,
      year,
      entity_name:     entityName,
      entity_id:       Array.isArray(src.file_num) ? src.file_num[0] : (src.file_num || null),
      filing_type:     src.form_type || 'UNKNOWN',
      filing_date:     src.file_date ? src.file_date.slice(0, 10) : null,
      filing_source:   'SEC_EDGAR_FULLTEXT',
      source_url:      `https://efts.sec.gov/LATEST/search-index?q=${query}`,
      raw_excerpt:     JSON.stringify(src).slice(0, 500),
      signal_snapshot: signalSnapshot
    });
  }
  return rows;
}

// ── Source B: SEC EDGAR 13F filings ──────────────────────────────────────────
// 13F = institutional investment managers reporting holdings quarterly.
// We search 13F filings that mention the country.

async function scanEdgar13F(country, year, eventId, signalSnapshot) {
  const rows = [];
  const query = encodeURIComponent('"' + country + '"');
  let from = 0;
  while (true) {
    const url = `https://efts.sec.gov/LATEST/search-index?q=${query}&forms=13F-HR&from=${from}&hits.hits._source=display_names,file_num,form_type,file_date`;
    const result = await fetchJson(url);
    if (!result || !result.hits || !result.hits.hits || result.hits.hits.length === 0) break;
    for (const hit of result.hits.hits) {
      const src = hit._source || {};
      const entityName = src.display_names?.[0]?.replace(/\s*\(CIK[^)]*\)/,'').trim() || null;
      if (!entityName) continue;
      rows.push({
        event_id:        eventId,
        country,
        year,
        entity_name:     entityName,
        entity_id:       Array.isArray(src.file_num) ? src.file_num[0] : (src.file_num || null),
        filing_type:     '13F',
        filing_date:     src.file_date ? src.file_date.slice(0, 10) : null,
        filing_source:   'SEC_EDGAR_13F',
        source_url:      `https://efts.sec.gov/LATEST/search-index?q=${query}&forms=13F-HR`,
        raw_excerpt:     JSON.stringify(src).slice(0, 500),
        signal_snapshot: signalSnapshot
      });
    }
    if (result.hits.hits.length < 100) break;
    from += 100;
    await sleep(DELAY_MS);
  }
  return rows;
}

// ── Source C: CourtListener — SDNY sovereign litigation ───────────────────────
// Pulls every federal case in SDNY where the country is mentioned.
// No date filter — everything in the record.

async function scanCourtListener(country, year, eventId, signalSnapshot) {
  const rows = [];
  if (!CL_KEY) return rows;

  const query = encodeURIComponent(country);
  const url = `https://www.courtlistener.com/api/rest/v4/search/?q=${query}&type=d&court=nyed+nysd&format=json`;

  const result = await fetchJson(url, {
    Authorization: `Token ${CL_KEY}`
  });

  if (!result || !result.results) return rows;

  for (const c of result.results) {
    const parties = [
      c.caseName || '',
      c.court_citation_string || ''
    ].join(' ').trim();

    if (!parties) continue;

    rows.push({
      event_id:        eventId,
      country,
      year,
      entity_name:     c.caseName ? c.caseName.trim() : 'UNKNOWN',
      entity_id:       c.docket_id ? String(c.docket_id) : null,
      filing_type:     'SDNY_LITIGATION',
      filing_date:     c.dateFiled ? c.dateFiled.slice(0, 10) : null,
      filing_source:   'COURTLISTENER',
      source_url:      c.absolute_url
        ? `https://www.courtlistener.com${c.absolute_url}`
        : url,
      raw_excerpt:     JSON.stringify(c).slice(0, 500),
      signal_snapshot: signalSnapshot
    });
  }

  return rows;
}

// ── Source D: UK Companies House ─────────────────────────────────────────────
// Searches for UK-registered companies with the country name in their name.
// Catches SPVs and holding companies deliberately named after target countries.

async function scanCompaniesHouse(country, year, eventId, signalSnapshot) {
  const rows = [];
  if (!CH_KEY) return rows;

  const query = encodeURIComponent(country);
  const url = `https://api.company-information.service.gov.uk/search/companies?q=${query}&items_per_page=100`;

  const result = await new Promise((resolve, reject) => {
    const options = {
      headers: {
        Authorization: 'Basic ' + Buffer.from(CH_KEY + ':').toString('base64'),
        'User-Agent': 'SabianBrain/1.0 (contact@sabian.ai)'
      }
    };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve(null); }
      });
    }).on('error', reject);
  });

  if (!result || !result.items) return rows;

  for (const item of result.items) {
    if (!item.title) continue;
    rows.push({
      event_id:        eventId,
      country,
      year,
      entity_name:     item.title.trim(),
      entity_id:       item.company_number || null,
      filing_type:     item.company_type || 'UK_COMPANY',
      filing_date:     item.date_of_creation || null,
      filing_source:   'UK_COMPANIES_HOUSE',
      source_url:      `https://find-and-update.company-information.service.gov.uk/company/${item.company_number}`,
      raw_excerpt:     JSON.stringify(item).slice(0, 500),
      signal_snapshot: signalSnapshot
    });
  }

  return rows;
}

// ── Source E: GLEIF – Legal Entity Identifier lookup ─────────────────────────
// GLEIF maps legal entity relationships globally — parent/child/branch.
// Searches by country name to find all LEI-registered entities in that country.
// Free, no key needed. Catches actors across name changes and SPV structures.

async function scanGLEIF(country, year, eventId, signalSnapshot) {
  const rows = [];
  const query = encodeURIComponent(country);
  const url = `https://api.gleif.org/api/v1/lei-records?filter[entity.legalAddress.country]=${query}&page[size]=100&page[number]=1`;

  const result = await fetchJson(url, { 'Accept': 'application/vnd.api+json' });
  if (!result || !result.data) return rows;

  for (const item of result.data) {
    const entity = item.attributes?.entity || {};
    const name = entity.legalName?.name;
    if (!name) continue;
    rows.push({
      event_id:        eventId,
      country,
      year,
      entity_name:     name.trim(),
      entity_id:       item.attributes?.lei || null,
      filing_type:     entity.category || 'LEI_ENTITY',
      filing_date:     item.attributes?.registration?.initialRegistrationDate?.slice(0,10) || null,
      filing_source:   'GLEIF',
      source_url:      `https://search.gleif.org/#/record/${item.attributes?.lei}`,
      raw_excerpt:     JSON.stringify(entity).slice(0, 500),
      signal_snapshot: signalSnapshot
    });
  }

  return rows;
}

// ── Write rows to Supabase ────────────────────────────────────────────────────

async function writeRows(rows) {
  if (!rows.length) return;

  const unique = [];
  const seen = new Set();
  for (const r of rows) {
    const key = `${r.event_id}|${r.entity_name}|${r.filing_type}|${r.filing_date}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(r);
    }
  }

  const CHUNK = 500;
  let totalWritten = 0;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const { error } = await sb
      .from('actor_presence_raw')
      .upsert(chunk, { onConflict: 'id', ignoreDuplicates: true });
    if (error) {
      console.error(`  [WRITE ERROR chunk ${i}-${i+CHUNK}]`, error.message);
    } else {
      totalWritten += chunk.length;
    }
  }
  console.log(`  [WROTE] ${totalWritten} rows`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('SABIAN ACTOR PRESENCE SCAN');
  console.log('Raw pull — no filters, no assumptions, everything in');
  console.log('═══════════════════════════════════════════════════════\n');

  const events = await loadEvents();
  console.log(`Loaded ${events.length} extraction events\n`);

  let totalRows = 0;

  for (const event of events) {
    console.log(`[${event.country} ${event.year}] ${event.pattern_type}`);

    const allRows = [];

    try {
      const a = await scanEdgarFullText(
        event.country, event.year, event.id, event.signal_snapshot
      );
      console.log(`  EDGAR full-text: ${a.length} entities`);
      allRows.push(...a);
      await sleep(DELAY_MS);

      const b = await scanEdgar13F(
        event.country, event.year, event.id, event.signal_snapshot
      );
      console.log(`  EDGAR 13F:       ${b.length} entities`);
      allRows.push(...b);
      await sleep(DELAY_MS);

      const c = await scanCourtListener(
        event.country, event.year, event.id, event.signal_snapshot
      );
      console.log(`  CourtListener:   ${c.length} cases`);
      allRows.push(...c);
      await sleep(DELAY_MS);

      const d = await scanCompaniesHouse(
        event.country, event.year, event.id, event.signal_snapshot
      );
      console.log(`  Companies House: ${d.length} entities`);
      allRows.push(...d);
      await sleep(DELAY_MS);

      const e = await scanGLEIF(
        event.country, event.year, event.id, event.signal_snapshot
      );
      console.log(`  GLEIF:           ${e.length} entities`);
      allRows.push(...e);
      await sleep(DELAY_MS);

    } catch (err) {
      console.error(`  [ERROR] ${err.message}`);
    }

    await writeRows(allRows);
    totalRows += allRows.length;
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log(`SCAN COMPLETE — ${totalRows} raw presence rows written`);
  console.log('═══════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});