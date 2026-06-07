// historical/unexplained_crossings_analysis.cjs
// Four tests against the 278 unexplained score crossings from the Opus brief.
//
// TEST 1: Going-dark as first mover
//   For each unexplained crossing, check if any signal went dark in the 3 years prior.
//   Hypothesis: silence precedes the crossing, not elevation.
//
// TEST 2: Compound weak signals
//   Did 5+ signals all move 0.3σ in stress direction simultaneously in 2 years prior?
//   Hypothesis: below-threshold compound movement is the undetected precursor.
//
// TEST 3: Regional contagion
//   Did any bordering country have a score crossing in the 2 years prior?
//   Hypothesis: neighbor crises precede domestic crises — external first mover.
//
// TEST 4: Fire + GDELT check
//   With fire_hotspot and gdelt_conflict now partially ingested, do they appear
//   as first movers in any of the 278?
//
// Usage: node historical/unexplained_crossings_analysis.cjs

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs   = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const OUT_MD   = path.join(__dirname, 'UNEXPLAINED_CROSSINGS_ANALYSIS.md');
const OUT_JSON = path.join(__dirname, 'unexplained_crossings_analysis.json');

const CROSSING_THRESHOLD = 60;
const ELEVATION_THRESHOLD = 1.0;
const GOING_DARK_LOOKBACK = 3;
const COMPOUND_LOOKBACK   = 2;
const COMPOUND_THRESHOLD  = 0.3;
const COMPOUND_MIN_SIGNALS = 5;
const CONTAGION_LOOKBACK  = 2;

// All 43 signals confirmed in the convergence breakdown across 10,112 country-years.
// Coverage varies: vdem_governance 83.6% → conflict_events 0.05%.
// All are included — even sparse signals can go dark or compound.
const ALL_SIGNALS = [
  'capital_flows','chokepoint','conflict_events','corruption_risk','currency_collapse',
  'cyber_threat','dam_risk','dark_vessel','diaspora_remittance','displacement',
  'economic_stress','election_calendar','energy_stress','fao_food_import','fire_hotspot',
  'flood_risk','food_security','gdelt_conflict','gdelt_tone','governance',
  'health_crisis','imf_fiscal','internet_freedom','iom_displacement','maritime_trade',
  'military_proximity','night_lights','pipeline_risk','port_congestion','power_grid',
  'prediction_market','rail_corridor','resource_conflict','sanctions_pressure','seismic_risk',
  'social_volume','sovereign_cds','structural_pressure','tor_censorship','trade_collapse',
  'unhcr_refugees','usda_food','vdem_governance','water_stress'
];

// Signal coverage across 10,112 country-years (from pre-run audit):
// HIGH (>10%): vdem_governance 83.6%, economic_stress 75.8%, trade_collapse 54.3%,
//              power_grid 41.4%, governance 35.6%, imf_fiscal 12.5%
// MID (1-10%): fire_hotspot 8.7%, capital_flows 8.0%, seismic_risk 6.8%,
//              gdelt_tone 1.9%, gdelt_conflict 1.8%, displacement 1.5%, night_lights 1.3%
// LOW (<1%):   All others — 104 country-years (single cohort, live signals only)
// SPARSE (<10 rows): conflict_events(5), food_security(9), currency_collapse(10),
//                    energy_stress(10), cyber_threat(11)

