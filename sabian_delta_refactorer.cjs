// sabian_delta_refactorer.cjs — FULL VERSION with LOOPING upgrade

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { logToHive } = require("./logger.cjs");

const REFLECTIONS_FILE = path.join(__dirname, "sabian_reflections.jsonl");
const DELTA_OUTPUT = path.join(__dirname, "sabian_delta_map.json");

function hashDiff(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function loadLines(filepath) {
  try {
    const raw = fs.readFileSync(filepath, "utf8").trim().split("\n");
    return raw.map(line => JSON.parse(line));
  } catch (err) {
    logToHive({
      source: "sabian_delta_refactorer",
      level: "error",
      event: "Failed to read or parse sabian_reflections.jsonl",
      data: { message: err.message },
      tags: ["delta", "read_failure"]
    });
    return [];
  }
}

function buildDeltaMap(reflections) {
  const deltas = [];

  reflections.forEach(entry => {
    if (!entry.file || !entry.improvement) return;

    const delta = {
      id: hashDiff(entry.file + entry.improvement),
      file: entry.file,
      suggestion: entry.improvement,
      timestamp: new Date().toISOString(),
      source: "sabian_reflections"
    };

    deltas.push(delta);
  });

  return deltas;
}

function saveDeltas(deltas) {
  fs.writeFileSync(DELTA_OUTPUT, JSON.stringify(deltas, null, 2));
  logToHive({
    source: "sabian_delta_refactorer",
    level: "info",
    event: "Delta map regenerated",
    data: {
      count: deltas.length,
      output: DELTA_OUTPUT
    },
    tags: ["delta", "map", "looped"]
  });
}

function runDeltaLoop() {
  const reflections = loadLines(REFLECTIONS_FILE);
  const deltas = buildDeltaMap(reflections);
  saveDeltas(deltas);
  console.log("🛠️ Delta Refactorer completed a cycle.");
}

// 🔁 LOOP EVERY 5 MINUTES
setInterval(runDeltaLoop, 1000 * 60 * 5);
runDeltaLoop();
