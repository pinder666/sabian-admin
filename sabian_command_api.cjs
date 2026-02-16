const express = require('express');
const fs = require('fs');
const path = require('path');
const { logToHive } = require('./logger.cjs');

const app = express();
const PORT = process.env.PORT || 5050;

app.use(express.json());

// === Utility Loader ===
function loadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return { error: 'Could not load file' };
  }
}

// === Routes ===

// Hive Logs
app.get('/api/hive/logs', (req, res) => {
  const data = loadJson('./sabian_hive_report.json');
  res.json(data);
});

// System Status
app.get('/api/status', (req, res) => {
  const status = loadJson('./sabian_status.json');
  const heartbeat = loadJson('./sabian_heartbeat.json');
  res.json({ status, heartbeat });
});

// Brain Snapshot
app.get('/api/brain/today', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const file = `./sabian_brain_${today}.json`;
  const data = loadJson(file);
  res.json(data);
});

// Escalations
app.get('/api/escalations', (req, res) => {
  const data = loadJson('./hive_escalations.json');
  res.json(data);
});

// Phoenix DNA
app.get('/api/phoenix/files', (req, res) => {
  const data = loadJson('./phoenix_dna.json');
  res.json(data);
});

// === Command Triggers ===

function runScript(file, label, res) {
  const { exec } = require('child_process');
  exec(file, (err, stdout, stderr) => {
    logToHive({
      source: 'command_center_api',
      level: 'action',
      event: `UI Triggered: ${label}`,
      data: { err, stderr },
      tags: ['trigger', 'ui']
    });
    res.json({ stdout, stderr, success: !err });
  });
}

app.post('/api/trigger/learn', (req, res) => runScript('python sabian_learn.py', 'sabian_learn.py', res));
app.post('/api/trigger/self-reflect', (req, res) => runScript('python sabian_self_evolve.py', 'sabian_self_evolve.py', res));
app.post('/api/trigger/evolve', (req, res) => runScript('python sabian_evolve.py', 'sabian_evolve.py', res));
app.post('/api/trigger/smart', (req, res) => runScript('node smart_sabian.cjs', 'smart_sabian.cjs', res));
app.post('/api/trigger/wizard', (req, res) => runScript('node sabian_wizard.cjs', 'sabian_wizard.cjs', res));
app.post('/api/trigger/merge-brain', (req, res) =>
  runScript('python sabian_brain_merger.py', 'sabian_brain_merger.py', res));

app.post('/api/trigger/scenario', (req, res) =>
  runScript('python sabian_scenario_engine.py', 'sabian_scenario_engine.py', res));

app.post('/api/trigger/advisor', (req, res) =>
  runScript('python sabian_smart_advisor.py', 'sabian_smart_advisor.py', res));

app.post('/api/trigger/govern', (req, res) =>
  runScript('python sabian_global_governor.py', 'sabian_global_governor.py', res));

app.listen(PORT, () => {
  console.log(`🧠 Sabian Command API running on http://localhost:${PORT}`);
});