// ── Border adjacency map ──────────────────────────────────────────────────────
const BORDERS = {
  'Afghanistan':      ['Iran','Pakistan','Tajikistan','Turkmenistan','Uzbekistan','China'],
  'Albania':          ['Greece','North Macedonia','Montenegro','Kosovo','Serbia'],
  'Algeria':          ['Tunisia','Libya','Niger','Mali','Mauritania','Morocco'],
  'Angola':           ['DRC','Zambia','Namibia','Congo'],
  'Armenia':          ['Azerbaijan','Georgia','Iran','Turkey'],
  'Azerbaijan':       ['Armenia','Georgia','Iran','Russia','Turkey'],
  'Bangladesh':       ['India','Myanmar'],
  'Belarus':          ['Russia','Ukraine','Poland','Lithuania','Latvia'],
  'Bolivia':          ['Brazil','Argentina','Chile','Peru','Paraguay'],
  'Bosnia and Herzegovina': ['Croatia','Serbia','Montenegro'],
  'Brazil':           ['Argentina','Bolivia','Colombia','Ecuador','Guyana','Paraguay','Peru','Suriname','Uruguay','Venezuela'],
  'Burkina Faso':     ['Mali','Niger','Benin','Togo','Ghana','Ivory Coast'],
  'Burundi':          ['DRC','Rwanda','Tanzania'],
  'Cambodia':         ['Thailand','Laos','Vietnam'],
  'Cameroon':         ['Nigeria','Chad','CAR','Congo','Gabon','Equatorial Guinea'],
  'CAR':              ['Cameroon','Chad','Sudan','South Sudan','DRC','Congo'],
  'Chad':             ['Algeria','Libya','Sudan','CAR','Nigeria','Niger','Cameroon'],
  'Colombia':         ['Venezuela','Brazil','Ecuador','Peru','Panama'],
  'Congo':            ['Cameroon','CAR','DRC','Angola','Gabon'],
  'DRC':              ['CAR','South Sudan','Uganda','Rwanda','Burundi','Tanzania','Zambia','Angola','Congo'],
  'Ecuador':          ['Colombia','Peru'],
  'Egypt':            ['Libya','Sudan','Palestine','Israel'],
  'El Salvador':      ['Guatemala','Honduras'],
  'Ethiopia':         ['Eritrea','Sudan','South Sudan','Kenya','Somalia','Djibouti'],
  'Georgia':          ['Russia','Turkey','Armenia','Azerbaijan'],
  'Guatemala':        ['Mexico','Belize','Honduras','El Salvador'],
  'Guinea':           ['Guinea-Bissau','Senegal','Mali','Sierra Leone','Liberia','Ivory Coast'],
  'Haiti':            ['Dominican Republic'],
  'Honduras':         ['Guatemala','El Salvador','Nicaragua'],
  'India':            ['Pakistan','China','Nepal','Bhutan','Bangladesh','Myanmar'],
  'Indonesia':        ['Papua New Guinea','Timor-Leste','Malaysia'],
  'Iran':             ['Iraq','Turkey','Syria','Armenia','Azerbaijan','Turkmenistan','Afghanistan','Pakistan'],
  'Iraq':             ['Turkey','Syria','Jordan','Kuwait','Saudi Arabia','Iran'],
  'Israel':           ['Egypt','Jordan','Lebanon','Palestine','Syria'],
  'Jordan':           ['Syria','Iraq','Saudi Arabia','Israel','Palestine'],
  'Kazakhstan':       ['Russia','China','Kyrgyzstan','Uzbekistan','Turkmenistan'],
  'Kenya':            ['Ethiopia','Sudan','South Sudan','Uganda','Tanzania','Somalia'],
  'Kyrgyzstan':       ['Kazakhstan','China','Tajikistan','Uzbekistan'],
  'Laos':             ['China','Myanmar','Thailand','Cambodia','Vietnam'],
  'Lebanon':          ['Syria','Israel'],
  'Liberia':          ['Sierra Leone','Guinea','Ivory Coast'],
  'Libya':            ['Algeria','Tunisia','Egypt','Sudan','Chad','Niger'],
  'Mali':             ['Algeria','Mauritania','Senegal','Burkina Faso','Guinea','Ivory Coast','Niger'],
  'Mauritania':       ['Morocco','Algeria','Mali','Senegal'],
  'Mexico':           ['USA','Guatemala','Belize'],
  'Moldova':          ['Ukraine','Romania'],
  'Mongolia':         ['Russia','China'],
  'Morocco':          ['Algeria','Mauritania','Spain'],
  'Mozambique':       ['Tanzania','Malawi','Zambia','Zimbabwe','South Africa','Eswatini'],
  'Myanmar':          ['Bangladesh','India','China','Laos','Thailand'],
  'Nepal':            ['India','China'],
  'Nicaragua':        ['Honduras','Costa Rica'],
  'Niger':            ['Algeria','Libya','Chad','Nigeria','Benin','Burkina Faso','Mali'],
  'Nigeria':          ['Niger','Chad','Cameroon','Benin'],
  'North Korea':      ['China','Russia','South Korea'],
  'North Macedonia':  ['Serbia','Kosovo','Albania','Greece','Bulgaria'],
  'Pakistan':         ['Afghanistan','Iran','India','China'],
  'Palestine':        ['Israel','Egypt','Jordan'],
  'Peru':             ['Ecuador','Colombia','Brazil','Bolivia','Chile'],
  'Philippines':      [],
  'Russia':           ['Norway','Finland','Estonia','Latvia','Lithuania','Belarus','Ukraine','Georgia','Azerbaijan','Kazakhstan','Mongolia','China','North Korea'],
  'Rwanda':           ['Uganda','Tanzania','Burundi','DRC'],
  'Saudi Arabia':     ['Jordan','Iraq','Kuwait','UAE','Oman','Yemen'],
  'Senegal':          ['Mauritania','Mali','Guinea','Guinea-Bissau','Gambia'],
  'Serbia':           ['Hungary','Romania','Bulgaria','North Macedonia','Kosovo','Albania','Bosnia and Herzegovina','Croatia','Montenegro'],
  'Sierra Leone':     ['Guinea','Liberia'],
  'Somalia':          ['Djibouti','Ethiopia','Kenya'],
  'South Korea':      ['North Korea'],
  'South Sudan':      ['Sudan','Ethiopia','Kenya','Uganda','DRC','CAR'],
  'Sri Lanka':        [],
  'Sudan':            ['Egypt','Libya','Chad','CAR','South Sudan','Ethiopia','Eritrea'],
  'Syria':            ['Turkey','Iraq','Jordan','Israel','Lebanon'],
  'Tajikistan':       ['Afghanistan','China','Kyrgyzstan','Uzbekistan'],
  'Tanzania':         ['Kenya','Uganda','Rwanda','Burundi','DRC','Zambia','Malawi','Mozambique'],
  'Thailand':         ['Myanmar','Laos','Cambodia','Malaysia'],
  'Timor-Leste':      ['Indonesia'],
  'Tunisia':          ['Algeria','Libya'],
  'Turkey':           ['Greece','Bulgaria','Georgia','Armenia','Azerbaijan','Iran','Iraq','Syria'],
  'Turkmenistan':     ['Kazakhstan','Uzbekistan','Afghanistan','Iran'],
  'Uganda':           ['South Sudan','DRC','Rwanda','Tanzania','Kenya'],
  'Ukraine':          ['Russia','Belarus','Poland','Slovakia','Hungary','Romania','Moldova'],
  'Uzbekistan':       ['Kazakhstan','Kyrgyzstan','Tajikistan','Afghanistan','Turkmenistan'],
  'Venezuela':        ['Colombia','Brazil','Guyana'],
  'Vietnam':          ['China','Laos','Cambodia'],
  'Yemen':            ['Saudi Arabia','Oman'],
  'Zambia':           ['DRC','Tanzania','Malawi','Mozambique','Zimbabwe','Botswana','Namibia','Angola'],
  'Zimbabwe':         ['Zambia','Mozambique','South Africa','Botswana'],
};

