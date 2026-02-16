// failure_logger.cjs

const fs = require('fs');
const path = require('path');
const FAILURE_LOG = path.join(__dirname, 'failure_counter.json');

function logFailure(missionId, errorMessage) {
  let log = {};
  if (fs.existsSync(FAILURE_LOG)) {
    log = JSON.parse(fs.readFileSync(FAILURE_LOG, 'utf8'));
  }

  if (!log[missionId]) {
    log[missionId] = { count: 0, lastError: '' };
  }

  log[missionId].count += 1;
  log[missionId].lastError = errorMessage;
  log[missionId].lastFailure = new Date().toISOString();

  fs.writeFileSync(FAILURE_LOG, JSON.stringify(log, null, 2));
  console.error(`❌ Mission failure logged: ${missionId} [${log[missionId].count}x]`);
}

module.exports = { logFailure };
