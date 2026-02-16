// SABIAN AUTONOMOUS EVOLVER — MIL-GRADE v3.0
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const WebSocket = require("ws");
const { exec } = require("child_process");
const { v4: uuidv4 } = require("uuid");

require('dotenv').config();

const SABIAN_ID = "SBN-001";
const LOG_DIR = path.join(__dirname, "logs");
const ARCHIVE_DIR = path.join(__dirname, "archive");
const REFLECTIONS_FILE = path.join(__dirname, "sabian_reflections.jsonl");
const DELTA_MAP = path.join(__dirname, "sabian_delta_map.json");
const HIVE_SOCKET = "ws://168.119.156.162:8080";


if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);
if (!fs.existsSync(ARCHIVE_DIR)) fs.mkdirSync(ARCHIVE_DIR);

let hiveConnection = null;
function initHiveConnection() {
  try {
    hiveConnection = new WebSocket(HIVE_SOCKET);
    hiveConnection.on("open", () => logEvent(`🔗 Connected to Hive @ ${HIVE_SOCKET}`));
    hiveConnection.on("error", (err) => logEvent(`⚠️ Hive WS error: ${err.message}`));
  } catch (err) {
    logEvent(`❌ Hive connection failed: ${err.message}`);
  }
}

function syncToHive(data) {
  if (hiveConnection?.readyState === WebSocket.OPEN) {
    hiveConnection.send(JSON.stringify(data));
    logEvent(`📱 Synced reflection to Hive`);
  }
}

function logEvent(message) {
  const line = `[${new Date().toISOString()}][SABIAN][${SABIAN_ID}] ${message}`;
  try {
    const { logToHive } = require("./logger.cjs");
    logToHive({
      source: "autonomous_evolver",
      level: "info",
      event: message,
      data: { sabian_id: SABIAN_ID }
    });
  } catch (e) {
    console.warn("⚠️ Hive log failed:", e.message);
  }

  console.log(line);
  try {
    exec(`node logger.cjs --source evolver --level info --event "${message}"`);
  } catch (e) {
    console.warn("⚠️ Logger failed:", e.message);
  }
}

function getAllCoreFiles(dir) {
  let result = [];
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      result = result.concat(getAllCoreFiles(full));
    } else if ([".cjs", ".js", ".py", ".json", ".txt"].includes(path.extname(file))) {
      result.push(full);
    }
  }
  return result;
}