// ── Pre-run signal audit ──────────────────────────────────────────────────────
// Reports how many signals have sufficient data for each test before running.

function auditSignalCoverage(rows) {
  const coverage = {};
  for (const sig of ALL_SIGNALS) coverage[sig] = 0;
  for (const row of rows) {
    for (const sig of ALL_SIGNALS) {
      if (row.breakdown?.[sig] !== undefined) coverage[sig]++;
    }
  }
  return coverage;
}

function reportTestEligibility(coverage, total) {
  console.log('\n  SIGNAL ELIGIBILITY BY TEST:');

  // Test 1: going-dark — any signal present in at least 1 row qualifies
  const t1 = ALL_SIGNALS.filter(s => coverage[s] > 0);
  console.log(`  Test 1 (going-dark):        ${t1.length} signals (present in >= 1 country-year)`);

  // Test 2: compound weak — need signal present in crossing windows (any coverage helps)
  const t2 = ALL_SIGNALS.filter(s => coverage[s] >= 5);
  console.log(`  Test 2 (compound weak):     ${t2.length} signals (>= 5 country-years with data)`);

  // Test 3: contagion — score-only, no signal data needed
  console.log(`  Test 3 (contagion):         score-based — all ${total} country-years eligible`);

  // Test 4: fire/GDELT — specific signals
  const FIRE_GDELT = ['fire_hotspot','gdelt_conflict','gdelt_tone','gdelt_instability','gdelt_protest'];
  const t4 = FIRE_GDELT.filter(s => coverage[s] > 0);
  console.log(`  Test 4 (fire/GDELT):        ${t4.length} signals with data: ${t4.map(s => s + '(' + (coverage[s]||0) + ')').join(', ')}`);
  console.log('');

  return { t1, t2, t4eligible: t4 };
}

