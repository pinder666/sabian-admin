// mission_executor_military.cjs
// 🔒 MILITARY-GRADE SABIAN EXECUTOR v1.0 + Failure Intelligence

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { logFailure } = require('./failure_logger.cjs');
const { requestFix } = require('./autofix_handler.cjs');

const CHILD_DIR = '/root/sabians/children';
const LOG_PATH = '/root/sabian_reports/logs.json';
const FAILURE_TRACKER = path.join(__dirname, 'failure_counter.json');
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = 500;
const VERSION = '1.0-military';
const SABIAN_CORE_DIR = '/root/sabian_core';

function logEvent(event) {
  const entry = {
    ...event,
    timestamp: new Date().toISOString(),
    host: os.hostname(),
    executor_version: VERSION
  };
  fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n');
}

function verifyIntegrity() {
  const criticalFiles = [
    path.join(SABIAN_CORE_DIR, 'sabian_wizard.cjs'),
    path.join(__dirname, 'mission_executor_military.cjs')
  ];
  for (const filePath of criticalFiles) {
    if (!fs.existsSync(filePath)) {
      console.error(`🛑 CRITICAL FILE MISSING: ${filePath}`);
      logEvent({ level: 'fatal', message: `Missing file ${filePath}` });
      process.exit(1);
    }
  }
  logEvent({ level: 'info', message: 'Phoenix integrity check passed' });
}

function runMission(childFile) {
  try {
    const childPath = path.join(CHILD_DIR, childFile);
    const child = JSON.parse(fs.readFileSync(childPath));

    if (child.mission.status === 'completed') return;

    let failureLog = {};
    if (fs.existsSync(FAILURE_TRACKER)) {
      failureLog = JSON.parse(fs.readFileSync(FAILURE_TRACKER));
    }

    const failureKey = child.id;
    failureLog[failureKey] = failureLog[failureKey] || { count: 0, lastError: '' };

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const success = Math.random() < 0.1;
      child.mission.attempts += 1;

      if (success) {
        child.mission.status = 'completed';
        logEvent({ id: child.id, target: child.target, status: 'success', attempts: attempt });
        break;
      } else {
        logEvent({ id: child.id, target: child.target, status: 'failed attempt', attempts: attempt });
        failureLog[failureKey].count++;
        failureLog[failureKey].lastError = 'Execution failure';

        if (failureLog[failureKey].count >= 3) {
          logFailure(child.id, failureLog[failureKey].lastError);
          requestFix({ id: child.id, file: path.relative(__dirname, childPath), lastError: failureLog[failureKey].lastError });
        }

        if (attempt < MAX_ATTEMPTS) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, BACKOFF_MS);
      }
    }

    fs.writeFileSync(childPath, JSON.stringify(child, null, 2));
    fs.writeFileSync(FAILURE_TRACKER, JSON.stringify(failureLog, null, 2));

  } catch (err) {
    logEvent({ level: 'error', message: `Executor crash on ${childFile}`, error: err.message });
    logFailure(childFile.replace('.json', ''), err.message);
  }
}

function main() {
  console.log(`🛰️ SABIAN MILITARY EXECUTOR v${VERSION} BOOTED`);
  verifyIntegrity();
  const children = fs.readdirSync(CHILD_DIR).filter(f => f.endsWith('.json'));

  for (const file of children) {
    runMission(file);
  }

  logEvent({ level: 'info', message: 'Executor run complete', totalChildren: children.length });
  console.log('✅ Executor completed. Logs written to logs.json');
}

main();
