/**
 * parse_usgs_feed.cjs
 * Military-grade Sabian USGS feed parser
 *
 * Functions:
 * 1. Validate and summarize the feed.
 * 2. Normalize and export a clean intelligence JSON for downstream AI analysis.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const INPUT_FILE = path.join(__dirname, "data", "usgs_feed.json");
const OUTPUT_DIR = path.join(__dirname, "data");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "usgs_normalized.json");
const LOG_DIR = path.join(__dirname, "logs");
const LOG_FILE = path.join(LOG_DIR, "usgs_parser.log");

// --- helpers ---
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function logRecord(obj) {
  ensureDir(LOG_DIR);
  fs.appendFileSync(LOG_FILE, JSON.stringify({ ts: nowIso(), ...obj }) + "\n");
}

function sha256hex(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

// --- validation ---
function validateFeed(feed) {
  if (!feed || typeof feed !== "object") return "feed not object";
  if (!feed.features || !Array.isArray(feed.features)) return "missing features array";
  if (feed.features.length === 0) return "no events";
  return null;
}

// --- normalization ---
function normalizeEvents(feed) {
  return feed.features.map((f) => {
    const p = f.properties || {};
    const g = f.geometry || {};
    return {
      id: f.id || null,
      title: p.title || "unknown",
      magnitude: p.mag || 0,
      place: p.place || "unknown",
      time: p.time ? new Date(p.time).toISOString() : null,
      updated: p.updated ? new Date(p.updated).toISOString() : null,
      coordinates: g.coordinates || [],
      depth_km: Array.isArray(g.coordinates) ? g.coordinates[2] || null : null,
      type: f.type || "Feature"
    };
  });
}

// --- main ---
(async () => {
  ensureDir(OUTPUT_DIR);
  logRecord({ level: "info", msg: "parser_start", file: INPUT_FILE });

  try {
    const raw = fs.readFileSync(INPUT_FILE, "utf8");
    const feed = JSON.parse(raw);
    const validationError = validateFeed(feed);
    if (validationError) {
      logRecord({ level: "error", msg: "validation_failed", error: validationError });
      console.error("[Sabian][Parser] Validation failed:", validationError);
      process.exitCode = 2;
      return;
    }

    // summarize
    const count = feed.features.length;
    const mags = feed.features.map((f) => f.properties?.mag || 0);
    const avgMag = mags.reduce((a, b) => a + b, 0) / count;
    console.log(`[Sabian][Parser] Valid feed ✅ ${count} events, avg magnitude ${avgMag.toFixed(2)}`);

    // normalize and export
    const normalized = normalizeEvents(feed);
    const json = JSON.stringify({ ts: nowIso(), events: normalized }, null, 2);
    const buffer = Buffer.from(json, "utf8");
    const hash = sha256hex(buffer);
    const tmp = OUTPUT_FILE + ".tmp." + Date.now();
    fs.writeFileSync(tmp, buffer);
    fs.renameSync(tmp, OUTPUT_FILE);

    logRecord({
      level: "info",
      msg: "parser_success",
      file: path.relative(__dirname, OUTPUT_FILE),
      sha256: hash,
      events: count
    });

    console.log(`[Sabian][Parser] Exported normalized file → ${OUTPUT_FILE}`);
    console.log(`[Sabian][Parser] sha256: ${hash}`);
    process.exitCode = 0;
  } catch (err) {
    logRecord({ level: "fatal", msg: "parser_failed", error: err.message });
    console.error("[Sabian][Parser] Error:", err.message);
    process.exitCode = 3;
  }
})();
