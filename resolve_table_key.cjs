// resolve_table_key.cjs
// Resolves a country name to a key in a lookup table using canonical resolution.
// Returns { key, value } where key is the matched candidate and value is the table entry.
// Returns { key: null, value: undefined } if no match found or on error.

const { resolveCountry } = require('./country_resolver.cjs');

async function resolveTableKey(country, table) {
  try {
    const resolved = await resolveCountry(country);
    const candidates = [country, ...(resolved.namesToTry || [])];

    // De-dupe preserving order
    const seen = new Set();
    const unique = [];
    for (const c of candidates) {
      if (!seen.has(c)) {
        seen.add(c);
        unique.push(c);
      }
    }

    // Find first candidate that exists as a key in table
    for (const c of unique) {
      if (Object.prototype.hasOwnProperty.call(table, c)) {
        return { key: c, value: table[c] };
      }
    }

    return { key: null, value: undefined };
  } catch (err) {
    return { key: null, value: undefined };
  }
}

module.exports = { resolveTableKey };
