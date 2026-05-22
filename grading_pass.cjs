// grading_pass.cjs
// Scores open observations as their windows elapse.
// Run daily after global_scan.cjs — uses the latest convergence scores already in Supabase.
//
// Grade definitions:
//   HIT     — situation moved in the predicted direction and held through the window
//   MISS    — situation reversed before the window closed
//   PARTIAL — partial movement in the predicted direction, did not reach the predicted band
//
// Usage:
//   node grading_pass.cjs               -- grade all due observations using latest DB scores
//   node grading_pass.cjs --dry-run     -- show what would be graded without writing

require('dotenv').config({ path: './.env' });
const { getObservationsDueForGrading, gradeObservation, getLedgerStats } = require('./observation_ledger.cjs');
const { getLatestScores } = require('./sabian_persistence.cjs');
const { logToHive } = require('./logger.cjs');

const BAND_RANK = { STABLE: 0, ELEVATED: 1, WARNING: 2, CRITICAL: 3 };

function scoreToLevel(score) {
  if (score >= 81) return 'CRITICAL';
  if (score >= 66) return 'WARNING';
  if (score >= 41) return 'ELEVATED';
  return 'STABLE';
}

// Grade logic:
//
// ASCENDING observation (score moved into a higher band, situation worsening):
//   HIT     — current level >= crossing level (held or deteriorated further)
//   MISS    — current level < previous level (fully recovered past the crossing point)
//   PARTIAL — current level between previous and crossing (partial recovery)
//
// DESCENDING observation (score dropped to a lower band, situation improving):
//   HIT     — current level <= crossing level (held or improved further)
//   MISS    — current level >= previous level (re-escalated back to or past the crossing point)
//   PARTIAL — current level between crossing and previous (partial re-escalation)
function computeGrade(obs, currentLevel) {
  const crossRank  = BAND_RANK[obs.risk_level]          ?? -1;
  const prevRank   = BAND_RANK[obs.previous_risk_level] ?? -1;
  const currRank   = BAND_RANK[currentLevel]             ?? -1;

  if (obs.direction === 'ASCENDING') {
    if (currRank >= crossRank)  return { grade: 'HIT',     note: `Still ${currentLevel} — crossing held or worsened` };
    if (currRank <= prevRank)   return { grade: 'MISS',    note: `Recovered to ${currentLevel} — below crossing level ${obs.risk_level}` };
    return                             { grade: 'PARTIAL', note: `Partially recovered to ${currentLevel} — between ${obs.previous_risk_level} and ${obs.risk_level}` };
  }

  if (obs.direction === 'DESCENDING') {
    if (currRank <= crossRank)  return { grade: 'HIT',     note: `Still ${currentLevel} — improvement held or continued` };
    if (currRank >= prevRank)   return { grade: 'MISS',    note: `Re-escalated to ${currentLevel} — back at or above ${obs.previous_risk_level}` };
    return                             { grade: 'PARTIAL', note: `Partially re-escalated to ${currentLevel} — between ${obs.risk_level} and ${obs.previous_risk_level}` };
  }

  return { grade: 'PARTIAL', note: `Unknown direction — manual review` };
}

async function runGradingPass(options = {}) {
  const dryRun = options.dryRun || false;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  SABIAN GRADING PASS${dryRun ? ' [DRY RUN]' : ''}`);
  console.log(`  ${new Date().toISOString().slice(0, 10)}`);
  console.log(`${'='.repeat(60)}\n`);

  // Fetch observations whose windows have closed
  const { due, error: dueErr } = await getObservationsDueForGrading();
  if (dueErr) {
    console.error('  Failed to fetch due observations:', dueErr);
    return { graded: 0, error: dueErr };
  }

  if (!due.length) {
    console.log('  No observations due for grading today.\n');
    return { graded: 0 };
  }

  console.log(`  ${due.length} observation(s) due for grading.\n`);

  // Fetch latest convergence scores for all affected countries
  const latestScores = await getLatestScores().catch(() => []);
  const scoreMap = {};
  if (Array.isArray(latestScores)) {
    for (const row of latestScores) scoreMap[row.country] = row;
  }

  let graded = 0;
  let hits = 0;
  let misses = 0;
  let partial = 0;
  let skipped = 0;

  for (const obs of due) {
    const latest = scoreMap[obs.country];

    if (!latest || latest.convergence_score == null) {
      console.log(`  [SKIP] ${obs.country} (id:${obs.id}) — no current score in DB, cannot grade`);
      skipped++;
      continue;
    }

    const currentLevel = latest.risk_level || scoreToLevel(latest.convergence_score);
    const { grade, note } = computeGrade(obs, currentLevel);

    const gradeLabel = grade === 'HIT' ? '✓ HIT' : grade === 'MISS' ? '✗ MISS' : '~ PARTIAL';
    console.log(`  [${gradeLabel}] ${obs.country.padEnd(20)} id:${obs.id}`);
    console.log(`         Was: ${obs.previous_risk_level} → ${obs.risk_level} (${obs.direction}) on ${obs.scan_date}`);
    console.log(`         Now: ${currentLevel} (score ${latest.convergence_score}) | Window closed: ${obs.window_closes_at}`);
    console.log(`         ${note}\n`);

    if (!dryRun) {
      const result = await gradeObservation(obs.id, {
        grade,
        grade_notes:    note,
        score_at_grade: latest.convergence_score,
        level_at_grade: currentLevel
      });
      if (!result.graded) {
        console.log(`         [ERROR] Failed to write grade: ${result.error}`);
      }
    }

    graded++;
    if (grade === 'HIT')     hits++;
    if (grade === 'MISS')    misses++;
    if (grade === 'PARTIAL') partial++;
  }

  // Summary
  console.log(`${'='.repeat(60)}`);
  console.log(`  Graded:  ${graded}  (${hits} HIT / ${misses} MISS / ${partial} PARTIAL)`);
  if (skipped) console.log(`  Skipped: ${skipped} (no current score available)`);
  console.log(`${'='.repeat(60)}\n`);

  // Running dossier stats
  if (!dryRun) {
    const stats = await getLedgerStats();
    if (!stats.error) {
      console.log(`  Running ledger: ${stats.total} total | ${stats.graded} graded | ${stats.open} open`);
      if (stats.hit_rate !== null) console.log(`  Hit rate: ${stats.hit_rate}% (${stats.hits}/${stats.graded} graded)`);
      console.log('');
    }
  }

  logToHive({
    source: 'grading_pass',
    level: 'intel',
    event: 'grading_pass_complete',
    data: { graded, hits, misses, partial, skipped, dry_run: dryRun },
    tags: ['grading', 'ledger', 'dossier']
  });

  return { graded, hits, misses, partial, skipped };
}

// CLI entry point
if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  runGradingPass({ dryRun }).catch(err => {
    console.error('Grading pass failed:', err.message);
    process.exit(1);
  });
}

module.exports = runGradingPass;
