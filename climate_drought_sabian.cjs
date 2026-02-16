// climate_drought_sabian.cjs
// 🌍 SABIAN INTEL ENGINE — CLIMATE & DROUGHT MONITORING (UAE + SADC + Zambia)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { performance } = require('perf_hooks');

const AGENT_ID = 'climate_drought_sabian';
const DEVICE_ID = 'SABIAN-GRID-001';

const CONFIG = {
  memoryPath: path.join(__dirname, 'brain_memory.jsonl'),
  timeoutMs: 20000,
  sources: [
    {
      name: 'Open-Meteo Climate UAE',
      url: 'https://api.open-meteo.com/v1/forecast?latitude=24.4539&longitude=54.3773&daily=temperature_2m_max,precipitation_sum&timezone=auto',
      region: 'UAE',
      tags: ['climate', 'uae', 'forecast']
    },
    {
      name: 'Open-Meteo Climate Namibia',
      url: 'https://api.open-meteo.com/v1/forecast?latitude=-22.5597&longitude=17.0832&daily=temperature_2m_max,precipitation_sum&timezone=auto',
      region: 'Namibia',
      tags: ['climate', 'namibia', 'forecast']
    },
    {
      name: 'Open-Meteo Climate Zambia',
      url: 'https://api.open-meteo.com/v1/forecast?latitude=-13.1339&longitude=27.8493&daily=temperature_2m_max,precipitation_sum&timezone=auto',
      region: 'Zambia',
      tags: ['climate', 'zambia', 'forecast', 'mining']
    }
  ]
};

function logToMemory(entry) {
  const record = {
    timestamp: new Date().toISOString(),
    missionId: crypto.randomUUID(),
    deviceId: DEVICE_ID,
    agent: AGENT_ID,
    status: entry.status || 'active',
    runtime: entry.runtime || null,
    ...entry
  };
  try {
    fs.appendFileSync(CONFIG.memoryPath, JSON.stringify(record) + '\n');
    console.log(`[🌍] ${record.source} — ${record.summary.slice(0, 60)}...`);
  } catch (err) {
    console.error('[❌] Memory write failed:', err.message);
  }
}

async function fetchClimateData({ url, name, region, tags }) {
  const start = performance.now();
  let status = 'success';
  let summary = '', confidence = 0.88;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.timeoutMs);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    const temp = data.daily?.temperature_2m_max?.[0];
    const rain = data.daily?.precipitation_sum?.[0];
    if (!temp && !rain) throw new Error('Missing climate data');
    summary = `Max Temp: ${temp}°C, Precipitation: ${rain}mm`;
  } catch (err) {
    status = 'error';
    confidence = 0.3;
    summary = `⚠️ Fetch failed: ${err.message}`;
  }
  const runtime = ((performance.now() - start) / 1000).toFixed(2);
  logToMemory({ region, source: name, summary, tags, confidence, status, runtime });
}

function validateEnvironment() {
  if (!fs.existsSync(CONFIG.memoryPath)) fs.writeFileSync(CONFIG.memoryPath, '');
  console.log(`[🔍] Environment validated.`);
}

(async () => {
  console.log(`[🌍] ${AGENT_ID.toUpperCase()} INITIATED`);
  validateEnvironment();
  for (const source of CONFIG.sources) {
    await fetchClimateData(source);
  }
  console.log(`[✅] ${AGENT_ID.toUpperCase()} COMPLETED`);
})();