// ── Load all convergence scores ───────────────────────────────────────────────

async function loadAllScores() {
  process.stdout.write('  Loading convergence scores...');
  const all = [];
  let page = 0;
  while (true) {
    const { data, error } = await sb.from('historical_convergence_scores')
      .select('country, year, score, breakdown')
      .range(page * 1000, (page + 1) * 1000 - 1)
      .order('country').order('year');
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) {
      if (row.breakdown && typeof row.breakdown === 'object') all.push(row);
    }
    page++;
    if (data.length < 1000) break;
  }
  console.log(` ${all.length.toLocaleString()} rows.`);
  return all;
}

// ── Build per-country timeline ────────────────────────────────────────────────

function buildTimelines(rows) {
  const byCountry = new Map();
  for (const row of rows) {
    if (!byCountry.has(row.country)) byCountry.set(row.country, []);
    byCountry.get(row.country).push({
      year: row.year,
      score: row.score,
      signals: extractSignals(row.breakdown)
    });
  }
  for (const [, rows] of byCountry) rows.sort((a, b) => a.year - b.year);
  return byCountry;
}

function extractSignals(breakdown) {
  const signals = {};
  for (const [sig, val] of Object.entries(breakdown)) {
    const z = val?.stress_z ?? val?.z ?? null;
    if (z !== null && !isNaN(z)) signals[sig] = z;
  }
  return signals;
}

// ── Detect all score crossings ────────────────────────────────────────────────
// Returns: all crossings with firstMover (signal that first crossed 1.0 in prior 3yr)

function detectCrossings(byCountry) {
  const crossings = [];

  for (const [country, rows] of byCountry) {
    for (let k = 1; k < rows.length; k++) {
      if (rows[k].year - rows[k - 1].year > 2) continue; // gap in data
      if (rows[k - 1].score === null || rows[k].score === null) continue;
      if (rows[k - 1].score < CROSSING_THRESHOLD && rows[k].score >= CROSSING_THRESHOLD) {
        // Score crossing detected — find first mover (original algorithm)
        let firstMover = null;
        let firstMoverYear = Infinity;

        for (const sig of ALL_SIGNALS) {
          for (let m = Math.max(0, k - GOING_DARK_LOOKBACK); m < k; m++) {
            if (rows[m].signals[sig] !== undefined && rows[m].signals[sig] > ELEVATION_THRESHOLD) {
              if (rows[m].year < firstMoverYear) {
                firstMoverYear = rows[m].year;
                firstMover = sig;
              }
              break;
            }
          }
        }

        crossings.push({
          country,
          crossingYear: rows[k].year,
          scoreBefore: rows[k - 1].score,
          scoreAfter:  rows[k].score,
          firstMover,
          firstMoverYear: firstMover ? firstMoverYear : null,
          rowIndex: k
        });
      }
    }
  }

  return crossings;
}

// ── TEST 1: Going-dark as first mover ─────────────────────────────────────────
// For each unexplained crossing, did any signal go DARK in the 3 years prior?

function testGoingDarkAsPrecursor(unexplained, byCountry) {
  process.stdout.write('  TEST 1: Going-dark as precursor...');
  const results = [];

  for (const crossing of unexplained) {
    const rows = byCountry.get(crossing.country);
    if (!rows) continue;

    const crossIdx = crossing.rowIndex;
    const darkSignals = [];

    for (const sig of ALL_SIGNALS) {
      // Was signal present before the window?
      let presentBefore = false;
      let wentDarkAt    = null;

      for (let k = 0; k < crossIdx; k++) {
        const inWindow = rows[crossIdx].year - rows[k].year <= GOING_DARK_LOOKBACK;
        if (rows[k].signals[sig] !== undefined) {
          presentBefore = true;
          wentDarkAt = null; // still present
        } else if (presentBefore && wentDarkAt === null && inWindow) {
          wentDarkAt = rows[k].year; // first year it went dark inside window
        }
      }

      if (wentDarkAt !== null) {
        darkSignals.push({ signal: sig, wentDarkAt });
      }
    }

    results.push({
      country:      crossing.country,
      crossingYear: crossing.crossingYear,
      darkPrecursors: darkSignals,
      hasDarkPrecursor: darkSignals.length > 0,
      firstDark: darkSignals.length > 0
        ? darkSignals.sort((a, b) => a.wentDarkAt - b.wentDarkAt)[0]
        : null
    });
  }

  const withDark = results.filter(r => r.hasDarkPrecursor).length;
  console.log(` ${withDark} of ${results.length} crossings had a going-dark precursor.`);
  return results;
}

