// checkpoint_runner.cjs
// Runs daily alongside grading_pass.cjs.
// For each open observation, checks if any milestone checkpoint dates match today.
// When a checkpoint date arrives: captures current score, computes delta, writes
// a data-only summary. Does not grade — grading is at day 84 window close only.
//
// Checkpoint days: 30, 42, 56, 70, 84, 183, 365
//   Day 30:  First data snapshot
//   Day 42:  6-week snapshot
//   Day 56:  8-week snapshot
//   Day 70:  10-week snapshot
//   Day 84:  Full window closes — grading_pass.cjs handles the grade
//   Day 183: 6-month cycle
//   Day 365: 12-month full cycle
//
// The summary is data-only. What the signals show. No interpretation.

require('dotenv').config({ path: './.env' });
const { createClient } = require('@supabase/supabase-js');

const CHECKPOINT_DAYS = [30, 42, 56, 70, 84, 183, 365];

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  return createClient(url, key, { auth: { persistSession: false } });
}

function buildSummary(obs, checkpointDay, currentScore, currentLevel, topSignals) {
  const delta = currentScore !== null ? (currentScore - obs.convergence_score) : null;
  const deltaStr = delta !== null
    ? (delta > 0 ? '+' + delta : delta === 0 ? '0' : String(delta))
    : 'unavailable';

  const sigStr = (topSignals || []).slice(0, 3)
    .map(s => (s.signal_name || s.name || s) + (s.score != null ? ':' + s.score : ''))
    .join(' | ');

  const nextDay = CHECKPOINT_DAYS.find(d => d > checkpointDay);
  const nextDate = nextDay ? addDays(obs.scan_date, nextDay) : null;

  const lines = [
    `Day ${checkpointDay} — ${obs.country}`,
    `Opened: ${obs.scan_date} | Score: ${obs.convergence_score} | Level: ${obs.risk_level} | Direction: ${obs.direction}`,
    `Day ${checkpointDay} state: Score ${currentScore ?? '—'} (${currentLevel ?? '—'}) | Change: ${deltaStr}`,
  ];

  if (sigStr) lines.push(`Active signals: ${sigStr}`);

  if (checkpointDay === 84) {
    lines.push('Day 84 — full grading window. Grade recorded by grading_pass.');
  } else if (nextDay) {
    lines.push(`Next checkpoint: Day ${nextDay} (${nextDate})`);
  } else {
    lines.push('Day 365 — full 12-month cycle complete.');
  }

  return lines.join('\n');
}

async function runCheckpoints() {
  const sb = getClient();
  const today = new Date().toISOString().slice(0, 10);
  console.log(`[CHECKPOINT] ${today}`);

  const { data: openObs, error: obsErr } = await sb
    .from('observations')
    .select('id,country,scan_date,convergence_score,risk_level,direction,window_closes_at')
    .is('graded_at', null);

  if (obsErr) {
    console.error('[CHECKPOINT] Failed to fetch observations:', obsErr.message);
    return;
  }

  console.log(`[CHECKPOINT] ${openObs?.length || 0} open observations`);

  let written = 0;
  let skipped = 0;

  for (const obs of (openObs || [])) {
    for (const cpDay of CHECKPOINT_DAYS) {
      const cpDate = addDays(obs.scan_date, cpDay);
      if (cpDate !== today) continue;

      // Check if already recorded
      const { data: existing } = await sb
        .from('observation_checkpoints')
        .select('id')
        .eq('observation_id', obs.id)
        .eq('checkpoint_day', cpDay)
        .limit(1);

      if (existing?.length) {
        skipped++;
        continue;
      }

      // Fetch current score for this country
      const { data: scores } = await sb
        .from('convergence_scores')
        .select('convergence_score,risk_level,top_3_signals')
        .eq('country', obs.country)
        .order('scan_date', { ascending: false })
        .limit(1);

      const currentScore = scores?.[0]?.convergence_score ?? null;
      const currentLevel = scores?.[0]?.risk_level ?? null;
      const topSignals   = scores?.[0]?.top_3_signals || [];

      const delta   = currentScore !== null ? (currentScore - obs.convergence_score) : null;
      const summary = buildSummary(obs, cpDay, currentScore, currentLevel, topSignals);

      const { error: writeErr } = await sb
        .from('observation_checkpoints')
        .upsert({
          observation_id:      obs.id,
          country:             obs.country,
          checkpoint_day:      cpDay,
          checkpoint_date:     cpDate,
          score_at_checkpoint: currentScore,
          level_at_checkpoint: currentLevel,
          score_delta:         delta,
          top_signals:         topSignals,
          summary
        }, { onConflict: 'observation_id,checkpoint_day' });

      if (writeErr) {
        console.error(`[CHECKPOINT] Write failed ${obs.country} day ${cpDay}:`, writeErr.message);
      } else {
        const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
        console.log(`[CHECKPOINT] WROTE ${obs.country} day ${cpDay}: ${obs.convergence_score} ${arrow} ${currentScore ?? '?'} (Δ${delta ?? '?'})`);
        written++;
      }
    }
  }

  console.log(`[CHECKPOINT] Complete — ${written} written, ${skipped} already recorded`);
  return { written, skipped };
}

// Allow direct run or require
if (require.main === module) {
  runCheckpoints().catch(err => { console.error('[CHECKPOINT] Fatal:', err.message); process.exit(1); });
}

module.exports = { runCheckpoints };
