/* WIZARD_MANAGED {
  "path": "sabian_core/sabian_launch_may/agents/worldbank_autogen_agent.cjs",
  "hash": "e3debe4f6db4ffb660f4ce43cfb72c9e735662788e3c9ce1aa2e3de8bcf5e4e9"
} */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const crypto = require('crypto');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
require('dotenv').config();

if (process.env.SABIAN_MODE === 'standby') {
  console.log('⏸️ Sabian in standby mode. Skipping LLM call.');
  return;
}

async function rotateLLM(promptText) {
  const providers = [
    {
      name: 'openrouter',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      key: process.env.OPENROUTER_API_KEY,
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://sabian.ai',
        'X-Title': 'sabian-worldbank-agent'
      },
      body: (prompt) => ({
        model: 'deepseek-coder',
        messages: [
          { role: 'system', content: 'You are a military-grade AI agent engineer. Write secure, scalable Node.js agents.' },
          { role: 'user', content: prompt }
        ]
      }),
      parse: (json) => json.choices?.[0]?.message?.content?.trim() || json.choices?.[0]?.content?.trim()
    },
    {
      name: 'together',
      url: 'https://api.together.xyz/v1/chat/completions',
      key: process.env.TOGETHER_API_KEY,
      headers: {
        Authorization: `Bearer ${process.env.TOGETHER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: (prompt) => ({
        model: 'deepseek-coder',
        messages: [
          { role: 'system', content: 'You are a military-grade AI agent engineer. Write secure, scalable Node.js agents.' },
          { role: 'user', content: prompt }
        ]
      }),
      parse: (json) => json.choices?.[0]?.message?.content?.trim() || json.choices?.[0]?.content?.trim()
    },
    {
      name: 'groq',
      url: 'https://api.groq.com/openai/v1/chat/completions',
      key: process.env.GROQ_API_KEY,
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: (prompt) => ({
        model: 'mixtral-8x7b-32768',
        messages: [
          { role: 'system', content: 'You are a military-grade AI agent engineer. Write secure, scalable Node.js agents.' },
          { role: 'user', content: prompt }
        ]
      }),
      parse: (json) => json.choices?.[0]?.message?.content?.trim() || json.choices?.[0]?.content?.trim()
    }
  ];

  for (const provider of providers) {
    try {
      console.log(`🔁 Trying ${provider.name}...`);
      const res = await fetch(provider.url, {
        method: 'POST',
        headers: provider.headers,
        body: JSON.stringify(provider.body(promptText))
      });
      const json = await res.json();
      const result = provider.parse(json);
      if (result) {
        console.log(`✅ ${provider.name} succeeded`);
        return result;
      } else {
        console.log(`⚠️ ${provider.name} returned empty or unusable response`);
      }
    } catch (e) {
      console.log(`❌ ${provider.name} failed: ${e.message}`);
    }
  }

  throw new Error('All LLM providers failed.');
}


const CONFIG = {
  hiveReportURL: 'http://localhost:5000/api/report',
  hiveEscalateURL: 'http://localhost:5000/api/escalate',
  outputScriptPath: path.join(__dirname, 'generated_worldbank_agent.cjs'),
  memoryPath: path.join(__dirname, '..', 'central_memory.jsonl'),
  generation: 0
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
  try {
    fs.appendFileSync(CONFIG.memoryPath, JSON.stringify(entry) + '\n');
    sendToHive(entry);
  } catch {}
}

async function sendToHive(log) {
  try {
    await fetch(CONFIG.hiveReportURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(log),
    });
    logEvent('📡 Report sent to Hive.');
  } catch {}
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
  } catch {}
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
  logEvent('🧠 Sabian AI Launcher v2 — Initiating Hive-connected multi-LLM mission.');

  const prompt = `Write a complete Node.js script using node-fetch that connects to the World Bank API and retrieves the latest GDP data for UAE and all 16 SADC member countries: Angola, Botswana, Comoros, Democratic Republic of the Congo, Eswatini, Lesotho, Madagascar, Malawi, Mauritius, Mozambique, Namibia, Seychelles, South Africa, Tanzania, Zambia, and Zimbabwe. The script must log each country's name, GDP value, and year to the console, and save all results in a structured JSON file. Ensure the code is military-grade: fault-tolerant, secure, audit-logged, and follows best practices.`;

  try {
  const code = await rotateLLM(prompt);
  console.log('🧾 RAW RESPONSE:', code); // log raw LLM output
  if (!code || !code.includes('fetch')) throw new Error('LLM returned unusable script.');
  saveAndRunScript(code);
} catch (err) {
  logEvent(`⚠️ Generation failed: ${err.message}`);
  logToMemory({ insight: 'AI generation failed', error: err.message, status: 'fail' });
  escalateToHive(`LLM generation failure: ${err.message}`);
}


  logEvent('🏁 AI Launcher session finished.');
})();