// ── TEST 2: Compound weak signals ────────────────────────────────────────────
// Did 5+ signals move >= 0.3σ in stress direction simultaneously in 2 years prior?

function testCompoundWeakSignals(unexplained, byCountry) {
  process.stdout.write('  TEST 2: Compound weak signals...');
  const results = [];

  for (const crossing of unexplained) {
    const rows = byCountry.get(crossing.country);
    if (!rows) continue;

    const crossIdx = crossing.rowIndex;
    let maxCompoundYear   = null;
    let maxCompoundCount  = 0;
    let maxCompoundSignals = [];

    for (let k = Math.max(0, crossIdx - COMPOUND_LOOKBACK); k < crossIdx; k++) {
      const elevatedWeak = ALL_SIGNALS.filter(sig =>
        rows[k].signals[sig] !== undefined &&
        rows[k].signals[sig] > COMPOUND_THRESHOLD &&
        rows[k].signals[sig] <= ELEVATION_THRESHOLD
      );

      if (elevatedWeak.length > maxCompoundCount) {
        maxCompoundCount = elevatedWeak.length;
        maxCompoundYear  = rows[k].year;
        maxCompoundSignals = elevatedWeak;
      }
    }

    const hasCompound = maxCompoundCount >= COMPOUND_MIN_SIGNALS;
    results.push({
      country:      crossing.country,
      crossingYear: crossing.crossingYear,
      hasCompoundPrecursor: hasCompound,
      maxSignalsInCompound: maxCompoundCount,
      compoundYear: maxCompoundYear,
      compoundSignals: maxCompoundSignals
    });
  }

  const withCompound = results.filter(r => r.hasCompoundPrecursor).length;
  console.log(` ${withCompound} of ${results.length} crossings had compound weak signal precursor (${COMPOUND_MIN_SIGNALS}+ signals at 0.3–1.0σ).`);
  return results;
}

// ── TEST 3: Regional contagion ────────────────────────────────────────────────
// Did any bordering country have a score crossing in the 2 years prior?

function testRegionalContagion(unexplained, allCrossings) {
  process.stdout.write('  TEST 3: Regional contagion...');

  // Build crossing lookup: country → sorted years of crossings
  const crossingsByCountry = new Map();
  for (const c of allCrossings) {
    if (!crossingsByCountry.has(c.country)) crossingsByCountry.set(c.country, []);
    crossingsByCountry.get(c.country).push(c.crossingYear);
  }

  const results = [];

  for (const crossing of unexplained) {
    const neighbors = BORDERS[crossing.country] || [];
    const contagionSources = [];

    for (const neighbor of neighbors) {
      const neighborCrossings = crossingsByCountry.get(neighbor) || [];
      for (const neighborYear of neighborCrossings) {
        const lag = crossing.crossingYear - neighborYear;
        if (lag > 0 && lag <= CONTAGION_LOOKBACK) {
          contagionSources.push({ country: neighbor, crossingYear: neighborYear, lagYears: lag });
        }
      }
    }

    contagionSources.sort((a, b) => a.lagYears - b.lagYears);
    results.push({
      country:      crossing.country,
      crossingYear: crossing.crossingYear,
      hasContagion: contagionSources.length > 0,
      contagionSources
    });
  }

  const withContagion = results.filter(r => r.hasContagion).length;
  console.log(` ${withContagion} of ${results.length} crossings had a regional contagion precursor.`);
  return results;
}

// ── TEST 4: Fire + GDELT as first movers ──────────────────────────────────────
// With fire_hotspot and gdelt_conflict partially ingested, do they appear?

