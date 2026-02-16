// sabian_phoenix_rewriter.cjs — FULL VERSION with UPGRADE
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { logToHive } = require("./logger.cjs");

const DELTA_FILE = path.join(__dirname, "sabian_delta_map.json");
const BACKUP_DIR = path.join(__dirname, "rewriter_backup");
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);

function hashFileContent(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function backupOriginal(filePath) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = path.basename(filePath);
  const backupPath = path.join(BACKUP_DIR, `${fileName}.${timestamp}.bak`);
  try {
    fs.copyFileSync(filePath, backupPath);
    return backupPath;
  } catch (err) {
    logToHive({
      source: "sabian_phoenix_rewriter",
      level: "warn",
      event: "Failed to back up original file",
      data: { filePath, message: err.message },
      tags: ["backup", "warning"]
    });
    return null;
  }
}

function applyRewrites() {
  let deltas;
  try {
    deltas = JSON.parse(fs.readFileSync(DELTA_FILE, "utf8"));
  } catch (err) {
    logToHive({
      source: "sabian_phoenix_rewriter",
      level: "error",
      event: "Failed to read delta file",
      data: { error: err.message },
      tags: ["delta", "parse"]
    });
    return;
  }

  deltas.forEach(delta => {
    const filePath = path.join(__dirname, delta.file);
    if (!fs.existsSync(filePath)) return;

    try {
      const original = fs.readFileSync(filePath, "utf8");
      const modified = original + `\n\n// 🔁 SUGGESTION: ${delta.suggestion}`;
      const backupPath = backupOriginal(filePath);
      fs.writeFileSync(filePath, modified, "utf8");

      logToHive({
        source: "sabian_phoenix_rewriter",
        level: "info",
        event: "File updated with delta suggestion",
        data: {
          file: delta.file,
          hash: hashFileContent(modified),
          backup: backupPath,
          suggestion: delta.suggestion
        },
        tags: ["rewrite", "delta", "phoenix"]
      });
    } catch (err) {
      logToHive({
        source: "sabian_phoenix_rewriter",
        level: "error",
        event: "Rewrite failed",
        data: {
          file: delta.file,
          message: err.message
        },
        tags: ["rewrite", "failure"]
      });
    }
  });

  console.log("🔥 Phoenix rewrite complete.");
}

// 🔁 LOOP EVERY 5 MINUTES
setInterval(applyRewrites, 1000 * 60 * 5);
applyRewrites();
