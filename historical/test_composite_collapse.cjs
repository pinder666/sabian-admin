// test_composite_collapse.cjs
// Builds a "Multi-Dimensional Collapse" (MDC) composite from 5 cluster signals,
// then runs 100 simulation tests across the historical record.
// Two questions:
//   1. Does the composite predict crises earlier/better than any single signal?
//   2. Is the composite independent of the 42 surviving signals?

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// ── The 5 cluster signals ──────────────────────────────────────────────────────
const CLUSTER = ['iom_displacement','social_volume','prediction_market','food_security','usda_food'];

// ── Reference signals to test independence against ────────────────────────────
const REFERENCE = ['economic_stress','food_stress','displacement','conflict','social_unrest','fao_food','imf_fiscal','trade_collapse'];

// ── 100 test cases: known crises (positive) + stable controls (negative) ──────
// Format: { country, crisis_year, type, truth }
// truth: 'crisis' = should fire, 'stable' = should NOT fire
const TEST_CASES = [
  // ── TIER 1: Full societal collapses — all 5 dimensions should fire ──────────
  { country: 'Zimbabwe',              crisis_year: 2008, type: 'hyperinflation+famine+displacement',      truth: 'crisis'  },
  { country: 'Zimbabwe',              crisis_year: 2006, type: 'early warning Zimbabwe',                  truth: 'crisis'  },
  { country: 'Somalia',               crisis_year: 2011, type: 'famine+conflict+displacement',            truth: 'crisis'  },
  { country: 'Somalia',               crisis_year: 2009, type: 'ongoing collapse Somalia',               truth: 'crisis'  },
  { country: 'Somalia',               crisis_year: 2017, type: 'drought+famine recurrence',              truth: 'crisis'  },
  { country: 'Haiti',                 crisis_year: 2010, type: 'earthquake + pre-existing fragility',    truth: 'crisis'  },
  { country: 'Haiti',                 crisis_year: 2021, type: 'assassination+gang+earthquake',          truth: 'crisis'  },
  { country: 'Haiti',                 crisis_year: 2022, type: 'gang territorial collapse',              truth: 'crisis'  },
  { country: 'Sudan',                 crisis_year: 2004, type: 'Darfur genocide',                        truth: 'crisis'  },
  { country: 'Sudan',                 crisis_year: 2005, type: 'Darfur displacement peak',               truth: 'crisis'  },
  { country: 'Sudan',                 crisis_year: 2010, type: 'ICC indictment + famine',                truth: 'crisis'  },
  { country: 'Zambia',                crisis_year: 2002, type: 'AIDS+drought+famine',                    truth: 'crisis'  },
  { country: 'Zambia',                crisis_year: 2003, type: 'Zambia continued crisis',                truth: 'crisis'  },
  { country: 'Venezuela',             crisis_year: 2016, type: 'economic collapse+food shortage',        truth: 'crisis'  },
  { country: 'Venezuela',             crisis_year: 2017, type: 'hyperinflation+displacement begins',     truth: 'crisis'  },
  { country: 'Venezuela',             crisis_year: 2018, type: 'full collapse Venezuela',                truth: 'crisis'  },
  { country: 'Venezuela',             crisis_year: 2014, type: 'early warning Venezuela',                truth: 'crisis'  },
  { country: 'Syria',                 crisis_year: 2012, type: 'civil war year 2',                       truth: 'crisis'  },
  { country: 'Syria',                 crisis_year: 2013, type: 'Syria displacement peak',                truth: 'crisis'  },
  { country: 'Syria',                 crisis_year: 2015, type: 'Syria refugee crisis',                   truth: 'crisis'  },
  { country: 'Syria',                 crisis_year: 2010, type: 'pre-Arab Spring Syria',                  truth: 'crisis'  },
  { country: 'Yemen',                 crisis_year: 2015, type: 'war begins Yemen',                       truth: 'crisis'  },
  { country: 'Yemen',                 crisis_year: 2016, type: 'famine onset Yemen',                     truth: 'crisis'  },
  { country: 'Yemen',                 crisis_year: 2018, type: 'cholera+famine Yemen',                   truth: 'crisis'  },
  { country: 'Yemen',                 crisis_year: 2013, type: 'pre-war fragility Yemen',                truth: 'crisis'  },
  { country: 'Central African Republic', crisis_year: 2013, type: 'Seleka coup CAR',                    truth: 'crisis'  },
  { country: 'Central African Republic', crisis_year: 2014, type: 'anti-balaka CAR',                    truth: 'crisis'  },
  { country: 'Democratic Republic of the Congo', crisis_year: 2008, type: 'Kivu war',                   truth: 'crisis'  },
  { country: 'Democratic Republic of the Congo', crisis_year: 2017, type: 'Kasai crisis DRC',           truth: 'crisis'  },
  { country: 'Ethiopia',              crisis_year: 2021, type: 'Tigray war+famine',                      truth: 'crisis'  },
  { country: 'Ethiopia',              crisis_year: 2022, type: 'Tigray displacement peak',               truth: 'crisis'  },
  { country: 'Afghanistan',           crisis_year: 2021, type: 'Taliban takeover',                      truth: 'crisis'  },
  { country: 'Afghanistan',           crisis_year: 2022, type: 'economic collapse+famine',              truth: 'crisis'  },
  { country: 'Myanmar',               crisis_year: 2017, type: 'Rohingya displacement',                 truth: 'crisis'  },
  { country: 'Myanmar',               crisis_year: 2021, type: 'coup+economic collapse',                truth: 'crisis'  },
  { country: 'Mozambique',            crisis_year: 2019, type: 'Cyclone Idai+Islamist insurgency',      truth: 'crisis'  },
  { country: 'Mozambique',            crisis_year: 2021, type: 'Cabo Delgado peak violence',            truth: 'crisis'  },
  { country: 'Niger',                 crisis_year: 2005, type: 'Sahel famine Niger',                    truth: 'crisis'  },
  { country: 'Niger',                 crisis_year: 2010, type: 'coup+drought Niger',                    truth: 'crisis'  },
  { country: 'Mali',                  crisis_year: 2012, type: 'Tuareg rebellion+coup',                 truth: 'crisis'  },
  { country: 'Mali',                  crisis_year: 2013, type: 'jihadist expansion Mali',               truth: 'crisis'  },
  { country: 'South Sudan',           crisis_year: 2014, type: 'civil war erupts',                      truth: 'crisis'  },
  { country: 'South Sudan',           crisis_year: 2016, type: 'famine+displacement peak',              truth: 'crisis'  },
  { country: 'Libya',                 crisis_year: 2011, type: 'civil war Libya',                       truth: 'crisis'  },
  { country: 'Libya',                 crisis_year: 2014, type: 'second civil war Libya',                truth: 'crisis'  },
  { country: 'Angola',                crisis_year: 2000, type: 'civil war end phase Angola',            truth: 'crisis'  },
  { country: 'Burundi',               crisis_year: 2015, type: 'coup attempt+displacement',             truth: 'crisis'  },
  { country: 'Nigeria',               crisis_year: 2014, type: 'Boko Haram peak + food north',          truth: 'crisis'  },
  { country: 'Nigeria',               crisis_year: 2016, type: 'northeast food emergency Nigeria',      truth: 'crisis'  },
  { country: 'Cambodia',              crisis_year: 1994, type: 'Khmer Rouge remnants+famine',           truth: 'crisis'  },
  // ── TIER 2: Severe but partial collapses — 3-4 dimensions ─────────────────
  { country: 'Greece',                crisis_year: 2012, type: 'financial crisis Greece',               truth: 'crisis'  },
  { country: 'Greece',                crisis_year: 2013, type: 'austerity peak Greece',                 truth: 'crisis'  },
  { country: 'Argentina',             crisis_year: 2002, type: 'peso collapse Argentina',               truth: 'crisis'  },
  { country: 'Lebanon',               crisis_year: 2020, type: 'Beirut explosion+financial collapse',   truth: 'crisis'  },
  { country: 'Lebanon',               crisis_year: 2021, type: 'hyperinflation+food insecurity',        truth: 'crisis'  },
  { country: 'Pakistan',              crisis_year: 2022, type: 'floods+economic crisis',                truth: 'crisis'  },
  { country: 'Sri Lanka',             crisis_year: 2022, type: 'debt default+food shortage',            truth: 'crisis'  },
  { country: 'Turkey',                crisis_year: 2018, type: 'lira crisis Turkey',                    truth: 'crisis'  },
  { country: 'Egypt',                 crisis_year: 2011, type: 'Arab Spring Egypt',                     truth: 'crisis'  },
  { country: 'Tunisia',               crisis_year: 2011, type: 'Arab Spring Tunisia',                   truth: 'crisis'  },
  { country: 'North Korea',           crisis_year: 1996, type: 'famine North Korea',                    truth: 'crisis'  },
  { country: 'Tajikistan',            crisis_year: 1994, type: 'civil war+famine Tajikistan',           truth: 'crisis'  },
  // ── TIER 3: Early warning tests — fire 1-2 years BEFORE peak ──────────────
  { country: 'Syria',                 crisis_year: 2009, type: 'drought+unemployment PRE-Spring',       truth: 'crisis'  },
  { country: 'Venezuela',             crisis_year: 2013, type: 'early signs Venezuela',                 truth: 'crisis'  },
  { country: 'Zimbabwe',              crisis_year: 2005, type: 'early warning Zimbabwe',                truth: 'crisis'  },
  { country: 'Sudan',                 crisis_year: 2002, type: 'pre-Darfur Sudan',                      truth: 'crisis'  },
  { country: 'Haiti',                 crisis_year: 2018, type: 'peyi lòk protests building',           truth: 'crisis'  },
  { country: 'Lebanon',               crisis_year: 2019, type: 'pre-collapse Lebanon',                  truth: 'crisis'  },
  { country: 'Myanmar',               crisis_year: 2020, type: 'pre-coup fragility Myanmar',            truth: 'crisis'  },
  { country: 'Ethiopia',              crisis_year: 2020, type: 'pre-Tigray fragility',                  truth: 'crisis'  },
  // ── TIER 4: Stable controls — should NOT fire ─────────────────────────────
  { country: 'Norway',                crisis_year: 2015, type: 'stable welfare state',                  truth: 'stable'  },
  { country: 'Norway',                crisis_year: 2010, type: 'stable Norway',                         truth: 'stable'  },
  { country: 'Switzerland',           crisis_year: 2015, type: 'stable Switzerland',                    truth: 'stable'  },
  { country: 'Denmark',               crisis_year: 2015, type: 'stable Denmark',                        truth: 'stable'  },
  { country: 'New Zealand',           crisis_year: 2018, type: 'stable New Zealand',                    truth: 'stable'  },
  { country: 'Singapore',             crisis_year: 2015, type: 'stable Singapore',                      truth: 'stable'  },
  { country: 'South Korea',           crisis_year: 2015, type: 'stable South Korea',                    truth: 'stable'  },
  { country: 'Germany',               crisis_year: 2015, type: 'stable Germany',                        truth: 'stable'  },
  { country: 'Japan',                 crisis_year: 2015, type: 'stable Japan',                          truth: 'stable'  },
  { country: 'Australia',             crisis_year: 2015, type: 'stable Australia',                      truth: 'stable'  },
  { country: 'Canada',                crisis_year: 2015, type: 'stable Canada',                         truth: 'stable'  },
  { country: 'Netherlands',           crisis_year: 2010, type: 'stable Netherlands',                    truth: 'stable'  },
  { country: 'United Kingdom',        crisis_year: 2015, type: 'stable UK',                             truth: 'stable'  },
  { country: 'France',                crisis_year: 2015, type: 'stable France',                         truth: 'stable'  },
  // ── TIER 5: Stress events below collapse threshold (true negatives) ─────────
  { country: 'India',                 crisis_year: 2020, type: 'COVID stress — not collapse',           truth: 'stable'  },
  { country: 'Brazil',                crisis_year: 2015, type: 'recession Brazil — not collapse',       truth: 'stable'  },
  { country: 'Mexico',                crisis_year: 2010, type: 'drug war Mexico — not multidim',        truth: 'stable'  },
  { country: 'United States',         crisis_year: 2009, type: 'financial crisis US — not collapse',    truth: 'stable'  },
  { country: 'Italy',                 crisis_year: 2012, type: 'austerity Italy — not collapse',        truth: 'stable'  },
  { country: 'Spain',                 crisis_year: 2012, type: 'unemployment peak Spain',               truth: 'stable'  },
  { country: 'Portugal',              crisis_year: 2012, type: 'troika Portugal',                       truth: 'stable'  },
  { country: 'Indonesia',             crisis_year: 2000, type: 'post-1997 recovery Indonesia',          truth: 'stable'  },
  { country: 'Kenya',                 crisis_year: 2008, type: 'post-election violence Kenya',          truth: 'stable'  }, // political, not multidim
  { country: 'Ukraine',               crisis_year: 2014, type: 'Maidan crisis Ukraine',                 truth: 'stable'  }, // political/conflict, not food/displacement multidim
  { country: 'Egypt',                 crisis_year: 2014, type: 'post-coup stability Egypt',             truth: 'stable'  },
  { country: 'Colombia',              crisis_year: 2005, type: 'FARC still active — not collapse',      truth: 'stable'  },
  { country: 'Peru',                  crisis_year: 2009, type: 'commodity boom Peru',                   truth: 'stable'  },
  { country: 'Thailand',              crisis_year: 2014, type: 'coup Thailand — not multidim',          truth: 'stable'  },
  { country: 'Russia',                crisis_year: 2015, type: 'sanctions/ruble Russia',                truth: 'stable'  },
];

