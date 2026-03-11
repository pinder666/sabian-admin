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

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function writeFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf8");
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

function mapNormalizedToLegacyToday(normalized) {
  return {
    sleep_minutes: normalized?.sleep?.totalSleepMinutes ?? null,
    hrv_ms: normalized?.recovery?.hrvMs ?? null,
    resting_hr: normalized?.recovery?.restingHeartRate ?? null,
    steps: normalized?.activity?.steps ?? null
  };
}

function mapHistoryBaselineToLegacy(history = []) {
  const valid = history
    .map(item => normalizeHealthConnectPayload(item))
    .map(mapNormalizedToLegacyToday);

  function average(field) {
    const values = valid
      .map(v => Number(v?.[field]))
      .filter(n => Number.isFinite(n));

    if (!values.length) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  return {
    sleep_minutes: average("sleep_minutes"),
    hrv_ms: average("hrv_ms"),
    resting_hr: average("resting_hr"),
    steps: average("steps")
  };
}

function buildUserPrompt({
  user,
  today,
  baseline,
  deviations,
  flags,
  behaviorLayer,
  normalizedToday
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
      behavior_layer: behaviorLayer
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
          temperature: 0.2,
          max_tokens: 900,
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

  ensureDir(OUT_DIR);
  const ts = new Date().toISOString().replace(/[:.]/g, "-");

  const user = {
    name: "Jason",
    profile: {
      fasting: true,
      morning_caffeine: true
    }
  };

  const rawHealthPayload = {
    date: new Date().toISOString().slice(0, 10),
    sleepSession: {
      startTime: "2026-03-07T00:30:00.000Z",
      endTime: "2026-03-07T06:50:00.000Z",
      totalSleepMinutes: 380
    },
    steps: [{ count: 7200 }],
    restingHeartRate: 62,
    hrvMs: 42
  };

  const history = [
    {
      date: "2026-03-06",
      sleepSession: { totalSleepMinutes: 430, startTime: "2026-03-06T00:00:00.000Z" },
      steps: [{ count: 9100 }],
      restingHeartRate: 56,
      hrvMs: 51
    },
    {
      date: "2026-03-05",
      sleepSession: { totalSleepMinutes: 440, startTime: "2026-03-05T23:50:00.000Z" },
      steps: [{ count: 9800 }],
      restingHeartRate: 55,
      hrvMs: 53
    },
    {
      date: "2026-03-04",
      sleepSession: { totalSleepMinutes: 435, startTime: "2026-03-04T00:10:00.000Z" },
      steps: [{ count: 9600 }],
      restingHeartRate: 54,
      hrvMs: 52
    }
  ];

  const normalizedToday = normalizeHealthConnectPayload(rawHealthPayload);
  const behaviorLayer = buildBehaviorLayer({
    today: normalizedToday,
    history,
    profile: user.profile || {}
  });

  const today = mapNormalizedToLegacyToday(normalizedToday);
  const baseline = mapHistoryBaselineToLegacy(history);

  const deviations = computeDeviations(today, baseline);
  const { state, flags } = classifyState(today, baseline, deviations, user.profile);
  const rules = selectRules(state, flags, user.profile);

  const baseUserPrompt = buildUserPrompt({
    user,
    today,
    baseline,
    deviations,
    flags,
    behaviorLayer,
    normalizedToday
  });

  function buildAttemptPrompt(attempt, prevErrors) {
    if (attempt === 1) {
      return baseUserPrompt;
    }

    const correction = [
      "",
      "CORRECTION REQUIREMENTS (must comply exactly):",
      "",
      "Return ONLY a JavaScript array of strings.",
      "Return EXACTLY 11 lines.",
      "",
      "Exact speaker order:",
      "1 Host A",
      "2 Sabian",
      "3 Host A",
      "4 Sabian",
      "5 Host A",
      "6 Sabian",
      "7 Host A",
      "8 Sabian",
      "9 Host A",
      "10 Sabian",
      "11 Host A",
      "",
      "Exact required content:",
      "Line 1: Host A opens with raw numbers only.",
      "Line 2: Sabian MUST repeat at least one exact number from the input. Example: 6 hours 20 minutes, 42 HRV, 62 resting heart rate, 7200 steps.",
      "Line 3: Host A challenges for proof or clarity.",
      "Line 4: Sabian clarifies plainly and includes at least one number again.",
      "Line 5: Host A asks about cost or consequence.",
      "Line 6: Sabian explains the cost plainly.",
      "Line 7: EXACT TEXT = Host A: Define the day.",
      "Line 8: Sabian defines the day in one sentence only.",
      "Line 9: EXACT TEXT = Host A: Sabian, how do we win the day?",
      "Line 10: Sabian gives EXACTLY 5 short directives.",
      "Line 11: Host A wraps the reading in 1 or 2 short sentences.",
      "",
      "Hard rules for line 10:",
      "Use exactly 5 short sentences.",
      "Each sentence must be a command.",
      "Do not explain.",
      "Do not ask questions.",
      "Do not use numbers on line 10.",
      "Do not use these words: and, because, which, while, although, however, therefore.",
      "",
      "Good line 10 example:",
      "Sabian: Hold effort below max. Use mineral hydration early. Eat a clean first meal. Delay intensity until later. Protect the sleep window.",
      "",
      "Hard rules for Sabian:",
      "Every Sabian line must be maximum 2 sentences.",
      "Sabian must not use report labels like Indicator, Mechanism, or Move.",
      "Sabian must not sound like a report.",
      "Sabian must sound like a calm human expert.",
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
        state,
        flags,
        rules,
        today,
        baseline,
        deviations,
        normalizedToday,
        behaviorLayer,
        outputs: audio
      },
      null,
      2
    )
  );

  console.log("✅ VRTX run complete:");
  console.log("- Script:", path.join(OUT_DIR, `vrtx_script_${ts}.txt`));
  console.log("- Audio:", audio.mergedPath);
}

main().catch(err => {
  console.error("❌ VRTX engine error:", err.message);
  process.exitCode = 1;
});