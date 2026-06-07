// historical/defense_procurement_ingest.cjs
// Backfill defense procurement signals into historical record
// Phase 4.5 Step 10-Pre-F: Defense Procurement Layer
//
// Usage: node historical/defense_procurement_ingest.cjs
//        node historical/defense_procurement_ingest.cjs --country Turkey
//
// NOTE: Defense procurement signals are NOT converged into stress score.
// They remain in historical_signal_readings as a separate behavioral layer.

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const {
  DEFENSE_PROCUREMENT_SIGNALS,
  fetchDefenseProcurementSignals
} = require('./defense_procurement_signals.cjs');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Country list (reuse from behavioral signals)
const COUNTRIES = [
  'Afghanistan', 'Albania', 'Algeria', 'Armenia', 'Australia', 'Austria',
  'Azerbaijan', 'Bahrain', 'Bangladesh', 'Belarus', 'Belgium', 'Benin',
  'Bolivia', 'Bosnia and Herzegovina', 'Brazil', 'Bulgaria', 'Cameroon',
  'Canada', 'CAR', 'Chile', 'China', 'Colombia', 'Croatia', 'Cuba',
  'Cyprus', 'Czechia', 'Denmark', 'Ecuador', 'Egypt', 'El Salvador',
  'Eritrea', 'Estonia', 'Ethiopia', 'Finland', 'France', 'Gambia',
  'Georgia', 'Germany', 'Ghana', 'Greece', 'Guatemala', 'Guinea',
  'Guinea-Bissau', 'Haiti', 'Honduras', 'Hungary', 'Iceland', 'India',
  'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy', 'Jamaica',
  'Japan', 'Jordan', 'Kazakhstan', 'Kenya', 'Kuwait', 'Kyrgyzstan',
  'Latvia', 'Lebanon', 'Liberia', 'Libya', 'Lithuania', 'Luxembourg',
  'Madagascar', 'Malawi', 'Malaysia', 'Mali', 'Malta', 'Mauritania',
  'Mexico', 'Moldova', 'Mongolia', 'Montenegro', 'Morocco', 'Mozambique',
  'Myanmar', 'Namibia', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua',
  'Niger', 'Nigeria', 'North Korea', 'North Macedonia', 'Norway', 'Oman',
  'Pakistan', 'Palestine', 'Panama', 'Papua New Guinea', 'Paraguay', 'Peru',
  'Philippines', 'Poland', 'Portugal', 'Qatar', 'Romania', 'Russia',
  'Rwanda', 'Saudi Arabia', 'Senegal', 'Serbia', 'Sierra Leone', 'Singapore',
  'Slovakia', 'Slovenia', 'Somalia', 'South Africa', 'South Korea',
  'South Sudan', 'Spain', 'Sri Lanka', 'Sudan', 'Sweden', 'Switzerland',
  'Syria', 'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand', 'Togo',
  'Trinidad and Tobago', 'Tunisia', 'Turkey', 'Turkmenistan', 'UAE',
  'Uganda', 'UK', 'Ukraine', 'United States', 'Uruguay', 'Uzbekistan',
  'Venezuela', 'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe'
];

// ── Register defense procurement signals ─────────────────────────────────────

async function registerSignals() {
  console.log('[DEFENSE] Registering defense procurement signals...');

  for (const [key, sig] of Object.entries(DEFENSE_PROCUREMENT_SIGNALS)) {
    const record = {
      signal_key: sig.key,
      signal_name: sig.name,
      earliest_date: `${sig.available_from}-01-01`,
      cadence: sig.cadence,
      data_type: 'defense_procurement',
      source: sig.source,
      has_history_api: false, // SIPRI data requires manual download or API license
      history_api_notes: sig.description
    };

    const { error } = await sb.from('signal_registry').upsert(record, { onConflict: 'signal_key' });
    if (error) {
      console.log(`[DEFENSE] Warning: Could not register ${sig.key}: ${error.message}`);
    } else {
      console.log(`[DEFENSE] Registered: ${sig.key}`);
    }
  }
}

// ── Fetch and store defense procurement signals ──────────────────────────────

async function ingestCountry(country) {
  const signals = await fetchDefenseProcurementSignals(country);

  if (signals.length === 0) {
    console.log(`[DEFENSE] No data for ${country}`);
    return 0;
  }

  // Store in historical_signal_readings
  const records = signals.map(s => ({
    country: s.country,
    signal_key: s.signal_key,
    signal_name: DEFENSE_PROCUREMENT_SIGNALS[s.signal_key]?.name || s.signal_key,
    date: `${s.year}-01-01`,
    raw_value: s.value,
    raw_metadata: s.metadata,
    source: DEFENSE_PROCUREMENT_SIGNALS[s.signal_key]?.source || 'defense_procurement',
    gap: false
  }));

  // Batch upsert
  const batchSize = 100;
  let inserted = 0;
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const { error } = await sb.from('historical_signal_readings').upsert(batch, {
      onConflict: 'country,date,signal_key'
    });
    if (error) {
      console.log(`[DEFENSE] Batch error for ${country}: ${error.message}`);
    } else {
      inserted += batch.length;
    }
  }

  console.log(`[DEFENSE] ${country}: inserted ${inserted} defense procurement readings`);
  return inserted;
}

async function ingestAllCountries() {
  console.log(`[DEFENSE] Ingesting defense procurement signals for ${COUNTRIES.length} countries...`);

  let total = 0;
  for (let i = 0; i < COUNTRIES.length; i++) {
    const country = COUNTRIES[i];
    console.log(`[DEFENSE] [${i + 1}/${COUNTRIES.length}] ${country}`);

    try {
      const count = await ingestCountry(country);
      total += count;
    } catch (err) {
      console.log(`[DEFENSE] Error for ${country}: ${err.message}`);
    }

    // Rate limit
    if (i < COUNTRIES.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`[DEFENSE] Complete. Total readings inserted: ${total}`);
  return total;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const singleCountry = args.find(a => a.startsWith('--country='))?.split('=')[1] ||
                        (args.includes('--country') ? args[args.indexOf('--country') + 1] : null);

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('SABIAN DEFENSE PROCUREMENT SIGNAL INGEST');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Mode: ${singleCountry ? `Single country: ${singleCountry}` : 'Full ingest'}`);
  console.log('');
  console.log('NOTE: Defense procurement signals are NOT converged into stress score.');
  console.log('      They remain as a separate behavioral layer for triangulation.');
  console.log('');

  // Step 1: Register signals
  await registerSignals();

  // Step 2: Fetch and store data
  if (singleCountry) {
    await ingestCountry(singleCountry);
  } else {
    await ingestAllCountries();
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('DEFENSE PROCUREMENT SIGNAL INGEST COMPLETE');
  console.log('Signals: defense_spending, arms_imports, arms_exports');
  console.log('Layer: Separate (NOT converged into stress score)');
  console.log('Purpose: Government action/intent triangulation');
  console.log('═══════════════════════════════════════════════════════════════');
}

if (require.main === module) {
  main().catch(err => {
    console.error('[DEFENSE] FATAL:', err);
    process.exit(1);
  });
}

module.exports = {
  registerSignals,
  ingestCountry,
  ingestAllCountries
};