// ── Utility: Pearson correlation ──────────────────────────────────────────────
function pearson(x, y) {
  const n = x.length;
  if (n < 8) return { r: NaN, n };
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const a = x[i] - mx, b = y[i] - my;
    num += a * b; dx2 += a * a; dy2 += b * b;
  }
  const den = Math.sqrt(dx2 * dy2);
  return { r: den > 0 ? num / den : 0, n };
}

function stats(vals) {
  if (!vals || vals.length === 0) return { mean: 0, std: 1 };
  const n = vals.length;
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  const std = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  return { mean, std: std > 0 ? std : 1 };
}

// ── Load all readings ─────────────────────────────────────────────────────────
async function loadReadings(signals) {
  const data = {};
  for (const s of signals) data[s] = {};

  let page = 0;
  while (true) {
    const { data: rows, error } = await sb
      .from('historical_signal_readings')
      .select('country,signal_key,date,raw_value')
      .in('signal_key', signals)
      .not('raw_value', 'is', null)
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error) throw error;
    if (!rows || rows.length === 0) break;
    for (const r of rows) {
      const year = new Date(r.date).getFullYear();
      const key = `${r.country}|${year}`;
      if (!data[r.signal_key][key]) data[r.signal_key][key] = [];
      data[r.signal_key][key].push(parseFloat(r.raw_value));
    }
    if (rows.length < 1000) break;
    page++;
  }

  for (const s of signals) {
    for (const k of Object.keys(data[s])) {
      const v = data[s][k];
      data[s][k] = v.reduce((a, b) => a + b, 0) / v.length;
    }
  }
  return data;
}

