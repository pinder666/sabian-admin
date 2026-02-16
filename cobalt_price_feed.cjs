require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { performance } = require('perf_hooks');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const AGENT_ID = 'cobalt_price_feed';
const DEVICE_ID = 'SABIAN-GRID-001';
const METAL_API_KEY = process.env.METAL_API_KEY;
const memoryPath = path.join(__dirname, 'brain_memory.jsonl');

function logToMemory(entry) {
  const record = {
    timestamp: new Date().toISOString(),
    missionId: crypto.randomUUID(),
    deviceId: DEVICE_ID,
    agent: AGENT_ID,
    status: entry.status || 'active',
    runtime: entry.runtime || null,
    ...entry,
  };
  try {
    fs.appendFileSync(memoryPath, JSON.stringify(record) + '\n');
    console.log(`[⚙️] ${record.source}: ${record.summary.slice(0, 60)}...`);
  } catch (err) {
    console.error('[❌] Memory write failed:', err.message);
  }
}

function validateEnvironment() {
  if (!fs.existsSync(memoryPath)) fs.writeFileSync(memoryPath, '');
  console.log('[🔍] Environment validated.');
}

(async () => {
  console.log('[⚙️] COBALT_PRICE_FEED INITIATED');
  validateEnvironment();

  // Debugging check
  console.log('[DEBUG] Using MetalpriceAPI Key:', METAL_API_KEY);

  // === Investing.com (HTML scrape) ===
  try {
    const res = await fetch('https://www.investing.com/commodities/cobalt');
    const html = await res.text();
    const match = html.match(/"last_last".*?>([\d,.]+)/);
    if (match) {
      const price = match[1];
      const summary = `Cobalt price from Investing.com: $${price}`;
      logToMemory({
        source: 'Investing.com',
        summary,
        confidence: 0.9,
        region: 'Global',
        tags: ['cobalt', 'price', 'scrape']
      });
    } else {
      throw new Error('Could not parse cobalt price');
    }
  } catch (err) {
    logToMemory({
      source: 'Investing.com',
      summary: `⚠️ Fetch failed: ${err.message}`,
      confidence: 0.2,
      region: 'Global',
      tags: ['cobalt', 'price', 'scrape'],
      status: 'error'
    });
  }

  // === MetalpriceAPI ===
  try {
    const metalRes = await fetch(`https://api.metalpriceapi.com/v1/latest?base=USD&currencies=XCO&api_key=${METAL_API_KEY}`);
    const metalData = await metalRes.json();

    if (metalData.success && metalData.rates?.XCO) {
      const price = metalData.rates.XCO;
      const summary = `Cobalt Price from MetalpriceAPI: $${price}`;
      logToMemory({
        source: 'MetalpriceAPI',
        summary,
        confidence: 0.95,
        region: 'Global',
        tags: ['metal', 'cobalt', 'api']
      });
    } else {
      throw new Error(metalData.error?.message || 'Missing cobalt price from MetalpriceAPI');
    }
  } catch (err) {
    logToMemory({
      source: 'MetalpriceAPI',
      summary: `⚠️ API error: ${err.message}`,
      confidence: 0.1,
      region: 'Global',
      tags: ['metal', 'cobalt', 'api'],
      status: 'error'
    });
  }

  // === MineTicker API (placeholder/fallback) ===
  try {
    const mineRes = await fetch('https://mineticker-api.example.com/cobalt');
    const mineData = await mineRes.json();
    if (mineData && mineData.price) {
      const summary = `Cobalt Price from MineTicker: $${mineData.price}`;
      logToMemory({
        source: 'MineTicker API',
        summary,
        confidence: 0.8,
        region: 'Global',
        tags: ['cobalt', 'mining', 'backup']
      });
    } else {
      throw new Error('Missing data in MineTicker API response');
    }
  } catch (err) {
    logToMemory({
      source: 'MineTicker API',
      summary: `⚠️ API error: ${err.message}`,
      confidence: 0.1,
      region: 'Global',
      tags: ['cobalt', 'mining', 'backup'],
      status: 'error'
    });
  }

  console.log('[✅] COBALT_PRICE_FEED COMPLETED');
})();
