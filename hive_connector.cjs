
const fs = require('fs');
const https = require('https');
const path = require('path');
const { logToHive } = require('./logger.cjs');

const HIVE_FILE = './sabian_hive_report.json';
const BACKEND_URL = 'https://your-backend-domain.com/api/report'; // Replace with real URL

function sendToBackend(payload) {
  const data = JSON.stringify(payload);
  const options = {
    hostname: 'your-backend-domain.com', // Replace with real domain
    path: '/api/report',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };

  const req = https.request(options, res => {
    let response = '';
    res.on('data', d => response += d);
    res.on('end', () => {
      logToHive({
        source: 'hive_connector',
        level: 'info',
        event: 'Hive logs synced successfully',
        data: { response: response },
        tags: ['sync', 'backend']
      });
      console.log('✅ Hive logs synced.');
    });
  });

  req.on('error', error => {
    logToHive({
      source: 'hive_connector',
      level: 'warn',
      event: 'Hive sync failed',
      data: { error: error.message },
      tags: ['sync', 'failure']
    });
    console.error('❌ Sync error:', error);
  });

  req.write(data);
  req.end();
}

function syncHiveLogs() {
  if (!fs.existsSync(HIVE_FILE)) {
    logToHive({
      source: 'hive_connector',
      level: 'warn',
      event: 'Hive file missing during sync attempt',
      tags: ['sync', 'missing']
    });
    return;
  }

  try {
    const logs = JSON.parse(fs.readFileSync(HIVE_FILE, 'utf8'));
    sendToBackend(logs);
  } catch (err) {
    logToHive({
      source: 'hive_connector',
      level: 'error',
      event: 'Failed to read Hive file during sync',
      data: { error: err.message },
      tags: ['sync', 'parse-failure']
    });
  }
}

syncHiveLogs();