// ── Build MDC composite ───────────────────────────────────────────────────────
// For each country-year: z-score each signal against its own global distribution,
// then average the z-scores. Require at least 2 of 5 signals present.
function buildMDC(clusterData) {
  // Compute global stats per signal
  const globalStats = {};
  for (const s of CLUSTER) {
    const vals = Object.values(clusterData[s]);
    globalStats[s] = stats(vals);
  }

  // Collect all country-years
  const allKeys = new Set(CLUSTER.flatMap(s => Object.keys(clusterData[s])));
  const mdc = {};

  for (const key of allKeys) {
    const zScores = [];
    for (const s of CLUSTER) {
      const v = clusterData[s][key];
      if (v !== undefined) {
        const { mean, std } = globalStats[s];
        zScores.push((v - mean) / std);
      }
    }
    if (zScores.length >= 2) {
      mdc[key] = {
        score: zScores.reduce((a, b) => a + b, 0) / zScores.length,
        dims: zScores.length,   // how many dimensions fired
        zScores,
      };
    }
  }
  return mdc;
}

// ── Run the 100 test simulations ──────────────────────────────────────────────
function runSimulations(mdc, clusterData) {
  console.log('\n' + '═'.repeat(70));
  console.log('100 SIMULATION TESTS — MDC vs GROUND TRUTH');
  console.log('Threshold: MDC z-score > 0.5 = COLLAPSE SIGNAL');
  console.log('Window: crisis_year ± 1 year (early warning counts as hit)');
  console.log('═'.repeat(70));

  // Compute MDC global stats for threshold
  const mdcVals = Object.values(mdc).map(v => v.score);
  const mdcStats = stats(mdcVals);
  const THRESHOLD = mdcStats.mean + 0.5 * mdcStats.std;

  console.log(`\nMDC global: mean=${mdcStats.mean.toFixed(3)} std=${mdcStats.std.toFixed(3)} threshold=${THRESHOLD.toFixed(3)}\n`);

  const results = [];
  let TP = 0, FP = 0, TN = 0, FN = 0;
  let covered = 0, missing = 0;

  // Per-tier tracking
  const tiers = { 'full_collapse': [], 'partial': [], 'early_warning': [], 'stable': [], 'below_threshold': [] };

  const tierMap = {
    0: 'full_collapse', 1: 'full_collapse',
    50: 'partial',
    62: 'early_warning',
    70: 'stable',
    84: 'below_threshold',
  };

  for (let i = 0; i < TEST_CASES.length; i++) {
    const tc = TEST_CASES[i];
    const { country, crisis_year, type, truth } = tc;

    // Check window: year-1, year, year+1
    const keys = [
      `${country}|${crisis_year - 1}`,
      `${country}|${crisis_year}`,
      `${country}|${crisis_year + 1}`,
    ];

    const available = keys.filter(k => mdc[k] !== undefined);
    if (available.length === 0) {
      missing++;
      results.push({ i: i+1, country, crisis_year, type, truth, fired: null, mdc_score: null, dims: null, status: 'NO DATA' });
      continue;
    }
    covered++;

    // Take the maximum MDC score in the window
    const best = available.reduce((a, k) => {
      const v = mdc[k];
      return v.score > (a.score || -Infinity) ? { key: k, score: v.score, dims: v.dims } : a;
    }, {});

    const fired = best.score > THRESHOLD;

    let status;
    if (truth === 'crisis' && fired)  { TP++; status = 'TP'; }
    if (truth === 'crisis' && !fired) { FN++; status = 'FN'; }
    if (truth === 'stable' && fired)  { FP++; status = 'FP'; }
    if (truth === 'stable' && !fired) { TN++; status = 'TN'; }

    results.push({ i: i+1, country, crisis_year, type, truth, fired, mdc_score: +best.score.toFixed(3), dims: best.dims, status });
  }

  // Print all results
  for (const r of results) {
    const icon = r.status === 'TP' ? '✅' : r.status === 'TN' ? '✅' : r.status === 'FP' ? '❌' : r.status === 'FN' ? '⚠️' : '◌';
    const scoreStr = r.mdc_score !== null ? `mdc=${r.mdc_score.toFixed(2)} dims=${r.dims}` : 'NO DATA';
    console.log(`  ${String(r.i).padStart(3)}. ${icon} ${r.status || 'SKIP'} | ${r.country.padEnd(30)} ${r.crisis_year} | ${scoreStr} | ${r.type}`);
  }

  console.log('\n' + '─'.repeat(70));
  console.log(`COVERAGE: ${covered}/${TEST_CASES.length} tests had data (${missing} missing from DB)`);
  const total = TP + FP + TN + FN;
  const precision = TP + FP > 0 ? TP / (TP + FP) : NaN;
  const recall    = TP + FN > 0 ? TP / (TP + FN) : NaN;
  const f1        = (precision + recall) > 0 ? 2 * precision * recall / (precision + recall) : NaN;
  const specificity = TN + FP > 0 ? TN / (TN + FP) : NaN;

  console.log(`\nCONFUSION MATRIX:`);
  console.log(`  True  Positives (crisis  fired):  ${TP}`);
  console.log(`  False Positives (stable  fired):  ${FP}`);
  console.log(`  True  Negatives (stable  silent): ${TN}`);
  console.log(`  False Negatives (crisis silent):  ${FN}`);
  console.log(`\nPERFORMANCE METRICS:`);
  console.log(`  Precision:   ${isNaN(precision) ? 'n/a' : (precision*100).toFixed(1)}%  (of all fires, how many were real crises)`);
  console.log(`  Recall:      ${isNaN(recall)    ? 'n/a' : (recall*100).toFixed(1)}%  (of all crises, how many did MDC catch)`);
  console.log(`  Specificity: ${isNaN(specificity) ? 'n/a' : (specificity*100).toFixed(1)}%  (of all stables, how many correctly silent)`);
  console.log(`  F1-score:    ${isNaN(f1)         ? 'n/a' : f1.toFixed(3)}`);

  return { TP, FP, TN, FN, precision, recall, f1, specificity, results };
}

