const fs = require("fs");
const path = require("path");

const fitbitPath = path.join(__dirname, "..", "input", "fitbit_latest.json");
const statePath = path.join(__dirname, "..", "calibration", "calibration_state.json");
const baselinePath = path.join(__dirname, "..", "calibration", "baseline_schema.json");

function load(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function save(p, d) {
  fs.writeFileSync(p, JSON.stringify(d, null, 2));
}

function asNumber(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function avg(currentMean, newValue, day) {
  if (newValue === null) return currentMean;
  if (currentMean === null || currentMean === undefined) return newValue;
  return ((currentMean * (day - 1)) + newValue) / day;
}

function timeToMinutes(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return d.getHours() * 60 + d.getMinutes();
}

function computeSleepConsistency(bedtime, wakeTime, baseBed, baseWake) {
  if (
    bedtime === null ||
    wakeTime === null ||
    baseBed === null ||
    baseWake === null
  ) return null;

  const bedDrift = Math.abs(bedtime - baseBed);
  const wakeDrift = Math.abs(wakeTime - baseWake);

  const totalDrift = bedDrift + wakeDrift;

  // normalize into 0 → 1 (lower drift = higher consistency)
  const score = Math.max(0, 1 - (totalDrift / 240)); // 4hr max drift window

  return Number(score.toFixed(3));
}

function run() {
  const fitbit = load(fitbitPath);
  const state = load(statePath);
  const baseline = load(baselinePath);

  const day = state.calibration_day || 1;

  // ===== EXTRACT RAW METRICS =====
  const sleep = asNumber(fitbit?.sleep?.summary?.totalMinutesAsleep);
  const steps = asNumber(fitbit?.activity?.summary?.steps);

  const lightlyActive = asNumber(fitbit?.activity?.summary?.lightlyActiveMinutes) || 0;
  const fairlyActive = asNumber(fitbit?.activity?.summary?.fairlyActiveMinutes) || 0;
  const veryActive = asNumber(fitbit?.activity?.summary?.veryActiveMinutes) || 0;

  const activeMinutes = lightlyActive + fairlyActive + veryActive;

  const restingHr = asNumber(
    fitbit?.heart?.value?.restingHeartRate
  );

  const hrv = asNumber(
    fitbit?.hrv?.dailyRmssd ||
    fitbit?.hrv?.rmssd ||
    fitbit?.hrv?.value
  );

  const spo2 = asNumber(
    fitbit?.spo2?.avg ||
    fitbit?.spo2?.value
  );

  const sleepLog = fitbit?.sleep?.sleep?.[0] || {};

  const bedtime = timeToMinutes(sleepLog?.startTime);
  const wakeTime = timeToMinutes(sleepLog?.endTime);

  console.log("CALIBRATION INPUT");
  console.log({
    sleep,
    steps,
    activeMinutes,
    restingHr,
    hrv,
    spo2,
    bedtime,
    wakeTime
  });

  // ===== UPDATE BASELINE =====
  baseline.sleep_minutes = avg(baseline.sleep_minutes, sleep, day);
  baseline.steps = avg(baseline.steps, steps, day);
  baseline.resting_hr = avg(baseline.resting_hr, restingHr, day);
  baseline.hrv_ms = avg(baseline.hrv_ms, hrv, day);
  baseline.spo2 = avg(baseline.spo2, spo2, day);

  baseline.bedtime_minutes_from_midnight = avg(
    baseline.bedtime_minutes_from_midnight,
    bedtime,
    day
  );

  baseline.wake_minutes_from_midnight = avg(
    baseline.wake_minutes_from_midnight,
    wakeTime,
    day
  );

  // ===== SLEEP CONSISTENCY =====
  const consistency = computeSleepConsistency(
    bedtime,
    wakeTime,
    baseline.bedtime_minutes_from_midnight,
    baseline.wake_minutes_from_midnight
  );

  baseline.sleep_consistency = avg(
    baseline.sleep_consistency,
    consistency,
    day
  );

  // ===== STATE =====
  state.calibration_day = day + 1;

  if (state.calibration_day >= 7) {
    state.status = "calibration_day_8_14";
  }

  if (state.calibration_day >= 14) {
    state.status = "calibrated";
    state.baseline_established = true;
  }

  save(baselinePath, baseline);
  save(statePath, state);

  console.log("UPDATED BASELINE");
  console.log(baseline);

  console.log("DAY:", state.calibration_day);
  console.log("STATUS:", state.status);
}

run();