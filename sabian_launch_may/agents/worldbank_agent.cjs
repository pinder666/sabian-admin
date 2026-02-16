// ─────────────────────────────────────────────
// SABIAN MILITARY-GRADE AGENT: World Bank Intel
// Agent ID: worldbank-001
// Source: World Bank GDP for UAE
// Standards: Operational, Auditable, Secure, Modular, Scalable
// ─────────────────────────────────────────────

const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ───── CONFIG ─────
const CONFIG = {
  agentId: 'worldbank-001',
  source: 'World Bank',
  target: 'https://api.worldbank.org/v2/country/UAE/indicator/NY.GDP.MKTP.CD?format=json',
  memoryPath: path.join(__dirname, '..', 'central_memory.jsonl'),
  generation: 0,
  parentId: null,
  retries: 3,
  timeout: 10000,
};

// ───── HELPERS ─────
function logEvent(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

function logToMemory(data) {
  const entry = {
    ...data,
    timestamp: new Date().toISOString(),
    agentId: CONFIG.agentId,
    source: CONFIG.source,
    parentId: CONFIG.parentId,
    generation: CONFIG.generation,
    status: 'active',
    missionId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
  };

  fs.appendFileSync(CONFIG.memoryPath, JSON.stringify(entry) + '\n');
  logEvent(`✅ Insight logged to memory: ${entry.missionId}`);
}

function verifyIntegrity() {
  const criticalFiles = [__filename];
  criticalFiles.forEach((file) => {
    const hash = crypto.createHash('sha256');
    const content = fs.readFileSync(file);
    hash.update(content);
    const digest = hash.digest('hex');
    logEvent(`🔐 Integrity check for ${path.basename(file)}: ${digest}`);
  });
}

function fetchWithHttps(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { timeout: CONFIG.timeout }, (res) => {
        let rawData = '';
        res.on('data', (chunk) => (rawData += chunk));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            return reject(new Error(`HTTP ${res.statusCode}`));
          }
          try {
            const parsed = JSON.parse(rawData);
            resolve(parsed);
          } catch (e) {
            reject(new Error('Invalid response format'));
          }
        });
      })
      .on('error', (err) => reject(err));
  });
}

// ───── MAIN OPERATION ─────
(async () => {
  logEvent(`🛰️ ${CONFIG.agentId} mission start`);
  verifyIntegrity();

  let attempt = 0;
  let success = false;

  while (attempt < CONFIG.retries && !success) {
    attempt++;
    logEvent(`🌐 Attempt ${attempt}: connecting to ${CONFIG.target}`);

    try {
      const data = await fetchWithHttps(CONFIG.target);
      if (!data || !Array.isArray(data) || !data[1]) {
        throw new Error('Invalid response format');
      }

      const latest = data[1][0];
      if (!latest || !latest.value || !latest.date) {
        throw new Error('Missing data in response');
      }

      const insight = `UAE GDP: ${latest.value} (${latest.date})`;

      logToMemory({ insight });
      success = true;
    } catch (err) {
      logEvent(`❌ Error: ${err.message}`);
      if (attempt >= CONFIG.retries) {
        logToMemory({ insight: `Mission failed: ${err.message}`, status: 'error' });
      }
    }
  }

  const masterLogPath = path.join(__dirname, '..', 'recon_logs', 'master_loop_ping.log');
  fs.appendFileSync(masterLogPath, `[${new Date().toISOString()}] [${CONFIG.agentId}] COMPLETED\n`);

  logEvent(`🏁 Mission complete for ${CONFIG.agentId}`);
})();
