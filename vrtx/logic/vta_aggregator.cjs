require("dotenv").config({ path: "./.env" });

const fs = require("fs");
const path = require("path");

const VTA_INPUT_DIR = path.join(__dirname, "..", "input", "vta");
const VTA_OUTPUT_DIR = path.join(__dirname, "..", "output", "vta");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function extractDailySummary(payload) {
  const sleepSummary = payload?.sleep?.summary || {};
  const activitySummary = payload?.activity?.summary || {};
  const heartArray = Array.isArray(payload?.heart?.["activities-heart"])
    ? payload.heart["activities-heart"]
    : [];
  const heartValue = heartArray.length ? heartArray[0]?.value || {} : {};

  const sleepMinutes = safeNumber(sleepSummary?.totalMinutesAsleep);
  const steps = safeNumber(activitySummary?.steps);
  const restingHeartRate = safeNumber(heartValue?.restingHeartRate);

  let dailyState = "mixed";
  if (sleepMinutes !== null && sleepMinutes < 360) dailyState = "sleep_compressed";
  if (restingHeartRate !== null && restingHeartRate > 65) dailyState = "recovery_elevated";
  if (steps !== null && steps > 10000 && dailyState === "mixed") dailyState = "high_output";

  return {
    name: payload?.vta_member?.name || payload?.profile?.user?.displayName || "User",
    slug: payload?.vta_member?.slug || "user",
    date: payload?.date || null,
    sleep_minutes: sleepMinutes,
    steps,
    resting_hr: restingHeartRate,
    daily_state: dailyState
  };
}

function main() {
  const manifestPath = path.join(VTA_INPUT_DIR, "vta_manifest.json");

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing manifest file: ${manifestPath}`);
  }

  const manifest = readJson(manifestPath);
  const members = Array.isArray(manifest.members) ? manifest.members : [];

  if (!members.length) {
    throw new Error("No member files found in manifest");
  }

  const summaries = members.map(member => {
    const payload = readJson(member.file);
    return extractDailySummary(payload);
  });

  const group = {
    total_members: summaries.length,
    sleep_compressed_count: summaries.filter(x => x.daily_state === "sleep_compressed").length,
    recovery_elevated_count: summaries.filter(x => x.daily_state === "recovery_elevated").length,
    high_output_count: summaries.filter(x => x.daily_state === "high_output").length,
    avg_sleep_minutes: (() => {
      const vals = summaries.map(x => x.sleep_minutes).filter(v => v !== null);
      return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    })(),
    avg_steps: (() => {
      const vals = summaries.map(x => x.steps).filter(v => v !== null);
      return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    })()
  };

  const outPath = path.join(VTA_OUTPUT_DIR, "weekly_vta_snapshot.json");
  writeJson(outPath, {
    generated_at: new Date().toISOString(),
    source: "vta_aggregator",
    group,
    members: summaries
  });

  console.log("✅ VTA aggregation complete");
  console.log("Saved:", outPath);
}

main();
