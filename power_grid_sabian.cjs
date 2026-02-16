// power_grid_sabian.cjs
// 🛡️ SABIAN CORE INTEL THREAD — POWER GRID INTELLIGENCE (SADC, MILITARY-GRADE, EXPANDED)

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const crypto = require('crypto');
const { performance } = require('perf_hooks');

const __dirname = __dirname;
const AGENT_ID = 'power_grid_sabian';
const DEVICE_ID = 'SABIAN-GRID-001';

const CONFIG = {
  memoryPath: path.join(__dirname, 'brain_memory.jsonl'),
  timeoutMs: 20000,
  confidenceThreshold: 0.75,
  sources: [
    {
      name: 'IRENA SADC Overview',
      url: 'https://www.irena.org/Statistics/View-Data-by-Region/Sub-Saharan-Africa',
      selector: 'main',
      region: 'SADC',
      tags: ['energy', 'policy', 'region']
    },
    {
      name: 'AfDB Energy News',
      url: 'https://www.afdb.org/en/news-and-events/energy',
      selector: '.views-row',
      region: 'Africa',
      tags: ['infra', 'development', 'afdb']
    },
    {
      name: 'SAPP News Panel',
      url: 'https://www.sapp.co.zw/',
      selector: '.carousel-inner',
      region: 'SADC',
      tags: ['grid', 'infrastructure', 'sapp']
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
    console.log(`[⚡] ${record.source} — ${record.summary.slice(0, 60)}...`);
  } catch (err) {
    console.error('[❌] Memory write failed:', err.message);
  }
}

async function fetchAndParse({ url, selector, name, region, tags }) {
  const start = performance.now();
  let status = 'success';
  let summary = '', confidence = 0.88;
  try {
    const res = await fetch(url, { timeout: CONFIG.timeoutMs });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);
    const content = $(selector).text().trim().replace(/\s+/g, ' ').slice(0, 1000);
    if (!content || content.length < 50) throw new Error('Parsed content too short');
    summary = content;
  } catch (err) {
    status = 'error';
    confidence = 0.25;
    summary = `⚠️ Fetch failure: ${err.message}`;
  }
  const runtime = ((performance.now() - start) / 1000).toFixed(2);
  logToMemory({ region, source: name, summary, tags, confidence, status, runtime });
}

function validateEnvironment() {
  if (!fs.existsSync(CONFIG.memoryPath)) fs.writeFileSync(CONFIG.memoryPath, '');
  console.log(`[🔍] Environment validated.`);
}

(async () => {
  console.log(`[⚡] ${AGENT_ID.toUpperCase()} INITIATED`);
  validateEnvironment();
  for (const source of CONFIG.sources) {
    await fetchAndParse(source);
  }
  console.log(`[✅] ${AGENT_ID.toUpperCase()} COMPLETED`);
})();
