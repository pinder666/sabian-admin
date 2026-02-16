// loader.cjs
const fs = require('fs');
const path = require('path');
const { fork, spawn } = require('child_process');

const coreDir = __dirname;
const log = (msg) => console.log(`[SABIAN LOADER] ${msg}`);
const running = new Map();

// 🔧 Wizard First
try {
  const wizard = require('./sabian_wizard.cjs');
  if (typeof wizard.run === 'function') {
    wizard.run('--check');
    log('Wizard integrity check complete.');
  }
} catch (e) {
  const errorLog = {
  timestamp: new Date().toISOString(),
  source: "sabian_loader",
  file: "sabian_wizard.cjs",
  error: e.message,
  stack: e.stack || null
};
fs.appendFileSync("hive_debug_log.jsonl", JSON.stringify(errorLog) + "\n");
log(`[⚠️] Wizard load failed:`, e.message);


}


// 🔍 Valid Extensions
const validExtensions = ['.cjs', '.js', '.py', '.mjs', '.jsonl'];

// 🔁 Scan all files in core recursively
function getAllExecutableFiles(dir) {
  let results = [];
  fs.readdirSync(dir).forEach(file => {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      results = results.concat(getAllExecutableFiles(full));
    } else if (validExtensions.includes(path.extname(file)) && !file.includes('loader')) {
      results.push(full);
    }
  });
  return results;
}

// 🚀 Start module as persistent process
function startProcess(file) {
  if (running.has(file)) return;

  const ext = path.extname(file);
  let child;

  try {
    if (ext === '.py') {
      child = spawn('python', [file], { stdio: 'ignore' });
    } else if (ext === '.jsonl') {
      child = spawn('node', ['-e', `require("${file}")`], { stdio: 'ignore' });
    } else {
      child = fork(file);
    }

    running.set(file, child);
    log(`Started: ${file}`);

    child.on('exit', (code) => {
      log(`Module exited: ${file} [code ${code}]`);
      running.delete(file);

      // Let Wizard decide on restart
      try {
        const wizard = require('./sabian_wizard.cjs');
        if (typeof wizard.run === 'function') wizard.run('--check');
      } catch (e) {
        log(`Wizard restart check failed: ${e.message}`);
      }
    });
  } catch (err) {
    log(`❌ Failed to start ${file}: ${err.message}`);
  }
}

// 🧠 Boot Process
function bootSabianCore() {
  const allFiles = getAllExecutableFiles(coreDir);
  allFiles.forEach(startProcess);
}
require('./logger.cjs');

bootSabianCore();
