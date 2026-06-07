// historical/relationship_map.cjs
// Phase 1 Step 2 — Signal relationship map.
// Reads the historical record. Finds which signals move together, which lead,
// and which go dark before events. No human definitions. No preset weights.
//
// Outputs three Supabase tables:
//   signal_correlation_map  — pairwise Spearman r at lags 0-4 years
//   signal_lead_indicators  — which signals are early movers
//   going_dark_patterns     — what follows when a signal goes silent
//
// Run after ingestion, reliability map, and baselines are complete.
// Requires: MIGRATION_RELATIONSHIP.sql run in Supabase first.
// Usage: node historical/relationship_map.cjs

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const { logToHive } = require('../logger.cjs');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const MIN_COUNTRIES  = 3;    // minimum countries needed to trust a relationship
const MIN_YEARS      = 5;    // minimum overlapping years per country pair
const MAX_LAG        = 4;    // test lags 0 through 4 years
const R_THRESHOLD    = 0.25; // minimum |r| to record a relationship
const SPIKE_Z        = 1.0;  // z-score threshold for "significant movement"

// ── Table check ───────────────────────────────────────────────────────────────

async function checkTables() {
  const required = ['signal_correlation_map','signal_lead_indicators','going_dark_patterns'];
  const missing = [];
  for (const t of required) {
    const { error } = await sb.from(t).select('*').limit(1);
    if (error) missing.push(t);
  }
  if (missing.length > 0) {
    console.error('\n❌ Missing tables:', missing.join(', '));
    console.error('  Run: historical/MIGRATION_RELATIONSHIP.sql in Supabase SQL editor');
    console.error('  https://supabase.com/dashboard/project/qdxgcyawpqxhhjprqyas/sql\n');
    process.exit(1);
  }
}

// ── Math ──────────────────────────────────────────────────────────────────────

function rank(arr) {
  const indexed = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array(arr.length);
  for (let i = 0; i < indexed.length; i++) ranks[indexed[i].i] = i + 1;
  return ranks;
}

function pearsonR(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx  += (xs[i] - mx) ** 2;
    dy  += (ys[i] - my) ** 2;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

function spearmanR(xs, ys) {
  if (xs.length < 3) return null;
  return pearsonR(rank(xs), rank(ys));
}

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadBaselines() {
  const out = {};
  let page = 0;
  while (true) {
    const { data, error } = await sb
      .from('signal_baselines')
      .select('country,signal_key,baseline_median,baseline_p10,baseline_p90')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (!out[r.country]) out[r.country] = {};
      const iqr = (r.baseline_p90 - r.baseline_p10);
      out[r.country][r.signal_key] = {
        median: r.baseline_median,
        iqr:    iqr > 0 ? iqr : 1,
      };
    }
    if (data.length < 1000) break;
    page++;
  }
  return out;
}

async function loadAllReadings() {
  // Returns: raw[country][signal][year] = { values: number[], allGap: bool }
  const out = {};
  let page = 0;
  let total = 0;
  process.stdout.write('  Loading readings .');
  while (true) {
    const { data, error } = await sb
      .from('historical_signal_readings')
      .select('country,signal_key,date,raw_value,gap')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) {
      const year = new Date(r.date).getFullYear();
      if (!out[r.country]) out[r.country] = {};
      if (!out[r.country][r.signal_key]) out[r.country][r.signal_key] = {};
      if (!out[r.country][r.signal_key][year]) {
        out[r.country][r.signal_key][year] = { values: [], allGap: true };
      }
      const bucket = out[r.country][r.signal_key][year];
      if (!r.gap && r.raw_value !== null) {
        bucket.values.push(parseFloat(r.raw_value));
        bucket.allGap = false;
      }
    }
    total += data.length;
    if (data.length < 1000) break;
    page++;
    if (page % 30 === 0) process.stdout.write('.');
  }
  console.log(` ${total} rows loaded.\n`);
  return out;
}

// ── Normalization ─────────────────────────────────────────────────────────────

function buildTimeSeries(rawData, baselines) {
  // ts[country][signal][year] = z-score
  const ts = {};
  for (const [country, signals] of Object.entries(rawData)) {
    ts[country] = {};
    for (const [signal, byYear] of Object.entries(signals)) {
      const b = baselines[country]?.[signal];
      if (!b) continue;
      ts[country][signal] = {};
      for (const [year, bucket] of Object.entries(byYear)) {
        if (bucket.allGap || bucket.values.length === 0) continue;
        const avg = bucket.values.reduce((a, v) => a + v, 0) / bucket.values.length;
        ts[country][signal][parseInt(year)] = (avg - b.median) / b.iqr;
      }
    }
  }
  return ts;
}

// ── Pairwise correlation ───────────────────────────────────────────────────────