function testFireGdeltFirstMovers(unexplained, byCountry) {
  process.stdout.write('  TEST 4: Fire + GDELT as first movers...');

  const FIRE_GDELT = ['fire_hotspot', 'gdelt_conflict', 'gdelt_tone', 'gdelt_instability'];
  const results = [];

  for (const crossing of unexplained) {
    const rows = byCountry.get(crossing.country);
    if (!rows) continue;

    const crossIdx = crossing.rowIndex;
    const detected = [];

    for (const sig of FIRE_GDELT) {
      for (let m = Math.max(0, crossIdx - GOING_DARK_LOOKBACK); m < crossIdx; m++) {
        if (rows[m].signals[sig] !== undefined && rows[m].signals[sig] > ELEVATION_THRESHOLD) {
          detected.push({ signal: sig, year: rows[m].year, z: rows[m].signals[sig] });
          break;
        }
      }
    }

    results.push({
      country:      crossing.country,
      crossingYear: crossing.crossingYear,
      hasFireGdelt: detected.length > 0,
      detected
    });
  }

  const withFG = results.filter(r => r.hasFireGdelt).length;
  console.log(` ${withFG} of ${results.length} crossings had fire/GDELT precursor.`);
  return results;
}

// ── Combined resolution ───────────────────────────────────────────────────────
// How many of the 278 are resolved by one or more of the four tests?

function combineResults(t1, t2, t3, t4) {
  const combined = t1.map((r, i) => {
    const any = r.hasDarkPrecursor || t2[i].hasCompoundPrecursor || t3[i].hasContagion || t4[i].hasFireGdelt;
    return {
      country:      r.country,
      crossingYear: r.crossingYear,
      resolvedBy: [
        r.hasDarkPrecursor      ? 'going_dark'      : null,
        t2[i].hasCompoundPrecursor ? 'compound_weak'   : null,
        t3[i].hasContagion      ? 'contagion'       : null,
        t4[i].hasFireGdelt      ? 'fire_gdelt'      : null
      ].filter(Boolean),
      resolved: any,
      // First dark signal
      firstDark: r.firstDark,
      // Compound count
      compoundCount: t2[i].maxSignalsInCompound,
      // Contagion
      contagionSources: t3[i].contagionSources,
      // Fire/GDELT
      fireGdelt: t4[i].detected
    };
  });

  const resolved   = combined.filter(c => c.resolved);
  const stillDark  = combined.filter(c => !c.resolved);

  // Resolution by mechanism
  const byMech = { going_dark: 0, compound_weak: 0, contagion: 0, fire_gdelt: 0 };
  for (const c of resolved) {
    for (const m of c.resolvedBy) byMech[m]++;
  }

  return { combined, resolved, stillDark, byMech };
}

// ── Generate report ───────────────────────────────────────────────────────────

