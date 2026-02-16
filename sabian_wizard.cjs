// sabian_wizard.cjs — OVERSEER OF THE SABIAN SYSTEM

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { phoenixDeepRepair, restoreFromDNA, verifyAndRestore } = require("./phoenix_restore.cjs");
const { logToHive } = require("./logger.cjs");
const { requestFix } = require("./autofix_handler.cjs");

const CORE_DIR = __dirname;
const MANIFEST_FILE = path.join(__dirname, "core_manifest.json");
const PHOENIX_FILE = path.join(__dirname, "phoenix_dna.json");
const HASH_ALGO = "sha256";
const WIZARD_LOG_PATH = "sabian_logs-wizard_logs.jsonl";
const DELTA_PATH = path.join(__dirname, "sabian_delta_map.json");

// Atomic writer
function atomicWrite(filePath, data) {
  const tempPath = filePath + ".tmp";
  fs.writeFileSync(tempPath, data, { encoding: "utf8" });
  fs.renameSync(tempPath, filePath);
}

// Wizard internal logger
function logWizardEvent(event) {
  fs.appendFileSync(WIZARD_LOG_PATH, JSON.stringify({
    ...event,
    timestamp: new Date().toISOString(),
    sabian_id: "SBN-001"
  }) + "\n");
}

// File hash
function getFileHash(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath);
  return crypto.createHash(HASH_ALGO).update(content).digest("hex");
}

// Scan and write manifest
function scanAndUpdateManifest() {
  const allFiles = fs.readdirSync(CORE_DIR, { withFileTypes: true })
    .filter(f => f.isFile() && !f.name.includes("wizard"))
    .map(f => f.name);

  let manifest = {};
  if (fs.existsSync(MANIFEST_FILE)) {
    try {
      manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf8"));
    } catch (err) {
      logToHive({
        source: "sabian_wizard",
        level: "error",
        event: "Failed to parse manifest",
        data: { message: err.message, stack: err.stack || "No stack" },
        tags: ["manifest", "parse_error"]
      });
      manifest = {};
    }
  }

  let updated = false;

  allFiles.forEach(file => {
    const filePath = path.join(CORE_DIR, file);
    const hash = getFileHash(filePath);

    if (!manifest[file] || manifest[file].hash !== hash) {
      manifest[file] = {
        hash,
        lastSeen: new Date().toISOString(),
        status: "active",
        source: "detected"
      };
      logToHive({
        source: "sabian_wizard",
        level: "info",
        event: "File registered or updated in manifest",
        data: { file, hash },
        tags: ["manifest", "watch", "assimilation"]
      });
      updated = true;
    }
  });

  if (updated) {
    atomicWrite(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
    logToHive({
      source: "sabian_wizard",
      level: "info",
      event: "Core manifest updated",
      data: { count: Object.keys(manifest).length },
      tags: ["manifest", "sync"]
    });
  }
}

// Core monitor
async function monitorAndRepair() {
  logToHive({
    source: "sabian_wizard",
    level: "info",
    event: "Auto-monitor loop running",
    tags: ["monitor", "loop"]
  });

  scanAndUpdateManifest();

  let manifest = {};
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf8"));
  } catch (err) {
    logToHive({
      source: "sabian_wizard",
      level: "fatal",
      event: "Manifest load failed",
      data: { message: err.message, stack: err.stack || "No stack trace" },
      tags: ["manifest", "fatal"]
    });
    return;
  }

  for (const [file, meta] of Object.entries(manifest)) {
    const fullPath = path.join(CORE_DIR, file);
    const currentHash = getFileHash(fullPath);

    if (!currentHash) {
      logWizardEvent({ step: "restoreFromDNA", file, status: "executing" });
      restoreFromDNA(file);
      logToHive({
        source: "sabian_wizard",
        level: "critical",
        event: "File missing, restored from DNA",
        data: { file, message: "File was missing and has been restored using Phoenix DNA protocol" },
        tags: ["restore", "phoenix", "dna"]
      });
    } else if (currentHash !== meta.hash) {
      const mismatchDetails = {
        file,
        currentHash,
        expected: meta.hash,
        timestamp: new Date().toISOString()
      };

      logToHive({
        source: "sabian_wizard",
        level: "warn",
        event: "File hash mismatch detected",
        data: mismatchDetails,
        tags: ["integrity", "hash", "mismatch"]
      });

      try {
        const failedMission = {
          id: crypto.randomUUID(),
          file: path.join("sabian_core", file),
          lastError: `Hash mismatch — expected ${meta.hash}, got ${currentHash}`
        };

        logWizardEvent({ step: "requestFix", file, status: "dispatching", missionId: failedMission.id });
        await requestFix(failedMission);

        logToHive({
          source: "sabian_wizard",
          level: "info",
          event: "Autofix triggered for hash mismatch",
          data: { file, missionId: failedMission.id, status: "Autofix dispatched successfully" },
          tags: ["autofix", "wizard", "recovery"]
        });

        logWizardEvent({ step: "autofix_complete", file, status: "ok", missionId: failedMission.id });

      } catch (err) {
        console.error("💥 Autofix failed:", err.message);
        fs.appendFileSync("hive_debug_log.jsonl", JSON.stringify({
          timestamp: new Date().toISOString(),
          source: "sabian_wizard",
          file,
          error: err.message,
          stack: err.stack || null
        }) + "\n");

        let fallbackLog = { message: err.message };
        try {
          if (typeof err.message === "string") {
            const trimmed = err.message.trim();
            if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
              fallbackLog = JSON.parse(err.message);
            }
          }
        } catch {}

        logToHive({
          source: "autofix_handler",
          level: "error",
          event: "Autofix failed",
          data: {
            file,
            message: fallbackLog.message,
            stack: err.stack || "No stack trace available",
            timestamp: new Date().toISOString(),
            hint: "Check autofix_handler or Phoenix layer for stability issues"
          },
          tags: ["autofix", "failure", "exception", "debug"]
        });

        logWizardEvent({ step: "autofix_failed", file, status: "error", error: err.message });
      }
    }
  }
}

function checkDeltaMap() {
  if (!fs.existsSync(DELTA_PATH)) return;

  let deltas = [];
  try {
    deltas = JSON.parse(fs.readFileSync(DELTA_PATH, "utf8"));
  } catch (err) {
    logToHive({
      source: "sabian_wizard",
      level: "error",
      event: "Failed to parse delta map",
      data: { message: err.message },
      tags: ["delta", "parse_error"]
    });
    return;
  }

  deltas.forEach(delta => {
    logToHive({
      source: "sabian_wizard",
      level: "intel",
      event: "Delta trigger received",
      data: delta,
      tags: ["delta", "trigger", "watch"]
    });
    logWizardEvent({ step: "delta_trigger", status: "received", file: delta.file, reason: delta.reason });
  });

  try {
    fs.writeFileSync(DELTA_PATH, JSON.stringify([], null, 2));
  } catch (err) {
    logToHive({
      source: "sabian_wizard",
      level: "warn",
      event: "Failed to clear delta map",
      data: { message: err.message },
      tags: ["delta", "clear_fail"]
    });
  }
}

setInterval(() => {
  monitorAndRepair();
  checkDeltaMap();
}, 1000 * 60 * 5); // every 5 minutes

scanAndUpdateManifest();
monitorAndRepair();
checkDeltaMap();

logWizardEvent({ step: "wizard_startup", status: "ready" });
console.log("🧙 Sabian Wizard is active and watching the entire system.");
