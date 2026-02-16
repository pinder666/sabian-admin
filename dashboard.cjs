const fs = require('fs');
const readline = require('readline');

function getRandomTelemetry() {
  const cpu = (Math.random() * 100).toFixed(1);
  const memory = (Math.random() * 100).toFixed(1);
  const status = cpu > 80 || memory > 80 ? '⚠ HIGH LOAD' : '✅ NORMAL';
  return { cpu, memory, status };
}

function getLastActions() {
  if (!fs.existsSync('actions_log.json')) return [];
  const lines = fs.readFileSync('actions_log.json', 'utf8').trim().split('\n');
  return lines.slice(-5).map(line => JSON.parse(line).action);
}

function drawBar(label, percent) {
  const full = Math.round(percent / 10);
  const empty = 10 - full;
  const bar = '█'.repeat(full) + '░'.repeat(empty);
  return `${label}: [${bar}] ${percent}%`;
}

function showDashboard() {
  const agents = 5; // example
  const telemetry = getRandomTelemetry();
  const lastActions = getLastActions();

  console.clear();
  console.log('🛰️  SABIAN MISSION CONTROL DASHBOARD');
  console.log('---------------------------------------');
  console.log(`🌡️  SYSTEM STATUS: ${telemetry.status}`);
  console.log(drawBar('CPU', telemetry.cpu));
  console.log(drawBar('MEM', telemetry.memory));
  console.log(`👾 ACTIVE AGENTS: ${agents}`);
  console.log('\n📜 LAST 5 ACTIONS:');
  lastActions.forEach(a => console.log(`→ ${a}`));
  console.log('\n🌍 TELEMETRY STREAM: CONNECTED ✅');
}

setInterval(showDashboard, 2000);
