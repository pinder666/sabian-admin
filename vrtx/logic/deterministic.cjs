function asNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round(value, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function pctDelta(todayValue, baselineValue) {
  const t = asNumber(todayValue);
  const b = asNumber(baselineValue);
  if (t === null || b === null || b === 0) return null;
  return round((t - b) / b, 3);
}

function absDelta(todayValue, baselineValue) {
  const t = asNumber(todayValue);
  const b = asNumber(baselineValue);
  if (t === null || b === null) return null;
  return round(t - b, 2);
}

function clamp(value, min, max) {
  const n = asNumber(value);
  if (n === null) return null;
  return Math.max(min, Math.min(max, n));
}

function shortfallPenalty(todayValue, baselineValue) {
  const t = asNumber(todayValue);
  const b = asNumber(baselineValue);
  if (t === null || b === null || b <= 0) return null;
  return round(Math.max(0, (b - t) / b), 3);
}

function excessPenalty(todayValue, baselineValue) {
  const t = asNumber(todayValue);
  const b = asNumber(baselineValue);
  if (t === null || b === null || b <= 0) return null;
  return round(Math.max(0, (t - b) / b), 3);
}

function inverseDeviationPenalty(todayValue, baselineValue, tolerance = 0.15) {
  const t = asNumber(todayValue);
  const b = asNumber(baselineValue);
  if (t === null || b === null || b <= 0) return null;

  const ratio = Math.abs(t - b) / b;
  const adjusted = Math.max(0, ratio - tolerance);
  return round(adjusted, 3);
}

function computeDeviations(today = {}, baseline = {}) {
  return {
    sleep_minutes: absDelta(today.sleep_minutes, baseline.sleep_minutes),
    sleep_minutes_pct: pctDelta(today.sleep_minutes, baseline.sleep_minutes),

    hrv_ms: absDelta(today.hrv_ms, baseline.hrv_ms),
    hrv_ms_pct: pctDelta(today.hrv_ms, baseline.hrv_ms),

    resting_hr: absDelta(today.resting_hr, baseline.resting_hr),
    resting_hr_pct: pctDelta(today.resting_hr, baseline.resting_hr),

    steps: absDelta(today.steps, baseline.steps),
    steps_pct: pctDelta(today.steps, baseline.steps),

    spo2: absDelta(today.spo2, baseline.spo2),
    spo2_pct: pctDelta(today.spo2, baseline.spo2),

    sleep_consistency: absDelta(today.sleep_consistency, baseline.sleep_consistency),
    sleep_consistency_pct: pctDelta(today.sleep_consistency, baseline.sleep_consistency)
  };
}

function computeRecoveryStrainMath(today = {}, baseline = {}) {
  const sleepPenalty = shortfallPenalty(today.sleep_minutes, baseline.sleep_minutes);
  const hrvPenalty = shortfallPenalty(today.hrv_ms, baseline.hrv_ms);
  const rhrPenalty = excessPenalty(today.resting_hr, baseline.resting_hr);
  const spo2Penalty = shortfallPenalty(today.spo2, baseline.spo2);
  const consistencyPenalty = inverseDeviationPenalty(
    today.sleep_consistency,
    baseline.sleep_consistency,
    0.10
  );

  const weights = {
    sleep: 0.30,
    hrv: 0.25,
    resting_hr: 0.21,
    spo2: 0.10,
    sleep_consistency: 0.14
  };

  const weighted = {
    sleep: sleepPenalty !== null ? round(sleepPenalty * weights.sleep, 3) : null,
    hrv: hrvPenalty !== null ? round(hrvPenalty * weights.hrv, 3) : null,
    resting_hr: rhrPenalty !== null ? round(rhrPenalty * weights.resting_hr, 3) : null,
    spo2: spo2Penalty !== null ? round(spo2Penalty * weights.spo2, 3) : null,
    sleep_consistency:
      consistencyPenalty !== null ? round(consistencyPenalty * weights.sleep_consistency, 3) : null
  };

  const score = round(
    (weighted.sleep || 0) +
    (weighted.hrv || 0) +
    (weighted.resting_hr || 0) +
    (weighted.spo2 || 0) +
    (weighted.sleep_consistency || 0),
    3
  );

  const components = [
    {
      key: "sleep",
      label: "sleep_shortfall",
      raw: sleepPenalty,
      weighted: weighted.sleep
    },
    {
      key: "hrv",
      label: "hrv_below_baseline",
      raw: hrvPenalty,
      weighted: weighted.hrv
    },
    {
      key: "resting_hr",
      label: "resting_hr_above_baseline",
      raw: rhrPenalty,
      weighted: weighted.resting_hr
    },
    {
      key: "spo2",
      label: "blood_oxygen_below_baseline",
      raw: spo2Penalty,
      weighted: weighted.spo2
    },
    {
      key: "sleep_consistency",
      label: "sleep_timing_drift",
      raw: consistencyPenalty,
      weighted: weighted.sleep_consistency
    }
  ].filter((x) => x.raw !== null);

  components.sort((a, b) => (b.weighted || 0) - (a.weighted || 0));

  const dominant = components[0] || null;
  const secondary = components[1] || null;

  let band = "steady_day";
  if (score >= 0.50) band = "support_day";
  else if (score >= 0.30) band = "adjustment_day";
  else if (score >= 0.16) band = "mixed_day";

  return {
    score,
    band,
    dominant_driver: dominant ? dominant.label : "no_clear_driver",
    secondary_driver: secondary ? secondary.label : "none",
    penalties: {
      sleep: sleepPenalty,
      hrv: hrvPenalty,
      resting_hr: rhrPenalty,
      spo2: spo2Penalty,
      sleep_consistency: consistencyPenalty
    },
    weighted_components: weighted
  };
}

function classifyState(today = {}, baseline = {}, deviations = {}, profile = {}) {
  const sleepMinutes = asNumber(today.sleep_minutes);
  const baselineSleep = asNumber(baseline.sleep_minutes) ?? 420;

  const hrvMs = asNumber(today.hrv_ms);
  const baselineHrv = asNumber(baseline.hrv_ms);

  const restingHr = asNumber(today.resting_hr);
  const baselineRhr = asNumber(baseline.resting_hr) ?? 55;

  const spo2 = asNumber(today.spo2);
  const baselineSpo2 = asNumber(baseline.spo2);

  const sleepConsistency = asNumber(today.sleep_consistency);
  const baselineSleepConsistency = asNumber(baseline.sleep_consistency);

  const hasHrv = hrvMs !== null && baselineHrv !== null;
  const hasRhr = restingHr !== null && baselineRhr !== null;
  const hasSpo2 = spo2 !== null && baselineSpo2 !== null;
  const hasSleepConsistency =
    sleepConsistency !== null && baselineSleepConsistency !== null;

  const sleepDelta = asNumber(deviations.sleep_minutes);
  const hrvDelta = asNumber(deviations.hrv_ms);
  const rhrDelta = asNumber(deviations.resting_hr);
  const spo2Delta = asNumber(deviations.spo2);
  const consistencyDelta = asNumber(deviations.sleep_consistency);

  const rss = computeRecoveryStrainMath(today, baseline);

  const flags = {
    short_sleep: sleepMinutes !== null && sleepMinutes < baselineSleep - 45,
    major_sleep_loss: sleepMinutes !== null && sleepMinutes < baselineSleep - 90,

    hrv_suppressed: hasHrv && hrvMs < baselineHrv * 0.9,
    hrv_severely_suppressed: hasHrv && hrvMs < baselineHrv * 0.82,

    resting_hr_elevated: hasRhr && restingHr > baselineRhr + 4,
    resting_hr_sharply_elevated: hasRhr && restingHr > baselineRhr + 7,
    resting_hr_below_baseline: hasRhr && restingHr < baselineRhr - 4,

    blood_oxygen_low: hasSpo2 && spo2 < baselineSpo2 - 1,
    blood_oxygen_sharply_low: hasSpo2 && spo2 < baselineSpo2 - 2,

    sleep_timing_drifted:
      hasSleepConsistency && sleepConsistency < baselineSleepConsistency * 0.9,
    sleep_timing_sharply_drifted:
      hasSleepConsistency && sleepConsistency < baselineSleepConsistency * 0.8,

    stimulation_pattern:
      profile?.coffee === true &&
      hasRhr &&
      restingHr > baselineRhr + 5,

    missing_recovery_data: !hasHrv,

    sleep_ok_but_recovery_not_following:
      sleepMinutes !== null &&
      sleepMinutes >= baselineSleep - 15 &&
      (
        (hasHrv && hrvMs < baselineHrv * 0.9) ||
        (hasRhr && restingHr > baselineRhr + 4)
      ),

    stable_recovery_available:
      !(hasHrv && hrvMs < baselineHrv * 0.9) &&
      !(hasRhr && restingHr > baselineRhr + 4) &&
      !(sleepMinutes !== null && sleepMinutes < baselineSleep - 60) &&
      !(hasSpo2 && spo2 < baselineSpo2 - 1),

    rss_mixed: rss.score !== null && rss.score >= 0.16 && rss.score < 0.30,
    rss_adjustment: rss.score !== null && rss.score >= 0.30 && rss.score < 0.50,
    rss_support: rss.score !== null && rss.score >= 0.50
  };

  let state = "Steady";
  let day_frame = "steady_day";
  let primary_constraint = "none";
  let primary_opportunity = "keep_stability";
  let signal_conflict = "none";
  let dominant_signal =
    rss.dominant_driver !== "no_clear_driver" ? rss.dominant_driver : "mixed_signal";
  let confidence = "moderate";

  if (flags.major_sleep_loss && (flags.resting_hr_elevated || flags.hrv_suppressed)) {
    state = "Reset";
    day_frame = "reset_day";
    primary_constraint = "sleep_and_recovery_drop";
    primary_opportunity = "restore_baseline";
    dominant_signal = "stacked_sleep_and_recovery_drop";
    confidence = "high";
  } else if (
    flags.sleep_ok_but_recovery_not_following ||
    (flags.rss_adjustment && (flags.hrv_suppressed || flags.resting_hr_elevated || flags.sleep_timing_drifted))
  ) {
    state = "Support";
    day_frame = "support_day";
    primary_constraint = flags.sleep_ok_but_recovery_not_following
      ? "overnight_reset_did_not_fully_convert"
      : dominant_signal;
    primary_opportunity = "support_recovery_follow_through";
    signal_conflict = flags.sleep_ok_but_recovery_not_following
      ? "sleep_time_held_but_recovery_did_not_fully_follow"
      : "surface_stability_does_not_match_recovery_math";
    dominant_signal = flags.sleep_ok_but_recovery_not_following
      ? "recovery_did_not_fully_follow_sleep"
      : dominant_signal;
    confidence = "high";
  } else if (
    flags.hrv_severely_suppressed ||
    flags.resting_hr_sharply_elevated ||
    flags.blood_oxygen_sharply_low ||
    flags.rss_support
  ) {
    state = "Constrained";
    day_frame = "constrained_day";
    primary_constraint = dominant_signal === "no_clear_driver"
      ? "recovery_markers_are_constrained"
      : dominant_signal;
    primary_opportunity = "reduce_system_friction";
    dominant_signal = dominant_signal === "no_clear_driver"
      ? "recovery_markers_are_constrained"
      : dominant_signal;
    confidence = "high";
  } else if (flags.short_sleep && !flags.hrv_suppressed && !flags.resting_hr_elevated) {
    state = "Controlled";
    day_frame = "controlled_day";
    primary_constraint = hasHrv
      ? "sleep_is_short_even_if_recovery_is_not_signaling_breakdown"
      : "sleep_is_short_with_partial_recovery_visibility";
    primary_opportunity = "use_the_day_cleanly_without_overspending";
    signal_conflict = hasHrv
      ? "sleep_short_but_recovery_not_fully_negative"
      : "sleep_short_with_missing_hrv";
    dominant_signal = "short_sleep";
    confidence = hasHrv ? "high" : "moderate";
  } else if (flags.stimulation_pattern) {
    state = "Correction";
    day_frame = "correction_day";
    primary_constraint = "activation_is_carrying_over";
    primary_opportunity = "settle_the_system";
    dominant_signal = "activation_overhang";
    confidence = "moderate";
  } else if (
    flags.stable_recovery_available &&
    !flags.short_sleep &&
    !flags.sleep_timing_drifted
  ) {
    state = "Momentum";
    day_frame = "momentum_day";
    primary_constraint = "none";
    primary_opportunity = "turn_stability_into_clean_output";
    dominant_signal = "stable_recovery";
    confidence = "high";
  } else if (flags.rss_mixed) {
    state = "Mixed";
    day_frame = "mixed_day";
    primary_constraint = dominant_signal;
    primary_opportunity = "keep_the_day_clean_and_stable";
    signal_conflict = "signals_do_not_fully_agree";
    confidence = flags.missing_recovery_data ? "moderate" : "high";
  }

  // ─── Metric Reasoning + Combined State layers ────────────────────────────
  const interpretedSignals = interpretMetrics(today, baseline, {
    sleep_minutes: sleepDelta,
    hrv_ms: hrvDelta,
    resting_hr: rhrDelta,
    spo2: spo2Delta,
    sleep_consistency: consistencyDelta
  });

  const combinedStateResult = combinedState(interpretedSignals);

  // Regulate Output for mild/mixed boards.
  // Coherent negative boards (3+ unfavorable, no favorable offset) trust the flag-based
  // classification which handles stacked Reset/Constrained cases correctly.
  // All other boards use the combined state regulation.
  const shouldRegulate = combinedStateResult.coherence !== "coherent_negative";

  if (shouldRegulate) {
    state = combinedStateResult.regulated_state;
    day_frame = combinedStateResult.regulated_day_frame;
    dominant_signal = combinedStateResult.body_state.replace(/_/g, " ");
    primary_constraint = "none";
    signal_conflict = "none";
  }

  return {
    state,
    flags,
    rss,
    interpretedSignals,
    combinedStateResult,
    framing: {
      day_frame,
      primary_constraint,
      primary_opportunity,
      signal_conflict,
      dominant_signal,
      confidence,
      support_score: rss.score,
      support_band: rss.band,
      secondary_driver: rss.secondary_driver,
      weighted_components: rss.weighted_components,
      penalties: rss.penalties,
      deltas: {
        sleepDelta,
        hrvDelta,
        rhrDelta,
        spo2Delta,
        consistencyDelta
      }
    }
  };
}

function selectRules(stateResult = {}, today = {}, baseline = {}, deviations = {}, profile = {}) {
  const state = stateResult?.state || "Steady";
  const flags = stateResult?.flags || {};
  const rss = stateResult?.rss || {};
  const rules = [];

  function push(rule_id, payload = {}, source = "STATE_RULE") {
    rules.push({ rule_id, payload, source });
  }

  push("RECOVERY_MATH", {
    score: rss.score,
    band: rss.band,
    dominant_driver: rss.dominant_driver,
    secondary_driver: rss.secondary_driver,
    weighted_components: rss.weighted_components
  }, "RSS");

  if (state === "Reset") {
    push("LIGHT_MOVEMENT_ONLY", { minutes: 20 }, "RESET");
    push("CAFFEINE_CUTOFF_EARLY", { cutoff_hour: 12 }, "RESET");
    push("SLEEP_EXTENSION", { target_minutes: 510 }, "RESET");
    push("SIMPLIFY_DAY", { reduce_optional_load: true }, "RESET");
  } else if (state === "Support") {
    push("EASY_MOVEMENT_ONLY", { minutes: 20 }, "SUPPORT");
    push("REGULAR_MEALS", { consistency: true }, "SUPPORT");
    push("PROTECT_EVENING_ROUTINE", { preserve_sleep_timing: true }, "SUPPORT");
  } else if (state === "Constrained") {
    push("ESSENTIAL_WORK_FIRST", { bias: "front_half_of_day" }, "CONSTRAINED");
    push("LOWER_FRICTION", { reduce_optional_load: true }, "CONSTRAINED");
    push("EARLY_SHUTDOWN", { preserve_night: true }, "CONSTRAINED");
  } else if (state === "Controlled") {
    push("STEADY_MOVEMENT", { minutes: 30 }, "CONTROLLED");
    push("FOCUS_BLOCK_EARLY", { bias: "front_half_of_day" }, "CONTROLLED");
    push("SLEEP_EXTENSION", { target_minutes: 480 }, "CONTROLLED");
  } else if (state === "Correction") {
    push("TIGHTEN_CAFFEINE", { reduce_late_intake: true }, "CORRECTION");
    push("REDUCE_STIMULATION", { extra_activation: false }, "CORRECTION");
    push("CALMING_BREAKS", { count: 2 }, "CORRECTION");
    push("EARLY_SLEEP_WINDOW", { target_minutes: 480 }, "CORRECTION");
  } else if (state === "Leverage") {
    push("USE_CAPACITY_EARLY", { bias: "front_half_of_day" }, "LEVERAGE");
    push("TRAIN_IF_PLANNED", { allow: true }, "LEVERAGE");
    push("DO_NOT_DRIFT", { start_clean: true }, "LEVERAGE");
  } else if (state === "Momentum") {
    push("NORMAL_TRAINING_ALLOWED", { allow: true }, "MOMENTUM");
    push("KEEP_RHYTHM", { preserve_schedule: true }, "MOMENTUM");
    push("DEPLOY_STABLE_OUTPUT", { consistent_work: true }, "MOMENTUM");
  } else {
    push("KEEP_STEADY", { consistency: true }, "DEFAULT");
  }

  if (flags.missing_recovery_data) {
    push("RECOVERY_VISIBILITY_LIMITED", { hrv_missing: true }, "DATA_LIMIT");
  }

  if (flags.major_sleep_loss) {
    push("SLEEP_DEBT_PRESENT", { severity: "major" }, "SLEEP_SIGNAL");
  } else if (flags.short_sleep) {
    push("SLEEP_DEBT_PRESENT", { severity: "moderate" }, "SLEEP_SIGNAL");
  }

  if (flags.sleep_timing_drifted) {
    push("SLEEP_TIMING_SUPPORT", { tighten_evening: true }, "RHYTHM_SIGNAL");
  }

  return rules;
}

// ─── METRIC REASONING LAYER ──────────────────────────────────────────────────

function classifyMetricDirection(metric, delta, baseline) {
  const d = asNumber(delta);
  if (d === null) return "neutral";

  switch (metric) {
    case "sleep_minutes":
      if (d < -15) return "unfavorable";
      return "neutral";

    case "hrv_ms": {
      const b = asNumber(baseline ? baseline.hrv_ms : null);
      if (b === null || b === 0) return "neutral";
      const pct = d / b;
      if (pct < -0.05) return "unfavorable";
      if (pct > 0.05) return "favorable";
      return "neutral";
    }

    case "resting_hr":
      if (d > 3) return "unfavorable";
      if (d < -4) return "favorable";
      return "neutral";

    case "spo2":
      if (d < -1) return "unfavorable";
      if (d > 1) return "favorable";
      return "neutral";

    case "sleep_consistency":
      if (d < -5) return "unfavorable";
      if (d > 5) return "favorable";
      return "neutral";

    default:
      return "neutral";
  }
}

function classifyMetricSeverity(metric, delta, baseline) {
  const d = asNumber(delta);
  if (d === null) return "stable";

  switch (metric) {
    case "sleep_minutes": {
      const below = -d;
      if (below > 75) return "severe";
      if (below > 45) return "moderate";
      if (below > 15) return "mild";
      return "stable";
    }

    case "hrv_ms": {
      const b = asNumber(baseline ? baseline.hrv_ms : null);
      if (b === null || b === 0) return "stable";
      const pct = Math.abs(d / b);
      if (pct > 0.20) return "severe";
      if (pct > 0.10) return "moderate";
      if (pct > 0.05) return "mild";
      return "stable";
    }

    case "resting_hr": {
      const above = d;
      if (above > 10) return "severe";
      if (above > 6) return "moderate";
      if (above > 3) return "mild";
      return "stable";
    }

    case "spo2": {
      const below = -d;
      if (below > 3) return "severe";
      if (below > 2) return "moderate";
      if (below > 1) return "mild";
      return "stable";
    }

    case "sleep_consistency": {
      const below = -d;
      if (below > 15) return "severe";
      if (below > 10) return "moderate";
      if (below > 5) return "mild";
      return "stable";
    }

    default:
      return "stable";
  }
}

const METRIC_LABELS = {
  sleep_minutes: "Sleep",
  hrv_ms: "HRV",
  resting_hr: "Resting Heart Rate",
  spo2: "Blood Oxygen",
  sleep_consistency: "Sleep Consistency"
};

function applyOffsets(signals) {
  // Severe signals are never offset — only moderate and mild
  const SEVERITY_DOWN = { severe: "severe", moderate: "mild", mild: "stable", stable: "stable" };

  const rhrSignal = signals.find((s) => s.metric === "resting_hr");
  const hrvSignal = signals.find((s) => s.metric === "hrv_ms");
  const sleepConsSignal = signals.find((s) => s.metric === "sleep_consistency");

  const rhrFavorable = rhrSignal && rhrSignal.direction === "favorable";
  const hrvFavorable = hrvSignal && hrvSignal.direction === "favorable";
  const sleepConsStable = sleepConsSignal && sleepConsSignal.direction === "neutral";

  for (const s of signals) {
    if (s.direction !== "unfavorable" || s.severity === "severe") continue;

    // RHR favorable offsets mild or moderate sleep/HRV by one band
    if (rhrFavorable && (s.metric === "sleep_minutes" || s.metric === "hrv_ms")) {
      s.severity = SEVERITY_DOWN[s.severity];
      s.offset = true;
    }

    // HRV favorable offsets mild RHR elevation by one band
    if (hrvFavorable && s.metric === "resting_hr" && !s.offset) {
      s.severity = SEVERITY_DOWN[s.severity];
      s.offset = true;
    }

    // Sleep consistency stable offsets mild sleep shortfall (only if not already offset)
    if (sleepConsStable && s.metric === "sleep_minutes" && !s.offset) {
      s.severity = SEVERITY_DOWN[s.severity];
      s.offset = true;
    }
  }

  return signals;
}

function interpretMetrics(today = {}, baseline = {}, deviations = {}) {
  const METRICS = ["sleep_minutes", "hrv_ms", "resting_hr", "spo2", "sleep_consistency"];
  const signals = [];

  for (const metric of METRICS) {
    const value = asNumber(today[metric]);
    if (value === null) continue;

    const base = asNumber(baseline[metric]);
    const delta = asNumber(deviations[metric]);
    const direction = classifyMetricDirection(metric, delta, baseline);
    const severity = direction === "unfavorable"
      ? classifyMetricSeverity(metric, delta, baseline)
      : "stable";

    signals.push({
      metric,
      label: METRIC_LABELS[metric] || metric,
      value,
      baseline: base,
      delta,
      direction,
      severity,
      available: true,
      baseline_quality: base !== null ? "confirmed" : "missing",
      material: direction !== "neutral",
      offset: false
    });
  }

  return applyOffsets(signals);
}

// ─── COMBINED STATE LAYER ─────────────────────────────────────────────────────

const BODY_STATE_DESCRIPTIONS = {
  depleted: "Multiple recovery signals are significantly below baseline.",
  constrained: "Recovery capacity is below normal across multiple signals.",
  controlled: "One signal is limiting capacity. Other recovery signals are not broken.",
  partially_constrained_with_offset: "One signal is mildly unfavorable. A favorable signal is offsetting it.",
  mixed_load: "The board shows moderate unfavorable signals alongside partial favorable or neutral signals.",
  steady: "All signals are at or near baseline.",
  recovering: "Sleep was within range but downstream recovery signals need support.",
  primed: "Recovery signals are above baseline."
};

const OUTPUT_REGULATION_MAP = {
  depleted: { state: "Reset", day_frame: "reset_day" },
  constrained: { state: "Constrained", day_frame: "constrained_day" },
  controlled: { state: "Controlled", day_frame: "controlled_day" },
  partially_constrained_with_offset: { state: "Steady", day_frame: "steady_day" },
  mixed_load: { state: "Controlled", day_frame: "mixed_day" },
  steady: { state: "Steady", day_frame: "steady_day" },
  recovering: { state: "Support", day_frame: "support_day" },
  primed: { state: "Momentum", day_frame: "momentum_day" }
};

const SEVERITY_RANK = { stable: 0, mild: 1, moderate: 2, severe: 3 };
const RANK_TO_SEVERITY = ["stable", "mild", "moderate", "severe"];

function combinedState(signals = []) {
  const unfavorable = signals.filter((s) => s.direction === "unfavorable" && s.severity !== "stable");
  const favorable = signals.filter((s) => s.direction === "favorable");

  const unfavorableCount = unfavorable.length;
  const favorableCount = favorable.length;

  // Net severity: highest remaining unfavorable severity after offsets
  let maxRank = 0;
  for (const s of unfavorable) {
    maxRank = Math.max(maxRank, SEVERITY_RANK[s.severity] || 0);
  }
  const netSeverity = RANK_TO_SEVERITY[maxRank];

  // Determine coherence
  let coherence;
  if (unfavorableCount === 0 && favorableCount === 0) {
    coherence = "neutral";
  } else if (unfavorableCount === 0 && favorableCount >= 2) {
    coherence = "coherent_positive";
  } else if (unfavorableCount === 0 && favorableCount === 1) {
    coherence = "partial_positive";
  } else if (unfavorableCount >= 3 && favorableCount <= 1) {
    coherence = "coherent_negative";
  } else if (unfavorableCount >= 2 && favorableCount === 0) {
    coherence = "partial_negative";
  } else if (unfavorableCount >= 1 && favorableCount >= 1) {
    coherence = "mixed";
  } else {
    coherence = "partial_negative";
  }

  // Determine body state from coherence + net severity
  let bodyState;
  if (coherence === "coherent_negative") {
    bodyState = netSeverity === "severe" ? "depleted" : "constrained";
  } else if (coherence === "partial_negative") {
    if (netSeverity === "severe") bodyState = "constrained";
    else if (netSeverity === "moderate") bodyState = "controlled";
    else bodyState = "steady";
  } else if (coherence === "mixed") {
    if (netSeverity === "severe") bodyState = "constrained";
    else if (netSeverity === "moderate") bodyState = "mixed_load";
    else bodyState = "partially_constrained_with_offset";
  } else if (coherence === "coherent_positive") {
    bodyState = "primed";
  } else if (coherence === "partial_positive") {
    bodyState = "recovering";
  } else {
    bodyState = "steady";
  }

  const regulation = OUTPUT_REGULATION_MAP[bodyState] || { state: "Steady", day_frame: "steady_day" };

  return {
    coherence,
    net_severity: netSeverity,
    unfavorable_count: unfavorableCount,
    favorable_count: favorableCount,
    body_state: bodyState,
    regulated_state: regulation.state,
    regulated_day_frame: regulation.day_frame,
    description: BODY_STATE_DESCRIPTIONS[bodyState] || ""
  };
}

// ─── PRE-INSIGHT LAYER ───────────────────────────────────────────────────────

function buildPreInsight(today = {}, baseline = {}, interpretedSignals = [], combinedStateResult = {}, framing = {}) {
  function safeGet(obj, key) {
    const v = obj == null ? undefined : obj[key];
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  const sdSleep  = Math.max(safeGet(baseline, "sleep_minutes_sd")       || 1, 1);
  const sdHrv    = Math.max(safeGet(baseline, "hrv_ms_sd")               || 1, 1);
  const sdRhr    = Math.max(safeGet(baseline, "resting_hr_sd")           || 1, 1);
  const sdSpo2   = Math.max(safeGet(baseline, "spo2_sd")                 || 1, 1);
  const sdBed    = Math.max(safeGet(baseline, "bedtime_minutes_sd")      || 1, 1);
  const sdWake   = Math.max(safeGet(baseline, "wake_minutes_sd")         || 1, 1);

  const todaySleep  = safeGet(today, "sleep_minutes");
  const baseSleep   = safeGet(baseline, "sleep_minutes");
  const todayHrv    = safeGet(today, "hrv_ms");
  const baseHrv     = safeGet(baseline, "hrv_ms");
  const todayRhr    = safeGet(today, "resting_hr");
  const baseRhr     = safeGet(baseline, "resting_hr");
  const todaySpo2   = safeGet(today, "spo2");
  const baseSpo2    = safeGet(baseline, "spo2");
  const todayBed    = safeGet(today, "bedtime_minutes_from_midnight");
  const baseBed     = safeGet(baseline, "bedtime_minutes_from_midnight");
  const todayWake   = safeGet(today, "wake_minutes_from_midnight");
  const baseWake    = safeGet(baseline, "wake_minutes_from_midnight");

  const z_sleep  = todaySleep !== null && baseSleep !== null  ? (todaySleep - baseSleep) / sdSleep   : null;
  const z_hrv    = todayHrv   !== null && baseHrv   !== null  ? (todayHrv   - baseHrv)   / sdHrv     : null;
  const z_rhr    = todayRhr   !== null && baseRhr   !== null  ? -(todayRhr  - baseRhr)   / sdRhr     : null;
  const z_spo2   = todaySpo2  !== null && baseSpo2  !== null  ? (todaySpo2  - baseSpo2)  / sdSpo2    : null;

  let z_sc = null;
  if (todayBed !== null && baseBed !== null && todayWake !== null && baseWake !== null) {
    const bed_dev  = Math.abs(todayBed  - baseBed);
    const wake_dev = Math.abs(todayWake - baseWake);
    z_sc = -(0.60 * (bed_dev / sdBed) + 0.40 * (wake_dev / sdWake));
  }

  const weightedComponents = [
    z_sleep !== null ? 0.30 * z_sleep : null,
    z_hrv   !== null ? 0.25 * z_hrv   : null,
    z_rhr   !== null ? 0.21 * z_rhr   : null,
    z_spo2  !== null ? 0.10 * z_spo2  : null,
    z_sc    !== null ? 0.14 * z_sc    : null
  ].filter(c => c !== null);

  const outputRaw   = weightedComponents.length > 0 ? weightedComponents.reduce((a, b) => a + b, 0) : null;
  const outputScore = outputRaw !== null ? Math.max(0, Math.min(100, Math.round(50 + 12 * outputRaw))) : null;

  // Governing signal: highest-severity unfavorable material signal; fallback to first favorable
  const SEV_RANK = { severe: 3, moderate: 2, mild: 1, stable: 0 };
  const unfavorable = (interpretedSignals || []).filter(s => s.direction === "unfavorable" && s.material);
  const favorable   = (interpretedSignals || []).filter(s => s.direction === "favorable"   && s.material);

  let governingSignal = null;
  if (unfavorable.length > 0) {
    const sorted = [...unfavorable].sort((a, b) => (SEV_RANK[b.severity] || 0) - (SEV_RANK[a.severity] || 0));
    governingSignal = sorted[0].metric;
  } else if (favorable.length > 0) {
    governingSignal = favorable[0].metric;
  }

  const ACTION_DOMAIN_MAP = {
    depleted:                        "restoration",
    constrained:                     "reduction",
    controlled:                      "management",
    partially_constrained_with_offset: "optimization",
    mixed_load:                      "management",
    steady:                          "maintain",
    recovering:                      "support",
    primed:                          "leverage"
  };

  const bodyState   = combinedStateResult?.body_state || "steady";
  const actionDomain = ACTION_DOMAIN_MAP[bodyState] || "maintain";

  // Flag when SDs are placeholder (all 1s) — output_score is unreliable in this case
  const sdValues = [sdSleep, sdHrv, sdRhr, sdSpo2, sdBed, sdWake];
  const allSdsAreOne = sdValues.every(sd => sd === 1);

  return {
    output_score:      allSdsAreOne ? null : outputScore,
    sd_quality:        allSdsAreOne ? "placeholder" : "calibrated",
    body_state:        bodyState,
    net_severity:      combinedStateResult?.net_severity      || "stable",
    coherence:         combinedStateResult?.coherence         || "neutral",
    confidence:        framing?.confidence                    || "moderate",
    unfavorable_count: combinedStateResult?.unfavorable_count ?? 0,
    favorable_count:   combinedStateResult?.favorable_count   ?? 0,
    governing_signal:  governingSignal,
    action_domain:     actionDomain,
    signals: (interpretedSignals || []).map(s => ({
      metric:    s.metric,
      direction: s.direction,
      severity:  s.severity,
      material:  s.material,
      offset:    s.offset
    }))
  };
}

module.exports = {
  asNumber,
  computeDeviations,
  computeRecoveryStrainMath,
  classifyState,
  selectRules,
  interpretMetrics,
  combinedState,
  buildPreInsight
};