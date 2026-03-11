require("dotenv").config({ path: "./.env" });

const fs = require("fs");
const path = require("path");
const axios = require("axios");

const VRTX_SYSTEM_PROMPT = require("../prompts/vrtx_system_prompt.cjs");
const { validateVrtx } = require("../guardrails/validator.cjs");
const { scriptToAudio } = require("../audio/audio_orchestrator.cjs");
const {
  normalizeHealthConnectPayload,
  buildBehaviorLayer
} = require("../data/vrtx_context_layer.cjs");
const {
  computeDeviations,
  classifyState,
  selectRules
} = require("../logic/deterministic.cjs");

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
const OUT_DIR = path.join(__dirname, "..", "..", "output", "vrtx");
const FITBIT_INPUT_PATH = path.join(__dirname, "..", "input", "fitbit_latest.json");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function writeFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf8");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function linesToJsArray(raw) {
  const s = String(raw || "").trim();

  if (s.startsWith("[")) {
    return s;
  }

  const lines = String(raw || "")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);

  return JSON.stringify(lines, null, 2);
}

function stripWeeklyAndTargets(obj) {
  if (obj === null || obj === undefined) return obj;

  if (Array.isArray(obj)) {
    return obj
      .map(stripWeeklyAndTargets)
      .filter(v => v !== undefined);
  }

  if (typeof obj === "object") {
    const out = {};

    for (const [k, v] of Object.entries(obj)) {
      const key = String(k).toLowerCase();

      if (
        key.includes("weekly") ||
        key.includes("week") ||
        key.includes("target") ||
        key.includes("load")
      ) {
        continue;
      }

      const cleaned = stripWeeklyAndTargets(v);
      if (cleaned !== undefined) {
        out[k] = cleaned;
      }
    }

    return out;
  }

  if (typeof obj === "string") {
    const s = obj.toLowerCase();

    if (
      s.includes("weekly") ||
      s.includes("week") ||
      s.includes("target") ||
      s.includes("load")
    ) {
      return undefined;
    }

    return obj;
  }

  return obj;
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapNormalizedToLegacyToday(normalized) {
  return {
    sleep_minutes: normalized?.sleep?.totalSleepMinutes ?? null,
    hrv_ms: normalized?.recovery?.hrvMs ?? null,
    resting_hr: normalized?.recovery?.restingHeartRate ?? null,
    steps: normalized?.activity?.steps ?? null
  };
}

function mapHistoryBaselineToLegacy(history = [], fallbackToday = {}) {
  const valid = history
    .map(item => normalizeHealthConnectPayload(item))
    .map(mapNormalizedToLegacyToday);

  function averageField(field) {
    const values = valid
      .map(v => safeNumber(v?.[field]))
      .filter(n => Number.isFinite(n));

    if (!values.length) {
      return safeNumber(fallbackToday?.[field]);
    }

    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  return {
    sleep_minutes: averageField("sleep_minutes"),
    hrv_ms: averageField("hrv_ms"),
    resting_hr: averageField("resting_hr"),
    steps: averageField("steps")
  };
}

function avgHeartFromIntraday(heartIntraday) {
  const dataset = heartIntraday?.["activities-heart-intraday"]?.dataset;
  if (!Array.isArray(dataset) || !dataset.length) return null;

  const values = dataset
    .map(row => safeNumber(row?.value))
    .filter(v => Number.isFinite(v));

  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function buildFitbitRawHealthPayload(fitbitRaw) {
  const sleepSummary = fitbitRaw?.sleep?.summary || {};
  const sleepArray = Array.isArray(fitbitRaw?.sleep?.sleep) ? fitbitRaw.sleep.sleep : [];
  const sleepLog = sleepArray.length ? sleepArray[0] : null;

  const activitySummary = fitbitRaw?.activity?.summary || {};
  const activityGoals = fitbitRaw?.activity?.goals || {};

  const heartArray = Array.isArray(fitbitRaw?.heart?.["activities-heart"])
    ? fitbitRaw.heart["activities-heart"]
    : [];

  const heartValue = heartArray.length ? heartArray[0]?.value || {} : {};
  const avgHeartRate = avgHeartFromIntraday(fitbitRaw?.heartIntraday);

  const activeZoneMinutes =
    safeNumber(activitySummary?.fairlyActiveMinutes || 0) +
    safeNumber(activitySummary?.veryActiveMinutes || 0);

  return {
    date: fitbitRaw?.date || new Date().toISOString().slice(0, 10),

    sleepSession: {
      startTime: sleepLog?.startTime || null,
      endTime: sleepLog?.endTime || null,
      totalSleepMinutes: safeNumber(sleepSummary?.totalMinutesAsleep)
    },

    sleepStages: [
      { stage: "deep", minutes: safeNumber(sleepSummary?.stages?.deep) || 0 },
      { stage: "light", minutes: safeNumber(sleepSummary?.stages?.light) || 0 },
      { stage: "rem", minutes: safeNumber(sleepSummary?.stages?.rem) || 0 }
    ],

    steps: [
      { count: safeNumber(activitySummary?.steps) || 0 }
    ],

    distance: [
      { meters: safeNumber(activitySummary?.distances?.find?.(d => d.activity === "total")?.distance) ? safeNumber(activitySummary.distances.find(d => d.activity === "total").distance) * 1000 : 0 }
    ],

    activeCalories: [
      { kcal: safeNumber(activitySummary?.caloriesOut) || 0 }
    ],

    exerciseSessions: activeZoneMinutes > 0
      ? [
          {
            startTime: null,
            endTime: null,
            durationMinutes: activeZoneMinutes
          }
        ]
      : [],

    restingHeartRate: safeNumber(heartValue?.restingHeartRate),
    hrvMs: null,
    heartRateSeries: Number.isFinite(avgHeartRate)
      ? [{ beatsPerMinute: avgHeartRate }]
      : [],

    sourceMeta: {
      source: "fitbit_api",
      goals: activityGoals
    }
  };
}

function derivePromptSignals({ normalizedToday, behaviorLayer, deviations, flags }) {
  const signals = [];

  if (behaviorLayer?.summary?.dominantDriver) {
    signals.push(`dominant_driver=${behaviorLayer.summary.dominantDriver}`);
  }

  if (behaviorLayer?.summary?.dominantRisk) {
    signals.push(`dominant_risk=${behaviorLayer.summary.dominantRisk}`);
  }

  if (Number.isFinite(behaviorLayer?.signals?.sleepDebtMinutes)) {
    signals.push(`sleep_debt_minutes=${Math.round(behaviorLayer.signals.sleepDebtMinutes)}`);
  }

  if (Number.isFinite(behaviorLayer?.signals?.hrvDeltaPct)) {
    signals.push(`hrv_delta_pct=${Number(behaviorLayer.signals.hrvDeltaPct.toFixed(1))}`);
  }

  if (Number.isFinite(behaviorLayer?.signals?.rhrDelta)) {
    signals.push(`rhr_delta=${Number(behaviorLayer.signals.rhrDelta.toFixed(1))}`);
  }

  if (Number.isFinite(behaviorLayer?.signals?.circadianStabilityCoefficient)) {
    signals.push(
      `circadian_stability=${Number(behaviorLayer.signals.circadianStabilityCoefficient.toFixed(2))}`
    );
  }

  if (Number.isFinite(behaviorLayer?.signals?.recoveryPressureScore)) {
    signals.push(`recovery_pressure=${behaviorLayer.signals.recoveryPressureScore}`);
  }

  if (Number.isFinite(behaviorLayer?.signals?.stimulationPatternScore)) {
    signals.push(`stimulation_pattern_score=${behaviorLayer.signals.stimulationPatternScore}`);
  }

  if (behaviorLayer?.operatingProfile?.likelyRecoveryState) {
    signals.push(`likely_recovery_state=${behaviorLayer.operatingProfile.likelyRecoveryState}`);
  }

  if (behaviorLayer?.operatingProfile?.rhythmState) {
    signals.push(`rhythm_state=${behaviorLayer.operatingProfile.rhythmState}`);
  }

  if (Number.isFinite(normalizedToday?.activity?.exerciseMinutes)) {
    signals.push(`exercise_minutes=${Math.round(normalizedToday.activity.exerciseMinutes)}`);
  }

  if (Number.isFinite(normalizedToday?.activity?.activeCaloriesKcal)) {
    signals.push(`active_calories=${Math.round(normalizedToday.activity.activeCaloriesKcal)}`);
  }

  if (Number.isFinite(normalizedToday?.activity?.steps)) {
    signals.push(`steps=${Math.round(normalizedToday.activity.steps)}`);
  }

  if (Number.isFinite(normalizedToday?.recovery?.avgHeartRate)) {
    signals.push(`avg_heart_rate=${Number(normalizedToday.recovery.avgHeartRate.toFixed(1))}`);
  }

  if (Number.isFinite(normalizedToday?.recovery?.restingHeartRate)) {
    signals.push(`resting_hr=${Math.round(normalizedToday.recovery.restingHeartRate)}`);
  }

  if (deviations && typeof deviations === "object") {
    Object.entries(deviations).forEach(([k, v]) => {
      if (Number.isFinite(Number(v))) {
        signals.push(`deviation_${k}=${Number(v)}`);
      }
    });
  }

  if (flags && typeof flags === "object") {
    Object.entries(flags).forEach(([k, v]) => {
      if (typeof v === "boolean" && v) {
        signals.push(`flag_${k}=true`);
      }
    });
  }

  return signals;
}

function buildUserPrompt({
  user,
  today,
  baseline,
  deviations,
  flags,
  normalizedToday,
  behaviorLayer,
  promptSignals
}) {
  const safeFlags = stripWeeklyAndTargets(flags || {});

  return JSON.stringify(
    {
      name: user.name,
      profile: user.profile || {},
      metrics_today: today,
      metrics_baseline: baseline,
      deviations,
      flags: safeFlags,
      normalized_health_context: normalizedToday,
      behavior_layer: behaviorLayer,
      prompt_signals: promptSignals
    },
    null,
    2
  );
}

async function callOpenRouter(systemPrompt, userPrompt) {
  const maxNetRetries = 3;
  let lastErr = null;

  for (let i = 0; i <= maxNetRetries; i += 1) {
    try {
      const res = await axios.post(
        OPENROUTER_URL,
        {
          model: MODEL,
          temperature: 0.75,
          max_tokens: 1100,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ]
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json"
          },
          timeout: 120000
        }
      );

      return res.data?.choices?.[0]?.message?.content || "";
    } catch (err) {
      lastErr = err;
      const status = err?.response?.status;

      const retryable =
        status === 429 ||
        status === 502 ||
        status === 503 ||
        status === 504 ||
        (typeof status === "number" && status >= 500);

      if (!retryable || i === maxNetRetries) {
        break;
      }

      const waitMs = 800 * (i + 1);
      console.log(`⚠️ OpenRouter ${status || "error"} — retrying in ${waitMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }

  const status = lastErr?.response?.status;
  if (status) {
    throw new Error(`Request failed with status code ${status}`);
  }

  throw new Error(lastErr?.message || "OpenRouter request failed");
}

async function main() {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("Missing OPENROUTER_API_KEY");
  }

  if (!process.env.SABIAN_VOICE_ID) {
    throw new Error("Missing SABIAN_VOICE_ID");
  }

  if (!process.env.HOST_A_US_ID) {
    throw new Error("Missing HOST_A_US_ID");
  }

  if (!fs.existsSync(FITBIT_INPUT_PATH)) {
    throw new Error(`Missing Fitbit input file: ${FITBIT_INPUT_PATH}`);
  }

  ensureDir(OUT_DIR);
  const ts = new Date().toISOString().replace(/[:.]/g, "-");

  const fitbitRaw = readJson(FITBIT_INPUT_PATH);

  const user = {
    name:
      fitbitRaw?.profile?.user?.displayName ||
      fitbitRaw?.profile?.user?.fullName ||
      "User",
    profile: {
      source: "fitbit_api"
    }
  };

  const rawHealthPayload = buildFitbitRawHealthPayload(fitbitRaw);
  const history = [];

  const normalizedToday = normalizeHealthConnectPayload(rawHealthPayload);
  const behaviorLayer = buildBehaviorLayer({
    today: normalizedToday,
    history,
    profile: user.profile || {}
  });

  const today = mapNormalizedToLegacyToday(normalizedToday);
  const baseline = mapHistoryBaselineToLegacy(history, today);
  const deviations = computeDeviations(today, baseline);
  const { state, flags } = classifyState(today, baseline, deviations, user.profile);
  const rules = selectRules(state, flags, user.profile);

  const promptSignals = derivePromptSignals({
    normalizedToday,
    behaviorLayer,
    deviations,
    flags
  });

  const baseUserPrompt = buildUserPrompt({
    user,
    today,
    baseline,
    deviations,
    flags,
    normalizedToday,
    behaviorLayer,
    promptSignals
  });

  function buildAttemptPrompt(attempt, prevErrors) {
    if (attempt === 1) {
      return baseUserPrompt;
    }

    const correction = [
      "",
      "CORRECTION REQUIREMENTS",
      "",
      "Return ONLY a JavaScript array of strings.",
      "Return EXACTLY 11 lines.",
      "Use exact speaker order Host A, Sabian, Host A, Sabian, Host A, Sabian, Host A, Sabian, Host A, Sabian, Host A.",
      "Make Host A sound sharp and interrogative.",
      "Make Sabian sound plain, specific, and grounded in the numbers.",
      "Do not sound abstract.",
      "Do not sound like a report.",
      "Use the behavior_layer, normalized_health_context, and prompt_signals if present.",
      "Do not default to HRV if HRV is null.",
      "Use the real Fitbit-derived values that are present.",
      "",
      "Previous validation errors:",
      ...(prevErrors && prevErrors.length ? prevErrors : ["(none)"]),
      ""
    ].join("\n");

    return baseUserPrompt + "\n" + correction;
  }

  const maxAttempts = 6;
  let raw = "";
  let validation = { ok: false, errors: [], lines: [] };

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const userPrompt = buildAttemptPrompt(attempt, validation.errors);

    const rawModel = await callOpenRouter(VRTX_SYSTEM_PROMPT, userPrompt);
    raw = linesToJsArray(rawModel);

    writeFile(path.join(OUT_DIR, `attempt_${attempt}_script_${ts}.txt`), raw);

    validation = validateVrtx(raw);

    if (validation.ok) {
      break;
    }

    writeFile(
      path.join(OUT_DIR, `attempt_${attempt}_errors_${ts}.json`),
      JSON.stringify({ errors: validation.errors }, null, 2)
    );
  }

  if (!validation.ok) {
    throw new Error("Failed validation: " + validation.errors.join(" | "));
  }

  writeFile(path.join(OUT_DIR, `vrtx_script_${ts}.txt`), raw);
  writeFile(
    path.join(OUT_DIR, `vrtx_lines_${ts}.json`),
    JSON.stringify(validation.lines, null, 2)
  );

  const baseName = `vrtx_${ts}`;
  const audio = await scriptToAudio({
    lines: validation.lines,
    outDir: OUT_DIR,
    baseName,
    sabianVoiceId: process.env.SABIAN_VOICE_ID,
    hostVoiceId: process.env.HOST_A_US_ID
  });

  writeFile(
    path.join(OUT_DIR, `vrtx_run_${ts}.json`),
    JSON.stringify(
      {
        model: MODEL,
        fitbitInputPath: FITBIT_INPUT_PATH,
        source: "fitbit_api",
        state,
        flags,
        rules,
        today,
        baseline,
        deviations,
        normalizedToday,
        behaviorLayer,
        promptSignals,
        outputs: audio
      },
      null,
      2
    )
  );

  console.log("✅ VRTX run complete.");
  console.log("Engine:", path.join(__dirname, "vrtx_engine.cjs"));
  console.log("Input:", FITBIT_INPUT_PATH);
  console.log("Output Script:", path.join(OUT_DIR, `vrtx_script_${ts}.txt`));
  console.log("Output Run:", path.join(OUT_DIR, `vrtx_run_${ts}.json`));
}

main().catch(err => {
  console.error("❌ VRTX engine error:", err.message);
  process.exitCode = 1;
});