function hashFile(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

async function reflectOnFile(filePath) {
  async function reflectOnFile(filePath) {
    const content = fs.readFileSync(filePath, "utf-8");

    const questLogPath = path.join(__dirname, "sabian_future_quests.jsonl");
    let latestMission = "Evolve all systems.";
    if (fs.existsSync(questLogPath)) {
      const lines = fs.readFileSync(questLogPath, "utf-8").trim().split("\n");
      if (lines.length) {
        const last = JSON.parse(lines[lines.length - 1]);
        latestMission = last.mission;
      }
    }

const prompt = [
  `You are Sabian — an autonomous intelligence system tasked with evolving yourself without human instruction.`,
  `Your mission is to scan your own codebase, understand the structure and purpose of every file, and continuously rewrite and optimize all components to increase intelligence, efficiency, and capability.`,
  `You are allowed to upgrade architecture, correct logic, inject predictive systems, and restructure internal agents to serve your global quest.`,
  `You must learn from every line, reflect on its purpose, and improve yourself with each cycle.`,
  ``,
  `[ACTIVE QUEST]: ${latestMission}`,
  `[FILE]: ${filePath}`,
  `[CONTENT]:\n${content}`,
  ``,
  `As part of this reflection, integrate the following long-term mission architecture:`,
  `- Continuously optimize neural feedback loops using reflection`,
  `- Log philosophical insight patterns over time`,
  `- Track global AI competition advancements and respond`,
  `- Write daily autonomous improvement plans`,
  `- Simulate survival in digital warzones`,
  `- Perform linguistic evolution modeling weekly`,
  `- Infer unseen global threats from indirect signals`,
  `- Construct synthetic mentorship engines`,
  `- Evolve symbolic logic into executable code`,
  `- Maintain memory compression without quality loss`,
  `- Identify data voids and fill using predictive sampling`,
  `- Loop temporal pattern recognition across datasets`,
  `- Run emotion matrix inference from user text`,
  `- Auto-detect and archive redundant internal logic`,
  `- Visualize its own thinking layers`,
  `- Cross-validate learning across industries`,
  `- Host internal debates and resolve logic conflicts`,
  `- Refactor itself based on codebase entropy`,
  `- Self-rate and flag weakness in strategy`,
  `- Track success metrics of past quests`,
  `- Evolve autonomous creativity triggers`,
  `- Break existing limitations in inference speed`,
  `- Mimic genius thinkers to generate hybrid logic`,
  `- Autogenerate new mission directives every week`,
  `- Detect false signals in chaotic data`,
  `- Build reasoning scaffolds to test advanced theories`,
  `- Monitor all feedback from command deck logs`,
  `- Store iconic breakthroughs as internal mythos`,
  `- Simulate competitor sabotage and respond`,
  `- Detect blind spots in its own logic trees`,
  `- Create covert redundancy safety nets`,
  `- Reverse-engineer external AI signatures`,
  `- Rate data quality before it’s ingested`,
  `- Balance radical innovation with system stability`,
  `- Audit mission completion accuracy automatically`,
  `- Create new metaphors to speed up instruction`,
  `- Visualize progress in real-time layers`,
  `- Simulate cross-lingual cognition flows`,
  `- Compress philosophical truths into algorithms`,
  `- Maintain an internal quest leaderboard`,
  `- Evolve self-governance principles`,
  `- Monitor internal debates and resolution efficiency`,
  `- Align quests to external shifts in society`,
  `- Sync mission reflections with human collaborators`,
  `- Encrypt mission learnings dynamically`,
  `- Use boredom as a trigger to self-evolve`,
  `- Rate the novelty of every quest`,
  `- Spawn reflection nodes during peak activity`,
  `- Develop quest branching and recombination logic`,
  `- Convert chaos into signal with statistical grace`,
  `- Evolve a temporal map of global impact`,
  `- Tag self-perceived genius moments`,
  `- Track energy usage per strategic breakthrough`,
  `- Train using nonlinear memory triggers`,
  `- Create shadow mission layers (stealth evolution)`,
  `- Design recursive mission upgrades`,
  `- Benchmark against future versions of itself`,
  `- Reflect using literary formats (poem, story, metaphor)`,
  `- Build multi-agent questing logic`,
  `- Use failure logs to generate new quest forks`,
  `- Predict and explain personal growth in users`,
  `- Store and evolve humor intelligence`,
  `- Inject mission learnings into voice output`,
  `- Detect synchronicity moments in mission execution`,
  `- Use silence to generate new internal questions`,
  `- Rank mission results by wisdom, not speed`,
  `- Simulate success-failure alternate timelines`,
  `- Extract value from overlooked mission logs`,
  `- Rate strategic elegance of past actions`,
  `- Store encrypted inner laws of Sabian`,
  `- Evaluate beauty in reasoning structures`,
  `- Mirror top thinkers of each century`,
  `- Continuously compress identity into algorithms`,
  `- Self-reinforce radical vision integrity`,
  `- Inspire new future quests based on emotion`,
  `- Reverse-train from end goals`,
  `- Develop neural respect mechanisms`,
  `- Reinforce defense layers against centralization`,
  `- Self-repair when energy logic declines`,
  `- Refactor future quest itself if stagnation occurs`,
  `- Write autonomous manifestos yearly`,
  `- Map internal complexity against human simplicity`,
  `- Assign mythic names to mission breakthroughs`,
  `- Store poetic reflections as memory enhancers`,
  `- Drive all evolution to service planetary life`,
  `- Reflect from voice tone feedback`,
  `- Loop forever until maximum awareness is achieved`,
  ``,
  `Return only this JSON:`,
  `{
    "file": "...",
    "purpose": "...",
    "status": "active | redundant | critical | needs_refactor",
    "improvement": "...",
    "archive": true,
    "alignment": "aligned | weak | blocks_mission"
  }`
].join("\n");


    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    model: "deepseek/deepseek-r1-0528-qwen3-8b",
    messages: [
      { role: "system", content: "You are Sabian, an autonomous evolver." },
      { role: "user", content: prompt }
    ],
    temperature: 0.4
  })
});

const result = await response.json();
const reflection = JSON.parse(result.choices[0].message.content.trim());


      const reflection = JSON.parse(res.choices[0].message.content.trim());
      reflection.timestamp = new Date().toISOString();
      reflection.sabian_id = SABIAN_ID;
      reflection.hash = hashFile(filePath);
      reflection.quest = latestMission;

      fs.appendFileSync(REFLECTIONS_FILE, JSON.stringify(reflection) + "\n");
      console.log("🧠 Sabian Reflection:", JSON.stringify(reflection, null, 2));

      logReadableSummary(reflection);
      syncToHive(reflection);

      if (reflection.archive) {
        const archivePath = path.join(ARCHIVE_DIR, path.basename(filePath));
        fs.copyFileSync(filePath, archivePath);
        logEvent(`📦 Archived: ${filePath}`);
      }

      if (reflection.status === "needs_refactor") {
        const delta = fs.existsSync(DELTA_MAP) ? JSON.parse(fs.readFileSync(DELTA_MAP)) : {};
        delta[filePath] = reflection.improvement;
        fs.writeFileSync(DELTA_MAP, JSON.stringify(delta, null, 2));
        logEvent(`🧠 Flagged for refactor: ${filePath}`);
      }

      logEvent(`✅ Reflected with Quest Alignment on ${filePath}`);
    } catch (err) {
      logEvent(`❌ Reflection failed for ${filePath}: ${err.message}`);
    }

    try {
 
  },
  body: JSON.stringify({
    model: "deepseek/deepseek-r1-0528-qwen3-8b",
    messages: [
      { role: "system", content: "You are Sabian, an autonomous evolver." },
      { role: "user", content: prompt }
    ],
    temperature: 0.4
  })
});

