// historical/snapshot_nightly.cjs
// Sabian Snapshot / Audit Layer — Nightly Job (Step 6)
// Runs 0830 UTC daily after the pattern matcher
//
// For each country:
//   1. Generate the full intelligence dossier
//   2. Compute SHA256 checksum of the JSON
//   3. Compare to previous day's checksum
//   4. If changed (or no prior record): store full dossier JSON
//   5. If unchanged: store a no-change marker (no full JSON — saves storage)
//
// Result: complete, immutable daily audit trail with dedup.
// Buyers can retrieve: GET /api/intelligence/:country/history
//
// Usage: node historical/snapshot_nightly.cjs
//        node historical/snapshot_nightly.cjs --country Yemen
//        node historical/snapshot_nightly.cjs --force   (ignore checksum, always write full)

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { generateDossier } = require('./dossier_generator.cjs');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Theater map (matches global_aggregate.cjs) ────────────────────────────────

const THEATER_MAP = {
  AFRICOM:   ['Mali','Burkina Faso','Niger','Sudan','Ethiopia','Somalia','DRC','CAR','Chad','Nigeria','Mozambique','Libya','South Sudan','Cameroon','Zimbabwe','Zambia','Tanzania','Senegal','Guinea','Kenya','Uganda','Eritrea','Djibouti','Angola','Rwanda','Burundi','Malawi','Guinea-Bissau','Sierra Leone','Liberia','Togo','Benin','Mauritania','Tunisia','Algeria','Morocco','Egypt','Ghana','Ivory Coast','Gabon','Congo','Equatorial Guinea','Namibia','Botswana','South Africa'],
  CENTCOM:   ['Yemen','Syria','Iraq','Afghanistan','Pakistan','Iran','Lebanon','Israel','Palestine','Jordan','Saudi Arabia','UAE','Qatar','Bahrain','Kuwait','Oman','Kazakhstan','Kyrgyzstan','Tajikistan','Turkmenistan','Uzbekistan','Azerbaijan'],
  EUCOM:     ['Ukraine','Armenia','Georgia','Kosovo','Bosnia','Russia','Belarus','Moldova','Serbia','Albania','North Macedonia','Montenegro','Bulgaria','Romania','Hungary','Poland','Slovakia','Croatia','Turkey','Greece','Cyprus','UK','France','Germany','Spain','Italy','Portugal','Sweden','Finland','Norway','Denmark','Netherlands','Belgium','Austria','Switzerland'],
  INDOPACOM: ['Myanmar','Bangladesh','Sri Lanka','Taiwan','North Korea','South Korea','China','Japan','Mongolia','Philippines','Indonesia','Vietnam','Cambodia','Laos','Thailand','Malaysia','Singapore','Nepal','India','Timor-Leste','Papua New Guinea','Solomon Islands','Fiji','Australia','New Zealand'],
  SOUTHCOM:  ['Venezuela','Colombia','Haiti','Ecuador','Bolivia','Peru','Brazil','Argentina','Chile','Paraguay','Uruguay','Guyana','Suriname','Trinidad and Tobago','Panama','Costa Rica','Nicaragua','Honduras','Guatemala','El Salvador','Cuba','Dominican Republic','Jamaica','Belize','Mexico'],
  NORTHCOM:  ['United States']
};

const ALL_COUNTRIES = Object.values(THEATER_MAP).flat();

// ── Checksum ──────────────────────────────────────────────────────────────────

function computeChecksum(obj) {
  const str = JSON.stringify(obj, Object.keys(obj).sort());
  return crypto.createHash('sha256').update(str).digest('hex').slice(0, 16);
}

// ── Fetch prior day's snapshot checksum ───────────────────────────────────────

