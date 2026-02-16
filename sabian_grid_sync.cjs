// sabian_grid_sync.cjs
// 🛡️ SABIAN GRID SYNC — FULL MILITARY-GRADE VERSION (CJS)

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');

const __dirname = __dirname;
const DEVICE_ID = 'SABIAN-GRID-001';

const CONFIG = {
  agentDir: path.join(__dirname),
  logPath: path.join(__dirname, 'logs', 'grid_sync.log'),
  memoryPath: path.join(__dirname, 'brain_memory.jsonl'),
  manifestHashPath: path.join(__dirname, 'config', 'grid_manifest.hash'),
  loopIntervalMinutes: 15,
  dispatchFile: path.join(__dirname, 'config', 'mission_dispatch.json')
};

function structuredLog(type, message, details = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    type,
    message,
    deviceId: DEVICE_ID,
    sabianId: 'sabian_grid_sync',
    missionId: crypto.randomUUID(),
    ...details
  };
  fs.appendFileSync(CONFIG.logPath, JSON.stringify(entry) + '\n');
  console.log(`[${entry.timestamp}] [${type}] ${message}`);
  return entry;
}

function phoenixSelfTest() {
  try {
    if (!fs.existsSync(CONFIG.memoryPath)) fs.writeFileSync(CONFIG.memoryPath, '');
    if (!fs.existsSync(CONFIG.logPath)) {
      fs.mkdirSync(path.dirname(CONFIG.logPath), { recursive: true });
      fs.writeFileSync(CONFIG.logPath, '');
    }
    if (!fs.existsSync(CONFIG.agentDir)) throw new Error('Agent directory missing');
    structuredLog('SELF_CHECK', '✅ Phoenix self-check passed.');
  } catch (err) {
    structuredLog('FATAL_BOOT', '❌ Self-check failed', { error: err.message });
    process.exit(1);
  }
}

function scanAgents() {
  const agents = fs.readdirSync(CONFIG.agentDir)
    .filter(f => f.endsWith('.cjs') && f !== path.basename(__filename))
    .map(f => path.join(CONFIG.agentDir, f));
  structuredLog('AGENT_SCAN', `📦 Found ${agents.length} active threads.`);
  return agents;
}

function runAgent(filePath) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [filePath], { stdio: 'pipe' });
    let output = '';
    proc.stdout.on('data', (data) => output += data.toString());
    proc.stderr.on('data', (err) => structuredLog('AGENT_ERR', err.toString()));
    proc.on('exit', (code) => {
      if (code === 0) {
        structuredLog('AGENT_OK', `Agent success: ${path.basename(filePath)}`, { output });
        resolve();
      } else {
        structuredLog('AGENT_FAIL', `Agent failed: ${path.basename(filePath)}`, { code });
        reject(new Error(`Fail code ${code}`));
      }
    });
  });
}

async function executeLoop() {
  structuredLog('LOOP_START', '🔁 Starting Sabian GRID cycle.');
  const agents = scanAgents();
  for (const agentPath of agents) {
    try {
      await runAgent(agentPath);
    } catch (err) {
      structuredLog('AGENT_CRITICAL', err.message);
    }
  }
  structuredLog('LOOP_COMPLETE', `✅ Cycle complete. Sleeping ${CONFIG.loopIntervalMinutes}min.`);
}

function checkExternalDispatch() {
  if (!fs.existsSync(CONFIG.dispatchFile)) return [];
  try {
    const data = fs.readFileSync(CONFIG.dispatchFile);
    const payload = JSON.parse(data);
    if (!Array.isArray(payload.agents)) return [];
    structuredLog('EXTERNAL_TRIGGER', `🚨 Dispatch: ${payload.agents.length} files queued.`);
    return payload.agents.map(a => path.join(CONFIG.agentDir, a));
  } catch (err) {
    structuredLog('DISPATCH_ERROR', 'Failed dispatch parse.', { error: err.message });
    return [];
  }
}

(async () => {
  phoenixSelfTest();
  await executeLoop();
  setInterval(async () => {
    const external = checkExternalDispatch();
    if (external.length > 0) {
      for (const file of external) await runAgent(file);
    }
    await executeLoop();
  }, CONFIG.loopIntervalMinutes * 60 * 1000);
})();