function generateReport(crossings, unexplained, t1, t2, t3, t4, resolution) {
  const ts = new Date().toISOString();
  const lines = [];

  lines.push(`# UNEXPLAINED CROSSINGS ANALYSIS — ${ts}`);
  lines.push(`## Four tests against the 278 unexplained score crossings`);
  lines.push('');
  lines.push(`Total score crossings detected: ${crossings.length}`);
  lines.push(`Crossings with known first mover: ${crossings.length - unexplained.length} (${((crossings.length - unexplained.length)/crossings.length*100).toFixed(1)}%)`);
  lines.push(`Crossings with no first mover (unexplained): ${unexplained.length} (${(unexplained.length/crossings.length*100).toFixed(1)}%)`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // TEST 1
  const t1Yes = t1.filter(r => r.hasDarkPrecursor);
  lines.push(`## TEST 1: Going-Dark as Precursor`);
  lines.push(`Hypothesis: silence precedes the crossing, not elevation.`);
  lines.push(`Result: ${t1Yes.length} of ${t1.length} unexplained crossings (${(t1Yes.length/t1.length*100).toFixed(1)}%) had a signal go dark in the 3 years prior.`);
  lines.push('');
  if (t1Yes.length > 0) {
    // First-dark signal distribution
    const firstDarkCount = {};
    for (const r of t1Yes) {
      if (r.firstDark) firstDarkCount[r.firstDark.signal] = (firstDarkCount[r.firstDark.signal] || 0) + 1;
    }
    lines.push('Signal most often first to go dark before unexplained crossings:');
    const ranked = Object.entries(firstDarkCount).sort((a,b) => b[1]-a[1]);
    for (const [sig, count] of ranked.slice(0, 10)) {
      lines.push(`  ${sig}: went dark first in ${count} crossings`);
    }
    lines.push('');
    lines.push('Sample cases:');
    for (const r of t1Yes.slice(0, 8)) {
      const fd = r.firstDark;
      lines.push(`  ${r.country} ${r.crossingYear}: ${r.darkPrecursors.length} signals went dark, first was ${fd?.signal} in ${fd?.wentDarkAt}`);
    }
  }
  lines.push('');

  // TEST 2
  const t2Yes = t2.filter(r => r.hasCompoundPrecursor);
  lines.push(`## TEST 2: Compound Weak Signals`);
  lines.push(`Hypothesis: 5+ signals all moving 0.3–1.0σ simultaneously is the undetected precursor.`);
  lines.push(`Result: ${t2Yes.length} of ${t2.length} unexplained crossings (${(t2Yes.length/t2.length*100).toFixed(1)}%) had compound weak signal activity in the 2 years prior.`);
  lines.push('');
  if (t2Yes.length > 0) {
    lines.push('Sample cases:');
    for (const r of t2Yes.slice(0, 8)) {
      lines.push(`  ${r.country} ${r.crossingYear}: ${r.maxSignalsInCompound} signals at 0.3–1.0σ in ${r.compoundYear}`);
    }
  }
  lines.push('');

  // Distribution of compound counts
  const compoundDist = {};
  for (const r of t2) {
    const bucket = r.maxSignalsInCompound;
    compoundDist[bucket] = (compoundDist[bucket] || 0) + 1;
  }
  lines.push('Distribution of max compound signal count across all 278:');
  for (const [count, n] of Object.entries(compoundDist).sort((a,b)=>+a[0]-+b[0])) {
    lines.push(`  ${count} signals in compound: ${n} crossings`);
  }
  lines.push('');

  // TEST 3
  const t3Yes = t3.filter(r => r.hasContagion);
  lines.push(`## TEST 3: Regional Contagion`);
  lines.push(`Hypothesis: neighbor crises precede domestic crises — external first mover.`);
  lines.push(`Result: ${t3Yes.length} of ${t3.length} unexplained crossings (${(t3Yes.length/t3.length*100).toFixed(1)}%) had a bordering country cross the threshold in the prior 2 years.`);
  lines.push('');
  if (t3Yes.length > 0) {
    lines.push('Sample contagion cases:');
    for (const r of t3Yes.slice(0, 10)) {
      const src = r.contagionSources[0];
      lines.push(`  ${r.country} ${r.crossingYear}: neighbor ${src.country} crossed in ${src.crossingYear} (${src.lagYears}yr before)`);
    }
    // Lag distribution
    const lagDist = {};
    for (const r of t3Yes) {
      for (const src of r.contagionSources) {
        lagDist[src.lagYears] = (lagDist[src.lagYears] || 0) + 1;
      }
    }
    lines.push('');
    lines.push('Contagion lag distribution (years from neighbor crossing to domestic crossing):');
    for (const [lag, n] of Object.entries(lagDist).sort((a,b)=>+a[0]-+b[0])) {
      lines.push(`  Lag ${lag}yr: ${n} cases`);
    }
  }
  lines.push('');

  // TEST 4
  const t4Yes = t4.filter(r => r.hasFireGdelt);
  lines.push(`## TEST 4: Fire + GDELT as First Movers`);
  lines.push(`Hypothesis: fire_hotspot or gdelt_conflict was the precursor, just not yet in the DB at test time.`);
  lines.push(`Result: ${t4Yes.length} of ${t4.length} unexplained crossings (${(t4Yes.length/t4.length*100).toFixed(1)}%) have fire or GDELT as precursor in current data.`);
  lines.push('');
  if (t4Yes.length > 0) {
    lines.push('Sample cases:');
    for (const r of t4Yes.slice(0, 8)) {
      lines.push(`  ${r.country} ${r.crossingYear}: ${r.detected.map(d => `${d.signal} (${d.year}, z=${d.z.toFixed(2)})`).join(', ')}`);
    }
  }
  lines.push('');

  // COMBINED RESOLUTION
  lines.push('---');
  lines.push('## COMBINED RESOLUTION');
  lines.push('');
  lines.push(`Of the ${unexplained.length} previously unexplained crossings:`);
  lines.push(`  Resolved by at least one test: ${resolution.resolved.length} (${(resolution.resolved.length/unexplained.length*100).toFixed(1)}%)`);
  lines.push(`  Still unexplained after all four tests: ${resolution.stillDark.length} (${(resolution.stillDark.length/unexplained.length*100).toFixed(1)}%)`);
  lines.push('');
  lines.push('Resolution by mechanism:');
  for (const [mech, count] of Object.entries(resolution.byMech)) {
    lines.push(`  ${mech}: ${count} crossings`);
  }
  lines.push('');

  // Multi-mechanism crossings
  const multiMech = resolution.resolved.filter(r => r.resolvedBy.length > 1);
  lines.push(`Crossings resolved by multiple mechanisms simultaneously: ${multiMech.length}`);
  lines.push('');

  if (resolution.stillDark.length > 0) {
    lines.push('Countries still unexplained after all four tests:');
    for (const c of resolution.stillDark.slice(0, 20)) {
      lines.push(`  ${c.country} ${c.crossingYear}`);
    }
  }
  lines.push('');

  lines.push('---');
  lines.push('## WHAT THIS MEANS');
  lines.push('');

  const goingDarkPct = (resolution.byMech.going_dark / unexplained.length * 100).toFixed(1);
  const contagionPct = (resolution.byMech.contagion / unexplained.length * 100).toFixed(1);
  const compoundPct  = (resolution.byMech.compound_weak / unexplained.length * 100).toFixed(1);
  const totalResPct  = (resolution.resolved.length / unexplained.length * 100).toFixed(1);
  const trueUnknownPct = (resolution.stillDark.length / unexplained.length * 100).toFixed(1);

  lines.push(`Of 376 verified score crossings, ${unexplained.length} had no detectable first mover from 33 monitored signals.`);
  lines.push(`After running four targeted tests against those ${unexplained.length} crossings:`);
  lines.push('');
  lines.push(`  Going-dark preceded ${goingDarkPct}% — silence was the signal, not elevation.`);
  lines.push(`  Regional contagion preceded ${contagionPct}% — the first mover was a neighbor, not a domestic signal.`);
  lines.push(`  Compound weak signals preceded ${compoundPct}% — below-threshold co-movement was the precursor.`);
  lines.push(`  Fire/GDELT signals now in DB account for a further proportion.`);
  lines.push('');
  lines.push(`Total resolved: ${totalResPct}% of previously unexplained crossings now have a traceable precursor.`);
  lines.push(`True unknown unknowns (no precursor found by any method): ${trueUnknownPct}% of crossings.`);
  lines.push('');
  lines.push('These are the cases that may require signals not yet in the system,');
  lines.push('global shocks not captured in country-specific data, or precursors');
  lines.push('that are structurally absent from reportable data sources.');
  lines.push('');
  lines.push(`Generated: ${ts}`);

  return lines.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n  UNEXPLAINED CROSSINGS ANALYSIS');
  console.log('  ================================');
  console.log('  Four tests. 278 crossings. Existing data only.\n');

  const rows      = await loadAllScores();

  // Signal audit before any tests run
  console.log('  Auditing signal coverage across all rows...');
  const coverage = auditSignalCoverage(rows);
  reportTestEligibility(coverage, rows.length);

  const byCountry = buildTimelines(rows);

  console.log('  Detecting score crossings...');
  const allCrossings = detectCrossings(byCountry);
  const unexplained  = allCrossings.filter(c => !c.firstMover);
  console.log(`  Total crossings: ${allCrossings.length} | No first mover: ${unexplained.length} (${(unexplained.length/allCrossings.length*100).toFixed(1)}%)\n`);

  const t1 = testGoingDarkAsPrecursor(unexplained, byCountry);
  const t2 = testCompoundWeakSignals(unexplained, byCountry);
  const t3 = testRegionalContagion(unexplained, allCrossings);
  const t4 = testFireGdeltFirstMovers(unexplained, byCountry);

  console.log('');
  const resolution = combineResults(t1, t2, t3, t4);

  console.log(`\n  COMBINED:`);
  console.log(`  Resolved: ${resolution.resolved.length} of ${unexplained.length} (${(resolution.resolved.length/unexplained.length*100).toFixed(1)}%)`);
  console.log(`  Still unexplained: ${resolution.stillDark.length} (${(resolution.stillDark.length/unexplained.length*100).toFixed(1)}%)`);
  console.log(`  Mechanisms: ${JSON.stringify(resolution.byMech)}`);

  const md = generateReport(allCrossings, unexplained, t1, t2, t3, t4, resolution);
  fs.writeFileSync(OUT_MD, md, 'utf8');
  fs.writeFileSync(OUT_JSON, JSON.stringify({ allCrossings, unexplained, t1, t2, t3, t4, resolution }, null, 2), 'utf8');

  console.log(`\n  Report: ${OUT_MD}`);
  console.log(`  JSON:   ${OUT_JSON}\n`);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
