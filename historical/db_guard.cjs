// db_guard.cjs
// PROTECTION IS TWO-LAYER:
// Layer 1 (this file): JS-level convention — blocks scripts that import from db.cjs
// Layer 2 (PostgreSQL trigger): Database-level enforcement — blocks ALL DELETEs regardless of client
//   Trigger function: sabian_block_delete() — created 2026-06-01 in Supabase SQL editor
//   Applies to: historical_signal_readings, signal_baselines, historical_convergence_scores
//
// Before any DELETE from a protected table:
//   1. Notify Jason with: table, row count, row identifiers, reason
//   2. Get explicit approval
//   3. Log to immutable_audit_log BEFORE executing
//   4. Only then execute via Supabase SQL editor (trigger blocks all other paths)
//
// HARD NO-DELETE RULE: No script in this project runs DELETE against readings, scores, or baselines.
// This module wraps Supabase client to enforce this rule at runtime.
// Use upsertReadings() instead of delete+insert patterns.

const PROTECTED_TABLES = [
  'historical_signal_readings',
  'historical_convergence_scores',
  'signal_baselines'
];

/**
 * Wraps a Supabase client to block DELETE operations on protected tables.
 * If a DELETE is attempted, it throws an error with instructions.
 */
function guardClient(supabase) {
  const originalFrom = supabase.from.bind(supabase);

  supabase.from = function(table) {
    const builder = originalFrom(table);

    if (PROTECTED_TABLES.includes(table)) {
      const originalDelete = builder.delete.bind(builder);
      builder.delete = function() {
        throw new Error(
          `\n` +
          `════════════════════════════════════════════════════════════════\n` +
          `  BLOCKED: DELETE on protected table "${table}"\n` +
          `════════════════════════════════════════════════════════════════\n` +
          `  NO script runs DELETE against readings, scores, or baselines.\n` +
          `  Use upsertReadings() for INSERT-or-UPDATE behavior.\n` +
          `  If you truly need to remove rows, get explicit user approval.\n` +
          `════════════════════════════════════════════════════════════════\n`
        );
      };
    }

    return builder;
  };

  return supabase;
}

/**
 * Safe upsert for historical_signal_readings.
 * Uses INSERT ... ON CONFLICT (country, signal_key, date, source) DO UPDATE.
 * Never deletes — only inserts new rows or updates existing ones.
 *
 * @param {Object} supabase - Supabase client
 * @param {Array} rows - Array of reading objects
 * @param {Object} options - { batchSize: 100, onProgress: fn }
 * @returns {Object} { inserted: n, updated: n, errors: [] }
 */
async function upsertReadings(supabase, rows, options = {}) {
  const batchSize = options.batchSize || 100;
  const onProgress = options.onProgress || (() => {});

  let inserted = 0;
  let updated = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);

    // Use upsert with the new constraint that includes source
    const { data, error } = await supabase
      .from('historical_signal_readings')
      .upsert(batch, {
        onConflict: 'country,signal_key,date,source',
        ignoreDuplicates: false
      })
      .select('id');

    if (error) {
      errors.push({ batch: i, error: error.message });
    } else {
      // Supabase doesn't distinguish insert vs update in upsert response
      // Count all as processed
      inserted += batch.length;
    }

    onProgress({ processed: i + batch.length, total: rows.length });
  }

  return { inserted, updated, errors };
}

/**
 * Safe upsert for signal_baselines.
 * Uses INSERT ... ON CONFLICT (country, signal_key) DO UPDATE.
 */
async function upsertBaselines(supabase, rows, options = {}) {
  const batchSize = options.batchSize || 100;
  let processed = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);

    const { error } = await supabase
      .from('signal_baselines')
      .upsert(batch, {
        onConflict: 'country,signal_key',
        ignoreDuplicates: false
      });

    if (error) {
      errors.push({ batch: i, error: error.message });
    } else {
      processed += batch.length;
    }
  }

  return { processed, errors };
}

/**
 * Safe upsert for historical_convergence_scores.
 */
async function upsertScores(supabase, rows, options = {}) {
  const batchSize = options.batchSize || 100;
  let processed = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);

    const { error } = await supabase
      .from('historical_convergence_scores')
      .upsert(batch, {
        onConflict: 'country,date',
        ignoreDuplicates: false
      });

    if (error) {
      errors.push({ batch: i, error: error.message });
    } else {
      processed += batch.length;
    }
  }

  return { processed, errors };
}

module.exports = {
  guardClient,
  upsertReadings,
  upsertBaselines,
  upsertScores,
  PROTECTED_TABLES
};
