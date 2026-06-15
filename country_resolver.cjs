// country_resolver.cjs
// Resolves country names to canonical form with aliases, ISO codes, and scan category.
// Returns a fallback shape if not found — never throws.

require('dotenv').config({ path: './.env' });
const { createClient } = require('@supabase/supabase-js');

let _client = null;

function getClient() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return null;
  }
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

async function resolveCountry(country) {
  const fallback = {
    canonical_name: country,
    iso2: null,
    iso3: null,
    aliases: [],
    scan_category: null,
    lat: null,
    lon: null,
    namesToTry: [country]
  };

  const sb = getClient();
  if (!sb) return fallback;

  try {
    // First: try matching canonical_name
    const { data: canonMatch, error: err1 } = await sb
      .from('countries_canonical')
      .select('canonical_name, aliases, iso2, iso3, scan_category, lat, lon')
      .ilike('canonical_name', country)
      .maybeSingle();

    if (err1) return fallback;

    if (canonMatch) {
      return {
        canonical_name: canonMatch.canonical_name,
        iso2: canonMatch.iso2,
        iso3: canonMatch.iso3,
        aliases: canonMatch.aliases || [],
        scan_category: canonMatch.scan_category,
        lat: canonMatch.lat,
        lon: canonMatch.lon,
        namesToTry: [canonMatch.canonical_name, ...(canonMatch.aliases || [])]
      };
    }

    // Second: check if country is in any aliases array
    const { data: aliasMatch, error: err2 } = await sb
      .from('countries_canonical')
      .select('canonical_name, aliases, iso2, iso3, scan_category, lat, lon')
      .contains('aliases', [country])
      .maybeSingle();

    if (err2) return fallback;

    if (aliasMatch) {
      return {
        canonical_name: aliasMatch.canonical_name,
        iso2: aliasMatch.iso2,
        iso3: aliasMatch.iso3,
        aliases: aliasMatch.aliases || [],
        scan_category: aliasMatch.scan_category,
        lat: aliasMatch.lat,
        lon: aliasMatch.lon,
        namesToTry: [aliasMatch.canonical_name, ...(aliasMatch.aliases || [])]
      };
    }

    // No match found
    return fallback;

  } catch (err) {
    return fallback;
  }
}

module.exports = { resolveCountry };
