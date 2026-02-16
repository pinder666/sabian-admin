const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const brain = require('brain.js');
const { restoreFromDNA, verifyAndRestore } = require('./phoenix_restore.cjs');

const criticalFiles = ['config.json', 'user_data.json', '.env', 'insight_engine.cjs', 'insight_engine.py'];
const dbFile = '.sabian_db.json';
const repairLog = 'repair_log.json';
const backupFolder = 'backup';

function log(message) {
  const entry = `[SABIAN-ML] ${new Date().toISOString()} → ${message}`;
  console.log(entry);
  fs.appendFileSync(repairLog, entry + '\n');
}

function loadDB() {
  if (!fs.existsSync(dbFile)) {
    fs.writeFileSync(dbFile, JSON.stringify({ history: [] }, null, 2));
  }
  return JSON.parse(fs.readFileSync(dbFile));
}

function saveDB(db) {
  fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));
}

function validateJSON(file) {
  try {
    JSON.parse(fs.readFileSync(file, 'utf8'));
    return true;
  } catch {
    return false;
  }
}

function createBackup(file) {
  if (!fs.existsSync(backupFolder)) fs.mkdirSync(backupFolder);
  const src = path.join(__dirname, file);
  const dest = path.join(__dirname, backupFolder, `${file}.${Date.now()}.bak`);
  fs.copyFileSync(src, dest);
  log(`Backup created for ${file}`);
}

async function rebuildFile(file) {
  const templates = {
    'config.json': { systemName: 'Sabian Core', version: '1.0.0' },
    'user_data.json': { users: [], updatedAt: new Date().toISOString() },
    '.env': 'OPENAI_API_KEY=\nELEVENLABS_API_KEY=\n'
  };
  if (templates[file]) {
    const content = file === '.env' ? templates[file] : JSON.stringify(templates[file], null, 2);
    fs.writeFileSync(file, content);
    log(`Rebuilt ${file}`);
  } else {
    restoreFromDNA(file);
    log(`Restored ${file} from phoenix_dna.json`);
  }
}

function checkSystemHealth() {
  const disk = os.freemem() / os.totalmem();
  const load = os.loadavg()[0];
  return { cpuOk: load < os.cpus().length * 0.75, memOk: disk > 0.1 };
}

async function deepRepair() {
  log('⚙️ Running ML-driven deep repair...');
  const db = loadDB();
  const systemHealth = checkSystemHealth();

  let trainingData = db.history.map(h => ({
    input: {
      failures: h.failures / 10,
      cpu: h.cpu,
      mem: h.mem
    },
    output: { risk: h.risk }
  }));

  const net = new brain.NeuralNetwork();
  if (trainingData.length > 5) net.train(trainingData);

  for (const file of criticalFiles) {
    const failureRecord = db.history.filter(h => h.file === file);
    const failures = failureRecord.length;
    const input = {
      failures: failures / 10,
      cpu: systemHealth.cpuOk ? 0 : 1,
      mem: systemHealth.memOk ? 0 : 1
    };
    const risk = net.run(input)?.risk || 0;

    log(`File: ${file} → Predicted risk: ${risk.toFixed(2)}`);

    if (risk > 0.7) {
      log(`🚨 High risk detected for ${file}. Triggering proactive repair.`);
      if (fs.existsSync(file)) createBackup(file);
      await rebuildFile(file);
      verifyAndRestore();
    } else if (risk > 0.4) {
      log(`⚠️ Medium risk: reinforcing ${file}`);
      if (!fs.existsSync(file) || !validateJSON(file)) await rebuildFile(file);
    } else {
      log(`✅ Low risk: ${file} skipped`);
    }

    db.history.push({
      timestamp: Date.now(),
      file,
      failures,
      cpu: systemHealth.cpuOk ? 0 : 1,
      mem: systemHealth.memOk ? 0 : 1,
      risk
    });
  }

  saveDB(db);
  log('✅ ML-driven deep repair cycle complete.');
}

function startSelfHealingLoop() {
  deepRepair();
  setInterval(() => {
    deepRepair();
  }, 10 * 60 * 1000);
}

if (require.main === module) {
  startSelfHealingLoop();
}

module.exports = { deepRepair };