function computePairCorrelation(ts, sigA, sigB, lag) {
  const allA = [], allB = [];
  let countriesUsed = 0;
  let totalYears = 0;

  for (const [, signals] of Object.entries(ts)) {
    const seriesA = signals[sigA];
    const seriesB = signals[sigB];
    if (!seriesA || !seriesB) continue;

    const pairs = [];
    for (const yearA of Object.keys(seriesA).map(Number)) {
      const bVal = seriesB[yearA + lag];
      if (bVal !== undefined) pairs.push([seriesA[yearA], bVal]);
    }
    if (pairs.length < MIN_YEARS) continue;
    countriesUsed++;
    totalYears += pairs.length;
    for (const [a, b] of pairs) { allA.push(a); allB.push(b); }
  }

  if (countriesUsed < MIN_COUNTRIES || allA.length < 10) return null;
  const r = spearmanR(allA, allB);
  if (r === null || Math.abs(r) < R_THRESHOLD) return null;
  return {
    r,
    countries_observed: countriesUsed,
    sample_years_avg:   Math.round(totalYears / countriesUsed),
  };
}

// ── Lead indicators ───────────────────────────────────────────────────────────

function buildLeadIndicators(correlations) {
  const leaders = {};
  for (const c of correlations) {
    if (c.lag_years === 0 || c.correlation_r === null) continue;
    if (!leaders[c.signal_a]) leaders[c.signal_a] = { leads: [], countries: 0 };
    leaders[c.signal_a].leads.push({ target: c.signal_b, lag: c.lag_years, r: c.correlation_r });
    leaders[c.signal_a].countries = Math.max(leaders[c.signal_a].countries, c.countries_observed);
  }

  return Object.entries(leaders).map(([signal, data]) => {
    const sorted = data.leads.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
    const best = sorted[0];
    return {
      signal_key:         signal,
      best_lead_lag:      best.lag,
      best_lead_target:   best.target,
      best_lead_r:        parseFloat(best.r.toFixed(4)),
      avg_lead_years:     parseFloat((data.leads.reduce((s, l) => s + l.lag, 0) / data.leads.length).toFixed(2)),
      signals_led:        sorted.map(l => ({ target: l.target, lag: l.lag, r: parseFloat(l.r.toFixed(4)) })),
      countries_observed: data.countries,
      computed_at:        new Date().toISOString(),
    };
  });
}

// ── Going dark patterns ───────────────────────────────────────────────────────

function buildGoingDarkPatterns(rawData, ts) {
  // dark_events[signal][lag][otherSignal] = { events, spikes, countries }
  const dark = {};

  for (const [country, signals] of Object.entries(rawData)) {
    for (const [signal, byYear] of Object.entries(signals)) {
      const years = Object.keys(byYear).map(Number).sort((a, b) => a - b);
      let wasLive = false;

      for (const year of years) {
        const isLive = !byYear[year].allGap && byYear[year].values.length > 0;
        if (wasLive && !isLive) {
          // Signal just went dark at `year`
          if (!dark[signal]) dark[signal] = {};
          for (let lag = 1; lag <= 3; lag++) {
            if (!dark[signal][lag]) dark[signal][lag] = {};
            for (const [otherSig, otherTs] of Object.entries(ts[country] || {})) {
              if (otherSig === signal) continue;
              const futureZ = otherTs[year + lag];
              if (futureZ === undefined) continue;
              if (!dark[signal][lag][otherSig]) {
                dark[signal][lag][otherSig] = { events: 0, spikes: 0, countries: new Set() };
              }
              dark[signal][lag][otherSig].events++;
              dark[signal][lag][otherSig].countries.add(country);
              if (Math.abs(futureZ) > SPIKE_Z) dark[signal][lag][otherSig].spikes++;
            }
          }
        }
        wasLive = isLive;
      }
    }
  }

  const out = [];
  for (const [signal, lags] of Object.entries(dark)) {
    for (const [lag, others] of Object.entries(lags)) {
      const affected = Object.entries(others)
        .filter(([, d]) => d.events >= 3 && d.countries.size >= MIN_COUNTRIES)
        .map(([sig, d]) => ({
          signal:    sig,
          spike_pct: parseFloat((d.spikes / d.events).toFixed(3)),
          events:    d.events,
        }))
        .sort((a, b) => b.spike_pct - a.spike_pct);

      if (affected.length === 0) continue;
      const totalEvents = affected.reduce((s, a) => s + a.events, 0);
      const totalSpikes = affected.reduce((s, a) => s + Math.round(a.spike_pct * a.events), 0);

      out.push({
        signal_key:            signal,
        lag_years:             parseInt(lag),
        dark_event_count:      totalEvents,
        subsequent_spike_count: totalSpikes,
        spike_pct:             parseFloat((totalSpikes / totalEvents).toFixed(4)),
        affected_signals:      affected,
        countries_observed:    Math.max(...affected.map(() => MIN_COUNTRIES)),
        computed_at:           new Date().toISOString(),
      });
    }
  }
  return out;
}

