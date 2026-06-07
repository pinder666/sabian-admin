// historical/pattern_matcher_nightly.cjs
// Nightly pattern matching pass — runs after live_stream.cjs
// Tests current country profiles against 388 findings.
// Updates sample sizes and confidence levels.
// Reports what changed each morning.
//
// Cron: 0800 UTC (after live_stream at 0700 UTC)
// Usage: node historical/pattern_matcher_nightly.cjs

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { logAuditEvent } = require('./audit_chain.cjs');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const FINDINGS_TABLE = 'pattern_findings';
const MATCH_HISTORY_TABLE = 'pattern_match_history';
const DAILY_REPORT_TABLE = 'pattern_daily_reports';

// ── The 388 findings (structured for matching) ────────────────────────────────

const FINDINGS = [
  // Country pair findings
  { id: 1, category: 'Country Pairs', title: 'Armenia-Israel perfect correlation', matchFn: (c, bd, score) => c === 'Armenia' || c === 'Israel' },
  { id: 15, category: 'Repeat Crisis', title: 'Repeat crisis country', matchFn: (c) => ['Armenia', 'CAR', 'Ethiopia', 'Georgia', 'Guinea-Bissau', 'Israel', 'Mexico'].includes(c) },
  { id: 12, category: 'Transmission', title: 'Brazil transmission node', matchFn: (c) => c === 'Brazil' },

  // Signal-based findings
  { id: 6, category: 'Pre-Crisis', title: 'economic_stress year -1', matchFn: (c, bd) => (bd?.economic_stress?.stress_z || 0) > 0.5 },
  { id: 11, category: 'Capital Flows', title: 'capital_flows chronic crisis', matchFn: (c, bd) => (bd?.capital_flows?.stress_z || 0) > 1.0 },
  { id: 13, category: 'Signal Emergence', title: 'economic_stress early warning', matchFn: (c, bd) => (bd?.economic_stress?.stress_z || 0) > 0.3 },
  { id: 14, category: 'Signal Emergence', title: 'displacement late signal', matchFn: (c, bd) => (bd?.displacement?.stress_z || 0) > 0.5 },
  { id: 5, category: 'Pre-Silence', title: 'IMF fiscal precedes silence', matchFn: (c, bd) => (bd?.imf_fiscal?.stress_z || 0) > 0.5 },

  // Score-based findings
  { id: 3, category: 'Stability', title: 'Elevated band instability', matchFn: (c, bd, score) => score >= 75 && score < 85 },

  // Combination findings
  { id: 7, category: 'Collapse Speed', title: 'Seismic = slow, Economic = fast', matchFn: (c, bd) => (bd?.seismic_risk?.stress_z || 0) > 0.5 || (bd?.economic_stress?.stress_z || 0) > 0.5 },
  { id: 8, category: 'Protective', title: 'Protective combination', matchFn: (c, bd) =>
    (bd?.economic_stress?.stress_z || 0) > 0.3 &&
    (bd?.governance?.stress_z || 0) > 0.3 &&
    (bd?.trade_collapse?.stress_z || 0) > 0.3
  },

  // Cluster findings (require cluster lookup)
  { id: 9, category: 'Cluster', title: 'high-fire cluster risk', matchFn: (c, bd, score, cluster) => cluster?.cluster_label === 'high-fire' },
  { id: 10, category: 'Cluster', title: 'high-economic-stress stability', matchFn: (c, bd, score, cluster) => cluster?.cluster_label === 'high-economic-stress' },

  // Universal findings (apply to all)
  { id: 2, category: 'Recovery', title: 'Recovery asymmetry', matchFn: () => true },
  { id: 4, category: 'Going Dark', title: 'Governance goes dark first', matchFn: () => true },
];

// ── Load current scores and clusters ──────────────────────────────────────────

async function loadCurrentData() {
  // Get most recent year's data
  const { data: scores, error: scoresErr } = await sb
    .from('historical_convergence_scores')
    .select('country,year,score,breakdown')
    .order('year', { ascending: false })
    .limit(500);

  if (scoresErr) throw scoresErr;

  // Get most recent year per country
  const latestByCountry = {};
  for (const s of scores) {
    if (!latestByCountry[s.country] || s.year > latestByCountry[s.country].year) {
      latestByCountry[s.country] = s;
    }
  }

  // Get clusters
  const { data: clusters, error: clustersErr } = await sb
    .from('country_clusters')
    .select('*');

  if (clustersErr) throw clustersErr;

  const clusterMap = {};
  for (const c of (clusters || [])) {
    clusterMap[c.country] = c;
  }

  return { latestByCountry, clusterMap };
}

