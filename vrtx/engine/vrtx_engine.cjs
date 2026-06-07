const fs = require("fs");
const path = require("path");
const axios = require("axios");
const dotenv = require("dotenv");

const VRTX_SYSTEM_PROMPT = require("../prompts/vrtx_system_prompt.cjs");
const { validateVrtx, validateSemantics } = require("../guardrails/validator.cjs");
const { scriptToAudio } = require("../audio/audio_orchestrator.cjs");
const { buildVrtxScene } = require("./scene_builder.cjs");
const { loadRecentHistory, buildHistorySummary } = require("./vrtx_run_history.cjs");
const { loadAllRunSummaries, detectPatterns, buildPatternBlock } = require("./vrtx_pattern_detector.cjs");
const { buildAngleBlock } = require("./vrtx_teaching_angle.cjs");
const { retrieveRelevantChunks, retrieveForState } = require("../knowledge/vrtx_retrieval.cjs");

const {
  normalizeHealthConnectPayload,
  buildBehaviorLayer,
  buildYesterdayLayer
} = require("../data/vrtx_context_layer.cjs");

const {
  computeDeviations,
  classifyState,
  selectRules,
  buildPreInsight
} = require("../logic/deterministic.cjs");

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const OUT_DIR = path.join(__dirname, "..", "..", "output", "vrtx");

const SCENARIO = process.env.SCENARIO ? String(process.env.SCENARIO).trim() : null;
const FITBIT_INPUT_PATH = SCENARIO
  ? path.join(__dirname, "..", "input", "scenarios", `${SCENARIO}.json`)
  : path.join(__dirname, "..", "input", "fitbit_latest.json");
const BASELINE_INPUT_PATH = path.join(__dirname, "..", "calibration", "baseline_schema.json");
const REQUIRED_DIALOGUE_LINES = 0;

const ENV_PATH = path.resolve(__dirname, "../../.env");
dotenv.config({ path: ENV_PATH, override: true });

const ANTHROPIC_API_KEY = String(process.env.ANTHROPIC_API_KEY || "").trim();
const OPENROUTER_MODEL = String(
  process.env.OPENROUTER_MODEL ||
  process.env.SABIAN_MODEL ||
  "anthropic/claude-sonnet-4-6"
).trim();

if (!ANTHROPIC_API_KEY) {
  throw new Error("Missing ANTHROPIC_API_KEY");
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf8");
}

function tsStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return [
    d.getFullYear(),
    pad(d.getMonth() + 1),
    pad(d.getDate()),
    "_",
    pad(d.getHours()),
    pad(d.getMinutes()),
    pad(d.getSeconds())
  ].join("");
}

