const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const crypto = require('crypto');
const fetch = require('node-fetch');

require('dotenv').config();

const CONFIG = {
  openaiApiKey: process.env.OPENAI_API_KEY,
  hiveReportURL: 'http://localhost:5000/api/report',     // Change to your Hive IP/domain if needed
  hiveEscalateURL: 'http://localhost:5000/api/escalate', // Same here
  targetDescription: 'Connect to the World Bank API and retrieve the latest UAE GDP data',
  outputScriptPath: path.join(__dirname, 'generated_worldbank_agent.cjs'),
  memoryPath: path.join(__dirname, '..', 'central_memory.jsonl'),
  generation: 0,
};

function logEvent(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

function logToMemory(data) {
  const entry = {
    ...data,
    timestamp: new Date().toISOString(),
    agentId: 'auto-gen-worldbank',
    missionId: crypto.randomUUID(),
    generation: CONFIG.generation,
    status: data.status || 'active',
  };
  fs.appendFileSync(CONFIG.memoryPath, JSON.stringify(entry) + '\n');
  sendToHive(entry);
}

async function sendToHive(log) {
  try {
    await fetch(CONFIG.hiveReportURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(log),
    });
    logEvent('📡 Report sent to Hive.');
  } catch (err) {
    logEvent(`❌ Failed to send log to Hive: ${err.message}`);
  }
}

async function escalateToHive(issue) {
  try {
    await fetch(CONFIG.hiveEscalateURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'auto-gen-worldbank',
        issue,
        time: new Date().toISOString(),
      }),
    });
    logEvent('🚨 Escalation sent to Hive.');
  } catch (err) {
    logEvent(`❌ Failed to escalate to Hive: ${err.message}`);
  }
}

async function promptOpenAI(promptText) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CONFIG.openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are a military-grade AI agent engineer. Write secure, self-healing Node.js scripts that extract live data.' },
        { role: 'user', content: promptText },
      ],
      temperature: 0.2,
    }),
  });

  const json = await res.json();
  if (!json.choices || !json.choices[0] || !json.choices[0].message) {
    throw new Error('OpenAI returned invalid response.');
  }

  return json.choices[0].message.content;
}

function saveAndRunScript(code) {
  fs.writeFileSync(CONFIG.outputScriptPath, code);
  logEvent('🚀 New script generated. Executing...');
  exec(`node ${CONFIG.outputScriptPath}`, (err, stdout, stderr) => {
    if (err) {
      const msg = `Script error: ${err.message}`;
      logEvent(`❌ ${msg}`);
      logToMemory({ insight: msg, status: 'error' });
      escalateToHive(msg);
    } else {
      logEvent('✅ Script executed successfully.');
      logToMemory({ insight: 'Execution output', output: stdout });
    }
  });
}

(async () => {
  logEvent('🧠 Sabian AI Launcher v2 — Initiating Hive-connected GPT mission.');

  const prompt = `Write a complete Node.js script using node-fetch that connects to the World Bank API (UAE GDP endpoint), parses the latest GDP value, logs it to the console, and saves a JSON object to a file. The code must be military-grade: error-tolerant, secure, and audit-compliant.`;

  try {
    const code = await promptOpenAI(prompt);
    if (!code.includes('fetch')) throw new Error('GPT returned unusable script.');
    saveAndRunScript(code);
  } catch (err) {
    logEvent(`⚠️ Generation failed: ${err.message}`);
    logToMemory({ insight: 'AI generation failed', error: err.message, status: 'fail' });
    escalateToHive(`OpenAI generation failure: ${err.message}`);
  }

  logEvent('🏁 AI Launcher session finished.');
})();