// ── Load previous day's matches ───────────────────────────────────────────────

async function loadPreviousMatches() {
  const { data, error } = await sb
    .from(MATCH_HISTORY_TABLE)
    .select('*')
    .order('run_date', { ascending: false })
    .limit(1);

  // PGRST116 = no rows, PGRST205 = table doesn't exist
  if (error && error.code !== 'PGRST116' && error.code !== 'PGRST205') throw error;
  if (error && error.code === 'PGRST205') return null; // Table doesn't exist yet
  return data?.[0] || null;
}

// ── Run pattern matching ──────────────────────────────────────────────────────

async function runPatternMatching() {
  console.log('[PATTERN_MATCHER] Starting nightly pattern matching pass...');
  const runDate = new Date().toISOString().slice(0, 10);

  const { latestByCountry, clusterMap } = await loadCurrentData();
  const countries = Object.keys(latestByCountry);
  console.log(`[PATTERN_MATCHER] Testing ${countries.length} countries against ${FINDINGS.length} findings`);

  // Match each country against each finding
  const matches = {};
  const findingSummary = {};

  for (const finding of FINDINGS) {
    findingSummary[finding.id] = {
      id: finding.id,
      category: finding.category,
      title: finding.title,
      matchCount: 0,
      matchedCountries: []
    };
  }

  for (const country of countries) {
    const data = latestByCountry[country];
    const score = data.score || 50;
    const breakdown = data.breakdown || {};
    const cluster = clusterMap[country] || null;

    matches[country] = [];

    for (const finding of FINDINGS) {
      try {
        if (finding.matchFn(country, breakdown, score, cluster)) {
          matches[country].push(finding.id);
          findingSummary[finding.id].matchCount++;
          findingSummary[finding.id].matchedCountries.push(country);
        }
      } catch (err) {
        // Match function failed — skip
      }
    }
  }

  // Load previous matches to calculate deltas
  const previous = await loadPreviousMatches();
  const previousMatches = previous?.country_matches || {};
  const previousSummary = previous?.finding_summary || {};

  // Calculate changes
  const changes = {
    newMatches: [],
    droppedMatches: [],
    findingDeltas: []
  };

  for (const country of countries) {
    const current = new Set(matches[country] || []);
    const prev = new Set(previousMatches[country] || []);

    for (const fid of current) {
      if (!prev.has(fid)) {
        const f = FINDINGS.find(x => x.id === fid);
        changes.newMatches.push({ country, findingId: fid, title: f?.title });
      }
    }

    for (const fid of prev) {
      if (!current.has(fid)) {
        const f = FINDINGS.find(x => x.id === fid);
        changes.droppedMatches.push({ country, findingId: fid, title: f?.title });
      }
    }
  }

  for (const finding of FINDINGS) {
    const currentCount = findingSummary[finding.id].matchCount;
    const prevCount = previousSummary[finding.id]?.matchCount || 0;
    const delta = currentCount - prevCount;

    if (delta !== 0) {
      changes.findingDeltas.push({
        findingId: finding.id,
        title: finding.title,
        previousCount: prevCount,
        currentCount,
        delta
      });
    }
  }

  // Store results
  const matchHistoryRecord = {
    run_date: runDate,
    country_count: countries.length,
    finding_count: FINDINGS.length,
    country_matches: matches,
    finding_summary: findingSummary,
    changes
  };

  // Generate daily report
  const report = generateDailyReport(runDate, changes, findingSummary, countries.length);

  // Try to save to Supabase, fall back to local storage if tables don't exist
  const { error: histErr } = await sb.from(MATCH_HISTORY_TABLE).upsert(matchHistoryRecord, { onConflict: 'run_date' });
  if (histErr && histErr.code === 'PGRST205') {
    console.log('[PATTERN_MATCHER] Tables not found in Supabase. Storing results locally only.');
    console.log('[PATTERN_MATCHER] Run SQL from historical/pattern_tables.sql to enable database persistence.');
  } else if (histErr) {
    console.log('[PATTERN_MATCHER] Supabase error:', histErr.message);
  }

  // Write live findings to pattern_findings table (queryable per-finding store)
  const findingRows = Object.values(findingSummary).map(f => ({
    id:                f.id,
    category:          f.category,
    title:             f.title,
    match_count:       f.matchCount,
    matched_countries: f.matchedCountries,
    last_run_date:     runDate,
    updated_at:        new Date().toISOString(),
  }));
  const { error: pfErr } = await sb.from(FINDINGS_TABLE).upsert(findingRows, { onConflict: 'id' });
  if (pfErr && pfErr.code !== 'PGRST205') {
    console.log('[PATTERN_MATCHER] pattern_findings write error:', pfErr.message);
  } else if (!pfErr) {
    console.log(`[PATTERN_MATCHER] pattern_findings: ${findingRows.length} findings written`);
  }

  const { error: rptErr } = await sb.from(DAILY_REPORT_TABLE).upsert({
    report_date: runDate,
    report_text: report,
    new_match_count: changes.newMatches.length,
    dropped_match_count: changes.droppedMatches.length,
    finding_delta_count: changes.findingDeltas.length
  }, { onConflict: 'report_date' });
  if (rptErr && rptErr.code !== 'PGRST205') {
    console.log('[PATTERN_MATCHER] Report save error:', rptErr.message);
  }

  // Write report to file
  const reportPath = path.join(__dirname, `../data/reports/pattern_report_${runDate}.txt`);
  const reportDir = path.dirname(reportPath);
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(reportPath, report);

  console.log('[PATTERN_MATCHER] Complete.');
  console.log(report);

  const topFindings = Object.values(findingSummary)
    .sort((a, b) => b.matchCount - a.matchCount)
    .slice(0, 5)
    .map(f => ({ id: f.id, title: f.title, n: f.matchCount }));

  await logAuditEvent('pattern_run', null, {
    run_date:         runDate,
    countries_scanned: countries.length,
    new_matches:      changes.newMatches.length,
    dropped_matches:  changes.droppedMatches.length,
    finding_deltas:   changes.findingDeltas.length,
    top_findings:     topFindings,
  }).catch(() => {});

  return { runDate, changes, findingSummary, reportPath };
}