// ── Write ─────────────────────────────────────────────────────────────────────

async function writeChunked(table, rows, conflict) {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from(table).upsert(rows.slice(i, i + 500), { onConflict: conflict });
    if (error) throw error;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🛰️  Phase 1 Step 2 — Signal relationship map');
  console.log('   The system reads its own record. No human opinion enters.\n');

  await checkTables();

  console.log('  Loading baselines...');
  const baselines = await loadBaselines();
  console.log(`  ${Object.keys(baselines).length} countries with baselines.\n`);

  const rawData = await loadAllReadings();
  const countries = Object.keys(rawData);
  const allSignals = [...new Set(countries.flatMap(c => Object.keys(rawData[c])))];
  console.log(`  ${countries.length} countries. ${allSignals.length} signals.\n`);

  console.log('  Normalizing to z-scores against country baselines...');
  const ts = buildTimeSeries(rawData, baselines);
  console.log('  Done.\n');

  // Pairwise correlations
  console.log(`  Computing pairwise Spearman r (${allSignals.length} signals × lags 0–${MAX_LAG})...`);
  const correlationRows = [];
  for (const sigA of allSignals) {
    for (const sigB of allSignals) {
      if (sigA === sigB) continue;
      for (let lag = 0; lag <= MAX_LAG; lag++) {
        const result = computePairCorrelation(ts, sigA, sigB, lag);
        if (result) {
          correlationRows.push({
            signal_a:           sigA,
            signal_b:           sigB,
            correlation_r:      parseFloat(result.r.toFixed(4)),
            lag_years:          lag,
            countries_observed: result.countries_observed,
            sample_years_avg:   result.sample_years_avg,
            computed_at:        new Date().toISOString(),
          });
        }
      }
    }
  }

  const pairs = allSignals.length * (allSignals.length - 1) * (MAX_LAG + 1);
  console.log(`  ${pairs} pairs tested. ${correlationRows.length} relationships found (|r| ≥ ${R_THRESHOLD}, ≥${MIN_COUNTRIES} countries).\n`);

  if (correlationRows.length > 0) {
    const top = [...correlationRows]
      .sort((a, b) => Math.abs(b.correlation_r) - Math.abs(a.correlation_r))
      .slice(0, 12);
    console.log('  Strongest relationships:');
    for (const r of top) {
      const dir = r.correlation_r > 0 ? '+' : '-';
      const lag = r.lag_years > 0 ? ` [${r.signal_a} leads ${r.lag_years}yr]` : ' [same time]';
      console.log(`    ${dir}${Math.abs(r.correlation_r).toFixed(3)}  ${r.signal_a} ↔ ${r.signal_b}${lag}  (${r.countries_observed} countries)`);
    }
    console.log('');
  }

  console.log('  Building lead indicator rankings...');
  const leadRows = buildLeadIndicators(correlationRows);
  if (leadRows.length > 0) {
    console.log('  Leading signals:');
    for (const l of leadRows) {
      console.log(`    ${l.signal_key} → ${l.best_lead_target} by ${l.best_lead_lag}yr  r=${l.best_lead_r}  (${l.countries_observed} countries)`);
    }
  }
  console.log('');

  console.log('  Analyzing going-dark patterns...');
  const darkRows = buildGoingDarkPatterns(rawData, ts);
  if (darkRows.length > 0) {
    console.log('  Going-dark patterns:');
    for (const d of darkRows) {
      console.log(`    ${d.signal_key} goes dark → ${(d.spike_pct * 100).toFixed(1)}% spike rate at lag ${d.lag_years}yr`);
    }
  }
  console.log('');

  console.log('  Writing to Supabase...');
  await writeChunked('signal_correlation_map', correlationRows, 'signal_a,signal_b,lag_years');
  console.log(`    signal_correlation_map:  ${correlationRows.length} rows`);
  await writeChunked('signal_lead_indicators', leadRows, 'signal_key');
  console.log(`    signal_lead_indicators:  ${leadRows.length} rows`);
  await writeChunked('going_dark_patterns', darkRows, 'signal_key,lag_years');
  console.log(`    going_dark_patterns:     ${darkRows.length} rows`);

  logToHive({
    source: 'relationship_map',
    level: 'intel',
    event: 'relationship_map_built',
    data: {
      correlations: correlationRows.length,
      lead_indicators: leadRows.length,
      going_dark: darkRows.length,
      signals: allSignals.length,
      countries: countries.length,
    }
  });

  console.log('\n' + '═'.repeat(60));
  console.log('✅ Signal relationship map complete.');
  console.log(`   Correlations found:     ${correlationRows.length}`);
  console.log(`   Lead indicators:        ${leadRows.length}`);
  console.log(`   Going-dark patterns:    ${darkRows.length}`);
  console.log('\nNext: Phase 1 Step 3');
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
