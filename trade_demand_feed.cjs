require('dotenv').config();
const fs = require('fs');
const path = require('path');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const AGENT_ID = 'trade_demand_feed';
const DEVICE_ID = 'SABIAN-GRID-001';
const memoryPath = path.join(__dirname, 'brain_memory.jsonl');

const SADC_COUNTRIES = {
  Angola: '24',
  Botswana: '72',
  Comoros: '174',
  'DR Congo': '180',
  Eswatini: '748',
  Lesotho: '426',
  Madagascar: '450',
  Malawi: '454',
  Mauritius: '480',
  Mozambique: '508',
  Namibia: '516',
  Seychelles: '690',
  'South Africa': '710',
  Tanzania: '834',
  Zambia: '894',
  Zimbabwe: '716'
};

const HS_CODES = ['2605', '8105']; // 2605 = Cobalt ores, 8105 = Cobalt mattes & other

function logToMemory(entry) {
  const record = {
    timestamp: new Date().toISOString(),
    agent: AGENT_ID,
    deviceId: DEVICE_ID,
    ...entry
  };
  try {
    fs.appendFileSync(memoryPath, JSON.stringify(record) + '\n');
    console.log(`[⚙️] ${record.source}: ${record.summary}`);
  } catch (err) {
    console.error('[❌] Memory write failed:', err.message);
  }
}

function validateEnvironment() {
  if (!fs.existsSync(memoryPath)) fs.writeFileSync(memoryPath, '');
  console.log('[🔍] Environment validated.');
}

async function fetchTradeData(countryCode, year, hsCode) {
  const url = `https://comtradeapi.un.org/public/v1/preview/flow/2/partner/0/cmdCode/${hsCode}?reporterCode=${countryCode}&period=${year}`;
  const res = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data;
}

(async () => {
  console.log('[⚙️] TRADE_DEMAND_FEED INITIATED');
  validateEnvironment();

  let foundData = false;
  const currentYear = new Date().getFullYear();

  for (let year = currentYear; year >= currentYear - 3; year--) {
    console.log(`[🔍] Querying ${year} exports (${HS_CODES.join(',')}) to World...`);

    for (const [country, code] of Object.entries(SADC_COUNTRIES)) {
      try {
        let totalValue = 0;
        for (const hsCode of HS_CODES) {
          const data = await fetchTradeData(code, year, hsCode);
          if (data && data.data && data.data.length > 0) {
            data.data.forEach(item => {
              totalValue += item.primaryValue || 0;
            });
          }
        }

        if (totalValue > 0) {
          foundData = true;
          logToMemory({
            source: 'UN Comtrade',
            summary: `${country} exported $${totalValue.toLocaleString()} of cobalt products in ${year}`,
            region: 'SADC',
            tags: ['cobalt', 'exports', 'trade', year]
          });
        } else {
          console.log(`[ℹ️] ${country}: No data for ${year}`);
        }

      } catch (err) {
        console.log(`[⚠️] ${country}: ${err.message}`);
      }
    }

    if (foundData) break;
  }

  if (!foundData) {
    console.log('[⚠️] No trade data returned after fallback years.');
  }

  console.log('[✅] TRADE_DEMAND_FEED COMPLETED');
})();