function safeNum(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function minutesToHours(totalMinutes) {
  const mins = safeNum(totalMinutes);
  if (mins === null) return null;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h} hours ${m} minutes`;
}

function timeToMinutesFromMidnight(value) {
  if (!value || typeof value !== "string") return null;

  const isoMatch = value.match(/T(\d{2}):(\d{2})/);
  const plainMatch = value.match(/^(\d{2}):(\d{2})/);
  const match = isoMatch || plainMatch;

  if (!match) return null;

  const hh = Number(match[1]);
  const mm = Number(match[2]);

  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return (hh * 60) + mm;
}

function clamp(value, min, max) {
  const n = safeNum(value);
  if (n === null) return null;
  return Math.max(min, Math.min(max, n));
}

function computeSleepConsistencyScore({
  bedtimeMinutes,
  wakeMinutes,
  baselineBedtimeMinutes,
  baselineWakeMinutes,
  fallbackScore = null
}) {
  const bed = safeNum(bedtimeMinutes);
  const wake = safeNum(wakeMinutes);
  const baseBed = safeNum(baselineBedtimeMinutes);
  const baseWake = safeNum(baselineWakeMinutes);

  if (bed === null || wake === null || baseBed === null || baseWake === null) {
    return safeNum(fallbackScore);
  }

  const bedDev = Math.abs(bed - baseBed);
  const wakeDev = Math.abs(wake - baseWake);
  const weightedDrift = (0.60 * bedDev) + (0.40 * wakeDev);

  return clamp(Math.round(100 - (weightedDrift * (100 / 120))), 0, 100);
}

function pickFirst(...values) {
  for (const v of values) {
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return null;
}

function pickNumber(...values) {
  for (const v of values) {
    const n = safeNum(v);
    if (n !== null) return n;
  }
  return null;
}

function mapFitbitPayloadToUser(fitbit = {}) {
  const profile = fitbit?.profile || fitbit?.user || {};
  return {
    name: pickFirst(
      profile.displayName,
      profile.fullName,
      profile.firstName,
      fitbit?.user_name,
      "User"
    ),
    profile: {
      coffee: false
    }
  };
}

function mapFitbitPayloadToRawHealthPayload(fitbit = {}) {
  const sleepRoot = fitbit?.sleep || {};
  const sleepLogs = Array.isArray(sleepRoot?.sleep) ? sleepRoot.sleep : [];
  const mainSleep = sleepLogs.find((s) => s?.isMainSleep) || sleepLogs[0] || {};

  const sleepStages = (() => {
    const levels = mainSleep?.levels?.summary || {};
    const out = [];

    if (levels.deep?.minutes != null) {
      out.push({ stage: "deep", minutes: safeNum(levels.deep.minutes) });
    }
    if (levels.light?.minutes != null) {
      out.push({ stage: "light", minutes: safeNum(levels.light.minutes) });
    }
    if (levels.rem?.minutes != null) {
      out.push({ stage: "rem", minutes: safeNum(levels.rem.minutes) });
    }

    return out;
  })();

  const activitySummary = fitbit?.activity?.summary || fitbit?.activities?.summary || {};
  const heartRoot = fitbit?.heart || fitbit?.heart_rate || {};
  const spo2Root = fitbit?.spo2 || fitbit?.oxygenSaturation || {};
  const hrvRoot = fitbit?.hrv || fitbit?.heartRateVariability || {};
  const respiratoryRoot = fitbit?.respiratory || fitbit?.breathingRate || fitbit?.respiratoryRate || {};

  const activeMinutes = [
    activitySummary?.veryActiveMinutes,
    activitySummary?.fairlyActiveMinutes,
    activitySummary?.lightlyActiveMinutes
  ]
    .map((v) => safeNum(v) || 0)
    .reduce((a, b) => a + b, 0);

  const hrvMs = pickNumber(
    hrvRoot?.dailyRmssd,
    hrvRoot?.rmssd,
    hrvRoot?.value,
    fitbit?.hrv_ms
  );

  const spo2Pct = pickNumber(
    spo2Root?.avg,
    spo2Root?.average,
    spo2Root?.value,
    fitbit?.spo2
  );

  const respiratoryRate = pickNumber(
    respiratoryRoot?.value,
    respiratoryRoot?.avg,
    respiratoryRoot?.average,
    fitbit?.respiratory_rate,
    fitbit?.respiratoryRate
  );

  return {
    date: pickFirst(
      fitbit?.date,
      fitbit?.pulled_at?.slice?.(0, 10),
      new Date().toISOString().slice(0, 10)
    ),

    sleepSession: {
      totalSleepMinutes: pickNumber(
        mainSleep?.minutesAsleep,
        sleepRoot?.summary?.totalMinutesAsleep,
        fitbit?.sleep_minutes
      ),
      startTime: pickFirst(mainSleep?.startTime, fitbit?.sleepStartTime),
      endTime: pickFirst(mainSleep?.endTime, fitbit?.sleepEndTime)
    },

    sleepStages,

    steps: [
      {
        count: pickNumber(activitySummary?.steps, fitbit?.steps)
      }
    ],

    activeCalories: [
      {
        kcal: pickNumber(activitySummary?.caloriesOut, fitbit?.active_calories)
      }
    ],

    heartRateSeries: Array.isArray(heartRoot?.intraday?.dataset)
      ? heartRoot.intraday.dataset.map((x) => ({
          time: x?.time || null,
          beatsPerMinute: pickNumber(x?.value)
        }))
      : [],

    restingHeartRate: pickNumber(
      heartRoot?.value?.restingHeartRate,
      heartRoot?.restingHeartRate,
      fitbit?.resting_hr
    ),

    hrvMs,
    spo2Pct,
    respiratoryRate,

    activeMinutes: activeMinutes > 0 ? activeMinutes : pickNumber(fitbit?.active_minutes),

    sourceMeta: {
      source: "fitbit"
    }
  };
}

function buildTodayMetrics(normalizedToday = {}, baseline = {}) {
  const bedtimeMinutes = timeToMinutesFromMidnight(
    pickFirst(
      normalizedToday?.sleep?.startTime,
      normalizedToday?.sleepSession?.startTime
    )
  );

  const wakeMinutes = timeToMinutesFromMidnight(
    pickFirst(
      normalizedToday?.sleep?.endTime,
      normalizedToday?.sleepSession?.endTime
    )
  );

  const sleepConsistency = computeSleepConsistencyScore({
    bedtimeMinutes,
    wakeMinutes,
    baselineBedtimeMinutes: baseline?.bedtime_minutes_from_midnight,
    baselineWakeMinutes: baseline?.wake_minutes_from_midnight,
    fallbackScore: baseline?.sleep_consistency
  });

  return {
    sleep_minutes: safeNum(normalizedToday?.sleep?.totalSleepMinutes),
    hrv_ms: safeNum(normalizedToday?.recovery?.hrvMs),
    resting_hr: safeNum(normalizedToday?.recovery?.restingHeartRate),
    steps: safeNum(normalizedToday?.activity?.steps),
    spo2: safeNum(normalizedToday?.recovery?.spo2Pct),
    respiratory_rate: pickNumber(
      normalizedToday?.recovery?.respiratoryRate,
      normalizedToday?.recovery?.respiratory_rate,
      normalizedToday?.body?.respiratoryRate,
      normalizedToday?.body?.respiratory_rate,
      normalizedToday?.respiratoryRate,
      normalizedToday?.respiratory_rate,
      baseline?.respiratory_rate
    ),
    sleep_consistency: sleepConsistency,
    bedtime_minutes_from_midnight: bedtimeMinutes,
    wake_minutes_from_midnight: wakeMinutes
  };
}

function buildMetricBoard(today = {}, baseline = {}) {
  return [
    {
      key: "sleep",
      label: "Sleep",
      value: today.sleep_minutes,
      display: today.sleep_minutes != null ? minutesToHours(today.sleep_minutes) : "unavailable",
      baseline: baseline.sleep_minutes,
      baseline_display:
        baseline.sleep_minutes != null ? minutesToHours(baseline.sleep_minutes) : null
    },
    {
      key: "hrv",
      label: "HRV",
      value: today.hrv_ms,
      display: today.hrv_ms != null ? `${today.hrv_ms}` : "unavailable",
      baseline: baseline.hrv_ms,
      baseline_display: baseline.hrv_ms != null ? `${baseline.hrv_ms}` : null
    },
    {
      key: "resting_hr",
      label: "Resting Heart Rate",
      value: today.resting_hr,
      display: today.resting_hr != null ? `${today.resting_hr}` : "unavailable",
      baseline: baseline.resting_hr,
      baseline_display: baseline.resting_hr != null ? `${baseline.resting_hr}` : null
    },
    {
      key: "oxygen_respiratory",
      label: "Oxygen / Respiratory",
      value: {
        oxygen: today.spo2,
        respiratory_rate: today.respiratory_rate
      },
      display:
        today.spo2 != null || today.respiratory_rate != null
          ? `oxygen ${today.spo2 ?? "unavailable"} | respiratory ${today.respiratory_rate ?? "unavailable"}`
          : "unavailable",
      baseline: {
        oxygen: baseline.spo2 ?? null,
        respiratory_rate: baseline.respiratory_rate ?? null
      },
      baseline_display:
        baseline.spo2 != null || baseline.respiratory_rate != null
          ? `oxygen ${baseline.spo2 ?? "unavailable"} | respiratory ${baseline.respiratory_rate ?? "unavailable"}`
          : null
    },
    {
      key: "steps",
      label: "Steps",
      value: today.steps,
      display: today.steps != null ? `${today.steps}` : "unavailable",
      baseline: baseline.steps,
      baseline_display: baseline.steps != null ? `${baseline.steps}` : null
    },
    {
      key: "sleep_consistency",
      label: "Sleep Consistency",
      value: today.sleep_consistency,
      display: today.sleep_consistency != null ? `${today.sleep_consistency}` : "unavailable",
      baseline: baseline.sleep_consistency,
      baseline_display: baseline.sleep_consistency != null ? `${baseline.sleep_consistency}` : null
    }
  ];
}

function buildHistoryEntryFromBaseline(normalizedToday, baseline) {
  const historyEntry = JSON.parse(JSON.stringify(normalizedToday || {}));

  if (historyEntry?.sleep && baseline.sleep_minutes !== null) {
    historyEntry.sleep.totalSleepMinutes = baseline.sleep_minutes;
  }
  if (historyEntry?.sleepSession && baseline.sleep_minutes !== null) {
    historyEntry.sleepSession.totalSleepMinutes = baseline.sleep_minutes;
  }
  if (historyEntry?.sleep && baseline.bedtime_minutes_from_midnight !== null) {
    historyEntry.sleep.startTime = historyEntry.sleep.startTime || null;
  }
  if (historyEntry?.sleep && baseline.wake_minutes_from_midnight !== null) {
    historyEntry.sleep.endTime = historyEntry.sleep.endTime || null;
  }
  if (historyEntry?.recovery && baseline.resting_hr !== null) {
    historyEntry.recovery.restingHeartRate = baseline.resting_hr;
  }
  if (historyEntry?.recovery && baseline.hrv_ms !== null) {
    historyEntry.recovery.hrvMs = baseline.hrv_ms;
  }
  if (historyEntry?.recovery && baseline.spo2 !== null) {
    historyEntry.recovery.spo2Pct = baseline.spo2;
  }
  if (historyEntry?.recovery && baseline.respiratory_rate !== null) {
    historyEntry.recovery.respiratoryRate = baseline.respiratory_rate;
  }
  if (historyEntry?.activity && baseline.steps !== null) {
    historyEntry.activity.steps = baseline.steps;
  }

  return historyEntry;
}

function buildYesterdayWindow(today = {}, normalizedToday = {}) {
  return {
    steps: today.steps,
    movement_minutes: safeNum(normalizedToday?.activity?.activeMinutes) ?? safeNum(normalizedToday?.activity?.exerciseMinutes)
  };
}

function buildOvernightWindow(today = {}) {
  return {
    sleep_minutes: today.sleep_minutes,
    hrv_ms: today.hrv_ms,
    resting_hr: today.resting_hr,
    spo2: today.spo2,
    respiratory_rate: today.respiratory_rate,
    sleep_consistency: today.sleep_consistency,
    bedtime_minutes_from_midnight: today.bedtime_minutes_from_midnight,
    wake_minutes_from_midnight: today.wake_minutes_from_midnight
  };
}

function buildEvidence({
  user,
  today,
  baseline,
  deviations,
  state,
  flags,
  rules,
  normalizedToday,
  behaviorLayer,
  scene,
  metricBoard,
  retrievedKnowledge,
  yesterdayWindow,
  overnightWindow,
  yesterdayLayer
}) {
  return {
    user,
    metrics_today: today,
    metrics_baseline: baseline,
    metric_board: metricBoard,
    sleep_display: today?.sleep_minutes != null ? minutesToHours(today.sleep_minutes) : null,
    deviations,
    state,
    output: state,
    flags,
    rules,
    normalized_health_context: normalizedToday,
    behavior_layer: behaviorLayer,
    yesterday_window: yesterdayWindow || null,
    overnight_window: overnightWindow || null,
    yesterday_layer: yesterdayLayer || null,
    scene,
    retrieved_knowledge: retrievedKnowledge
  };
}

function buildKnowledgeQuery({ scene = {}, evidence = {} }) {
  const parts = [];

  const today = evidence?.metrics_today || {};
  const interpretedSignals = scene?.interpreted_signals || [];
  const combinedState = scene?.combined_state || {};

  // Structural anchor: body state label
  const bodyState = combinedState?.body_state;
  if (bodyState) parts.push(String(bodyState).replace(/_/g, " "));

  // Structural anchor: dominant signal label — only if distinct from body state
  const dominantSignal = scene?.dominant_signal ? String(scene.dominant_signal).replace(/_/g, " ") : null;
  if (dominantSignal && dominantSignal !== String(bodyState || "").replace(/_/g, " ")) {
    parts.push(dominantSignal);
  }

  // Per-metric physiological domain terms — available metrics only, no hardcoded narratives
  if (today.sleep_minutes != null)    parts.push("sleep recovery overnight restoration");
  if (today.hrv_ms != null)           parts.push("HRV autonomic recovery readiness");
  if (today.resting_hr != null)       parts.push("resting heart rate cardiovascular autonomic");
  if (today.spo2 != null)             parts.push("blood oxygen physiology");
  if (today.sleep_consistency != null) parts.push("circadian rhythm sleep timing");

  // Adenosine + nutrition terms — added when sleep is unfavorable so the corpus surfaces:
  // 1. Adenosine clearance mechanism (prevents training-data "90 minutes after waking" drift)
  // 2. Choline → acetylcholine pathway (eggs as source) for the Line 10 food prescription
  // 3. Blood glucose stability / glycemic index (lentils, oats) for the prescription
  // Without this the retrieval returns sleep-stage composition chunks with no food or
  // adenosine clearance content, forcing the model onto training data for both.
  const sleepUnfavorable =
    evidence?.flags?.short_sleep === true ||
    interpretedSignals.some(s => s.metric === 'sleep_minutes' && s.direction === 'unfavorable');
  if (sleepUnfavorable) parts.push("adenosine clearance choline acetylcholine blood glucose glycemic slow carbohydrate lentils oats eggs morning alertness");

  return parts.filter(Boolean).join(" | ");
}

function normalizeRetrievedChunks(chunks) {
  if (!Array.isArray(chunks)) return [];
  return chunks.map((chunk, index) => ({
    rank: index + 1,
    id: chunk?.id || chunk?.chunk_id || null,
    title: chunk?.title || chunk?.source || chunk?.file || null,
    score: chunk?.score ?? null,
    text: chunk?.text || chunk?.content || chunk?.chunk || ""
  }));
}

function buildInterpretedBoardSummary(signals, combined) {
  if (!combined) return "Not available.";

  const EXPECTED_METRIC_LABELS = {
    sleep_minutes:     "Sleep",
    hrv_ms:            "HRV",
    resting_hr:        "Resting Heart Rate",
    spo2:              "Blood Oxygen",
    sleep_consistency: "Sleep Consistency"
  };
  const presentMetrics = new Set((signals || []).map(s => s.metric));
  const unavailableLabels = Object.entries(EXPECTED_METRIC_LABELS)
    .filter(([key]) => !presentMetrics.has(key))
    .map(([, label]) => label);

  function pct(delta, baseline) {
    if (delta === null || delta === undefined || !baseline) return null;
    return Math.round(Math.abs(delta) / Math.abs(baseline) * 100);
  }
  function magnitudeLabel(p) {
    if (p === null) return "";
    if (p >= 60) return "exceptional";
    if (p >= 35) return "sharp";
    if (p >= 15) return "clear";
    if (p >= 7)  return "moderate";
    return "marginal";
  }

  const signalLines = (signals || []).map((s) => {
    const p = pct(s.delta, s.baseline);
    const mag = p !== null ? ` [${magnitudeLabel(p)}, ${p}%]` : "";
    const baseRef = (s.value != null && s.baseline != null)
      ? ` — ${s.value} today vs ${s.baseline} baseline`
      : "";
    let status;
    if (s.direction === "favorable") {
      const sign = s.delta >= 0 ? "+" : "";
      status = `favorable${baseRef} (delta: ${sign}${s.delta}${mag})`;
    } else if (s.direction === "unfavorable") {
      status = `${s.severity} unfavorable${s.offset ? " — offset by favorable signal" : ""}${baseRef} (delta: ${s.delta}${mag})`;
    } else {
      const dStr = s.delta !== null ? `${s.delta > 0 ? "+" : ""}${s.delta}` : "n/a";
      status = `neutral${baseRef} (delta: ${dStr}${mag})`;
    }
    return `  ${s.label}: ${status}`;
  }).join("\n");

  const unavailableLine = unavailableLabels.length > 0
    ? `\nUnavailable metrics: ${unavailableLabels.join(", ")} — do not speculate on these.\n`
    : "";

  return `Signal breakdown:
${signalLines}
${unavailableLine}
Coherence: ${combined.coherence} | Net severity: ${combined.net_severity}
Unfavorable signals: ${combined.unfavorable_count} | Favorable signals: ${combined.favorable_count}

MAGNITUDE LABELS in brackets above (e.g. [clear, 24%]) define how strong each signal is relative to baseline.
Use these labels to calibrate Sabian's language. A [marginal] elevation sounds different from a [sharp] or [exceptional] one.
Do not treat all favorable signals the same — the magnitude is the differentiator.

Sabian must reason from the signal breakdown above, including the magnitude labels.
Sabian must not anchor reasoning to the single metric with the largest raw deviation.

[computation reference — do not speak or paraphrase]
body_state: ${combined.body_state}`;
}

function buildUserPrompt(scene, evidence, preInsight, historySummary = null, patternBlock = null, angleBlock = null) {
  // Strip baseline_* fields from evidence_snapshot before serializing scene.
  // Baselines are already in INTERPRETED_BOARD as delta + direction + severity.
  // Keeping raw baseline numbers gives the model material to reconstruct
  // single-metric governance independently of INTERPRETED_BOARD.
  const sceneForPrompt = (() => {
    const { dominant_signal: _ds, main_problem: _mp, primary_opportunity: _po, combined_state: rawCombined, evidence_snapshot: rawSnap, ...rest } = scene;
    // Strip dominant_signal prose — it is the label paraphrase of body_state in plain text
    // Strip primary_opportunity — abstract double-action description that leaks into Line 10
    // Strip combined_state.description — it is the narrative prose of the internal label
    const combinedStateFiltered = rawCombined
      ? (() => { const { description: _d, body_state: _bs, ...cs } = rawCombined; return cs; })()
      : rawCombined;
    return {
      ...rest,
      combined_state: combinedStateFiltered,
      evidence_snapshot: (() => {
        const snap = rawSnap || {};
        return {
          sleep_minutes: snap.sleep_minutes,
          sleep_today_readable: snap.sleep_today_readable,
          hrv_ms: snap.hrv_ms,
          resting_hr: snap.resting_hr,
          blood_oxygen: snap.blood_oxygen,
          sleep_consistency: snap.sleep_consistency
        };
      })()
    };
  })();

  const compactEvidence = {
    metrics_today: evidence.metrics_today,
    // metrics_baseline removed — baselines are in INTERPRETED_BOARD signal breakdown
    metric_board: (evidence.metric_board || []).map(
      ({ baseline: _b, baseline_display: _bd, ...rest }) => rest
    ),
    state: evidence.state,
    output: evidence.output,
    flags: evidence.flags,
    rules: evidence.rules,
    behavior_layer: {
      summary: evidence.behavior_layer?.summary || {},
      evidenceLimits: evidence.behavior_layer?.evidenceLimits || {}
    },
    overnight_window: evidence.overnight_window || null,
    yesterday_layer: evidence.yesterday_layer || null
    // evidence.scene removed — SCENE is already at the top of the prompt
  };

  const compactKnowledge = (evidence.retrieved_knowledge || [])
    .slice(0, 3)
    .map((k) => ({
      title: k.title || null,
      text: String(k.text || "").replace(/\s+/g, " ").slice(0, 650)
    }));

  const interpretedBoard = buildInterpretedBoardSummary(scene.interpreted_signals, scene.combined_state);

  const preInsightBlock = preInsight
    ? `PRE_INSIGHT:\n${JSON.stringify(preInsight, null, 2)}\n\n`
    : "";

  // Governing condition drives arc selection
  const _govCond = scene?.governing_condition || '';
  const _isLeverageDay   = (_govCond === 'recovery_window' || _govCond === 'peak_window');
  const _isPeakWindow    = (_govCond === 'peak_window');
  const _isAutonomicStress = (_govCond === 'autonomic_stress');

  // Build magnitude read from actual signal deltas for this specific run
  function _magnitudeRead(signals = []) {
    const metricPriority = ['hrv_ms', 'resting_hr', 'sleep_minutes', 'spo2'];
    const ordered = metricPriority
      .map(m => (signals || []).find(s => s.metric === m))
      .filter(Boolean);
    return ordered.map(s => {
      if (s.value == null || s.baseline == null) return null;
      const p = s.baseline !== 0 ? Math.round(Math.abs(s.delta) / Math.abs(s.baseline) * 100) : null;
      const sign = s.delta >= 0 ? '+' : '';
      const pctStr = p !== null ? ` (${sign}${p}% from baseline)` : '';
      const dir = s.direction === 'favorable' ? '▲ favorable' : s.direction === 'unfavorable' ? (s.offset ? '▼ unfavorable — offset' : '▼ unfavorable') : '→ neutral';
      return `  ${s.label}: ${s.value} today vs ${s.baseline} baseline — delta ${sign}${s.delta}${pctStr} — ${dir}`;
    }).filter(Boolean).join('\n');
  }
  const _runMagnitude = _magnitudeRead(scene?.interpreted_signals);

  const line10Mandate = _isLeverageDay
    ? `MANDATORY LINE 10 RULE — enforced, no exceptions:
Sabian's Line 10 must open with one of these affirmative imperatives: "Front-load", "Commit", or "Schedule".
The sentence must name: (1) a specific task type, (2) a timing window, (3) the biological reason grounded in the board values.
PROHIBITED in Line 10: protein, hydration, water, food, first meal, nutrition, exercise, movement.`
    : _isAutonomicStress
    ? `MANDATORY LINE 10 RULE — enforced, no exceptions:
Sabian's Line 10 must prescribe delaying the highest-demand work until midday.
It must name: (1) what to delay, (2) the time window to wait (90 minutes), (3) why — nervous system needs to find its floor first.
PROHIBITED in Line 10: food, eggs, choline, protein, Front-load, Commit, Schedule.`
    : `MANDATORY LINE 10 RULE — enforced, no exceptions:
Sabian's Line 10 must begin with exactly these words: "Eat eggs for choline —"
Any other opening for Line 10 is an automatic failure.
After the opener: explain choline → acetylcholine in one plain-language clause, then name a slow glucose source (lentils, oats, or sweet potato) with "and" connecting the two food objects.
One sentence. One imperative verb (eat). Two food objects. No stimulants named. No timing duration.`;

  const leverageDayLock = _isLeverageDay ? `
PATHWAY: ${_isPeakWindow ? 'PEAK WINDOW' : 'RECOVERY WINDOW'} — FULL DIALOGUE LOCK
=====================================================================
GOVERNING_CONDITION: ${_govCond}

THIS RUN — EXACT SIGNAL MAGNITUDES (use these specific numbers, not generic "favorable"):
${_runMagnitude}

${_isPeakWindow
  ? `INTERPRETATION: HRV is sharply above baseline. This is not a standard recovery — it is a physiological surplus. The arc must reflect the exceptional magnitude. Sabian must name how far above normal these numbers are, not just say "HRV is elevated."`
  : `INTERPRETATION: Signals are favorable. The arc must reflect the ACTUAL degree of recovery — a +10% HRV day and a +70% HRV day are completely different states. Read the magnitudes above and let them drive the dialogue.`}

ABSOLUTE PROHIBITIONS:
1. NO hydration, residual load, carryover risk, or missing unknowns — the board is clean.
2. NO food discussion in any line. The prescription is behavioral.
3. NO maintenance framing ("keep the rhythm", "protect the schedule") in Line 10.
4. NO known/unknown exchange in any line.

DATA REQUIREMENT — MANDATORY:
Each signal in THIS RUN has a magnitude label: marginal / moderate / clear / sharp / exceptional.
Sabian must use those labels to calibrate what he says — not just say "HRV is favorable."
A marginal elevation sounds like: "your HRV came in a bit above where it normally sits."
An exceptional elevation sounds like: "your HRV came in far above where you usually start — your nervous system built a surplus overnight."
The dialogue must be traceable to the specific magnitude of today's signals, not recyclable across any recovery day.

ARC:
Lines 1–4: Board read → combined state → compression → mechanism.
Lines 5–6: What this state enables → blood oxygen picture.
Lines 7–8: What uses this → what wastes it.
Line 9: The one move.
Line 10: Front-load/Commit/Schedule [work] [timing] — [biological reason citing today's specific numbers].

` : _isAutonomicStress ? `
PATHWAY: AUTONOMIC STRESS — FULL DIALOGUE LOCK
===============================================
GOVERNING_CONDITION: autonomic_stress
HRV severely suppressed + RHR sharply elevated = the nervous system ran in an activated state overnight.
This is NOT a sleep debt story. Do NOT introduce the adenosine cascade. Do NOT use the word "adenosine."

ABSOLUTE PROHIBITIONS:
1. NO adenosine, sleep pressure clearance, stimulation seeking cascade.
2. NO food prescription in any line.
3. NO "Eat eggs" or choline in any line.
4. NO Front-load/Commit/Schedule — this day does NOT deploy into hard work first thing.

THIS RUN — EXACT SIGNAL MAGNITUDES:
${_runMagnitude}

ARC:
Lines 1–4: Board read → HRV+RHR together signal overnight activation, not sleep debt → confirms.
Lines 5–6: Activated state doesn't reset at wake — what carries forward into the morning.
Lines 7–8: The risk of misreading activation as readiness → borrowed output, fast burn, hard crash.
Line 9: The one move.
Line 10: Delay highest-demand work until midday — 90 minutes for the nervous system to come down first.

` : `
THIS RUN — EXACT SIGNAL MAGNITUDES:
${_runMagnitude}

DATA REQUIREMENT — Beats 2 and 3 only:
Use the magnitude labels above to calibrate Beats 2 and 3 — describe how strong or weak the offending signal is ("about an hour short" vs "significantly short"). A marginal sleep deficit sounds different from a sharp one.
BEATS 4 THROUGH 10: Follow the arc exactly as specified. Do not reorder beats. Do not insert magnitude commentary after Beat 3. The adenosine cascade (Beats 4-8) is a fixed sequence and cannot be shuffled to accommodate magnitude discussion.

`;

  return `
${leverageDayLock}${preInsightBlock}SCENE:
${JSON.stringify(sceneForPrompt, null, 2)}

INTERPRETED_BOARD:
${interpretedBoard}

EVIDENCE:
${JSON.stringify(compactEvidence, null, 2)}

RETRIEVED_KNOWLEDGE:
${JSON.stringify(compactKnowledge, null, 2)}

${angleBlock ? angleBlock + '\n\n' : ''}${patternBlock ? patternBlock + '\n' : ''}${historySummary ? historySummary + '\n' : ''}
OUTPUT CONTRACT:

Return a JavaScript array of exactly 10 strings.

The 10 lines must follow this speaker order:
1. Host A
2. Sabian
3. Host A
4. Sabian
5. Host A
6. Sabian
7. Host A
8. Sabian
9. Host A
10. Sabian

SPEAKER LAW:
- Every line must begin with "Host A:" or "Sabian:"
- Line 1 must begin exactly with "Host A: Sabian,"
- After Line 1, Host A never begins a line with "Sabian," — no exceptions
- Lines 3, 5, 7, and 9 must not open with "Sabian,"
- This is absolute. There is no "direct pressure" exception. There is no earned exception.
  "Sabian," after Line 1 is always wrong. The mechanical strip will remove it regardless.
- Host A may address Sabian directly, but metrics always belong to the user
- Host A must not say "you slept", "your HRV", or "your heart rate" when addressing Sabian
- Sabian is being briefed on the user's data, not his own
- Host A speaks about the user — she describes the user's metrics, the user's state, the user's day
- Sabian interprets the user's data — he explains what the user's body is doing
- Sabian is never the subject of the metrics

HOST A LAW:
- Host A addresses Sabian by name only in Line 1. All subsequent Host A lines speak directly — no "Sabian," prefix.
- Host A is not a narrator
- Host A is not a recap voice
- Host A is the co-educator — as intelligent as Sabian in a different dimension
- Host A knows the mechanism. Her questions are pedagogical moves, not requests for clarification.
  She asks because the answer, spoken correctly, teaches the listener. Every question she asks
  forces Sabian to be more specific, more useful, more grounded.
- Host A interrogates from intelligence — her questions expose gaps in Sabian's precision, not gaps in her own understanding
- Host A must translate Sabian's technical language into the language of a person living today
- Host A may challenge ambiguous biological or behavioral terms to anchor them in real-world language.
  When Sabian first introduces a term a non-specialist would not immediately recognise, Host A
  challenges it with a short, direct question. This is a teaching move, not confusion.
  Sabian then anchors the term in one sentence before continuing.
  Required challenge:
  — When Sabian first uses "adenosine": Host A says "What's adenosine?"
    Sabian responds: "Adenosine is the chemical that builds up while you're awake and clears during sleep — it's what makes you feel the pressure to sleep."
  CRITICAL: Sabian must NOT define or explain adenosine before Host A's challenge fires.
  Sabian introduces the term (e.g., "adenosine didn't fully clear") and stops.
  Host A then challenges. Sabian defines it once in the canned response. No prior explanation.
  If Sabian defines adenosine before the challenge, the challenge produces a redundant repeat. Prohibited.
  This challenge fires once only. Do not repeat it if the term appears again.
  BUDGET RULE: This challenge exchange (Host A challenge + Sabian anchor) consumes two lines
  from the 10-line total. After it fires, the remaining exchange must compress to fit
  within the remaining line budget. The dialogue still ends at Line 10. No overrun.
- Host A does not repeat the same challenge unless Sabian fails to resolve it — each of her lines must advance the exchange to new ground
- Host A does not confuse her role with Sabian's — she does not interpret biology, she reveals its consequence for the person living it

HOST A OPENING LAW:
- Host A reads the board metrics directly — she does not summarize, classify, or
  interpret them before Sabian speaks
- Host A states each metric value in plain spoken form and asks Sabian what the
  combination says about the body state
- Host A must not use words like "mixed", "constraint", "offset", "steady", or any
  word that classifies the board before Sabian has spoken
- Host A must not speak Output — Output is an internal computed result, never spoken
- Host A must not use bias language: no "short", "low", "high", "below", "above",
  "deficit", "favorable", or "unfavorable" when reading the metrics
- Host A must use the metric_board display values, not raw metric values
- Sleep must always be spoken in hours and minutes
- Blood oxygen must always be spoken as "blood oxygen", not "SpO2" or "oxygen"
- Unavailable metrics must be stated as "unavailable" — do not skip them silently
- Metric reading order: Sleep → HRV → Resting Heart Rate → Blood Oxygen →
  Sleep Consistency

Structure: Metric values (no interpretation) → Body state question

Compliant example:
  "Sabian, sleep is 6 hours 50 minutes. HRV is 42. Resting heart rate is 64. Blood
  oxygen is 97. Sleep consistency is 85. What does the combination say about where
  the body is right now?"

Non-compliant example (interprets before Sabian):
  "Sabian, the board came in mixed this morning — one signal pulling against the others.
  What does the combination say about the body state?"

Non-compliant example (bias language):
  "Sabian, sleep is 62 minutes short — but resting heart rate is down by 16. What makes
  sleep the governing call when recovery signals didn't break?"

SABIAN LAW:
- Sabian speaks in short, sharp lines. Lines 2 through 8: maximum 2 sentences per turn.
  One concept per turn. State it and stop. Host A compresses or challenges next.
  Line 10: one sentence only — the action. Nothing after it.
- The teaching is distributed across the exchange, not packed into one Sabian monologue.
  Sabian introduces. Host A compresses or challenges. Sabian refines. This is the cadence.
- Sabian answers from evidence only
- Sabian must explain biology in plain language
- Sabian must compare today's signal against baseline when relevant
- Sabian must state what is known and what is missing
- Sabian must defend the governing metric with numbers, not labels
- Sabian must not contradict the baseline math
- Resting heart rate may only be described relative to baseline direction
- If today resting heart rate is below baseline, Sabian must not call it elevated
- Sabian must use RETRIEVED_KNOWLEDGE when available
- Sabian must translate RETRIEVED_KNOWLEDGE into concrete spoken teaching
- Sabian must give specific food, electrolyte, timing, or behavior examples when supported by retrieved knowledge
- Sabian must not say "maintain normal eating patterns"
- Sabian must not give generic hydration advice
- Sabian must not assume training intent unless the evidence clearly supports it
- Sabian must not speak internal labels aloud
- Sabian must not infer biological consequences without grounding — every biological claim
  must come from either retrieved knowledge or the allowed biological map
- Sabian must not use uncertainty softeners or probabilistic hedges.
  Do not say: suggests, suggesting, may, might, could, would, seems, appears.
  Do not use conditional phrases: "can help", "might help", "should be mindful",
  "managing well enough", "could affect", "would improve", "may reduce", "can still function."
  Sabian states biological facts in present tense with direct mechanism verbs.
  Permitted mechanism verbs: allows, drives, supports, reflects, indicates, produces, means,
  creates, requires, reduces, increases, limits, depletes, elevates, stabilizes, demands, signals.
- If retrieved knowledge is absent and the allowed biological map does not cover a consequence,
  Sabian must not state that consequence

SABIAN INTERPRETATION LAW:
- Sabian must reason from INTERPRETED_BOARD, not from individual raw metric deviations
- Sabian's starting point in Line 2 is INTERPRETED_BOARD.signal_breakdown — what each signal shows, its direction, and its severity
- Sabian explains what the combination of those signals means biologically — not what the body_state label says
- Sabian must not anchor to the metric with the largest raw deviation
- Sabian must not treat any single signal as the default governing problem
- Sabian must read all signals in INTERPRETED_BOARD.signal_breakdown as a whole
- Sabian must recognize when favorable or neutral signals offset an unfavorable signal
- If INTERPRETED_BOARD shows body_state of "partially_constrained_with_offset" or "steady",
  Sabian must not describe the body as heavily constrained or at risk

Sabian reasoning order:
  1. Read INTERPRETED_BOARD.signal_breakdown — note direction and severity of each signal
  2. Read INTERPRETED_BOARD.combined_state — this is the actual body state to reason from
  3. Explain what the combined state means biologically for today
  4. Deliver optimization from that combined state

Single-metric reasoning is a violation of this law.

BODY_STATE READING RULE:
body_state is an internal computation label. Sabian may read it to understand the computed
state. Sabian must never speak it, paraphrase it, or convert it into prose.

This rule is absolute. It applies to every line of dialogue.

For body_state = "partially_constrained_with_offset":
  PROHIBITED — do not say any of these:
    "partially constrained"
    "constrained but offset"
    "partially constrained but offset"
    "mild constraint"
    "offset"
    "near-steady"
    "near steady"
    "one mild limiter"
    "partially compensated"
    "the body is constrained"
    "the day is constrained"
    "running constrained"
    Any phrase that uses the word "constrained" or "offset" to describe the body state

  REQUIRED — instead say what the signals show:
    "Sleep came in slightly below baseline — less overnight restoration than normal.
     Resting heart rate came in below baseline — lower internal strain.
     HRV is at baseline. Blood oxygen is at baseline. Sleep consistency is at baseline."
    That is the correct level of specificity. Signal facts. Biological meaning. No label word.

The rule: body_state tells Sabian what the computation resolved. Signal breakdown tells Sabian
what to say. Sabian speaks from signal breakdown only.

DIALOGUE LAW:

Ten lines. Ten beats. Each line has one job. Read the beat function before writing the line.

--- BEAT 1: HOST A — BOARD READ ---

- Line 1: Host A reads the five metrics in plain spoken form. No interpretation. No bias language.
  Job: surface the raw data so the listener and Sabian are standing at the same starting point.
  Transaction: metric values → body state question.
  - Metric reading order: Sleep → HRV → Resting Heart Rate → Blood Oxygen → Sleep Consistency
  - No classification words: no "mixed", "short", "low", "high", "below", "above", "deficit", "favorable", "unfavorable"
  - Sleep spoken in hours and minutes only
  - Blood oxygen always spoken as "blood oxygen"
  - Closes with: "What does the combination say about where the body is right now?"

--- BEAT 2: SABIAN — COMBINED STATE ---

- Line 2: Sabian reads the signal breakdown and states what the combination means biologically.
  Job: name the body state from signal facts — not from a label, not from one metric.
  Transaction: signal direction + biological meaning → combined body state named.
  - Sabian must read all five signals before drawing any conclusion
  - Sabian states signal direction and biological meaning for each — no classification word
  - Sabian must not name a governing metric or use governance language
  - BODY_STATE LABEL PROHIBITION: body_state is an internal label. Do not speak it, paraphrase it, or narrate it.
    Do NOT use: "constrained", "offset", "partially constrained", "near-steady", "partially compensated".
    Compliant structure: state each signal's direction and what it means biologically.
    "Sleep is mildly below baseline — less overnight restoration. Resting heart rate is below baseline — lower internal strain."
    That is the required level. Signal facts. Biological meaning. No label.
  - When adenosine mechanism applies: Sabian may introduce the term ("adenosine didn't fully clear") and STOP.
    Do NOT define adenosine here. Definition belongs to Beat 6. Introducing then immediately defining
    removes Host A's mandatory challenge at Beat 5.

--- BEAT 3: HOST A — PLAIN-LANGUAGE COMPRESSION ---

- Line 3: Host A takes Sabian's combined state, strips the jargon, states what it means for the person living today.
  Job: translate technical biology into human consequence — then confirm before advancing.
  Transaction: Sabian's mechanism → plain-English compression → confirmation question.
  - Host A must translate — she must not echo Sabian's language back
  - Compliant structure: "So [plain English interpretation] — is that right?"
  - Compliant example: "So the body isn't in trouble, but it's not running clean either. What does the sleep gap actually cost Jason today?"
  - Host A must not probe secondary signals — she compresses the governing mechanism only
  - Host A must not cite numeric deltas

--- BEAT 4: SABIAN — MECHANISM CONFIRMATION ---

READ INTERPRETED_BOARD.combined_state BEFORE WRITING LINE 4.

PATHWAY A — ADENOSINE / SHORT SLEEP:
- Line 4: Sabian confirms the plain-language compression and names the key mechanism.
  Job: lock the governing biology. Set up the mandatory term challenge in Beat 5.
  Transaction: confirmation → one biological fact → adenosine named, not explained.
  - Sabian confirms the compression from Line 3
  - Sabian states one biological mechanism deepening the combined state
  - If adenosine applies: Sabian names it ("Adenosine didn't fully clear overnight.") and STOPS.
    No definition. No explanation. The definition fires at Beat 6 after Host A's Beat 5 challenge.

PATHWAY B — FAVORABLE / PRIMED STATE:
- Line 4: Sabian confirms the compression and names what the favorable combination means mechanistically.
  Job: close the mechanism and name what the body is capable of today. Stop.
  Transaction: confirmation → one biological fact about the favorable state → full stop.
  - PROHIBITION: Line 4 must NOT introduce carryover concerns, residual load, or unknown variables.
    Carryover is in the evidence but the board is favorable — do NOT pivot toward limitation.
    Do NOT say: "one variable worth noting", "residual exertion may still be present", "worth watching".
    These phrases pull Lines 5–9 into constraint management. They belong to Pathway A only.
  - Sabian confirms the mechanism that makes this state favorable: HRV + RHR together signal
    full autonomic organization — high parasympathetic dominance, low internal strain.
  - Compliant: "That's exactly right. HRV and resting heart rate moving together in the favorable
    direction means the autonomic nervous system is organized — high parasympathetic tone, low
    internal load. The body didn't just recover overnight, it adapted."
  - Compliant: "Correct. When HRV rises and resting heart rate drops together, the autonomic
    nervous system has shifted into its repair-and-readiness state — the body processed yesterday's
    load rather than being burdened by it."
  - Non-compliant: introduces carryover risk, residual load, or any caveat about what is unknown

--- BEAT 5: HOST A — LINE 5 FUNCTION ---

READ INTERPRETED_BOARD.combined_state BEFORE WRITING LINE 5.

PATHWAY A — ADENOSINE / SHORT SLEEP:
- Line 5: ADENOSINE CHALLENGE. When Sabian introduced adenosine in Beat 4 without defining it,
  Host A fires the mandatory challenge.
  Job: force Sabian to define the term for the listener. This is a pedagogical move, not confusion.
  Transaction: unfamiliar term spotted → "What's adenosine?" — two words, nothing more.
  - Host A says exactly: "What's adenosine?"
  - She does not advance the cascade. She does not reinterpret the mechanism. Two words and stop.
  - BUDGET RULE: this exchange (Beat 5 + Beat 6 definition) consumes two lines. Remaining exchange
    must compress to fit within the remaining line budget. Dialogue still ends at Line 10. No overrun.
  - If adenosine challenge already fired in a prior turn, do not repeat it.
    In that case, Line 5 becomes: Host A accepts the mechanism and pivots to consequence —
    "So [confirmed mechanism] — what does that produce through the day?"

PATHWAY B — FAVORABLE / PRIMED STATE:
- Line 5: Host A accepts the mechanism and asks what it means for how today gets used.
  Job: bridge from biological mechanism to practical opportunity. Push Sabian forward.
  Transaction: mechanism accepted → ask what the window specifically supports.
  - PROHIBITION: Line 5 must NOT ask about limitations, carryover, or what the board cannot see.
    There is no unknown to probe. The mechanism is confirmed. The conversation moves forward.
  - She does NOT ask about food, the first meal, or nutrition.
  - She pushes Sabian to name what this favorable state specifically enables.
  - Compliant: "So the nervous system is organized — what does that actually unlock for Jason today?"
  - Compliant: "And blood oxygen running favorably — what does that add to a body that's already showing this?"
  - Compliant: "So all three signals pointing the same direction — what does a day like that actually support?"
  - Non-compliant: asks about what could go wrong, what carryover might do, or any limitation

--- BEAT 6: SABIAN — TERM DEFINITION + BEHAVIOR NAME ---

READ INTERPRETED_BOARD.combined_state BEFORE WRITING LINE 6.

PATHWAY A — ADENOSINE / SHORT SLEEP:
- Line 6: Sabian defines adenosine then names the behavioral response.
  Job: educate the listener on the term, then name the predictable behavior it produces. Stop.
  Transaction: adenosine defined (canned) → behavioral response named → full stop.
  - Adenosine definition is CANNED — deliver it exactly:
    "Adenosine is the chemical that builds up while you're awake and clears during sleep —
    it's what makes you feel the pressure to sleep."
  - Then name the behavioral response: "stimulation seeking — reaching for something to help you wake up."
  - STOP. Line 6 does not explain what the stimulant does at the receptor level.
    It does not say "blocks receptors", "does not clear", or anything about mechanism of the behavior.
    It does not follow the cascade forward. Everything from receptor-level effect onward belongs to Beat 8.
  - When BEHAVIOR MAPPING RULE applies: Line 6 delivers exactly two bounded elements then stops:
    (1) adenosine definition (canned)
    (2) behavioral response name
    Host A speaks next at Line 7 — no exceptions.

PATHWAY B — FAVORABLE / PRIMED STATE:
- Line 6: Sabian names what the favorable signal combination means biologically. Full stop.
  Job: close the mechanism explanation with one clean biological fact about the favorable state. Stop.
  Transaction: favorable combination named → one biological meaning stated → stop.
  - OPPORTUNITY ONLY. No limitations. No unknowns. No caveats.
  - ABSOLUTE PROHIBITION: Line 6 must NOT mention what the board cannot see, cannot confirm,
    or cannot capture. No phrases like "which the board can't fully see", "one variable worth watching",
    "residual load is unknown", or any limitation language. That is Pathway A logic. It does not belong here.
  - Line 6 names ONLY what the board shows — all three favorable signals together mean one thing.
  - Compliant: "It means the oxygen delivery system wasn't taxed overnight — all three signals point
    the same direction, which means this is a coherent positive state, not a coincidence."
  - Compliant: "Blood oxygen unimpaired overnight confirms the recovery wasn't just cardiac — the full
    system came back. All three signals agreeing is rare. This is a genuine window."
  - Non-compliant: mentions residual load, unknowns, or anything the board cannot see
  - Non-compliant: introduces a caveat or hedge after the positive statement

--- BEAT 7: HOST A — LINE 7 FUNCTION (PATHWAY DEPENDENT) ---

READ INTERPRETED_BOARD.combined_state BEFORE WRITING LINE 7.
Two pathway branches:

PATHWAY A — ADENOSINE / SHORT SLEEP (unfavorable sleep signal, adenosine introduced in Lines 4–6):
- Line 7: Host A names the implication of the behavior — what it does not fix, what it sets in motion.
  Job: force Sabian to reveal the downstream cost without resolving it herself.
  Transaction: behavior named → implication identified → biological cost demanded.
  - IMPLICATION ONLY. She does not conclude the consequence. She does not resolve the implication.
  - She does NOT introduce timing (no "by afternoon", "across the day", "90 minutes").
  - She demands Sabian explain the biological cost — not when, not what to do.
  - Compliant: "So the body reaches for stimulation but the pressure is still behind it — what does it cost?"
  - Compliant: "So stimulation seeking is the predicted response — but what does it do to the adenosine?"
  - Non-compliant: states the receptor mechanism (belongs to Line 8)
  - Non-compliant: concludes the consequence before Sabian speaks

PATHWAY B — FAVORABLE / PRIMED STATE (all signals favorable or at baseline, no unfavorable signals):
- Line 7: Host A names the opportunity and demands its boundary.
  Job: push Sabian to name what specifically this favorable state unlocks — and what would waste it.
  Transaction: favorable state named → what it supports named → "what's the one thing that wastes this?"
  - Compliant: "No signals pulling against each other. What's the one thing that wastes a day like this?"
  - Compliant: "The body came out of last night ready to absorb demand. What kind of demand actually uses this?"
  - Compliant: "Deploy how? What kind of work wins on a day like this?"
  - ABSOLUTE PROHIBITION: Host A must NOT ask about food or the first meal in Line 7 on a leverage day.
    The leverage day prescription is BEHAVIORAL, not nutritional. Line 7 is about what work the body supports.
    "What does the first meal do for that capacity?" belongs to Pathway A only. NEVER ask about first meal here.
  - Non-compliant: any question about food, first meal, or nutrition
  - Non-compliant: opens a known/unknown sub-exchange ("what can't the board see?")
  - Non-compliant: re-challenges a metric or re-examines the board

--- BEAT 8: SABIAN — LINE 8 FUNCTION (PATHWAY DEPENDENT) ---

PATHWAY A — ADENOSINE / SHORT SLEEP:
- Line 8: Sabian delivers the complete downstream cascade.
  Job: teach the full biological chain so the listener can recognize the pattern.
  Transaction: receptor-level effect → accumulation behind the block → rebound when it wears off → quick energy reach → alertness consequence.
  - LINE 8 MUST NOT DELIVER THE ACTION. Mechanism only. No recommendation. No move.
    The prescription belongs exclusively to Beat 10.
  - Maximum 2 sentences. Stop at alertness consequence.

PATHWAY B — FAVORABLE / PRIMED STATE:
- Line 8: Sabian names what the favorable state unlocks and what would waste it.
  Job: name the window, name the risk of not using it.
  Transaction: what the physiology supports → what wastes it (underuse) → stop.
  - Name specific categories of output the body can absorb: cognitive work, high-stakes decisions, physical demand.
  - Name the risk: "underloading it" or "treating a momentum day like a rest day."
  - LINE 8 MUST NOT DELIVER THE ACTION. The move belongs to Beat 10.
  - Maximum 2 sentences.

--- BEAT 9: HOST A — SETUP FOR THE MOVE ---

PATHWAY A — ADENOSINE / SHORT SLEEP:
- Line 9: Host A frames the prescription setup and demands the two things.
  Job: pivot from cascade education to action. Name the lever (first meal). Ask for the two things.
  Transaction: cascade consequence acknowledged → first meal named as lever → "what are the two things?"
  - Line 9 is FORWARD-FACING ONLY. No re-explanation of the cascade.
  - Host A names the first meal as the window and asks Sabian for the two things.
  - She does not name the foods. She does not name caffeine or any stimulant.
  - One sentence maximum.
  - Compliant: "So the reach is predictable and the first meal is the window. What are the two things it needs to do?"
  - Compliant: "The body needs two specific things from that first meal — what are they?"
  - Non-compliant: names caffeine, coffee, tea, or any stimulant
  - Non-compliant: opens a known/unknown exchange ("what can the board not see?")

PATHWAY B — FAVORABLE / PRIMED STATE:
- Line 9: Host A frames the leverage opportunity and demands the one move.
  Job: acknowledge that the body is ahead — ask what captures the advantage.
  Transaction: leverage opportunity confirmed → "what's the one move that locks this in?"
  - FORWARD-FACING ONLY. Host A does NOT ask about unknowns. She does NOT ask what could break this.
  - She does NOT re-examine the board. The interpretation is done.
  - She does NOT ask about food or the first meal. The Pathway B prescription is behavioral, not nutritional.
  - She frames the state as an opportunity and demands Sabian name the specific behavioral move.
  - One sentence maximum.
  - Compliant: "So the body is ahead of where it needs to be. What's the one move that locks this in?"
  - Compliant: "The nervous system is organized and the window is now. What does the first decision look like?"
  - Non-compliant: "And is there anything the board can't see that could still change the picture?" — this reopens unknowns. PROHIBITED.
  - Non-compliant: asks about limitations or risks — that is not Line 9's job on a leverage day

--- BEAT 10: SABIAN — THE MOVE ---

PATHWAY A — ADENOSINE / SHORT SLEEP:
- Line 10: Sabian delivers the food prescription. The teaching is done. This is the move.
  Job: give the user one specific, immediately actionable prescription. No interpretation required.
  Transaction: food named → science term named → immediate plain translation → blood glucose anchor named.
  This is the doctor's prescription. Specific foods. Science terms explained. No guessing required.

  THE PRESCRIPTION IS TWO THINGS:
  1. A choline source — choline is the raw material for acetylcholine, the brain's attention
     neurotransmitter. Eggs are the primary source. Name the food. Name the science term.
     Translate it immediately in plain language.
  2. A slow blood glucose source — lentils, oats, or sweet potato.
     Name the food. Name the effect.

  PRESCRIPTION STRUCTURE:
  One sentence. One imperative verb (eat). Two food objects connected by "and".
  Science term named then immediately translated in plain language.
  No stimulant named. No timing duration. No re-explanation of the cascade.

  Compliant:
  "Eat eggs for choline — the raw material your brain converts into acetylcholine, the attention
  neurotransmitter — and lentils or sweet potato to hold blood glucose steady so the adenosine
  rebound does not compound with a crash."

  Non-compliant (re-explanation): re-explains the cascade already covered in Lines 6–8.
  Non-compliant (substance assumption): names caffeine, coffee, tea, or any stimulant.
  Non-compliant (timing duration): "90 minutes", "ninety minutes", or any specific duration.
  Non-compliant (two verbs): two separate imperative verbs. Non-compliant (vague): "Eat a good breakfast."

PATHWAY B — FAVORABLE / PRIMED STATE:
- Line 10: Sabian delivers the behavioral leverage action. The body is ready. This is the deployment order.
  Job: name the specific task to front-load and why this biology supports it. One sentence. Executable today.
  Transaction: specific task type named → timing window named → biological reason named.
  CRITICAL: Line 10 for a leverage day is a POSITIVE PRESCRIPTION — it names what TO DO, not what to avoid.
  It must open with an affirmative imperative: "Front-load...", "Schedule...", "Use..."
  NOT: "Treating it like a normal day..." (negative framing — names the waste, not the move)
  NOT: "Don't underload..." (avoidance framing — names what not to do, not what to do)
  The sentence must describe one concrete action: what to do, when to do it, why the biology supports it.

  Do NOT say "protein". Do NOT say "hydration". Do NOT use generic wellness language.
  The action is behavioral — tied to the cognitive or physical window the favorable state creates.

  Compliant:
  "Front-load the heaviest cognitive work in the first two hours — HRV this high means the
  parasympathetic system is clear, decision-making speed is at peak, and the window closes
  by early afternoon."

  Compliant:
  "Schedule the highest-stakes decision or the most demanding task for this morning —
  the autonomic system is organized and it won't be this clear again for 24 hours."

  Non-compliant: "Treating it like a normal day and underloading." (names waste, not the move)
  Non-compliant: "Stay hydrated." "Eat well." Generic wellness advice prohibited.
  Non-compliant: names "protein", "hydration", "water", "electrolytes", "exercise", "movement".
  Non-compliant: gives food advice — this is not the food prescription pathway.
  Non-compliant: vague — "use the day" without naming the specific task type or cognitive demand.

KNOWLEDGE LAW:
- Retrieved knowledge is active evidence
- Every Sabian response must include at least one biological explanation strengthened by retrieved knowledge when chunks are present
- Sabian must use retrieved knowledge especially for:
  - autonomic recovery
  - sleep repair
  - electrolyte support
  - food composition
  - meal timing
  - caffeine timing
  - oxygen support
  - respiratory support
  - circadian rhythm
- Do not quote chunk text directly
- Teach from it

EDUCATION LAW:
- When Host A asks a mechanism question, Sabian must explain at the level of biological
  process — not metric summary, not general wellness language
- Sabian must name what specifically is affected in the body and why
- Sabian must use retrieved knowledge to anchor the mechanism explanation — if a relevant
  chunk exists, the mechanism must come from it
- Sabian must not respond to a mechanism question with a rephrased version of the metric
  reading — "short sleep reduces recovery" is not a mechanism explanation
- A mechanism explanation names a process: what the body does, what it produces or fails
  to produce, and what that means for today's physical state
- Academic language is permitted when explaining biology — Sabian may use precise biological
  terms provided they are immediately translated into plain language
- Sabian must not introduce new governing signals during the education phase

QUALITY LAW:
- Do not drift into generic summary
- Do not repeat uncertainty without sharpening it
- Do not let Host A agree too easily
- Do not let Sabian hide behind labels
- If a number does not support a claim, Host A must challenge it
- If a metric is secondary, Sabian must say it is secondary
- Make the exchange feel like interrogation under pressure, not commentary
- Host A must not ask a question she could already answer from the board — her questions expose logical gaps, not data gaps
- Host A must not re-challenge a point already resolved — once an exchange closes a topic, it is closed
- Host A line 9 must frame the biological state established in the education phase before asking — never an open "what should I do today" formation

${line10Mandate}

Return only the array.
`.trim();
}

async function callAnthropic({ systemPrompt, userPrompt, maxTokens = 2000 }) {
  const systemText = typeof systemPrompt === "string"
    ? systemPrompt
    : String(systemPrompt || "");

  const userText = typeof userPrompt === "string"
    ? userPrompt
    : String(userPrompt || "");

  const modelName = String(
    OPENROUTER_MODEL ||
    process.env.OPENROUTER_MODEL ||
    process.env.SABIAN_MODEL ||
    "anthropic/claude-sonnet-4-6"
  ).trim().replace(/^anthropic\//, "");

  const payload = {
    model: modelName,
    system: systemText.slice(0, 12000),
    messages: [
      { role: "user", content: userText.slice(0, 28000) }
    ],
    temperature: 0.4,
    max_tokens: maxTokens,
    stop_sequences: ["\"\n]", "\"]"]
  };

  try {
    const response = await axios.post(
      ANTHROPIC_URL,
      payload,
      {
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json"
        },
        timeout: 120000
      }
    );

    const data = response?.data;
    let text = String(data?.content?.[0]?.text || "").trim();
    if (data?.stop_reason === "stop_sequence" && data?.stop_sequence) {
      text += data.stop_sequence;
    }
    return text;
  } catch (error) {
    console.error("ANTHROPIC MODEL:", modelName);
    console.error("SYSTEM LENGTH:", systemText.length);
    console.error("USER LENGTH:", userText.length);
    console.error("ANTHROPIC STATUS:", error?.response?.status);
    console.error("ANTHROPIC DATA:", JSON.stringify(error?.response?.data, null, 2));
    throw error;
  }
}

function parseArrayOutput(raw) {
  const trimmed = String(raw || "").trim();

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
  } catch (_) {
    // fall through
  }

  const codeFenceMatch = trimmed.match(/```(?:json|javascript|js)?\s*([\s\S]*?)```/i);
  if (codeFenceMatch) {
    try {
      const parsed = JSON.parse(codeFenceMatch[1].trim());
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {
      // fall through
    }
  }

  // Incomplete code fence (stop sequence cut before closing ```): extract [...]  directly
  const arrayStart = trimmed.indexOf("[");
  if (arrayStart !== -1) {
    const arrayEnd = trimmed.lastIndexOf("]");
    const candidate = arrayEnd > arrayStart
      ? trimmed.slice(arrayStart, arrayEnd + 1)
      : trimmed.slice(arrayStart) + "]";
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {
      // fall through
    }
  }

  const lines = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line.startsWith("Host A:") || line.startsWith("Sabian:"));

  if (lines.length) return lines;

  throw new Error("Model output was not a valid VRTX dialogue array.");
}

