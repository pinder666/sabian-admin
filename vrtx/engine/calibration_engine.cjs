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

function avg(currentMean, newValue, day) {
  if (newValue === null || newValue === undefined) return currentMean;
  if (currentMean === null || currentMean === undefined) return newValue;
  return ((currentMean * (day - 1)) + newValue) / day;
}

function run() {
  const fitbit = load(fitbitPath);
  const state = load(statePath);
  const baseline = load(baselinePath);

  const sleep = fitbit?.sleep?.summary?.totalMinutesAsleep ?? 0;
  const steps = fitbit?.activity?.summary?.steps ?? 0;
  const lightlyActive = fitbit?.activity?.summary?.lightlyActiveMinutes ?? 0;
  const fairlyActive = fitbit?.activity?.summary?.fairlyActiveMinutes ?? 0;
  const veryActive = fitbit?.activity?.summary?.veryActiveMinutes ?? 0;
  const activeMinutes = lightlyActive + fairlyActive + veryActive;

  const day = state.calibration_day || 1;

  console.log("CALIBRATION INPUT");
  console.log({ sleep, steps, activeMinutes });

  baseline.sleep_mean = avg(baseline.sleep_mean, sleep, day);
  baseline.steps_mean = avg(baseline.steps_mean, steps, day);

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

  console.log("DAY:", state.calibration_day);
  console.log("STATUS:", state.status);
}

run();
