// historical/fetch_comtrade_arms_sample.cjs
// SAMPLE fetch: Top 10 arms traders, last 5 years
// Validates layer works before full historical fetch

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const https = require('https');
const fs = require('fs');
const path = require('path');

console.log('═══════════════════════════════════════════════════════════════');
console.log('UN COMTRADE ARMS TRADE SAMPLE FETCHER');
console.log('HS Code 93: Top 10 arms traders, 2019-2023');
console.log('═══════════════════════════════════════════════════════════════\n');

// Top 10 global arms traders (major importers/exporters)
const SAMPLE_COUNTRIES = {
  'United States': '842',
  'Russia': '643',
  'China': '156',
  'Saudi Arabia': '682',
  'India': '356',
  'Israel': '376',
  'France': '250',
  'UK': '826',
  'Germany': '276',
  'South Korea': '410'
};

const apiKey = process.env.COMTRADE_API_PRIMARY;
const RATE_LIMIT_MS = 2000; // 2 seconds between requests (conservative)

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchComtradeArms(reporterCode, period, flowCode) {
  const urlPath = `/data/v1/get/C/A/HS?reporterCode=${reporterCode}&period=${period}&cmdCode=93&flowCode=${flowCode}&partnerCode=0&maxRecords=50&format=JSON&breakdownMode=classic&countOnly=false`;

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'comtradeapi.un.org',
      path: urlPath,
      method: 'GET',
      headers: {
        'Ocp-Apim-Subscription-Key': apiKey,
        'Accept': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 429) {
          resolve({ rateLimited: true });
          return;
        }
        if (res.statusCode !== 200) {
          resolve({ error: `HTTP ${res.statusCode}` });
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ error: `Parse error: ${e.message}` });
        }
      });
    });

    req.on('error', err => resolve({ error: err.message }));
    req.setTimeout(30000, () => {
      req.destroy();
      resolve({ error: 'Timeout' });
    });
    req.end();
  });
}

function extractTradeValue(data) {
  if (data.rateLimited || data.error) return null;
  const records = data?.data || [];
  if (!records.length) return null;
  return records.reduce((sum, r) => sum + (r.primaryValue || r.TradeValue || r.fobvalue || 0), 0);
}

async function fetchSampleData() {
  const years = [2019, 2020, 2021, 2022, 2023];
  const countries = Object.keys(SAMPLE_COUNTRIES);
  const results = [];

  console.log(`[CONFIG] Countries: ${countries.length}`);
  console.log(`[CONFIG] Years: ${years.join(', ')}`);
  console.log(`[CONFIG] Total requests: ${countries.length * years.length * 2} (imports + exports)`);
  console.log(`[CONFIG] Estimated time: ~${Math.ceil((countries.length * years.length * 2 * RATE_LIMIT_MS) / 1000 / 60)} minutes\n`);

  let successCount = 0;
  let errorCount = 0;
  let rateLimitHit = false;

  for (const country of countries) {
    const reporterCode = SAMPLE_COUNTRIES[country];
    console.log(`[FETCH] ${country} (${reporterCode})...`);

    for (const year of years) {
      if (rateLimitHit) {
        console.log(`  [SKIP] Rate limited, skipping remaining...`);
        break;
      }

      // Imports
      await sleep(RATE_LIMIT_MS);
      const importData = await fetchComtradeArms(reporterCode, String(year), 'M');

      if (importData.rateLimited) {
        console.log(`  [WARN] Rate limited at ${country} ${year} imports`);
        rateLimitHit = true;
        break;
      }

      const importValue = extractTradeValue(importData);
      if (importValue !== null && importValue > 0) {
        results.push({
          country,
          year,
          flow: 'import',
          value_usd: importValue,
          hs_code: '93'
        });
        successCount++;
      } else if (importData.error) {
        errorCount++;
      }

      // Exports
      await sleep(RATE_LIMIT_MS);
      const exportData = await fetchComtradeArms(reporterCode, String(year), 'X');

      if (exportData.rateLimited) {
        console.log(`  [WARN] Rate limited at ${country} ${year} exports`);
        rateLimitHit = true;
        break;
      }

      const exportValue = extractTradeValue(exportData);
      if (exportValue !== null && exportValue > 0) {
        results.push({
          country,
          year,
          flow: 'export',
          value_usd: exportValue,
          hs_code: '93'
        });
        successCount++;
      } else if (exportData.error) {
        errorCount++;
      }

      console.log(`  ${year}: ${successCount} records so far`);
    }

    if (rateLimitHit) break;
  }

  console.log(`\n[COMPLETE] Fetched ${results.length} records`);
  console.log(`[STATS] Success: ${successCount}, Errors: ${errorCount}`);
  console.log(`[STATS] Countries with data: ${new Set(results.map(r => r.country)).size}`);

  if (results.length > 0) {
    console.log(`[STATS] Year range: ${Math.min(...results.map(r => r.year))}-${Math.max(...results.map(r => r.year))}\n`);
  }

  // Save
  const outputPath = path.join(__dirname, 'COMTRADE_ARMS_SAMPLE_DATA.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`[SAVE] Saved to: ${outputPath}\n`);

  return results;
}

async function main() {
  const data = await fetchSampleData();

  if (data.length > 0) {
    console.log('[SAMPLE] First 10 records:');
    data.slice(0, 10).forEach(r => {
      console.log(`  ${r.country} ${r.year} ${r.flow}: $${(r.value_usd / 1000000).toFixed(1)}M`);
    });
  } else {
    console.log('[WARN] No data fetched - API may still be rate-limited');
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(data.length > 0 ? '✅ SAMPLE FETCH COMPLETE' : '⚠️  NO DATA FETCHED');
  console.log('═══════════════════════════════════════════════════════════════');

  if (data.length > 0) {
    console.log('\nNext: Run ingest script');
    console.log('Command: node historical/ingest_comtrade_arms.cjs');
  } else {
    console.log('\nAPI rate-limited. Wait and retry, or proceed without arms data.');
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('[ERROR]', err);
    process.exit(1);
  });
}

module.exports = { fetchSampleData };
