// /vrtx/logic/deterministic.cjs
function computeDeviations(today, baseline) {
  const dev = {};
  for (const k of Object.keys(today || {})) {
    if (typeof today[k] !== "number") continue;
    if (typeof baseline?.[k] !== "number" || baseline[k] === 0) continue;
    dev[k] = (today[k] - baseline[k]) / baseline[k];
  }
  return dev;
}

function classifyState(today, baseline, deviations, profile) {
  const flags = {
    sleep_deficit: (today.sleep_minutes ?? 0) < (baseline.sleep_minutes ?? 420) - 45,
    recovery_compromised: (today.hrv_ms ?? 0) < (baseline.hrv_ms ?? 50) * 0.85,
    stimulation_pattern: profile?.coffee === true && (today.resting_hr ?? 0) > (baseline.resting_hr ?? 55) + 5,
    weekly_load_below_target: (today.steps ?? 0) < (baseline.steps ?? 9000) * 0.8
  };

  let state = "Rhythm";
  if (flags.sleep_deficit) state = "Sleep Repair";
  if (flags.recovery_compromised) state = "Recovery Compromised";
  if (flags.stimulation_pattern) state = "Stimulation Pattern";
  if (!flags.sleep_deficit && flags.weekly_load_below_target) state = "Load Build";

  return { state, flags };
}

function selectRules(state, flags, profile) {
  const rules = [];
  const push = (rule_id, parameters, reason_code) => rules.push({ rule_id, parameters, reason_code });

  push("HYDRATE_BASELINE", { ounces: 60 }, "STABILITY");

  if (state === "Sleep Repair") {
    push("WALK_STEADY", { minutes: 30 }, "SLEEP_DEFICIT");
    push("NO_LATE_STIM", { cutoff_hour: 14 }, "SLEEP_DEFICIT");
    push("LIGHT_MORNING", { minutes: 10 }, "SLEEP_DEFICIT");
    push("EARLY_WINDDOWN", { minutes: 45 }, "SLEEP_DEFICIT");
  } else if (state === "Recovery Compromised") {
    push("ZONE2_ONLY", { minutes: 25 }, "LOW_RECOVERY");
    push("PROTEIN_FLOOR", { grams: 120 }, "LOW_RECOVERY");
    push("SLEEP_PROTECT", { target_minutes: 450 }, "LOW_RECOVERY");
    push("INTENSITY_CAP", { hard_sessions: 0 }, "LOW_RECOVERY");
  } else if (state === "Stimulation Pattern") {
    push("CAFFEINE_CAP", { max_mg: 200 }, "STIMULATION");
    push("WALK_AFTER_MEALS", { minutes: 10 }, "STIMULATION");
    push("BREATHING_BLOCK", { minutes: 6 }, "STIMULATION");
    push("EARLY_CUTOFF", { cutoff_hour: 13 }, "STIMULATION");
  } else if (state === "Load Build") {
    push("MOVE_VOLUME", { steps: 11000 }, "LOAD_BEHIND");
    push("STRENGTH_MIN", { minutes: 35 }, "LOAD_BEHIND");
    push("SLEEP_MIN", { target_minutes: 420 }, "LOAD_BEHIND");
    push("CARB_TIMING", { window: "post-training" }, "LOAD_BEHIND");
  } else {
    push("MOVE_STEADY", { minutes: 25 }, "RHYTHM");
    push("SLEEP_LOCK", { window_hours: 8 }, "RHYTHM");
    push("PROTEIN_ANCHOR", { grams: 120 }, "RHYTHM");
    push("LIGHT_DAILY", { minutes: 10 }, "RHYTHM");
  }

  return rules.slice(0, 6);
}

module.exports = { computeDeviations, classifyState, selectRules };
