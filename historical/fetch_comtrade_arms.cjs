// historical/fetch_comtrade_arms.cjs
// UN Comtrade HS Code 93 (Arms & Ammunition) historical fetcher
// Fetches both imports and exports for arms trade
// 1962-2025 (Comtrade coverage)

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const https = require('https');
const fs = require('fs');
const path = require('path');

console.log('═══════════════════════════════════════════════════════════════');
console.log('UN COMTRADE ARMS TRADE HISTORICAL FETCHER');
console.log('HS Code 93: Arms & Ammunition');
console.log('═══════════════════════════════════════════════════════════════\n');

// UN Comtrade M49 country codes
const COUNTRY_M49 = {
  'Afghanistan': '4', 'Albania': '8', 'Algeria': '12', 'Angola': '24',
  'Argentina': '32', 'Armenia': '51', 'Australia': '36', 'Austria': '40',
  'Azerbaijan': '31', 'Bahrain': '48', 'Bangladesh': '50', 'Belarus': '112',
  'Belgium': '56', 'Bolivia': '68', 'Bosnia': '70', 'Brazil': '76',
  'Bulgaria': '100', 'Burkina Faso': '854', 'Cameroon': '120', 'Canada': '124',
  'CAR': '140', 'Chad': '148', 'Chile': '152', 'China': '156',
  'Colombia': '170', 'Croatia': '191', 'Cuba': '192', 'Cyprus': '196',
  'Czechia': '203', 'DRC': '180', 'Denmark': '208', 'Djibouti': '262',
  'Ecuador': '218', 'Egypt': '818', 'Eritrea': '232', 'Estonia': '233',
  'Ethiopia': '231', 'Finland': '246', 'France': '250', 'Georgia': '268',
  'Germany': '276', 'Ghana': '288', 'Greece': '300', 'Guinea': '324',
  'Haiti': '332', 'Hungary': '348', 'India': '356', 'Indonesia': '360',
  'Iran': '364', 'Iraq': '368', 'Ireland': '372', 'Israel': '376',
  'Italy': '380', 'Japan': '392', 'Jordan': '400', 'Kazakhstan': '398',
  'Kenya': '404', 'North Korea': '408', 'South Korea': '410', 'Kuwait': '414',
  'Latvia': '428', 'Lebanon': '422', 'Libya': '434', 'Lithuania': '440',
  'Mali': '466', 'Mexico': '484', 'Morocco': '504', 'Mozambique': '508',
  'Myanmar': '104', 'Netherlands': '528', 'Niger': '562', 'Nigeria': '566',
  'Norway': '578', 'Oman': '512', 'Pakistan': '586', 'Palestine': '275',
  'Peru': '604', 'Philippines': '608', 'Poland': '616', 'Portugal': '620',
  'Qatar': '634', 'Romania': '642', 'Russia': '643', 'Saudi Arabia': '682',
  'Senegal': '686', 'Serbia': '688', 'Slovakia': '703', 'Slovenia': '705',
  'Somalia': '706', 'South Africa': '710', 'South Sudan': '728', 'Spain': '724',
  'Sri Lanka': '144', 'Sudan': '729', 'Sweden': '752', 'Switzerland': '756',
  'Syria': '760', 'Taiwan': '158', 'Tanzania': '834', 'Thailand': '764',
  'Tunisia': '788', 'Turkey': '792', 'UAE': '784', 'Uganda': '800',
  'UK': '826', 'Ukraine': '804', 'United States': '842', 'Uruguay': '858',
  'Venezuela': '862', 'Vietnam': '704', 'Yemen': '887', 'Zambia': '894',
  'Zimbabwe': '716'
};

const apiKeys = [
  process.env.COMTRADE_API_PRIMARY,
  process.env.COMTRADE_API_SECONDARY
].filter(Boolean);

if (apiKeys.length === 0) {
  console.log('[ERROR] Missing COMTRADE_API_PRIMARY or COMTRADE_API_SECONDARY in .env');
  console.log('Get API key from: https://comtradeplus.un.org/');
  process.exit(1);
}

console.log(`[CONFIG] Using ${apiKeys.length} API keys for failover\n`);

let currentKeyIndex = 0;
let keyRateLimited = { 0: false, 1: false };

