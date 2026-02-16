const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

const LOG_PATH = path.join(__dirname, 'sabian_hive_report.json');
const BACKUP_PATH = path.join(__dirname, 'sabian_hive_backup.json');
const AWARENESS_PATH = path.join(__dirname, 'logs', 'core_awareness.log');
const SYSTEM_ID = os.hostname();
const MAX_ENTRIES = 1000000;
const VALID_LEVELS = ['debug', 'info', 'warn', 'error', 'critical', 'intel', 'heartbeat'];

if (!fs.existsSync(LOG_PATH)) fs.writeFileSync(LOG_PATH, JSON.stringify([], null, 2));
if (!fs.existsSync(path.dirname(AWARENESS_PATH))) fs.mkdirSync(path.dirname(AWARENESS_PATH), { recursive: true });

function hashPayload(payload) {
  const base = JSON.stringify(payload);
  return crypto.createHash('sha256').update(base).digest('hex');
}

function writeSafely(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    const fallback = filePath.replace('.json', `_FAILOVER_${Date.now()}.json`);
    const tempPath = `${filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
    fs.renameSync(tempPath, filePath);
    console.warn(`⚠️ Log fallback written to: ${fallback}`);
  }
}

function logToHive({ source = 'unknown', level = 'info', event = 'No event provided', data = null, trace = null, tags = [] }) {
  try {
    let logs = [];

    try {
      logs = JSON.parse(fs.readFileSync(LOG_PATH, 'utf8'));
    } catch (readErr) {
      console.warn("⚠️ Failed to parse existing log, resetting log file");
    }

    if (!VALID_LEVELS.includes(level)) level = 'info';

    let safeData = null;
    try {
      safeData = JSON.parse(JSON.stringify(data));
    } catch (e) {
      safeData = {
        error: "Unserializable data",
        type: typeof data,
        fallback: String(data)
      };
    }

    const payload = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      source,
      level: level.toUpperCase(),
      system: SYSTEM_ID,
      event,
      data: safeData,
      tags,
      trace,
    };

    payload.integrity = hashPayload(payload);

    logs.push(payload);

    if (logs.length > MAX_ENTRIES) logs.splice(0, logs.length - MAX_ENTRIES);

    writeSafely(LOG_PATH, logs);
    fs.writeFileSync(BACKUP_PATH, JSON.stringify(logs.slice(-1000), null, 2));

    // 🧠 Write to core awareness stream
    const awarenessEntry = `[${payload.timestamp}] ${payload.level} ${payload.source}: ${event}\n`;
    fs.appendFileSync(AWARENESS_PATH, awarenessEntry);

    console.log(`🛰️ [${payload.level}] ${payload.source} ➝ ${event}`);
  } catch (err) {
    console.error('💥 HIVE LOGGER FATAL:', err.message);
  }
}

// 🔹 Shorthand logging interface
module.exports = {
  logToHive,
  log: (level, event, data = null, source = 'sabian_core') =>
    logToHive({ level, event, data, source })
};
