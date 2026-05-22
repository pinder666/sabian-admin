// sanctions_feed.cjs
// Sanctions Pressure Signal — multi-source public sanctions data
// Primary sources: OFAC SDN list (US), UN consolidated list, EU financial sanctions
// Scoring: severity tier (program-based) + dynamic entity count from OFAC XML
//
// Score range: 0–100
//   90–95 : Comprehensive multi-program (North Korea, Iran)
//   70–85 : Broad sectoral (Russia, Syria)
//   45–60 : Targeted + multiple programs (Cuba, Venezuela, Belarus, Myanmar)
//   20–40 : Targeted + limited programs (Libya, Somalia, Sudan, Yemen, DRC, CAR...)
//   5–15  : Individual/entity-level only (China, Pakistan, Saudi targeted)
//   0     : No known international sanctions
//
// Sanctions data changes weekly — cadence set to 168h in FRESHNESS_WINDOWS
// Static tier table is the authoritative floor; OFAC XML provides entity-count enrichment

require('dotenv').config({ path: './.env' });
const https = require('https');
const { logToHive } = require('./logger.cjs');

// ── Sanctions severity table (judgment-set, May 2026) ─────────────────────────
// Programs listed are ACTIVE international sanctions regimes.
// Updated each time a new program activates or expires — treat as versioned data.
// Score = base floor; OFAC entity count adds up to +15 bonus on top.
const SANCTIONS_TABLE = {
  // COMPREHENSIVE — multiple programs, broad sectoral scope
  'North Korea':  { base: 92, tier: 'comprehensive', programs: ['OFAC_DPRK', 'UN_1718', 'EU_DPRK'] },
  'Iran':         { base: 88, tier: 'comprehensive', programs: ['OFAC_IRAN', 'UN_1737', 'EU_IRAN'] },
  'Syria':        { base: 82, tier: 'comprehensive', programs: ['OFAC_SYRIA', 'UN_2254_individuals', 'EU_SYRIA'] },

  // BROAD SECTORAL — major sectoral restrictions + individual designations
  'Russia':       { base: 78, tier: 'broad', programs: ['OFAC_RUSSIA', 'EU_RUSSIA_ENERGY', 'G7_RUSSIA', 'UN_RUSSIA_INDIVIDUALS'] },
  'Cuba':         { base: 62, tier: 'broad', programs: ['OFAC_CUBA', 'CACR'] },

  // TARGETED + MULTIPLE PROGRAMS — significant entity lists + sectoral
  'Venezuela':    { base: 55, tier: 'targeted_multi', programs: ['OFAC_VENEZUELA', 'EU_VENEZUELA'] },
  'Belarus':      { base: 52, tier: 'targeted_multi', programs: ['OFAC_BELARUS', 'EU_BELARUS'] },
  'Myanmar':      { base: 48, tier: 'targeted_multi', programs: ['OFAC_BURMA', 'EU_MYANMAR', 'UN_MYANMAR_ARMS'] },
  'Sudan':        { base: 45, tier: 'targeted_multi', programs: ['OFAC_SUDAN', 'UN_1591_DARFUR'] },
  'Nicaragua':    { base: 38, tier: 'targeted_multi', programs: ['OFAC_NICARAGUA', 'EU_NICARAGUA'] },
  'Zimbabwe':     { base: 28, tier: 'targeted_multi', programs: ['OFAC_ZIMBABWE', 'EU_ZIMBABWE'] },

  // TARGETED — UN mandatory + limited national programs
  'Somalia':      { base: 35, tier: 'targeted', programs: ['OFAC_SOMALIA', 'UN_751'] },
  'Libya':        { base: 33, tier: 'targeted', programs: ['OFAC_LIBYA', 'UN_1970'] },
  'Yemen':        { base: 32, tier: 'targeted', programs: ['OFAC_YEMEN', 'UN_2140'] },
  'Afghanistan':  { base: 35, tier: 'targeted', programs: ['OFAC_TALIBAN', 'UN_1988'] },
  'Mali':         { base: 28, tier: 'targeted', programs: ['OFAC_MALI', 'UN_2374'] },
  'DRC':          { base: 28, tier: 'targeted', programs: ['OFAC_DRC', 'UN_1533'] },
  'CAR':          { base: 28, tier: 'targeted', programs: ['OFAC_CAR', 'UN_2127'] },
  'South Sudan':  { base: 28, tier: 'targeted', programs: ['OFAC_SOUTHSUDAN', 'UN_2206'] },
  'Iraq':         { base: 22, tier: 'targeted', programs: ['OFAC_IRAQ', 'UN_FORMER_REGIME'] },
  'Haiti':        { base: 20, tier: 'targeted', programs: ['OFAC_HAITI', 'UN_2653'] },
  'Burkina Faso': { base: 15, tier: 'targeted', programs: ['EU_BURKINA'] },
  'Niger':        { base: 15, tier: 'targeted', programs: ['EU_NIGER', 'ECOWAS_NIGER'] },
  'Ethiopia':     { base: 12, tier: 'targeted', programs: ['OFAC_ETHIOPIA_INDIVIDUALS'] },

  // WATCH — individual/entity-level designations, no country-wide program
  'China':        { base: 10, tier: 'watch', programs: ['OFAC_CHINA_INDIVIDUALS', 'US_ENTITY_LIST', 'EU_CHINA_XINJIANG'] },
  'Pakistan':     { base: 6,  tier: 'watch', programs: ['OFAC_PAKISTAN_INDIVIDUALS', 'FATF_WATCH'] },
  'Saudi Arabia': { base: 5,  tier: 'watch', programs: ['OFAC_SAUDI_INDIVIDUALS'] },
  'Lebanon':      { base: 8,  tier: 'watch', programs: ['OFAC_LEBANON_HEZBOLLAH'] },
  'Pakistan':     { base: 6,  tier: 'watch', programs: ['OFAC_PAKISTAN_INDIVIDUALS'] },
  'Cambodia':     { base: 6,  tier: 'watch', programs: ['OFAC_CAMBODIA_INDIVIDUALS', 'EU_CAMBODIA'] },
  'Eritrea':      { base: 8,  tier: 'watch', programs: ['UN_ERITREA_ARMS'] },
  'Guinea':       { base: 8,  tier: 'watch', programs: ['EU_GUINEA', 'ECOWAS_GUINEA'] },
  'Chad':         { base: 5,  tier: 'watch', programs: ['OFAC_CHAD_INDIVIDUALS'] }
};

