// Smart Sabian: Finalized Autonomous Core — Hive-Aware, Wizard-Monitored, Phoenix-Healing, OpenAI-Enabled

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');
const https = require('https');
const { logToHive } = require('./logger.cjs');

const WATCH_FOLDER = './sabian_core';
const PHOENIX_BACKUP = './phoenix_dna.json';
const LOG_FILE = './sabian_hive_report.json';
const WATCHLIST_FILE = './sabian_core/smart_sabian_watchlist.json';
const STATUS_FILE = './sabian_status.json';
const HEARTBEAT_FILE = './sabian_heartbeat.json';
const SELF_FILE = __filename;

if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, JSON.stringify([], null, 2));
if (!fs.existsSync(STATUS_FILE)) fs.writeFileSync(STATUS_FILE, JSON.stringify({}, null, 2));

const lastRunTimestamps = {};
const failCounts = {};

function updateStatus(script, status) {
  const statusData = fs.existsSync(STATUS_FILE) ? JSON.parse(fs.readFileSync(STATUS_FILE)) : {};
  statusData[script] = { ...status, timestamp: new Date().toISOString() };
  fs.writeFileSync(STATUS_FILE, JSON.stringify(statusData, null, 2));
}

function writeHeartbeat() {
  const heartbeat = { status: 'alive', timestamp: new Date().toISOString() };
  fs.writeFileSync(HEARTBEAT_FILE, JSON.stringify(heartbeat, null, 2));
  logToHive({
    source: 'smart_sabian',
    level: 'heartbeat',
    event: 'System heartbeat written',
    data: heartbeat,
    tags: ['system', 'heartbeat']
  });
}

function getFileHash(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

function loadPhoenixBlueprint() {
  if (!fs.existsSync(PHOENIX_BACKUP)) return {};
  return JSON.parse(fs.readFileSync(PHOENIX_BACKUP, 'utf8'));
}

function repairFile(file, blueprint) {
  if (blueprint[file]) {
    fs.writeFileSync(path.join(WATCH_FOLDER, file), blueprint[file], 'base64');
    logToHive({
      source: 'smart_sabian',
      level: 'repair',
      event: `Repaired ${file} from Phoenix backup`,
      tags: ['phoenix', 'repair']
    });
  } else {
    logToHive({
      source: 'smart_sabian',
      level: 'warn',
      event: `No backup found for ${file}, escalating to Wizard`,
      tags: ['escalation', 'repair']
    });
  }
}

function watchAndHeal() {
  const blueprint = loadPhoenixBlueprint();
  fs.readdir(WATCH_FOLDER, (err, files) => {
    if (err) return;
    files.forEach(file => {
      const filePath = path.join(WATCH_FOLDER, file);
      if (!fs.existsSync(filePath)) repairFile(file, blueprint);
    });
  });
}

function checkSelfIntegrity() {
  const blueprint = loadPhoenixBlueprint();
  const selfName = path.basename(SELF_FILE);
  const selfHash = getFileHash(SELF_FILE);
  const backupHash = blueprint[`${selfName}_hash`];
  if (backupHash && selfHash !== backupHash) {
    logToHive({
      source: 'smart_sabian',
      level: 'critical',
      event: 'Self-integrity check failed',
      data: { current: selfHash, expected: backupHash },
      tags: ['integrity', 'security']
    });
  }
}

// GAP 1 FIXED: GPT-4 → Claude Sonnet 4.6 (Anthropic API)
function claudeAutonomousCall(prompt, callback) {
  const data = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [
      { role: 'user', content: prompt }
    ]
  });

  const options = {
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    }
  };

  const req = https.request(options, res => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      logToHive({
        source: 'smart_sabian',
        level: 'intel',
        event: 'Claude handshake complete',
        data: body,
        tags: ['claude', 'response']
      });
      if (callback) callback(body);
    });
  });

  req.on('error', error => logToHive({
    source: 'smart_sabian',
    level: 'error',
    event: 'Claude request failed',
    data: error.message,
    tags: ['claude', 'failure']
  }));
  req.write(data);
  req.end();
}