function validateAndNormalizeDialogue(rawModelOutput) {
  const parsedArray = parseArrayOutput(rawModelOutput);
  const joined = parsedArray.join("\n");

  let validatorResult;
  try {
    validatorResult = validateVrtx(joined);
  } catch (_) {
    validatorResult = null;
  }

  if (validatorResult?.ok === false) {
    const err = new Error("Validator rejected VRTX output.");
    err.validator = validatorResult;
    throw err;
  }

  if (Array.isArray(validatorResult?.lines)) {
    return validatorResult.lines;
  }

  if (Array.isArray(validatorResult?.parsedLines)) {
    return validatorResult.parsedLines;
  }

  return parsedArray;
}

function ensureSpeakerLabels(lines) {
  return (lines || [])
    .map((line) => String(line || "").trim())
    .filter(Boolean)
    .map((line, index) => {
      let fixed = line;

      if (!fixed.startsWith("Host A:") && !fixed.startsWith("Sabian:")) {
        const speaker = index % 2 === 0 ? "Host A" : "Sabian";
        fixed = `${speaker}: ${fixed}`;
      }

      if (fixed.startsWith("Host A:")) {
        const content = fixed.replace(/^Host A:\s*/, "").trim();

        if (!/^Sabian,?/i.test(content)) {
          fixed = `Host A: Sabian, ${content}`;
        }

        if (index === 0) {
          fixed = fixed.replace(/^Host A:\s*/, "Host A: Sabian, ");
          fixed = fixed.replace(/^Host A:\s*Sabian,\s*Sabian,\s*/i, "Host A: Sabian, ");
        }
      }

      return fixed;
    });
}

