// historical/fetchers/gee_fire_historical.cjs
// Google Earth Engine MOD14A1 fire data via Python wrapper
// Returns array of { signal_key, date, raw_value, raw_metadata, source, gap, gap_reason }

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { spawn } = require('child_process');
const path = require('path');

const GEE_KEY_PATH = process.env.GEE_SERVICE_ACCOUNT_KEY;
const GEE_PROJECT_ID = process.env.GEE_PROJECT_ID;

async function fetchGeeFireHistorical(country) {
  if (!GEE_KEY_PATH || !GEE_PROJECT_ID) {
    console.error('[GEE] Missing GEE_SERVICE_ACCOUNT_KEY or GEE_PROJECT_ID in .env');
    return [{
      signal_key: 'fire_hotspot',
      signal_name: 'Satellite Fire',
      date: '2000-01-01',
      raw_value: null,
      raw_metadata: { country, error: 'missing_gee_credentials' },
      source: 'gee_modis_mod14a1',
      gap: true,
      gap_reason: 'gee_not_configured'
    }];
  }

  return new Promise((resolve, reject) => {
    const pythonScript = path.join(__dirname, 'gee_fire_fetcher.py');
    const python = spawn('python', [pythonScript, GEE_KEY_PATH, GEE_PROJECT_ID, country]);

    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
      // Forward progress messages to console
      if (data.toString().startsWith('[GEE]')) {
        console.log(data.toString().trim());
      }
    });

    python.on('close', (code) => {
      if (code !== 0) {
        console.error('[GEE] Python script failed:', stderr);
        resolve([{
          signal_key: 'fire_hotspot',
          signal_name: 'Satellite Fire',
          date: '2000-01-01',
          raw_value: null,
          raw_metadata: { country, error: stderr.substring(0, 500) },
          source: 'gee_modis_mod14a1',
          gap: true,
          gap_reason: 'python_execution_error'
        }]);
        return;
      }

      try {
        const results = JSON.parse(stdout);
        resolve(results);
      } catch (e) {
        console.error('[GEE] Failed to parse Python output:', e.message);
        resolve([{
          signal_key: 'fire_hotspot',
          signal_name: 'Satellite Fire',
          date: '2000-01-01',
          raw_value: null,
          raw_metadata: { country, error: 'json_parse_failed' },
          source: 'gee_modis_mod14a1',
          gap: true,
          gap_reason: 'invalid_python_output'
        }]);
      }
    });
  });
}

module.exports = { fetchGeeFireHistorical };

// Test if run directly
if (require.main === module) {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('GOOGLE EARTH ENGINE FIRE FETCHER TEST');
  console.log('MOD14A1 (2000-present) via Python/GEE API');
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (!GEE_KEY_PATH || !GEE_PROJECT_ID) {
    console.log('❌ GEE not configured');
    console.log('\nSet up Google Earth Engine service account:');
    console.log('1. Read GOOGLE_EARTH_ENGINE_SETUP.md');
    console.log('2. Create service account and download JSON key');
    console.log('3. Add to .env:');
    console.log('   GEE_SERVICE_ACCOUNT_KEY=/path/to/key.json');
    console.log('   GEE_PROJECT_ID=your-project-id');
    process.exit(1);
  }

  // Test with Sudan (2023-2025 only for quick test)
  const testCountry = 'Sudan';
  console.log(`[TEST] Fetching fire data for ${testCountry} (this may take 2-3 minutes)...\n`);

  fetchGeeFireHistorical(testCountry).then(results => {
    console.log('\n[RESULTS]');
    console.log(`Total years: ${results.length}`);

    const withData = results.filter(r => r.raw_value !== null && r.raw_value > 0);
    console.log(`Years with fire detections: ${withData.length}`);

    if (withData.length > 0) {
      console.log('\nSample results (last 5 years):');
      withData.slice(-5).forEach(r => {
        console.log(`  ${r.date}: ${r.raw_value} fire pixels`);
      });
      console.log('\n✅ GEE fire fetcher working');
    } else {
      console.log('\n⚠️  No fire detections found (may indicate issue with country name or GEE access)');
    }
  }).catch(err => {
    console.error('\n❌ Test failed:', err.message);
    process.exit(1);
  });
}
