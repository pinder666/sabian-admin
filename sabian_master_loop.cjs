const fs = require('fs');
const axios = require('axios');

const path = require('path');
const { findByTag } = require('./memory_resolver.cjs');

// Add delay helper
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchSmartSabianData() {
  if (!fs.existsSync('smart_sabian_status.json')) return [];
  return JSON.parse(fs.readFileSync('smart_sabian_status.json', 'utf8'));
}

async function summarizeData(data) {
  const summary = {
    totalAgents: data.length,
    activeAgents: data.filter(a => a.status === 'active').length,
    averageCPU: (data.reduce((sum, a) => sum + parseFloat(a.cpu), 0) / data.length).toFixed(2),
    averageMemory: (data.reduce((sum, a) => sum + parseFloat(a.memory), 0) / data.length).toFixed(2),
    timestamp: new Date().toISOString()
  };
  fs.appendFileSync('sabian_learning_log.jsonl', JSON.stringify(summary) + '\n');
  console.log(`🧠 Sabian Learning Update → Agents: ${summary.totalAgents}, Avg CPU: ${summary.averageCPU}%, Avg Mem: ${summary.averageMemory}%`);
  return summary;
}

async function sendToMLPipeline(summary) {
  try {
    await delay(300); // prevent overload or 429s
    const response = await axios.post('http://localhost:6000/api/ml_pipeline', summary);
    console.log('🚀 Sent to ML pipeline:', response.data);
  } catch (err) {
    const status = err.response?.status || 'network';
    console.error(`❌ ML pipeline error [${status}]:`, err.message);
    if (status === 429 || status === 400 || status === 401) {
      console.warn('⚠️ Skipping ML send — rate limited or unauthorized');
    }
  }
}

function autoSelectTags(summary) {
  const tags = ['monitor'];
  const cpu = parseFloat(summary.averageCPU);
  const mem = parseFloat(summary.averageMemory);

  if (cpu > 80) tags.push('ai', 'recovery');
  if (mem > 75) tags.push('defense');
  if (cpu < 30 && mem < 30) tags.push('ml', 'optimize');

  return [...new Set(tags)];
}

function runDynamicMissions(tags) {
  tags.forEach(tag => {
    const missions = findByTag(tag);
    missions.forEach(mission => {
      if (mission.status !== 'active') return;
      console.log(`🎯 Running mission (${tag}): ${mission.id}`);
      exec(`node ${path.join(__dirname, '..', mission.file)}`, (error, stdout, stderr) => {
        if (error) {
          console.error(`❌ ${mission.id} failed:`, error.message);
          return;
        }
        if (stderr) console.error(`⚠️ ${mission.id} stderr:`, stderr);
        if (stdout) console.log(`✅ ${mission.id} output:\n${stdout}`);
      });
    });
  });
}

async function updateBrain() {
  try {
    const data = await fetchSmartSabianData();
    if (data.length === 0) {
      console.log('⚠ No Smart Sabian data yet.');
      return;
    }
    const summary = await summarizeData(data);
    await sendToMLPipeline(summary);
    const tags = autoSelectTags(summary);
    runDynamicMissions(tags);
  } catch (err) {
    console.error('❌ Sabian loop error:', err.message);
  }
}

async function loopForever() {
  while (true) {
    await updateBrain();
    await delay(5000);
  }
}

loopForever();
