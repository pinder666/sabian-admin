const express = require('express');
const fs = require('fs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { logToHive } = require('./logger.cjs');

const app = express();
const PORT = 8080;
const ENABLE_CONSOLE_LOGS = true;
const LOG_FILE = 'wizard_logs.jsonl';

app.use(express.json());

function safeAppend(file, content) {
  try {
    fs.appendFileSync(file, content);
  } catch (err) {
    const backupFile = file.replace('.json', '_BACKUP.json');
    fs.appendFileSync(backupFile, content);
  }
}

function logToWizard(data) {
  const payload = {
    id: uuidv4(),
    time: new Date().toISOString(),
    system: 'HIVE_BACKEND',
    status: 'active',
    ...data
  };
  const line = JSON.stringify(payload) + '\n';
  safeAppend(LOG_FILE, line);
  if (ENABLE_CONSOLE_LOGS) console.log(`[🧠 Wizard Log]`, payload);
}

app.post('/api/report', (req, res) => {
  const logData = req.body;
  safeAppend('hive_logs.json', JSON.stringify({ time: new Date(), logs: logData }) + '\n');
  logToHive({
    source: 'hive_backend',
    level: 'info',
    event: 'External report received',
    data: logData,
    tags: ['external', 'report']
  });
  res.json({ status: 'received' });
});

app.post('/api/escalate', (req, res) => {
  const issue = req.body;
  safeAppend('hive_escalations.json', JSON.stringify({ time: new Date(), issue }) + '\n');
  logToHive({
    source: 'hive_backend',
    level: 'critical',
    event: 'Escalation triggered',
    data: issue,
    tags: ['escalation', 'critical']
  });
  res.json({ status: 'escalation received' });
});

app.get('/heartbeat', (req, res) => {
  res.json({ status: 'alive', time: new Date().toISOString() });
});

app.get('/test-endpoint', (req, res) => {
  console.log('✅ Hive responded to test-endpoint.');
  res.json({ message: '✅ Hive backend is alive and operational.' });
});

app.listen(PORT, () => {
  console.log(`🚀 Hive backend running on port ${PORT}`);
  logToWizard({ event: 'Hive backend started.' });

  // 🌀 Loop every 60 seconds to log status
  setInterval(() => {
    logToWizard({ event: 'Hive loop heartbeat.' });
  }, 60000);
});
