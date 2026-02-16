
const fs = require('fs');
const https = require('https');
const path = require('path');
const { logToHive } = require('./logger.cjs');

const HIVE_FILE = './sabian_hive_report.json';
const SYNC_INTERVAL = 1000 * 60 * 5; // 5 minutes
const BACKEND_URL = 'https://hive.sabian.ai/api/report';

function sendToBackend(payload) {
  const data = JSON.stringify(payload);
  const options = {
    hostname: 'hive.sabian.ai',
    path: '/api/report',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    }
  };

  const req = https.request(options, res => {
    let response = '';
    res.on('data', d => response += d);
    res.on('end', () => {
      logToHive({
        source: 'hive_sync',
        level: 'info',
        event: 'Hive sync successful',
        data: { response: response },
        tags: ['sync', 'periodic']
      });
      console.log('✅ Hive sync completed.');
    });
  });

  req.on('error', error => {
    logToHive({
      source: 'hive_sync',
      level: 'warn',
      event: 'Hive sync failed',
      data: { error: error.message },
      tags: ['sync', 'failure']
    });
    console.error('❌ Hive sync error:', error);
  });

  req.write(data);
  req.end();
}

function performSync() {
  if (!fs.existsSync(HIVE_FILE)) {
    logToHive({
      source: 'hive_sync',
      level: 'warn',
      event: 'Hive file not found during sync attempt',
      tags: ['sync', 'missing']
    });
    return;
  }

  try {
    const logs = JSON.parse(fs.readFileSync(HIVE_FILE, 'utf8'));
    sendToBackend(logs);
  } catch (err) {
    logToHive({
      source: 'hive_sync',
      level: 'error',
      event: 'Failed to parse Hive file for sync',
      data: { error: err.message },
      tags: ['sync', 'corrupt']
    });
  }
}

console.log('🔁 Hive Sync Service Running...');
setInterval(performSync, SYNC_INTERVAL);
performSync();