// GAP 2 FIXED: Structured hive extraction — extracts pattern signals from script output
function extractAndPostHivePattern(scriptName, rawOutput) {
  const hiveEvent = {
    source_engine: 'smart_sabian',
    data_version: '1.0',
    ts: new Date().toISOString(),
    brand_id: 'all',
    watchlist_script: scriptName,
    raw_output_length: rawOutput.length,
  };

  // Wholesale signal extraction — parse known patterns from raw output
  const patterns = [
    { regex: /chargeback[s]?.*?\$([0-9,]+)/i, field: 'cb_total_exposed', parse: (m) => parseFloat(m[1].replace(/,/g, '')) },
    { regex: /at.?risk.*?(\d+)\s*account/i, field: 'ar_accounts_flagged', parse: (m) => parseInt(m[1]) },
    { regex: /dead.?stock.*?\$([0-9,]+)/i, field: 'ds_total_carry', parse: (m) => parseFloat(m[1].replace(/,/g, '')) },
    { regex: /score.*?:\s*(\d+)/i, field: 'score_composite', parse: (m) => parseInt(m[1]) },
    { regex: /recoverable.*?\$([0-9,]+)/i, field: 'cb_recovered_ytd', parse: (m) => parseFloat(m[1].replace(/,/g, '')) },
  ];

  for (const { regex, field, parse } of patterns) {
    const match = rawOutput.match(regex);
    if (match) hiveEvent[field] = parse(match);
  }

  const hiveLogPath = path.resolve(__dirname, '../output/hive_events.jsonl');
  try {
    const dir = path.dirname(hiveLogPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(hiveLogPath, JSON.stringify(hiveEvent) + '\n', 'utf8');
    logToHive({
      source: 'smart_sabian',
      level: 'info',
      event: `Hive pattern extracted from ${scriptName}`,
      data: { fields_extracted: Object.keys(hiveEvent).length },
      tags: ['hive', 'extraction']
    });
  } catch (e) {
    logToHive({ source: 'smart_sabian', level: 'error', event: 'Hive write failed', data: e.message, tags: ['hive', 'error'] });
  }
}

function runWatchlistScripts() {
  if (!fs.existsSync(WATCHLIST_FILE)) return;
  const watchlist = JSON.parse(fs.readFileSync(WATCHLIST_FILE, 'utf8'));

  watchlist.forEach(entry => {
    if (!entry.enabled) return;

    const now = Date.now();
    const interval = entry.interval_minutes * 60 * 1000;

    if (!(entry.script in lastRunTimestamps)) {
      lastRunTimestamps[entry.script] = now - interval - 1000;
    }

    const lastRun = lastRunTimestamps[entry.script];

    if (now - lastRun >= interval) {
      lastRunTimestamps[entry.script] = now;

      logToHive({
        source: 'smart_sabian',
        level: 'info',
        event: `Executing watchlist script: ${entry.script}`,
        tags: ['watchlist', 'execution']
      });

      exec(`node "${entry.script}"`, (err, stdout, stderr) => {
        const output = stdout?.trim() || '[no output]';
        const error = err?.message || stderr?.trim();

        if (err || stderr) {
          failCounts[entry.script] = (failCounts[entry.script] || 0) + 1;
          updateStatus(entry.script, { status: 'error', message: error, attempts: failCounts[entry.script] });
          logToHive({
            source: 'smart_sabian',
            level: 'error',
            event: `${entry.name} failed`,
            data: error,
            tags: ['watchlist', 'failure']
          });
          if (failCounts[entry.script] >= 3) {
            logToHive({
              source: 'smart_sabian',
              level: 'warn',
              event: `${entry.name} marked as degraded`,
              tags: ['watchlist', 'degraded']
            });
          }
        } else {
          failCounts[entry.script] = 0;
          updateStatus(entry.script, { status: 'success', output });
          logToHive({
            source: 'smart_sabian',
            level: 'success',
            event: `Ran ${entry.name}`,
            data: output,
            tags: ['watchlist', 'success']
          });
          claudeAutonomousCall(`Summarize and extract wholesale signals from: ${output}`);
          extractAndPostHivePattern(entry.script, output);
        }
      });
    }
  });
}

// GAP 3 FIXED: Outcome observer loop — runs Python observer every 60 minutes
let outcomeObserverTick = 0;
const OUTCOME_OBSERVER_INTERVAL = 60 * 60 * 1000 / (15 * 1000); // every 240 ticks @ 15s

setInterval(() => {
  watchAndHeal();
  checkSelfIntegrity();
  runWatchlistScripts();
  writeHeartbeat();

  outcomeObserverTick++;
  if (outcomeObserverTick >= OUTCOME_OBSERVER_INTERVAL) {
    outcomeObserverTick = 0;
    const observerCmd = 'python -m backend.cli.outcome_observer --brand-id all';
    exec(observerCmd, { cwd: path.resolve(__dirname, '../../orderbookiq') }, (err, stdout, stderr) => {
      if (err) {
        logToHive({ source: 'smart_sabian', level: 'error', event: 'Outcome observer failed', data: err.message, tags: ['outcome', 'observer'] });
      } else {
        logToHive({ source: 'smart_sabian', level: 'info', event: 'Outcome observer ran', data: stdout?.trim() || '[no output]', tags: ['outcome', 'observer'] });
      }
    });
  }
}, 15 * 1000);

console.log('🤖 Smart Sabian is live. Self-aware, mission-first, autonomous, and unstoppable.');