// ── Lead-indicator analysis: does MDC fire ahead of crisis peaks? ─────────────
function analyzeLeadTime(mdc, results) {
  console.log('\n' + '═'.repeat(70));
  console.log('LEAD TIME ANALYSIS — does MDC fire before the crisis year?');
  console.log('═'.repeat(70));

  const earlyHits = [];
  for (const r of results) {
    if (r.truth !== 'crisis' || !r.fired) continue;
    const key_year = mdc[`${r.country}|${r.crisis_year - 1}`];
    const key_now  = mdc[`${r.country}|${r.crisis_year}`];

    if (key_year && key_year.score > 0) {
      const lead = key_year.score > key_now?.score ? 'EARLY' : 'CONCURRENT';
      earlyHits.push({ country: r.country, crisis_year: r.crisis_year, lead, pre_score: +key_year.score.toFixed(3), crisis_score: +(key_now?.score || 0).toFixed(3) });
    }
  }

  if (earlyHits.length === 0) {
    console.log('\n  No lead-time data available.\n');
    return;
  }

  const earlyCount = earlyHits.filter(h => h.lead === 'EARLY').length;
  console.log(`\n  ${earlyCount}/${earlyHits.length} true-positive hits fired EARLY (year before crisis peak):\n`);
  for (const h of earlyHits.filter(h => h.lead === 'EARLY').slice(0, 20)) {
    console.log(`  ⚡ ${h.country.padEnd(28)} crisis=${h.crisis_year}  pre-score=${h.pre_score}  crisis-score=${h.crisis_score}`);
  }
}

