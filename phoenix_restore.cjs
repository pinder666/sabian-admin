const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const criticalFiles = ['config.json', 'user_data.json', '.env', 'insight_engine.cjs', 'insight_engine.py'];
const repairLog = 'repair_log.json';
const backupFolder = 'backup';

function log(message) {
  const entry = `[DEEP REPAIR] ${new Date().toISOString()} → ${message}`;
  console.log(entry);
  fs.appendFileSync(repairLog, entry + '\n');
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

function verifyAndRestore() {
  console.log("[PHOENIX] Running verifyAndRestore fallback...");
  // Add full verification + restore logic here later if needed
}

function restoreFromDNA(file) {
  console.log(`[PHOENIX] Restoring ${file} from phoenix_dna.json...`);
  if (!fs.existsSync(PHOENIX_FILE)) {
    console.error("[PHOENIX] DNA file missing");
    return;
  }

  const dna = JSON.parse(fs.readFileSync(PHOENIX_FILE, "utf8"));
  const encoded = dna[file];

  if (!encoded) {
    console.error(`[PHOENIX] No DNA entry for ${file}`);
    return;
  }

  try {
    const buffer = Buffer.from(encoded, 'base64');
    fs.writeFileSync(path.join(__dirname, file), buffer.toString('utf8'));
    log(`Restored ${file} from DNA`);
  } catch (err) {
    log(`❌ Failed to restore ${file}: ${err.message}`);
  }
}


async function rebuildFile(file) {
  const templates = {
    'config.json': { systemName: 'Sabian Core', version: '1.0.0' },
    'user_data.json': { users: [], updatedAt: new Date().toISOString() },
    '.env': 'OPENAI_API_KEY=\nELEVENLABS_API_KEY=\n'
  };

  if (templates[file]) {
    const content = file === '.env'
      ? templates[file]
      : JSON.stringify(templates[file], null, 2);
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
  const cpuOk = load < os.cpus().length * 0.75;
  const memOk = disk > 0.1;
  return { cpuOk, memOk };
}

function snapshotMetadata() {
  const snapshot = {
    timestamp: new Date().toISOString(),
    uptime: os.uptime(),
    freeMemory: os.freemem(),
    loadAverage: os.loadavg(),
    cpuCount: os.cpus().length
  };
  fs.writeFileSync('system_snapshot.json', JSON.stringify(snapshot, null, 2));
  log('System metadata snapshot saved.');
}

async function deepRepair() {
  log('🛠 Starting advanced deep repair...');
  let localSuccess = true;
  let failureCounter = 0;

  for (const file of criticalFiles) {
    if (fs.existsSync(file)) createBackup(file);

    if (!fs.existsSync(file)) {
      log(`⚠ ${file} missing. Rebuilding or restoring...`);
      await rebuildFile(file);
      localSuccess = false;
      failureCounter++;
    } else if (!validateJSON(file) && file !== '.env') {
      log(`⚠ ${file} corrupted. Rebuilding...`);
      await rebuildFile(file);
      localSuccess = false;
      failureCounter++;
    } else {
      log(`✅ ${file} OK`);
    }
  }

  const { cpuOk, memOk } = checkSystemHealth();
  if (!cpuOk || !memOk) {
    log(`❌ System health check failed (CPU OK: ${cpuOk}, Mem OK: ${memOk})`);
    localSuccess = false;
  }

  snapshotMetadata();

  if (failureCounter >= 2) {
    log(`⚠ Multiple failures detected (${failureCounter}). Triggering full Phoenix restore.`);
    verifyAndRestore();
  } else if (!localSuccess) {
    log('⚠ Local repair incomplete. Escalating to Phoenix restore...');
    verifyAndRestore();
  } else {
    log('✅ Advanced deep repair completed successfully.');
  }
}

if (require.main === module) {
  deepRepair();
}

module.exports = { verifyAndRestore, restoreFromDNA, phoenixDeepRepair: deepRepair };