// ── In-memory OFAC entity count cache (24h TTL) ───────────────────────────────
let _ofacCache = null;
let _ofacCacheTime = 0;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// ── Fetch and parse OFAC SDN XML for entity count per country ─────────────────
// Uses a streaming regex approach — avoids loading full 10MB XML into DOM
async function fetchOfacEntityCounts() {
  const now = Date.now();
  if (_ofacCache && now - _ofacCacheTime < CACHE_TTL_MS) return _ofacCache;

  const counts = {};

  await new Promise((resolve) => {
    const req = https.get(
      'https://www.treasury.gov/ofac/downloads/sdn.xml',
      { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/xml' } },
      (res) => {
        if (res.statusCode !== 200) { resolve(); return; }

        let buffer = '';
        let inEntry = false;
        let entryBuf = '';

        res.on('data', chunk => {
          buffer += chunk.toString();
          let start, end;
          while (true) {
            if (!inEntry) {
              start = buffer.indexOf('<sdnEntry>');
              if (start === -1) { buffer = buffer.slice(-500); break; }
              inEntry = true;
              entryBuf = buffer.slice(start);
              buffer   = buffer.slice(start + 10);
            } else {
              end = buffer.indexOf('</sdnEntry>');
              if (end === -1) { entryBuf += buffer; buffer = ''; break; }
              entryBuf += buffer.slice(0, end + 11);
              buffer    = buffer.slice(end + 11);
              inEntry   = false;

              // Extract country mentions from this entry
              const countryMatches = entryBuf.match(/<country>([^<]+)<\/country>/gi) || [];
              const seen = new Set();
              for (const m of countryMatches) {
                const c = m.replace(/<\/?country>/gi, '').trim();
                if (c && !seen.has(c)) {
                  seen.add(c);
                  counts[c] = (counts[c] || 0) + 1;
                }
              }
              entryBuf = '';
            }
          }
        });

        res.on('end', resolve);
      }
    );
    req.on('error', resolve);
    req.setTimeout(60000, () => { req.destroy(); resolve(); });
  });

  _ofacCache     = counts;
  _ofacCacheTime = Date.now();
  return counts;
}

// Map OFAC country name strings to Sabian country names
const OFAC_COUNTRY_MAP = {
  'Russia':                'Russia',
  'Russian Federation':    'Russia',
  'Iran':                  'Iran',
  'Iran, Islamic Republic of': 'Iran',
  'Korea, North':          'North Korea',
  'North Korea':           'North Korea',
  "Korea, Democratic People's Republic of": 'North Korea',
  'Syria':                 'Syria',
  'Syrian Arab Republic':  'Syria',
  'Cuba':                  'Cuba',
  'Venezuela':             'Venezuela',
  'Belarus':               'Belarus',
  'Myanmar':               'Myanmar',
  'Burma':                 'Myanmar',
  'Sudan':                 'Sudan',
  'Libya':                 'Libya',
  'Somalia':               'Somalia',
  'Yemen':                 'Yemen',
  'Afghanistan':           'Afghanistan',
  'Iraq':                  'Iraq',
  'Haiti':                 'Haiti',
  'Nicaragua':             'Nicaragua',
  'Zimbabwe':              'Zimbabwe',
  'Democratic Republic of the Congo': 'DRC',
  'Congo, the Democratic Republic of the': 'DRC',
  "Central African Republic": 'CAR',
  'South Sudan':           'South Sudan',
  'Mali':                  'Mali',
  'China':                 'China',
  "China, People's Republic of": 'China',
  'Ethiopia':              'Ethiopia',
  'Lebanon':               'Lebanon',
  'Pakistan':              'Pakistan',
  'Saudi Arabia':          'Saudi Arabia',
  'Eritrea':               'Eritrea',
  'Guinea':                'Guinea',
  'Chad':                  'Chad',
  'Burkina Faso':          'Burkina Faso',
  'Niger':                 'Niger',
  'Cambodia':              'Cambodia',
  'Ukraine':               'Ukraine',
  'United States':         'United States'
};

// ── Main export ────────────────────────────────────────────────────────────────

async function fetchSanctionsData(country) {
  const entry = SANCTIONS_TABLE[country];

  // Dynamic OFAC entity count (enriches static base)
  let entity_count    = 0;
  let ofac_enriched   = false;
  let entity_bonus    = 0;

  try {
    const ofacCounts = await fetchOfacEntityCounts();
    if (ofacCounts && Object.keys(ofacCounts).length > 0) {
      // Try both the Sabian country name and mapped OFAC forms
      const directCount = ofacCounts[country] || 0;
      const mappedKey   = Object.keys(OFAC_COUNTRY_MAP).find(k => OFAC_COUNTRY_MAP[k] === country);
      const mappedCount = mappedKey ? (ofacCounts[mappedKey] || 0) : 0;
      entity_count = Math.max(directCount, mappedCount);
      ofac_enriched = true;

      // Log-scaled entity bonus: +15 max at 500 entities, +7 at 50, +3 at 10
      if (entity_count > 0) {
        entity_bonus = Math.min(15, Math.round(Math.log10(entity_count + 1) * 6));
      }
    }
  } catch (_) { /* OFAC fetch failed — use static table only */ }

  if (!entry) {
    // Country not in table — use entity count alone if any
    const score = entity_count > 0 ? Math.min(15, entity_bonus) : 0;
    return {
      source: 'OFAC_SDN',
      country,
      sanctions_score: score,
      tier: score > 0 ? 'watch' : 'none',
      entity_count,
      active_programs: [],
      ofac_enriched,
      trend: score > 10 ? 'sanctioned_watch' : 'no_sanctions',
      fetched_at: new Date().toISOString()
    };
  }

  const final_score = Math.min(100, entry.base + entity_bonus);

  logToHive({
    source: 'sanctions_feed',
    level: 'intel',
    event: 'sanctions_scored',
    data: { country, score: final_score, tier: entry.tier, entity_count, programs: entry.programs },
    tags: ['sanctions', country]
  });

  return {
    source: 'OFAC_SDN',
    country,
    sanctions_score:  final_score,
    tier:             entry.tier,
    entity_count,
    active_programs:  entry.programs,
    program_count:    entry.programs.length,
    ofac_enriched,
    trend: entry.tier === 'comprehensive' ? 'comprehensive_sanctions'
         : entry.tier === 'broad'         ? 'broad_sectoral'
         : entry.tier === 'targeted_multi'? 'targeted_multiple'
         : entry.tier === 'targeted'      ? 'targeted'
         : 'watch',
    fetched_at: new Date().toISOString()
  };
}

module.exports = { fetchSanctionsData };

// Standalone test: node sanctions_feed.cjs Russia
if (require.main === module) {
  const country = process.argv[2] || 'Russia';
  console.log(`\nSanctions Pressure — ${country}...\n`);
  fetchSanctionsData(country).then(r => {
    console.log(JSON.stringify(r, null, 2));
  }).catch(console.error);
}