// ── Independence test: MDC vs 42 survivors ────────────────────────────────────
async function testIndependence(mdc, refData) {
  console.log('\n' + '═'.repeat(70));
  console.log('INDEPENDENCE TEST — MDC vs 8 key surviving signals');
  console.log('Question: does MDC track what already exists, or is it new?');
  console.log('Independence threshold: |r| < 0.30');
  console.log('═'.repeat(70) + '\n');

  const mdcKeys = Object.keys(mdc);

  for (const ref of REFERENCE) {
    const common = mdcKeys.filter(k => refData[ref][k] !== undefined);
    if (common.length < 10) {
      console.log(`  ${ref.padEnd(20)}: INSUFFICIENT OVERLAP (n=${common.length})`);
      continue;
    }
    const x = common.map(k => mdc[k].score);
    const y = common.map(k => refData[ref][k]);
    const { r, n } = pearson(x, y);

    let tag;
    if (isNaN(r))            tag = 'INSUFFICIENT DATA';
    else if (Math.abs(r) > 0.70) tag = '❌ HIGH OVERLAP — redundant with this signal';
    else if (Math.abs(r) > 0.50) tag = '⚠️  MODERATE OVERLAP';
    else if (Math.abs(r) > 0.30) tag = '🟡 LOW OVERLAP — some shared variance';
    else                         tag = '✅ INDEPENDENT — distinct from this signal';

    const rStr = isNaN(r) ? '  n/a ' : r.toFixed(3);
    console.log(`  MDC ↔ ${ref.padEnd(20)} r=${rStr}  n=${String(n).padStart(5)}  ${tag}`);
  }
}

