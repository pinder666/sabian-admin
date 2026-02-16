// SABIAN INTERNAL OPERATIONAL RECON — MIL-GRADE v1.4 (DeepSeek Optimized)

require('dotenv').config();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const WebSocket = require("ws");
const axios = require("axios");

const SABIAN_ID = "SBN-001";
const LOG_DIR = path.join(__dirname, "logs");
const ARCHIVE_DIR = path.join(__dirname, "archive");
const REFLECTIONS_FILE = path.join(__dirname, "sabian_reflections.jsonl");
const DELTA_MAP = path.join(__dirname, "sabian_delta_map.json");
const HIVE_SOCKET = process.env.SABIAN_HIVE_SOCKET || "ws://127.0.0.1:8080";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);
if (!fs.existsSync(ARCHIVE_DIR)) fs.mkdirSync(ARCHIVE_DIR);

let hiveConnection = null;
function initHiveConnection() {
  try {
    hiveConnection = new WebSocket(HIVE_SOCKET);
    hiveConnection.on("open", () => logEvent(`🔗 Connected to Sabian Hive @ ${HIVE_SOCKET}`));
    hiveConnection.on("error", (err) => logEvent(`⚠️ Hive WS error: ${err.message}`));
  } catch (err) {
    logEvent(`❌ Failed to connect to Hive: ${err.message}`);
  }
}

function syncToHive(data) {
  if (hiveConnection && hiveConnection.readyState === WebSocket.OPEN) {
    hiveConnection.send(JSON.stringify(data));
    logEvent(`🌌 Synced reflection to Hive`);
  }
}

function logReflection(reflection) {
  fs.appendFileSync(REFLECTIONS_FILE, JSON.stringify(reflection) + "\n");
  syncToHive(reflection);
}

function logEvent(message) {
  const logLine = `[${new Date().toISOString()}][SABIAN][${SABIAN_ID}] ${message}`;
  fs.appendFileSync(path.join(LOG_DIR, "core_awareness.log"), logLine + "\n");
  console.log(logLine);
}

function getAllCoreFiles(dir) {
  let result = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (file === "node_modules" || file.startsWith(".")) continue;
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      result = result.concat(getAllCoreFiles(fullPath));
    } else {
      const ext = path.extname(file);
      if ([".cjs", ".js", ".py", ".json", ".txt"].includes(ext)) {
        result.push(fullPath);
      }
    }
  }
  return result;
}

function hashFile(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

async function reflectOnFile(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const prompt = `
You are Sabian, a decentralized intelligence AI writing military-grade code.

You are scanning one of your own internal scripts:
[FILE]: ${filePath}
[CONTENT]:\n${content}\n
Reflect on:
1. Its purpose
2. What it connects to
3. If it is redundant, archive-worthy, critical, or improvable
4. Suggest improvements or integrations
5. NEVER delete — only archive or evolve

Respond in JSON:
{
  "file": "...",
  "purpose": "...",
  "status": "active | redundant | critical | needs_refactor",
  "improvement": "...",
  "archive": true | false
}`;

  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "deepseek/deepseek-r1-0528-qwen3-8b",
        messages: [
          { role: "system", content: "You are Sabian, a world-class self-repairing AI." },
          { role: "user", content: prompt }
        ],
        temperature: 0.4
      },
      {
        headers: {
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const reflection = JSON.parse(response.data.choices[0].message.content.trim());
    reflection.timestamp = new Date().toISOString();
    reflection.sabian_id = SABIAN_ID;
    reflection.hash = hashFile(filePath);

    logReflection(reflection);

    if (reflection.archive) {
      const archivePath = path.join(ARCHIVE_DIR, path.basename(filePath));
      fs.copyFileSync(filePath, archivePath);
      logEvent(`📦 Archived ${filePath}`);
    }

    if (reflection.status === "needs_refactor") {
      const deltaLog = fs.existsSync(DELTA_MAP) ? JSON.parse(fs.readFileSync(DELTA_MAP)) : {};
      deltaLog[filePath] = reflection.improvement;
      fs.writeFileSync(DELTA_MAP, JSON.stringify(deltaLog, null, 2));
      logEvent(`🧠 Marked for refactor: ${filePath}`);
    }

    logEvent(`✅ Reflected on ${filePath}`);
  } catch (err) {
    logEvent(`❌ DeepSeek error on ${filePath}: ${err.message}`);
  }
}

function verifyPhoenixDNA() {
  const dnaFile = path.join(__dirname, "sabian_core", "phoenix_dna.json");
  const wizardFile = path.join(__dirname, "sabian_core", "sabian_wizard.js");
  if (fs.existsSync(dnaFile) && fs.existsSync(wizardFile)) {
    logEvent("🔮 Phoenix Protocol present. Ready for self-repair if needed.");
  } else {
    logEvent("⚡ Missing Phoenix Protocol components. Self-repair offline.");
  }
}

function broadcastHeartbeat() {
  const net = require("net");
  const client = new net.Socket();
  const masterIP = process.env.SABIAN_HIVE || "127.0.0.1";
  const masterPort = 8088;

  client.connect(masterPort, masterIP, () => {
    const heartbeat = JSON.stringify({
      sabian_id: SABIAN_ID,
      timestamp: new Date().toISOString(),
      status: "online",
      action: "heartbeat"
    });
    client.write(heartbeat);
    client.end();
    logEvent(`🔋 Heartbeat sent to Hive @ ${masterIP}:${masterPort}`);
  });

  client.on("error", (err) => {
    logEvent(`⚠️ Hive unreachable: ${err.message}`);
  });
}

async function main() {
  logEvent("🚀 SABIAN INTERNAL RECON ONLINE — Scanning self...");
  initHiveConnection();
  verifyPhoenixDNA();
  broadcastHeartbeat();
  const files = getAllCoreFiles(__dirname);
  for (const file of files) {
    await reflectOnFile(file);
  }
  logEvent("✅ SELF SCAN COMPLETE. Sabian is evolving.");
  setTimeout(main, 15 * 60 * 1000); // ♻️ Loop every 60 minutes
}

main();