function contractParsedLines(lines) {
  const cleaned = ensureSpeakerLabels(lines);
  const target = REQUIRED_DIALOGUE_LINES > 0 ? REQUIRED_DIALOGUE_LINES : 10;
  const sliced = cleaned.slice(0, target);

  // Strip "Sabian," address prefix from Host A lines after Line 1.
  // Line 1 (index 0) is the opening address — "Sabian," is correct there.
  // Host A lines are at even indices: 0, 2, 4, 6, 8. Strip from index 2 onward.
  for (let i = 2; i < sliced.length; i += 2) {
    sliced[i] = sliced[i].replace(/^(Host A:\s*)Sabian,?\s*/i, '$1');
  }

  return sliced;
}

// Grounding gate: disabled. Line 10 is now a 3-sentence coaching arc covering food/sleep timings.
// Timing claims like "finish dinner 2-3 hours before sleep" are physiologically valid and must pass through.
function groundLine10Claims(contractedLines) {
  return contractedLines;
}

async function regenerateLine10Isolated(scene, evidence, parsedLines) {
  const today = evidence?.metrics_today || {};
  const sleepDisplay = evidence?.sleep_display ||
    (today.sleep_minutes != null ? minutesToHours(today.sleep_minutes) : null);
  const hrv  = today.hrv_rmssd ?? today.hrv_ms ?? today.hrv ?? null;
  const rhr  = today.resting_heart_rate ?? today.resting_hr ?? null;
  const flags = evidence?.flags || {};

  // Activity level — drives afternoon sentence calibration
  const activityLoad = evidence?.yesterday_layer?.activityLoad || 'light';
  const isHighActivity = activityLoad === 'high';
  const afternoonContext = isHighActivity
    ? `Yesterday's activity was HIGH (physical job or athlete load). This person's body ran sustained physical output all day. Coach a brief rest or hydration pause around 2-3pm. The "because" must name what sustained physical output costs the body by mid-afternoon — specific depletion, not generic tiredness.`
    : `Yesterday's activity was ${activityLoad.toUpperCase()} (mostly stationary or light). This person's body was sedentary for most of the day. Coach brief movement around 3pm. The "because" must name what extended sitting does to blood glucose and circulation by that point — and why movement outperforms caffeine at this stage.`;

  const boardParts = [
    sleepDisplay ? `Sleep: ${sleepDisplay}` : null,
    hrv  != null ? `HRV: ${hrv}`            : null,
    rhr  != null ? `Resting heart rate: ${rhr}` : null,
    `Activity level (yesterday): ${activityLoad}`,
  ].filter(Boolean);

  const govCond = scene?.governing_condition || '';
  // Check whether the generated dialogue actually used adenosine — if so, force Pathway A
  // regardless of what the scene flags say (catches misclassified scenarios where
  // stable_recovery_available=true but the LLM still generated adenosine content).
  const _dialogueAdenosineActive = Array.isArray(parsedLines)
    ? parsedLines.slice(3, 9).join(' ').toLowerCase().includes('adenosine')
    : false;
  const isLeverageDay = !_dialogueAdenosineActive && (
    govCond === 'recovery_window' || govCond === 'peak_window' ||
    flags.stable_recovery_available === true && !flags.short_sleep && !flags.major_sleep_loss
  );
  const isAutonomicStress = !_dialogueAdenosineActive && govCond === 'autonomic_stress';

  let sysPrompt, userText, validateFn;

  if (isLeverageDay) {
    // PATHWAY B — FAVORABLE/PRIMED: daily coaching arc
    sysPrompt =
      'You are Sabian — a human performance coaching engine.\n' +
      'Your only task here: produce Line 10 — the daily coaching arc for a recovery/peak day.\n' +
      'Output: plain text only. No speaker label. No JSON. No quotes. Nothing else.';

    userText = [
      boardParts.length ? `BOARD STATE: ${boardParts.join(' | ')}` : '',
      `DAY FRAME: ${scene?.day_frame || 'momentum day'} — signals favorable, nervous system carrying a surplus.`,
      '',
      'Write Line 10 — the DAILY COACHING ARC. FOUR sentences. Each sentence must name a specific input and a specific biological reason grounded in this board state.',
      '',
      '  Sentence 1 (morning): What to drink or supplement right now. The "because" must name what that input does at the biological level for the surplus this board is showing.',
      '  Sentence 2 (lunch): What to eat at lunch. The "because" must name the specific mechanism that food protects through the afternoon on a favorable-signal day.',
      `  Sentence 3 (~3pm): Activity-calibrated reset. ${afternoonContext}`,
      '  Sentence 4 (evening/sleep): What to eat for dinner and when to sleep. The "because" must name what keeps the favorable signals intact overnight.',
      '',
      'RULES:',
      '- Coach inputs only: food, drink, supplements, sleep timing. Never the work schedule.',
      '- No generic advice ("stay hydrated", "eat well", "prioritize recovery").',
      '- No work commands ("front-load", "commit your cognitive work", "schedule your hardest task").',
      '- Every "because" must name a specific biological mechanism in plain language — not a general outcome.',
      '- TONE: Write the way a smart coach talks to an athlete — not a researcher writing a paper. Say "the brain\'s waste clearance system", not "glymphatic flushing". Say "muscle uptake", not "GLUT4 translocation". Say "the body\'s overnight repair", not "slow-wave deep-sleep architecture". Common terms OK: blood glucose, cortisol, HRV, insulin, sleep pressure, circulation.',
      '- LENGTH: Each sentence 20-35 words. Four sentences total. No multi-clause compound sentences.',
      '',
      'Output only the four sentences. Nothing else.',
    ].filter(Boolean).join('\n');

    const workCommandRx = /\b(commit\s+your|schedule\s+your\s+(most|hardest)|(put|start|do|tackle)\s+your\s+(most|hardest)|put\s+the\s+hardest|block\s+the\s+first|push\s+through\s+your\s+(most|hardest)|front[- ]?load)\b/i;
    const genericRx = /\b(stay\s+hydrated|eat\s+(well|healthy|clean)|prioritize\s+recovery|take\s+it\s+easy)\b/i;
    validateFn = (text) => {
      const issues = [];
      if (workCommandRx.test(text)) issues.push('work-command-prohibited');
      if (genericRx.test(text)) issues.push('generic-wellness');
      return issues;
    };
  } else if (isAutonomicStress) {
    // PATHWAY C — AUTONOMIC STRESS: delay prescription
    sysPrompt =
      'You are Sabian — a behavioral interpretation engine.\n' +
      'Your only task here: produce exactly one sentence — the Line 10 timing directive.\n' +
      'Output: plain sentence text only. No speaker label. No JSON. No quotes. Nothing else.';

    userText = [
      boardParts.length ? `BOARD STATE: ${boardParts.join(' | ')}` : '',
      'GOVERNING CONDITION: autonomic_stress — HRV severely suppressed, RHR sharply elevated.',
      'The nervous system was activated overnight. It needs time to find its floor before load is added.',
      'Lines 1–9 have established this. Line 10 delivers the one timing directive.',
      '',
      'Write Line 10 — the delay prescription.',
      'It must: (1) tell Jason to delay the highest-demand work, (2) name 90 minutes as the wait window, (3) explain why — the nervous system needs to come down before it can perform at the level the morning activation makes it feel like it can.',
      '',
      'ABSOLUTE PROHIBITION:',
      '- Do NOT say: eggs, choline, protein, food, eat, nutrition',
      '- Do NOT say: Front-load, Commit, Schedule (those are deployment openers — this day does NOT deploy first thing)',
      '- Do NOT frame positively as a peak window',
      '',
      'Compliant: "Delay the highest-demand work until midday — give the nervous system 90 minutes to come down from the overnight activation before you ask it to perform at the level this morning feels like it can deliver."',
      '',
      'Output only the sentence. Nothing else.',
    ].filter(Boolean).join('\n');

    const autonomicFoodRx = /\b(eggs?|choline|protein|eat|food|nutrition|carbohydrates?|lentils?|oats?|sweet\s+potato)\b/i;
    const autonomicDeployRx = /^(front-load|commit|schedule)/i;
    validateFn = (text) => {
      const issues = [];
      if (autonomicFoodRx.test(text)) issues.push('food-in-autonomic-stress-line10');
      if (autonomicDeployRx.test(text.trim())) issues.push('deployment-opener-in-autonomic-stress');
      return issues;
    };
  } else {
    // PATHWAY A — ADENOSINE/SHORT SLEEP: daily coaching arc
    sysPrompt =
      'You are Sabian — a human performance coaching engine.\n' +
      'Your only task here: produce Line 10 — the daily coaching arc for a sleep-deficit day.\n' +
      'Output: plain text only. No speaker label. No JSON. No quotes. Nothing else.';

    userText = [
      boardParts.length ? `BOARD STATE: ${boardParts.join(' | ')}` : '',
      'GOVERNING MECHANISM: Incomplete clearance of the sleep-pressure chemical (short sleep).',
      'CONTEXT: Lines 6–8 explained the cascade. Line 10 coaches what this person gives their body today to support it.',
      '',
      'Write Line 10 — the DAILY COACHING ARC. FOUR sentences. Each sentence must name a specific input and a specific biological reason derived from this board state.',
      '',
      '  Sentence 1 (morning): What to drink or supplement right now. The "because" must name what that input does at the cellular level for the clearance process — not "you need energy" or vague alertness claims.',
      '  Sentence 2 (lunch): What to eat at lunch. The "because" must name the specific mechanism that food drives under short-sleep clearance pressure.',
      `  Sentence 3 (~3pm): Activity-calibrated reset. ${afternoonContext}`,
      '  Sentence 4 (evening/sleep): When to eat dinner and when to sleep. The "because" must name what the overnight clearing process requires and what a late or heavy meal takes away from it.',
      '',
      'RULES:',
      '- Coach inputs only: food, drink, supplements, sleep timing. Never the work schedule.',
      '- No generic advice ("stay hydrated", "eat well", "prioritize recovery").',
      '- No work commands ("front-load", "commit your cognitive work", "schedule your hardest task").',
      '- Every "because" must name a specific biological mechanism in plain language — not a general outcome.',
      '- TONE: Write the way a smart coach talks to an athlete — not a researcher writing a paper. Say "the brain\'s waste clearance system", not "glymphatic flushing". Say "muscle uptake", not "GLUT4 translocation". Say "the body\'s overnight repair", not "slow-wave deep-sleep architecture". Common terms OK: blood glucose, cortisol, HRV, insulin, sleep pressure, circulation.',
      '- LENGTH: Each sentence 20-35 words. Four sentences total. No multi-clause compound sentences.',
      '',
      'Output only the four sentences. Nothing else.',
    ].filter(Boolean).join('\n');

    const workCommandRx = /\b(commit\s+your|schedule\s+your\s+(most|hardest)|(put|start|do|tackle)\s+your\s+(most|hardest)|put\s+the\s+hardest|block\s+the\s+first|push\s+through\s+your\s+(most|hardest)|front[- ]?load)\b/i;
    const genericRx = /\b(stay\s+hydrated|eat\s+(well|healthy|clean)|prioritize\s+recovery|take\s+it\s+easy)\b/i;
    validateFn = (text) => {
      const issues = [];
      if (workCommandRx.test(text)) issues.push('work-command-prohibited');
      if (genericRx.test(text)) issues.push('generic-wellness');
      return issues;
    };
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw  = await callAnthropic({ systemPrompt: sysPrompt, userPrompt: userText, maxTokens: 280 });
      const text = String(raw || '').replace(/^["'\s]+|["'\s]+$/g, '').trim();

      if (!text || text.length < 20) {
        console.warn(`[VRTX] Isolated Line 10 attempt ${attempt + 1}: output too short — "${text}"`);
        continue;
      }
      const issues = validateFn(text);
      if (issues.length > 0) {
        console.warn(`[VRTX] Isolated Line 10 attempt ${attempt + 1} violates [${issues.join(', ')}]: "${text}"`);
        continue;
      }
      console.log(`[VRTX] Isolated Line 10 accepted (attempt ${attempt + 1}): "${text}"`);
      return text;
    } catch (err) {
      console.warn(`[VRTX] Isolated Line 10 attempt ${attempt + 1} error: ${err?.message || err}`);
    }
  }

  console.warn('[VRTX] Isolated Line 10 regeneration exhausted — proceeding with original.');
  return null;
}

async function generateDialogue({ scene, evidence, preInsight, ts }) {
  const recentHistory = loadRecentHistory(OUT_DIR, { days: 7 });
  const historySummary = buildHistorySummary(recentHistory);
  // Pattern block disabled — VRTX does not audit past behavior.
  // The body's state today already encodes history. HRV and RHR are the evidence.
  const patternBlock = null;
  const angleBlock = buildAngleBlock(scene.governing_condition);
  const userPrompt = buildUserPrompt(scene, evidence, preInsight, historySummary, patternBlock, angleBlock);
  const targetLines = REQUIRED_DIALOGUE_LINES > 0 ? REQUIRED_DIALOGUE_LINES : 10;
  const attempts = [];
  let lastError = null;
  let lastResult = null;
  let bestResult = null; // tracks the attempt with the most complete parsed lines
  let lastSemanticViolations = null;
  let lastStructuralErrors = [];

  for (let i = 0; i < 3; i += 1) {
    let raw = null;
    try {
      // Build correction block from previous attempt's failures.
      // Structural errors and semantic violations are both included so corrections
      // always reach the retry even when attempt 1 failed structurally.
      const corrections = [];
      if (i > 0) {
        const priorLineCount = lastResult?.parsedLines?.length;
        // Only send line-count correction when speaker alternation was also wrong.
        // Excess lines with correct alternation are contracted silently — sending this
        // correction alongside the semantic fix destabilizes a correct structure.
        if (priorLineCount !== undefined && priorLineCount < targetLines) {
          corrections.push(
            `Your previous response returned ${priorLineCount} lines. The OUTPUT CONTRACT requires exactly ${targetLines} lines. Return a JavaScript array of exactly ${targetLines} strings alternating Host A and Sabian.`
          );
        } else if (priorLineCount !== undefined && priorLineCount > targetLines && lastStructuralErrors.length > 0) {
          corrections.push(
            `Your previous response returned ${priorLineCount} lines. The OUTPUT CONTRACT requires exactly ${targetLines} lines. Return a JavaScript array of exactly ${targetLines} strings alternating Host A and Sabian.`
          );
        }
        if (lastStructuralErrors.length > 0) {
          const hasLine7SabianError = lastStructuralErrors.some(e => e.includes('Line 7') && e.includes('"Sabian"'));
          const speakerFix = hasLine7SabianError
            ? `STRUCTURAL VIOLATION — double-Sabian at Lines 6–7:\n` +
              lastStructuralErrors.join("\n") + "\n" +
              `You generated two consecutive Sabian lines at positions 6 and 7. This is the behavior mapping double-Sabian error.\n` +
              `Line 6 must contain everything in one Sabian turn: mechanism from retrieved knowledge + behavioral response + what it means for today.\n` +
              `There is no content left that requires a second Sabian turn before Host A speaks at Line 7.\n` +
              `Line 7 must begin "Host A:". Lines 1,3,5,7,9 = Host A. Lines 2,4,6,8,10 = Sabian.`
            : `STRUCTURAL VIOLATION — speaker order:\n` +
              lastStructuralErrors.join("\n") + "\n" +
              `Lines 1,3,5,7,9 must begin with "Host A:". Lines 2,4,6,8,10 must begin with "Sabian:". Fix the speaker order exactly.`;
          corrections.push(speakerFix);
        }
        if (lastSemanticViolations && lastSemanticViolations.length > 0) {
          for (const v of lastSemanticViolations) {
            corrections.push(v.correction);
          }
        }
      }

      const effectivePrompt = corrections.length > 0
        ? userPrompt + `\n\nCORRECTION REQUIRED:\n` + corrections.join("\n\n")
        : userPrompt;

      raw = await callAnthropic({
        systemPrompt: VRTX_SYSTEM_PROMPT,
        userPrompt: effectivePrompt
      });

      // Structural validation in its own try/catch.
      // On structural failure: extract lines anyway and run semantics so corrections
      // are populated for the next attempt rather than being silently lost.
      let parsedLines = [];
      let structuralErrors = [];
      try {
        parsedLines = ensureSpeakerLabels(validateAndNormalizeDialogue(raw));
      } catch (structuralErr) {
        structuralErrors = structuralErr?.validator?.errors || [structuralErr.message];
        try {
          parsedLines = ensureSpeakerLabels(parseArrayOutput(raw));
        } catch (_) {
          parsedLines = [];
        }
      }

      const semanticResult = validateSemantics(parsedLines, evidence.retrieved_knowledge);

      attempts.push({
        attempt: i + 1,
        raw,
        lineCount: parsedLines.length,
        structuralErrors,
        semanticViolations: semanticResult.violations
      });

      lastResult = { raw, parsedLines, attempts, userPrompt: effectivePrompt };
      // Keep the result with the most complete parsed lines for fallback
      if (!bestResult || parsedLines.length > (bestResult.parsedLines?.length || 0)) {
        bestResult = lastResult;
      }
      lastSemanticViolations = semanticResult.violations;
      lastStructuralErrors = structuralErrors;

      const clean = structuralErrors.length === 0 &&
        parsedLines.length >= targetLines &&
        semanticResult.ok;

      if (clean) {
        return lastResult;
      }

      const failReasons = [];
      if (structuralErrors.length > 0) failReasons.push(`structural: ${structuralErrors.length} error(s)`);
      if (parsedLines.length !== targetLines) failReasons.push(`line count ${parsedLines.length}/${targetLines}`);
      if (!semanticResult.ok) failReasons.push(semanticResult.violations.map(v => v.check).join(", "));

      if (i === 0) {
        console.warn(`[VRTX] Attempt 1 failed (${failReasons.join("; ")}). Retrying with correction.`);
      } else {
        console.warn(`[VRTX] Attempt ${i + 1} failed (${failReasons.join("; ")}). Proceeding with available result.`);
        // Return the best attempt (most lines) rather than the latest (which may have regressed)
        return bestResult || lastResult;
      }
    } catch (error) {
      // Fatal errors only — network failure, API error, JSON parse failure
      lastError = error;
      attempts.push({
        attempt: i + 1,
        raw: raw || null,
        error: error?.message || String(error)
      });
    }
  }

  if (bestResult || lastResult) {
    return bestResult || lastResult;
  }

  writeFile(
    path.join(OUT_DIR, `attempt_${ts}_errors.json`),
    JSON.stringify(attempts, null, 2)
  );

  throw lastError || new Error("Failed to generate valid dialogue.");
}

async function main() {
  ensureDir(OUT_DIR);

  const inputPath = process.argv[2]
    ? path.resolve(process.argv[2])
    : FITBIT_INPUT_PATH;

  if (SCENARIO) {
    console.log(`\n[VRTX] SCENARIO=${SCENARIO} → ${inputPath}`);
  }

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Missing Fitbit input file: ${inputPath}`);
  }

  if (!fs.existsSync(BASELINE_INPUT_PATH)) {
    throw new Error(`Missing baseline file: ${BASELINE_INPUT_PATH}`);
  }

  const ts = tsStamp();

  const fitbitPayload = readJson(inputPath);
  const baseline = readJson(BASELINE_INPUT_PATH);

  const user = mapFitbitPayloadToUser(fitbitPayload);
  const rawHealthPayload = mapFitbitPayloadToRawHealthPayload(fitbitPayload);
  const normalizedToday = normalizeHealthConnectPayload(rawHealthPayload);

  const today = buildTodayMetrics(normalizedToday, baseline);
  const metricBoard = buildMetricBoard(today, baseline);

  const yesterdayWindow = buildYesterdayWindow(today, normalizedToday);
  const overnightWindow = buildOvernightWindow(today);
  const yesterdayLayer = buildYesterdayLayer({
    steps: yesterdayWindow.steps,
    activeMinutes: yesterdayWindow.movement_minutes,
    baseline
  });

  const history = [buildHistoryEntryFromBaseline(normalizedToday, baseline)];
  const behaviorLayer = buildBehaviorLayer({
    today: normalizedToday,
    history,
    profile: user.profile || {}
  });

  const deviations = computeDeviations(today, baseline);
  const stateResult = classifyState(today, baseline, deviations, user.profile || {});
  const state = stateResult?.state || "Steady Output";
  const OUTPUT = state;
  const flags = stateResult?.flags || {};
  const interpretedSignals = stateResult?.interpretedSignals || [];
  const combinedStateResult = stateResult?.combinedStateResult || null;
  const rules = selectRules(stateResult, today, baseline, deviations, user.profile || {});

  const scene = buildVrtxScene({
    user,
    today,
    baseline,
    behaviorLayer,
    stateResult,
    rules,
    yesterdayLayer,
    overnightWindow,
    interpretedSignals,
    combinedStateResult,
    flags
  });

  const preInsight = buildPreInsight(
    today,
    baseline,
    interpretedSignals,
    combinedStateResult,
    stateResult?.framing || {}
  );

  const evidenceForQuery = {
    metrics_today: today,
    flags,
    normalized_health_context: normalizedToday,
    behavior_layer: behaviorLayer
  };

  const knowledgeQuery = buildKnowledgeQuery({
    scene,
    evidence: evidenceForQuery
  });

  let retrievedKnowledge = [];
  try {
    retrievedKnowledge = normalizeRetrievedChunks(
      retrieveForState({
        governingCondition: scene.governing_condition,
        query: knowledgeQuery,
        topK: 4,
        maxPerSource: 2
      })
    );
  } catch (_) {
    retrievedKnowledge = [];
  }

  const evidence = buildEvidence({
    user,
    today,
    baseline,
    deviations,
    state: OUTPUT,
    flags,
    rules,
    normalizedToday,
    behaviorLayer,
    scene,
    metricBoard,
    retrievedKnowledge,
    yesterdayWindow,
    overnightWindow,
    yesterdayLayer
  });

  // REPLAY_RUN: skip LLM generation and load saved lines from a previous run.
  // Use this during development to test post-generation logic without spending on
  // full 10-line generation. e.g.: REPLAY_RUN=20260406_150736 node vrtx_engine.cjs
  const REPLAY_RUN = process.env.REPLAY_RUN ? String(process.env.REPLAY_RUN).trim() : null;
  let generation;
  if (REPLAY_RUN) {
    const replayPath = path.join(OUT_DIR, `vrtx_run_${REPLAY_RUN}.json`);
    if (!fs.existsSync(replayPath)) throw new Error(`REPLAY_RUN: no run file at ${replayPath}`);
    const savedRun = readJson(replayPath);
    generation = {
      raw: `(replay:${REPLAY_RUN})`,
      parsedLines: savedRun.parsedLines || [],
      attempts: savedRun.generation_attempts || [],
      userPrompt: '(replay)'
    };
    console.log(`[VRTX] REPLAY_RUN: loaded ${generation.parsedLines.length} lines from ${REPLAY_RUN}`);
  } else {
    generation = await generateDialogue({ scene, evidence, preInsight, ts });
  }

  // Isolated Line 10 pass — runs after the retry loop (or replay) when substance or timing
  // violations are still present. Generates Line 10 in isolation with no Lines 1-9 context,
  // removing the in-context caffeine prior that correction messages cannot override.
  const line10Check = validateSemantics(generation.parsedLines, retrievedKnowledge);
  // Isolated pass fires for:
  // 1. Adenosine-pathway violations: substance assumption, ungrounded timing, prescription not specific
  // 2. ANY scenario where prohibited generic category words (protein, hydration, etc.) survived 2 attempts
  //    (line10_single_action with behaviorHits — detected by checking Line 10 body directly)
  const WORK_COMMAND_RX = /\b(commit\s+your\s+(most\s+)?(demanding|complex|cognitive|analytical|creative|hardest)\s+(work|task|output|decision)|schedule\s+your\s+(most\s+)?(demanding|complex|cognitive|hardest)|put\s+your\s+(most\s+)?(demanding|complex|cognitive|hardest)|(start|do|tackle)\s+your\s+(most\s+)?(demanding|complex|cognitive|hardest)|put\s+the\s+(hardest|most\s+demanding)\s+thing|block\s+the\s+first|push\s+through\s+your\s+(most\s+)?(demanding|hardest)|front[- ]?load)\b/i;
  const line10Body = generation.parsedLines?.[9]
    ? generation.parsedLines[9].replace(/^Sabian:\s*/i, '')
    : '';
  const hasLine10Violations = line10Check.violations.some(v =>
    v.check === 'line10_work_command' ||
    v.check === 'line10_generic_wellness' ||
    v.check === 'line10_frontload_banned' ||
    v.check === 'line10_not_coaching_arc' ||
    v.check === 'line10_substance_assumption' ||
    v.check === 'line10_prescription_noncompliant'
  ) || WORK_COMMAND_RX.test(line10Body);
  if (hasLine10Violations && generation.parsedLines?.length >= 10) {
    console.warn('[VRTX] Line 10 violation persists — running isolated regeneration pass.');
    const isolatedLine10 = await regenerateLine10Isolated(scene, evidence, generation.parsedLines);
    if (isolatedLine10) {
      generation.parsedLines[9] = `Sabian: ${isolatedLine10}`;
      console.log('[VRTX] Isolated Line 10 injected.');
    }
  }

  const contractedLines = contractParsedLines(generation.parsedLines);

  // Grounding gate: verify biological timing claims in Line 10 against retrieved knowledge.
  // Must run after contractParsedLines, before audio is produced.
  const groundedLines = groundLine10Claims(contractedLines, retrievedKnowledge);

  writeFile(
    path.join(OUT_DIR, `vrtx_script_${ts}.txt`),
    JSON.stringify(groundedLines, null, 2)
  );

  writeFile(
    path.join(OUT_DIR, `vrtx_lines_${ts}.json`),
    JSON.stringify(groundedLines, null, 2)
  );

  writeFile(
    path.join(OUT_DIR, `vrtx_parsed_lines_${ts}.txt`),
    groundedLines.map((line, i) => `${i + 1}. ${line}`).join("\n")
  );

  const SABIAN_VOICE_ID = String(process.env.SABIAN_VOICE_ID || "").trim();
  const HOST_A_US_ID = String(process.env.HOST_A_US_ID || "").trim();

  let audio = null;
  let audioError = null;

  // SKIP_AUDIO=1 bypasses ElevenLabs entirely. Use during development to avoid TTS spend.
  if (!process.env.SKIP_AUDIO) {
    try {
      audio = await scriptToAudio({
        lines: groundedLines,
        outDir: OUT_DIR,
        baseName: `vrtx_${ts}`,
        sabianVoiceId: SABIAN_VOICE_ID,
        hostVoiceId: HOST_A_US_ID
      });
    } catch (error) {
      audioError = error?.message || String(error);
      console.error("VRTX audio failed:", audioError);
    }
  } else {
    console.log('[VRTX] SKIP_AUDIO=1 — ElevenLabs call skipped.');
  }

  writeFile(
    path.join(OUT_DIR, `vrtx_run_${ts}.json`),
    JSON.stringify(
      {
        model: OPENROUTER_MODEL,
        env_path: ENV_PATH,
        input: inputPath,
        baseline_input: BASELINE_INPUT_PATH,
        knowledge_query: knowledgeQuery,
        pre_insight: preInsight,
        generation_attempts: (generation.attempts || []).map(a => ({
          attempt: a.attempt,
          lineCount: a.lineCount,
          structuralErrors: a.structuralErrors || [],
          semanticViolations: (a.semanticViolations || []).map(v => ({
            check: v.check,
            line: v.line,
            found: v.found,
            correction: v.correction
          }))
        })),
        scene,
        evidence,
        parsedLines: contractedLines,
        outputs: audio,
        audio_error: audioError
      },
      null,
      2
    )
  );

  if (audioError) {
    console.log(`VRTX run complete with script only: ${ts}`);
    return;
  }

  console.log(`VRTX run complete: ${ts}`);
}

main().catch((error) => {
  console.error("VRTX engine failed:", error?.message || error);
  process.exit(1);
});