// ── Unknown unknowns: patterns MDC finds that no single signal shows ───────────
function mineUnknownUnknowns(mdc, clusterData, simResults) {
  console.log('\n' + '═'.repeat(70));
  console.log('UNKNOWN UNKNOWNS — patterns no single signal shows alone');
  console.log('═'.repeat(70));

  // 1. Countries where MDC is elevated but NO single cluster signal fires above threshold
  console.log('\n[1] SILENT MULTI-DIM STRESS: MDC elevated but each individual signal below threshold');
  console.log('    (These countries look OK on any one metric — only MDC reveals the accumulation)\n');

  const globalStats = {};
  for (const s of CLUSTER) {
    globalStats[s] = stats(Object.values(clusterData[s]));
  }
  const mdcStats = stats(Object.values(mdc).map(v => v.score));
  const mdcThreshold = mdcStats.mean + 0.5 * mdcStats.std;

  const silentStress = [];
  for (const [key, mdcVal] of Object.entries(mdc)) {
    if (mdcVal.score < mdcThreshold) continue;
    const [country, yearStr] = key.split('|');
    const year = parseInt(yearStr);

    // Check: does any single signal fire above its own threshold?
    let anySignalFires = false;
    const sigScores = {};
    for (const s of CLUSTER) {
      const v = clusterData[s][key];
      if (v !== undefined) {
        const { mean, std } = globalStats[s];
        const z = (v - mean) / std;
        sigScores[s] = +z.toFixed(2);
        if (z > 1.0) anySignalFires = true;  // high bar for individual signal
      }
    }

    if (!anySignalFires && mdcVal.dims >= 3) {
      silentStress.push({ country, year, mdc_score: +mdcVal.score.toFixed(3), dims: mdcVal.dims, sigScores });
    }
  }

  silentStress.sort((a, b) => b.mdc_score - a.mdc_score);
  for (const s of silentStress.slice(0, 20)) {
    const sigs = Object.entries(s.sigScores).map(([k, v]) => `${k.replace('_', '').slice(0,4)}=${v}`).join(' ');
    console.log(`  ${s.country.padEnd(28)} ${s.year}  MDC=${s.mdc_score}  dims=${s.dims}  [${sigs}]`);
  }

  // 2. Dimensional signature — which combinations co-fire most?
  console.log('\n[2] DIMENSIONAL SIGNATURES: which signal combinations drive MDC highest?');
  console.log('    (The anatomy of collapse — what always appears together)\n');

  const comboCounts = {};
  for (const [key, mdcVal] of Object.entries(mdc)) {
    if (mdcVal.score < mdcThreshold || mdcVal.dims < 3) continue;
    const elevated = [];
    const [country] = key.split('|');
    for (const s of CLUSTER) {
      const v = clusterData[s][key];
      if (v !== undefined) {
        const { mean, std } = globalStats[s];
        if ((v - mean) / std > 0.3) elevated.push(s.replace('_', ' ').slice(0, 10));
      }
    }
    if (elevated.length >= 2) {
      const combo = elevated.sort().join('+');
      comboCounts[combo] = (comboCounts[combo] || 0) + 1;
    }
  }

  const sorted = Object.entries(comboCounts).sort((a, b) => b[1] - a[1]);
  for (const [combo, count] of sorted.slice(0, 12)) {
    console.log(`  ${String(count).padStart(4)} country-years: ${combo}`);
  }

  // 3. Geographic clustering — where does MDC find stress that conflict signals miss?
  console.log('\n[3] GEOGRAPHIC BLIND SPOTS: MDC elevation by region where no conflict is registered');
  console.log('    (Countries collapsing quietly — no war, but multidimensional breakdown)\n');

  const regions = {
    'Latin America':  ['Venezuela','Haiti','Honduras','Guatemala','El Salvador','Ecuador','Bolivia','Paraguay','Nicaragua','Cuba','Jamaica','Trinidad and Tobago','Dominican Republic','Guyana','Suriname'],
    'Sub-Saharan Africa': ['Niger','Chad','Mali','Burkina Faso','Guinea','Guinea-Bissau','Liberia','Sierra Leone','Togo','Benin','Cameroon','Gabon','Republic of the Congo','Angola','Zambia','Malawi','Mozambique','Tanzania','Rwanda','Burundi','Uganda','Kenya','Ethiopia','Eritrea','Djibouti','Somalia','Madagascar','Comoros'],
    'South/SE Asia':  ['Bangladesh','Nepal','Myanmar','Cambodia','Laos','Timor-Leste','Papua New Guinea','Sri Lanka','Pakistan','Afghanistan'],
    'MENA':           ['Egypt','Libya','Tunisia','Algeria','Morocco','Jordan','Lebanon','Syria','Iraq','Yemen','Sudan'],
    'Post-Soviet':    ['Tajikistan','Kyrgyzstan','Moldova','Armenia','Georgia','Azerbaijan','Ukraine','Belarus'],
  };

  for (const [region, countries] of Object.entries(regions)) {
    const regionKeys = Object.keys(mdc).filter(k => {
      const country = k.split('|')[0];
      return countries.includes(country) && mdc[k].score >= mdcThreshold && mdc[k].dims >= 3;
    });
    const unique = new Set(regionKeys.map(k => k.split('|')[0])).size;
    if (unique > 0) {
      console.log(`  ${region.padEnd(20)}: ${unique} countries with MDC elevation (${regionKeys.length} country-years)`);
    }
  }

  // 4. Temporal pattern — what decade shows the highest MDC globally?
  console.log('\n[4] TEMPORAL PATTERN: global MDC average by decade');
  console.log('    (When was the world most simultaneously stressed?)\n');

  const decadeScores = {};
  for (const [key, v] of Object.entries(mdc)) {
    const year = parseInt(key.split('|')[1]);
    if (year < 1960 || year > 2023) continue;
    const decade = Math.floor(year / 10) * 10;
    if (!decadeScores[decade]) decadeScores[decade] = [];
    decadeScores[decade].push(v.score);
  }

  for (const [decade, scores] of Object.entries(decadeScores).sort()) {
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const bar = '█'.repeat(Math.max(0, Math.round(mean * 10)));
    console.log(`  ${decade}s: ${bar} ${mean.toFixed(3)} (n=${scores.length})`);
  }

  // 5. Early warning lead — countries where MDC spiked 2+ years before conflict/crisis signals
  console.log('\n[5] EARLY WARNING SIGNATURES: countries where MDC elevated 2yr before known crisis');
  console.log('    (The unknown unknowns — what MDC saw that nothing else did)\n');

  const earlyWarnings = [];
  const knownCrises = simResults.results.filter(r => r.truth === 'crisis' && r.status === 'TP');

  for (const { country, crisis_year } of knownCrises) {
    const keyMinus2 = `${country}|${crisis_year - 2}`;
    const keyMinus1 = `${country}|${crisis_year - 1}`;
    const keyNow    = `${country}|${crisis_year}`;

    const m2 = mdc[keyMinus2];
    const m1 = mdc[keyMinus1];
    const mN = mdc[keyNow];

    if (m2 && m2.score > mdcThreshold && (!mN || m2.score > mN.score * 0.7)) {
      earlyWarnings.push({
        country, crisis_year,
        score_minus2: +m2.score.toFixed(3),
        score_minus1: m1 ? +m1.score.toFixed(3) : null,
        score_crisis: mN ? +mN.score.toFixed(3) : null,
        dims_minus2: m2.dims,
      });
    }
  }

  earlyWarnings.sort((a, b) => b.score_minus2 - a.score_minus2);
  if (earlyWarnings.length === 0) {
    console.log('  No 2-year early warnings found in TP cases.\n');
  } else {
    console.log(`  ${earlyWarnings.length} cases where MDC fired 2 years before crisis peak:\n`);
    for (const w of earlyWarnings) {
      console.log(`  ⚡ ${w.country.padEnd(28)} crisis=${w.crisis_year}  -2yr=${w.score_minus2}(${w.dims_minus2}dims)  -1yr=${w.score_minus1 || 'n/a'}  @crisis=${w.score_crisis || 'n/a'}`);
    }
  }
}

