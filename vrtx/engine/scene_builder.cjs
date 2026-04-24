function safe(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function minutesToHoursMinutes(totalMinutes) {
  const mins = safe(totalMinutes);
  if (mins === null) return "unavailable";
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h} hours ${m} minutes`;
}

function humanize(value, fallback = "mixed signal") {
  if (!value) return fallback;
  return String(value).replace(/_/g, " ");
}

function pickDayFrame(stateResult = {}) {
  const frame = stateResult?.framing?.day_frame;

  if (frame === "reset_day") return "reset day";
  if (frame === "support_day") return "support day";
  if (frame === "constrained_day") return "constrained day";
  if (frame === "controlled_day") return "controlled day";
  if (frame === "correction_day") return "correction day";
  if (frame === "leverage_day") return "leverage day";
  if (frame === "momentum_day") return "momentum day";
  if (frame === "mixed_day") return "mixed day";
  if (frame === "steady_day") return "steady day";

  return "mixed day";
}

const COMBINED_STATE_MAIN_PROBLEM = {
  partially_constrained_with_offset:
    "One recovery signal is below baseline. One signal is favorable. The combination does not produce a constrained day.",
  steady:
    "All recovery signals are at or near baseline.",
  mixed_load:
    "Recovery signals are mixed — some below baseline, some at or above.",
  recovering:
    "Sleep was within range. Downstream recovery markers show incomplete overnight reset.",
  primed:
    "Recovery markers are above baseline. Available capacity is elevated."
};

function pickMainProblem({ today = {}, baseline = {}, behaviorLayer = {}, stateResult = {} }) {
  // When combined state has resolved a regulated body state, use the board-level description.
  // Single-metric flags must not govern main_problem when the board says otherwise.
  const bodyState = stateResult?.combinedStateResult?.body_state;
  if (bodyState && COMBINED_STATE_MAIN_PROBLEM[bodyState]) {
    return COMBINED_STATE_MAIN_PROBLEM[bodyState];
  }

  // Single-metric fallback — only reached for depleted / constrained / controlled
  // where coherent_negative boards correctly reflect a dominant failing signal.
  const sleep = safe(today.sleep_minutes);
  const baseSleep = safe(baseline.sleep_minutes);
  const hrv = safe(today.hrv_ms);
  const baseHrv = safe(baseline.hrv_ms);
  const rhr = safe(today.resting_hr);
  const baseRhr = safe(baseline.resting_hr);
  const bloodOxygen = safe(today.spo2);
  const baseBloodOxygen = safe(baseline.spo2);
  const sleepConsistency = safe(today.sleep_consistency);
  const baseSleepConsistency = safe(baseline.sleep_consistency);

  if (sleep !== null && baseSleep !== null && sleep < baseSleep - 60) {
    return "Sleep came in clearly below baseline, so the body had less recovery time than usual.";
  }

  if (hrv !== null && baseHrv !== null && hrv < baseHrv * 0.9) {
    return "HRV is below baseline, so the nervous system is not as settled as usual.";
  }

  if (rhr !== null && baseRhr !== null && rhr > baseRhr + 4) {
    return "Resting heart rate is above baseline, which means the body is carrying more background load than usual.";
  }

  if (sleepConsistency !== null && baseSleepConsistency !== null && sleepConsistency < baseSleepConsistency - 10) {
    return "Sleep timing drifted from baseline, so rhythm support was weaker even if total sleep looked acceptable.";
  }

  if (bloodOxygen !== null && baseBloodOxygen !== null && bloodOxygen < baseBloodOxygen - 1) {
    return "Blood oxygen is below baseline, so oxygen support was not as stable as usual.";
  }

  if (behaviorLayer?.summary?.dominantRisk) {
    return `The clearest issue today is ${humanize(behaviorLayer.summary.dominantRisk)}.`;
  }

  return "The board is readable, but the signals do not all point in the same direction.";
}

function pickMechanism({ today = {}, baseline = {}, stateResult = {} }) {
  const sleep = safe(today.sleep_minutes);
  const baseSleep = safe(baseline.sleep_minutes);
  const hrv = safe(today.hrv_ms);
  const baseHrv = safe(baseline.hrv_ms);
  const rhr = safe(today.resting_hr);
  const baseRhr = safe(baseline.resting_hr);
  const sleepConsistency = safe(today.sleep_consistency);
  const baseSleepConsistency = safe(baseline.sleep_consistency);
  const bloodOxygen = safe(today.spo2);
  const baseBloodOxygen = safe(baseline.spo2);

  if (sleep !== null && baseSleep !== null && sleep < baseSleep - 60) {
    return "Shorter sleep usually means less time for the nervous system to settle and less room for overnight repair to finish cleanly.";
  }

  if (hrv !== null && baseHrv !== null && hrv < baseHrv * 0.9) {
    return "Lower HRV usually means the body is less adaptable this morning, which often shows up as lower stress tolerance and slower reset.";
  }

  if (rhr !== null && baseRhr !== null && rhr > baseRhr + 4) {
    return "A higher resting heart rate usually means the body is carrying more background demand, so ordinary tasks can feel more expensive than usual.";
  }

  if (sleepConsistency !== null && baseSleepConsistency !== null && sleepConsistency < baseSleepConsistency - 10) {
    return "When sleep timing drifts, the body can lose rhythm support even if total sleep time is not disastrous.";
  }

  if (bloodOxygen !== null && baseBloodOxygen !== null && bloodOxygen < baseBloodOxygen - 1) {
    return "Lower blood oxygen can reduce how stable the system feels, especially when other recovery markers are already soft.";
  }

  return "The body is not sending one clean message, so the day has to be read from the strongest metric and the weakest link together.";
}

function pickStakes({ stateResult = {} }) {
  const frame = stateResult?.framing?.day_frame;

  if (frame === "reset_day") {
    return "The mistake today is acting normal when the body is clearly behind baseline.";
  }

  if (frame === "support_day") {
    return "The mistake today is assuming decent sleep time means the body fully followed through overnight.";
  }

  if (frame === "constrained_day") {
    return "The cost today is forcing extra output when the system is already carrying more load than usual.";
  }

  if (frame === "controlled_day") {
    return "The risk today is letting a shorter night turn into a sloppier day through timing, food, or stimulation.";
  }

  if (frame === "correction_day") {
    return "If the system stays too activated, focus and recovery both tend to drift down together.";
  }

  if (frame === "leverage_day") {
    return "The risk is wasting a physiologically good day through delay, drift, or underuse.";
  }

  if (frame === "momentum_day") {
    return "The opportunity is to turn stable physiology into useful work without disturbing rhythm.";
  }

  return "The day can still be won, but only if the signal is read cleanly instead of smoothed over.";
}

function pickWinningMove({ stateResult = {}, rules = [] }) {
  const frame = stateResult?.framing?.day_frame;
  const ruleIds = new Set((rules || []).map((r) => r.rule_id));

  if (frame === "reset_day") {
    return "Make today simpler than usual: keep movement light, cut caffeine early, and build the night around a longer sleep window.";
  }

  if (frame === "support_day") {
    return "Support the day instead of forcing it: keep food timing regular, keep movement smooth, and tighten the evening so the body can finish the reset tonight.";
  }

  if (frame === "constrained_day") {
    return "Do the essential work first, keep the day mechanically clean, and stop adding stress that will not pay back today.";
  }

  if (frame === "controlled_day") {
    const move = [];
    move.push("Use the day cleanly");
    if (ruleIds.has("FOCUS_BLOCK_EARLY")) move.push("put important work earlier");
    if (ruleIds.has("STEADY_MOVEMENT")) move.push("keep movement steady");
    if (ruleIds.has("SLEEP_EXTENSION")) move.push("and make tonight longer than usual");
    return `${move.join(", ")}.`;
  }

  if (frame === "correction_day") {
    return "Reduce stimulation, tighten caffeine timing, and make the system easier to settle across the full day.";
  }

  if (frame === "leverage_day") {
    return "Use the stable signal early, place demanding work in the front half, and do not waste a good physiological window.";
  }

  if (frame === "momentum_day") {
    return "Keep rhythm intact and convert the stable signal into useful output instead of unnecessary variation.";
  }

  return "Keep the day steady, keep decisions simple, and finish the day in better condition than you started it.";
}

function buildTeachingPoints({ today = {}, baseline = {}, stateResult = {} }) {
  const points = [];
  const sleep = safe(today.sleep_minutes);
  const baseSleep = safe(baseline.sleep_minutes);
  const rhr = safe(today.resting_hr);
  const baseRhr = safe(baseline.resting_hr);
  const hrv = safe(today.hrv_ms);
  const baseHrv = safe(baseline.hrv_ms);
  const bloodOxygen = safe(today.spo2);
  const baseBloodOxygen = safe(baseline.spo2);
  const sleepConsistency = safe(today.sleep_consistency);
  const baseSleepConsistency = safe(baseline.sleep_consistency);
  const framing = stateResult?.framing || {};

  if (sleep !== null && baseSleep !== null) {
    const gap = Math.round(baseSleep - sleep);
    if (gap > 0) points.push(`sleep_gap_minutes:${gap}`);
    else if (gap < 0) points.push(`sleep_surplus_minutes:${Math.abs(gap)}`);
  }

  if (rhr !== null && baseRhr !== null) {
    const gap = Math.round(rhr - baseRhr);
    points.push(`resting_hr_delta:${gap}`);
  }

  if (hrv === null) {
    points.push("hrv_unavailable");
  } else if (baseHrv !== null) {
    const gap = Math.round(hrv - baseHrv);
    points.push(`hrv_delta:${gap}`);
  }

  if (bloodOxygen !== null && baseBloodOxygen !== null) {
    const gap = roundInt(bloodOxygen - baseBloodOxygen);
    points.push(`blood_oxygen_delta:${gap}`);
  }

  if (sleepConsistency !== null && baseSleepConsistency !== null) {
    const gap = roundInt(sleepConsistency - baseSleepConsistency);
    points.push(`sleep_consistency_delta:${gap}`);
  }

  points.push(`confidence:${framing.confidence || "moderate"}`);

  return points;
}

function roundInt(value) {
  const n = safe(value);
  if (n === null) return 0;
  return Math.round(n);
}

function buildConstraintSummary({ stateResult = {}, behaviorLayer = {} }) {
  const framing = stateResult?.framing || {};

  return {
    primary_constraint: humanize(framing.primary_constraint, "none"),
    primary_opportunity: humanize(framing.primary_opportunity, "maintain stability"),
    signal_conflict: humanize(framing.signal_conflict, "none"),
    dominant_signal: humanize(framing.dominant_signal, "mixed signal"),
    confidence: framing.confidence || "moderate",
    dominant_driver: null,
    dominant_risk: behaviorLayer?.summary?.dominantRisk
      ? humanize(behaviorLayer.summary.dominantRisk)
      : null
  };
}

function buildCarryover({ yesterdayLayer = null } = {}) {
  if (!yesterdayLayer) return null;
  return {
    steps: yesterdayLayer.steps,
    movement_minutes: yesterdayLayer.movementMinutes,
    movement_context: yesterdayLayer.activityLoad
      ? yesterdayLayer.activityLoad.replace(/_/g, " ") + " movement yesterday"
      : null,
    carryover_risk: yesterdayLayer.carryoverRisk,
    interpretation: yesterdayLayer.interpretation
  };
}

function pickGoverningCondition({ flags = {}, today = {} }) {
  const hrv = safe(today.hrv_ms) ?? safe(today.hrv_rmssd);

  if (flags.stable_recovery_available) {
    return (hrv != null && hrv >= 75) ? 'peak_window' : 'recovery_window';
  }
  if (flags.major_sleep_loss && flags.hrv_severely_suppressed && flags.resting_hr_sharply_elevated) {
    return (hrv != null && hrv < 25) ? 'autonomic_stress' : 'full_depletion';
  }
  if ((flags.short_sleep || flags.major_sleep_loss) && (flags.hrv_suppressed || flags.resting_hr_elevated)) {
    return 'full_depletion';
  }
  if (flags.short_sleep) {
    return 'partial_clearance_deficit';
  }
  return 'stable_baseline';
}

function buildVrtxScene({
  user = {},
  today = {},
  baseline = {},
  behaviorLayer = {},
  stateResult = {},
  rules = [],
  yesterdayLayer = null,
  overnightWindow = null,
  interpretedSignals = [],
  combinedStateResult = null,
  flags = {}
} = {}) {
  const dayFrame = pickDayFrame(stateResult);
  const constraintSummary = buildConstraintSummary({ stateResult, behaviorLayer });

  return {
    user_name: user?.name || "User",
    day_frame: dayFrame,
    governing_condition: pickGoverningCondition({ flags, today }),
    state: stateResult?.state || "Steady",
    main_problem: pickMainProblem({ today, baseline, behaviorLayer, stateResult }),
    stakes: pickStakes({ stateResult }),
    teaching_points: buildTeachingPoints({ today, baseline, stateResult }),
    primary_constraint: constraintSummary.primary_constraint,
    primary_opportunity: constraintSummary.primary_opportunity,
    signal_conflict: constraintSummary.signal_conflict,
    dominant_signal: constraintSummary.dominant_signal,
    confidence: constraintSummary.confidence,
    dominant_driver: constraintSummary.dominant_driver,
    dominant_risk: constraintSummary.dominant_risk,
    allowed_rules: Array.isArray(rules) ? rules.map((r) => r.rule_id) : [],
    carryover: buildCarryover({ yesterdayLayer }),
    overnight_window: overnightWindow || null,
    interpreted_signals: Array.isArray(interpretedSignals) ? interpretedSignals : [],
    combined_state: combinedStateResult || null,
    evidence_snapshot: {
      sleep_minutes: safe(today.sleep_minutes),
      baseline_sleep_minutes: safe(baseline.sleep_minutes),
      sleep_today_readable: minutesToHoursMinutes(today.sleep_minutes),
      sleep_baseline_readable: minutesToHoursMinutes(baseline.sleep_minutes),
      hrv_ms: safe(today.hrv_ms),
      baseline_hrv_ms: safe(baseline.hrv_ms),
      resting_hr: safe(today.resting_hr),
      baseline_resting_hr: safe(baseline.resting_hr),
      blood_oxygen: safe(today.spo2),
      baseline_blood_oxygen: safe(baseline.spo2),
      steps: safe(today.steps),
      baseline_steps: safe(baseline.steps),
      sleep_consistency: safe(today.sleep_consistency),
      baseline_sleep_consistency: safe(baseline.sleep_consistency)
    }
  };
}

module.exports = {
  buildVrtxScene,
  pickDayFrame,
  pickMainProblem,
  pickMechanism,
  pickStakes,
  pickWinningMove,
  buildTeachingPoints
};