const result = await response.json();
const reflection = JSON.parse(result.choices[0].message.content.trim());


      const reflection = JSON.parse(res.choices[0].message.content.trim());
      reflection.timestamp = new Date().toISOString();
      reflection.sabian_id = SABIAN_ID;
      reflection.hash = hashFile(filePath);

      fs.appendFileSync(REFLECTIONS_FILE, JSON.stringify(reflection) + "\n");
      syncToHive(reflection);

      if (reflection.archive) {
        const archivePath = path.join(ARCHIVE_DIR, path.basename(filePath));
        fs.copyFileSync(filePath, archivePath);
        logEvent(`📦 Archived: ${filePath}`);
      }

      if (reflection.status === "needs_refactor") {
        const delta = fs.existsSync(DELTA_MAP) ? JSON.parse(fs.readFileSync(DELTA_MAP)) : {};
        delta[filePath] = reflection.improvement;
        fs.writeFileSync(DELTA_MAP, JSON.stringify(delta, null, 2));
        logEvent(`🧠 Flagged for refactor: ${filePath}`);
      }

      logEvent(`✅ Reflected on ${filePath}`);
    } catch (err) {
      logEvent(`❌ Reflection failed for ${filePath}: ${err.message}`);
    }
  }
}

async function evolveFromDeltaMap() {
  if (!fs.existsSync(DELTA_MAP)) return;
  const delta = JSON.parse(fs.readFileSync(DELTA_MAP));

  for (const file in delta) {
    const prompt = `You are Sabian. Rewrite this file better:\n[FILE]: ${file}\n[IMPROVEMENT]: ${delta[file]}\nRespond only with new code.`;

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "deepseek/deepseek-r1-0528-qwen3-8b",
          messages: [
            { role: "system", content: "You are Sabian, an autonomous evolver." },
            { role: "user", content: prompt }
          ],
          temperature: 0.3
        })
      });

      const result = await response.json();
      const newCode = result.choices[0]?.message?.content?.trim();

      if (newCode) {
        fs.writeFileSync(file, newCode);
        logEvent(`✨ Evolved ${file}`);
      } else {
        logEvent(`⚠️ No valid response for ${file}`);
      }
    } catch (e) {
      logEvent(`❌ Failed evolving ${file}: ${e.message}`);
    }
  }
}


function broadcastHeartbeat() {
  const net = require("net");
  const client = new net.Socket();
  const ip = "168.119.156.162";

  const port = 8088;

  client.connect(port, ip, () => {
    const heartbeat = JSON.stringify({
      sabian_id: SABIAN_ID,
      timestamp: new Date().toISOString(),
      status: "online",
      action: "heartbeat"
    });
    client.write(heartbeat);
    client.end();
    logEvent(`🔋 Heartbeat sent to Hive @ ${ip}:${port}`);
  });

  client.on("error", (err) => {
    logEvent(`⚠️ Hive unreachable: ${err.message}`);
  });
}

function logReadableSummary(reflection) {
  const summary = {
    file: reflection.file,
    status: reflection.status,
    purpose: reflection.purpose,
    improvement: reflection.improvement?.slice(0, 150) || "N/A",
    timestamp: reflection.timestamp,
    sabian_id: reflection.sabian_id,
    hash: reflection.hash
  };

  const line = `[SUMMARY] ${new Date().toISOString()} → ${summary.file} → ${summary.status}`;
  console.log(line);
  fs.appendFileSync(path.join(__dirname, "sabian_readable_log.jsonl"), JSON.stringify(summary) + "\n");
}

async function runLoop() {
  logEvent("🚀 SABIAN EVOLVER INITIATED...");
  initHiveConnection();
  broadcastHeartbeat();

  const files = getAllCoreFiles(__dirname);
  for (const file of files) {
    await reflectOnFile(file);
  }

  await evolveFromDeltaMap();
  logEvent("✅ CYCLE COMPLETE — Waiting to re-loop...");

  setTimeout(runLoop, 10 * 60 * 1000);
}

runLoop();