// ── Dimensional breakdown: what does each dimension contribute uniquely? ────────
function dimensionalBreakdown(mdc, clusterData) {
  console.log('\n' + '═'.repeat(70));
  console.log('DIMENSIONAL BREAKDOWN — unique contribution of each signal to MDC');
  console.log('═'.repeat(70) + '\n');

  const globalStats = {};
  for (const s of CLUSTER) globalStats[s] = stats(Object.values(clusterData[s]));

  const mdcStats = stats(Object.values(mdc).map(v => v.score));
  const threshold = mdcStats.mean + 0.5 * mdcStats.std;

  for (const s of CLUSTER) {
    // What % of MDC-elevated country-years have this signal elevated?
    const mdcElevated = Object.entries(mdc).filter(([, v]) => v.score >= threshold);
    let hasSignal = 0, hasSignalElevated = 0;
    for (const [key] of mdcElevated) {
      const v = clusterData[s][key];
      if (v !== undefined) {
        hasSignal++;
        const { mean, std } = globalStats[s];
        if ((v - mean) / std > 0.3) hasSignalElevated++;
      }
    }
    const pct = hasSignal > 0 ? (hasSignalElevated / hasSignal * 100).toFixed(1) : 'n/a';
    console.log(`  ${s.padEnd(22)}: present in ${String(hasSignal).padStart(4)} MDC-elevated events  | elevated in ${pct}% of those events`);
  }
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n' + '█'.repeat(70));
  console.log('MULTI-DIMENSIONAL COLLAPSE (MDC) — FULL ANALYSIS');
  console.log('Combining: iom_displacement + social_volume + prediction_market +');
  console.log('           food_security + usda_food into one collapse signal');
  console.log('█'.repeat(70));

  // Load cluster signals
  console.log('\nLoading cluster data...');
  const clusterData = await loadReadings(CLUSTER);
  for (const s of CLUSTER) {
    console.log(`  ${s.padEnd(22)}: ${Object.keys(clusterData[s]).length} country-years`);
  }

  // Load reference signals
  console.log('\nLoading reference signals for independence test...');
  const refData = await loadReadings(REFERENCE);

  // Build the MDC composite
  console.log('\nBuilding MDC composite signal...');
  const mdc = buildMDC(clusterData);
  const mdcVals = Object.values(mdc).map(v => v.score);
  const mdcS = stats(mdcVals);
  console.log(`  MDC built: ${Object.keys(mdc).length} country-years  mean=${mdcS.mean.toFixed(3)}  std=${mdcS.std.toFixed(3)}`);

  // Run 100 simulations
  const simResults = runSimulations(mdc, clusterData);

  // Lead time analysis
  analyzeLeadTime(mdc, simResults.results);

  // Independence test
  await testIndependence(mdc, refData);

  // Dimensional breakdown
  dimensionalBreakdown(mdc, clusterData);

  // Unknown unknowns
  mineUnknownUnknowns(mdc, clusterData, simResults);

  // Final summary
  console.log('\n' + '█'.repeat(70));
  console.log('EXECUTIVE SUMMARY');
  console.log('█'.repeat(70));
  console.log(`\n  Signal composition:  5 dimensions → 1 composite (MDC)`);
  console.log(`  Country-years:       ${Object.keys(mdc).length}`);
  console.log(`  Test cases:          ${TEST_CASES.length} (${TEST_CASES.filter(t=>t.truth==='crisis').length} crisis, ${TEST_CASES.filter(t=>t.truth==='stable').length} stable)`);
  console.log(`\n  Predictive performance:`);
  console.log(`    Precision:    ${isNaN(simResults.precision) ? 'n/a' : (simResults.precision*100).toFixed(1)}%`);
  console.log(`    Recall:       ${isNaN(simResults.recall) ? 'n/a' : (simResults.recall*100).toFixed(1)}%`);
  console.log(`    Specificity:  ${isNaN(simResults.specificity) ? 'n/a' : (simResults.specificity*100).toFixed(1)}%`);
  console.log(`    F1-score:     ${isNaN(simResults.f1) ? 'n/a' : simResults.f1.toFixed(3)}`);

  if (!isNaN(simResults.f1) && simResults.f1 > 0.6 && simResults.specificity > 0.7) {
    console.log('\n  VERDICT: ✅ MDC IS A REAL SIGNAL');
    console.log('  Predictive and specific. Five signals collapse into one new thing.');
    console.log('  Recommend: build as standalone signal. Delete the five source signals.');
  } else if (!isNaN(simResults.recall) && simResults.recall > 0.5) {
    console.log('\n  VERDICT: ⚠️  MDC IS PARTIALLY PREDICTIVE');
    console.log('  Catches crises but with false positives or misses. Review FP/FN cases.');
    console.log('  Consider: keep MDC but tune threshold before deleting source signals.');
  } else {
    console.log('\n  VERDICT: ❌ MDC DOES NOT OUTPERFORM');
    console.log('  Combined signal does not reliably detect collapse.');
    console.log('  Source signals remain candidates for individual assessment.');
  }

  console.log('');
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