// Rate limiting: UN Comtrade allows 1 request per second for free tier
const RATE_LIMIT_MS = 1100; // 1.1 seconds between requests to be safe

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchComtradeArms(reporterCode, period, flowCode, retryCount = 0) {
  // flowCode: M = imports, X = exports
  // cmdCode: 93 = Arms & Ammunition (HS Code 93)
  // partnerCode: 0 = World aggregate

  const path = `/data/v1/get/C/A/HS?reporterCode=${reporterCode}&period=${period}&cmdCode=93&flowCode=${flowCode}&partnerCode=0&maxRecords=50&format=JSON&breakdownMode=classic&countOnly=false`;

  // Try current API key
  const apiKey = apiKeys[currentKeyIndex];

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'comtradeapi.un.org',
      path,
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
          // Rate limited - try next key if available
          if (!keyRateLimited[currentKeyIndex]) {
            keyRateLimited[currentKeyIndex] = true;
            console.log(`    [WARN] Key ${currentKeyIndex + 1} rate-limited, switching keys...`);
          }

          // Switch to next key
          const nextKeyIndex = (currentKeyIndex + 1) % apiKeys.length;

          if (apiKeys.length > 1 && !keyRateLimited[nextKeyIndex] && retryCount < apiKeys.length) {
            currentKeyIndex = nextKeyIndex;
            // Retry with next key after delay
            setTimeout(() => {
              fetchComtradeArms(reporterCode, period, flowCode, retryCount + 1)
                .then(resolve)
                .catch(reject);
            }, 2000);
            return;
          }

          reject(new Error('Rate limited - all keys exhausted'));
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Parse error: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
    req.end();
  });
}

function extractTradeValue(data) {
  const records = data?.data || [];
  if (!records.length) return null;

  // Sum all HS93 trade values
  return records.reduce((sum, r) => sum + (r.primaryValue || r.TradeValue || r.fobvalue || 0), 0);
}

async function fetchHistoricalArmsData() {
  console.log('[START] Fetching historical arms trade data...\n');

  const countries = Object.keys(COUNTRY_M49);
  const startYear = 2005; // Start from 2005 for manageable scope (~20 years)
  const endYear = 2023; // Comtrade lags ~2 years
  const years = [];

  for (let y = startYear; y <= endYear; y++) {
    years.push(y);
  }

  console.log(`[CONFIG] Countries: ${countries.length}`);
  console.log(`[CONFIG] Years: ${startYear}-${endYear} (${years.length} years)`);
  console.log(`[CONFIG] Total requests: ${countries.length * years.length * 2} (imports + exports)`);
  console.log(`[CONFIG] Estimated time: ~${Math.ceil((countries.length * years.length * 2 * RATE_LIMIT_MS) / 1000 / 60)} minutes\n`);

  const results = [];
  let successCount = 0;
  let errorCount = 0;

  for (const country of countries) {
    const reporterCode = COUNTRY_M49[country];

    console.log(`[FETCH] ${country} (${reporterCode})...`);

    for (const year of years) {
      // Fetch imports
      try {
        await sleep(RATE_LIMIT_MS);
        const importData = await fetchComtradeArms(reporterCode, String(year), 'M');
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
        }
      } catch (err) {
        errorCount++;
        // Silent fail, continue
      }

      // Fetch exports
      try {
        await sleep(RATE_LIMIT_MS);
        const exportData = await fetchComtradeArms(reporterCode, String(year), 'X');
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
        }
      } catch (err) {
        errorCount++;
        // Silent fail, continue
      }

      // Progress update every 10 years
      if (year % 10 === 0) {
        console.log(`  ${year}: ${successCount} records, ${errorCount} errors`);
      }
    }
  }

  console.log(`\n[COMPLETE] Fetched ${results.length} records`);
  console.log(`[STATS] Success: ${successCount}, Errors: ${errorCount}`);
  console.log(`[STATS] Countries with data: ${new Set(results.map(r => r.country)).size}`);
  console.log(`[STATS] Year range: ${Math.min(...results.map(r => r.year))}-${Math.max(...results.map(r => r.year))}\n`);

  // Save to file
  const outputPath = path.join(__dirname, 'COMTRADE_ARMS_RAW_DATA.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`[SAVE] Saved to: ${outputPath}\n`);

  return results;
}

async function main() {
  const data = await fetchHistoricalArmsData();

  console.log('[SAMPLE] First 10 records:');
  data.slice(0, 10).forEach(r => {
    console.log(`  ${r.country} ${r.year} ${r.flow}: $${(r.value_usd / 1000000).toFixed(1)}M`);
  });

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('✅ FETCH COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('\nNext: Run ingest script to upload to Supabase');
  console.log('Command: node historical/ingest_comtrade_arms.cjs');
}

if (require.main === module) {
  main().catch(err => {
    console.error('[ERROR]', err);
    process.exit(1);
  });
}

module.exports = { fetchHistoricalArmsData };