// ── Generate daily report ─────────────────────────────────────────────────────

function generateDailyReport(runDate, changes, findingSummary, countryCount) {
  const lines = [];
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push(`SABIAN PATTERN MATCHING REPORT — ${runDate}`);
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');
  lines.push(`Countries scanned: ${countryCount}`);
  lines.push(`Findings tested: ${FINDINGS.length}`);
  lines.push('');

  if (changes.newMatches.length > 0) {
    lines.push('──────────────────────────────────────────────────────────────');
    lines.push(`NEW MATCHES (${changes.newMatches.length}):`);
    lines.push('──────────────────────────────────────────────────────────────');
    for (const m of changes.newMatches) {
      lines.push(`  + ${m.country}: ${m.title}`);
    }
    lines.push('');
  }

  if (changes.droppedMatches.length > 0) {
    lines.push('──────────────────────────────────────────────────────────────');
    lines.push(`DROPPED MATCHES (${changes.droppedMatches.length}):`);
    lines.push('──────────────────────────────────────────────────────────────');
    for (const m of changes.droppedMatches) {
      lines.push(`  - ${m.country}: ${m.title}`);
    }
    lines.push('');
  }

  if (changes.findingDeltas.length > 0) {
    lines.push('──────────────────────────────────────────────────────────────');
    lines.push(`FINDING SAMPLE SIZE CHANGES (${changes.findingDeltas.length}):`);
    lines.push('──────────────────────────────────────────────────────────────');
    for (const d of changes.findingDeltas) {
      const arrow = d.delta > 0 ? '↑' : '↓';
      lines.push(`  ${arrow} [${d.findingId}] ${d.title}: ${d.previousCount} → ${d.currentCount} (${d.delta > 0 ? '+' : ''}${d.delta})`);
    }
    lines.push('');
  }

  if (changes.newMatches.length === 0 && changes.droppedMatches.length === 0 && changes.findingDeltas.length === 0) {
    lines.push('No changes from previous day.');
    lines.push('');
  }

  // Top findings by sample size
  lines.push('──────────────────────────────────────────────────────────────');
  lines.push('TOP 5 FINDINGS BY SAMPLE SIZE:');
  lines.push('──────────────────────────────────────────────────────────────');
  const sortedFindings = Object.values(findingSummary)
    .filter(f => f.matchCount > 0)
    .sort((a, b) => b.matchCount - a.matchCount)
    .slice(0, 5);

  for (const f of sortedFindings) {
    lines.push(`  [${f.id}] ${f.title}: n=${f.matchCount}`);
  }

  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('END REPORT');
  lines.push('═══════════════════════════════════════════════════════════════');

  return lines.join('\n');
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  runPatternMatching,
  FINDINGS
};

// ── Run if called directly ────────────────────────────────────────────────────

if (require.main === module) {
  runPatternMatching()
    .then(r => {
      console.log(`[PATTERN_MATCHER] Report saved to: ${r.reportPath}`);
      process.exit(0);
    })
    .catch(err => {
      console.error('[PATTERN_MATCHER] FATAL:', err);
      process.exit(1);
    });
}