async function getPriorChecksum(country) {
  const { data, error } = await sb
    .from('dossier_snapshots')
    .select('checksum, score, band')
    .eq('country', country)
    .order('generated_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data;
}

// ── Save snapshot row ─────────────────────────────────────────────────────────

async function saveSnapshot(country, dossier, checksum, changedFromPrior) {
  const page1   = dossier.pages?.find(p => p.pageNumber === 1)?.content || {};
  const page0   = dossier.pages?.find(p => p.pageNumber === 0)?.content || {};
  const page8   = dossier.pages?.find(p => p.pageNumber === 8)?.content || {};

  const now = new Date();
  const row = {
    country,
    snapshot_date:      now.toISOString().slice(0, 10),
    generated_at:       now.toISOString(),
    score:              page1.score != null ? Math.round(parseFloat(page1.score)) : null,
    band:               page1.riskBand ?? null,
    trajectory:         page1.trajectory ?? null,
    summary_text:       dossier.insight?.narrative ?? page0?.narrative ?? null,
    full_json:          changedFromPrior ? dossier : null,
    checksum,
    changed_from_prior: changedFromPrior,
    signals_count:      page1.elevatedSignalCount ?? null,
    active_lead_count:  page8.activeLeadIndicators?.length ?? null
  };

  const { error } = await sb
    .from('dossier_snapshots')
    .upsert(row, { onConflict: 'country,snapshot_date' });

  if (error) throw new Error(`Snapshot save failed for ${country}: ${error.message}`);
  return row;
}

// ── Process one country ───────────────────────────────────────────────────────

async function processCountry(country, options = {}) {
  try {
    const dossier  = await generateDossier(country);
    const checksum = computeChecksum(dossier);

    // Compare to prior unless --force
    let changedFromPrior = true;
    if (!options.force) {
      const prior = await getPriorChecksum(country);
      if (prior && prior.checksum === checksum) {
        changedFromPrior = false;
      }
    }

    await saveSnapshot(country, dossier, checksum, changedFromPrior);

    const page1 = dossier.pages?.find(p => p.pageNumber === 1)?.content || {};
    return {
      country,
      score:    page1.score,
      band:     page1.riskBand,
      changed:  changedFromPrior,
      checksum
    };
  } catch (err) {
    return { country, error: err.message };
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function runNightlySnapshots(options = {}) {
  const countries = options.country ? [options.country] : ALL_COUNTRIES;
  const batchSize = 5; // Process 5 countries concurrently (respects API rate limits)
  const startTime = Date.now();

  console.log('\n══════════════════════════════════════════════════');
  console.log('  SABIAN SNAPSHOT / AUDIT LAYER — NIGHTLY JOB');
  console.log(`  ${new Date().toUTCString()}`);
  console.log(`  Countries: ${countries.length}${options.force ? '  [FORCE MODE — checksums ignored]' : ''}`);
  console.log('══════════════════════════════════════════════════\n');

  const results = { written: [], unchanged: [], failed: [] };

  for (let i = 0; i < countries.length; i += batchSize) {
    const batch = countries.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(countries.length / batchSize);

    process.stdout.write(`  Batch ${batchNum}/${totalBatches}: ${batch.join(', ')}... `);

    const batchResults = await Promise.allSettled(
      batch.map(c => processCountry(c, options))
    );

    for (const r of batchResults) {
      const result = r.status === 'fulfilled' ? r.value : { error: r.reason?.message };
      if (result.error) {
        results.failed.push(result);
        process.stdout.write(`✗`);
      } else if (result.changed) {
        results.written.push(result);
        process.stdout.write(`●`);
      } else {
        results.unchanged.push(result);
        process.stdout.write(`·`);
      }
    }
    process.stdout.write('\n');

    // Brief pause between batches to avoid hammering the AI endpoint
    if (i + batchSize < countries.length) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n── SNAPSHOT RUN COMPLETE ─────────────────────────');
  console.log(`   Written (changed):  ${results.written.length}`);
  console.log(`   Unchanged (skipped): ${results.unchanged.length}`);
  console.log(`   Failed:             ${results.failed.length}`);
  console.log(`   Elapsed:            ${elapsed}s`);

  if (results.written.length > 0) {
    const critical = results.written.filter(r => r.band === 'CRITICAL');
    const warning  = results.written.filter(r => r.band === 'WARNING');
    if (critical.length > 0) {
      console.log(`\n   CRITICAL changes: ${critical.map(r => r.country).join(', ')}`);
    }
    if (warning.length > 0) {
      console.log(`   WARNING changes:  ${warning.map(r => r.country).join(', ')}`);
    }
  }

  if (results.failed.length > 0) {
    console.log(`\n   Failed countries: ${results.failed.map(r => r.country).join(', ')}`);
  }
  console.log('──────────────────────────────────────────────────\n');

  return results;
}

// ── CLI ───────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  const countryIdx = args.indexOf('--country');
  const options = {
    force:   args.includes('--force'),
    country: countryIdx !== -1 ? args[countryIdx + 1] : null
  };

  runNightlySnapshots(options).catch(err => {
    console.error('[SNAPSHOT] Fatal:', err.message);
    process.exit(1);
  });
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = { runNightlySnapshots, processCountry };
