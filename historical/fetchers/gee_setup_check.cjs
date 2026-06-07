// historical/fetchers/gee_setup_check.cjs
// Verify Google Earth Engine setup step by step

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

console.log('═══════════════════════════════════════════════════════════════');
console.log('GOOGLE EARTH ENGINE SETUP VERIFICATION');
console.log('═══════════════════════════════════════════════════════════════\n');

const checks = [];

// Check 1: .env variables
console.log('[1/5] Checking .env configuration...');
const keyPath = process.env.GEE_SERVICE_ACCOUNT_KEY;
const projectId = process.env.GEE_PROJECT_ID;

if (!keyPath || !projectId) {
  console.log('  ❌ Missing GEE configuration in .env');
  console.log('     Add these lines to .env:');
  console.log('     GEE_SERVICE_ACCOUNT_KEY=C:\\Users\\user\\Desktop\\sabian.ai\\sabian_core\\gee-service-account.json');
  console.log('     GEE_PROJECT_ID=your-project-id\n');
  checks.push(false);
} else {
  console.log('  ✅ .env configured');
  console.log(`     Key path: ${keyPath}`);
  console.log(`     Project ID: ${projectId}\n`);
  checks.push(true);
}

// Check 2: Service account key file exists
console.log('[2/5] Checking service account key file...');
if (keyPath && fs.existsSync(keyPath)) {
  try {
    const keyData = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    if (keyData.type === 'service_account') {
      console.log('  ✅ Service account key file found');
      console.log(`     Email: ${keyData.client_email}\n`);
      checks.push(true);
    } else {
      console.log('  ❌ Key file is not a service account key\n');
      checks.push(false);
    }
  } catch (e) {
    console.log(`  ❌ Key file exists but cannot be read: ${e.message}\n`);
    checks.push(false);
  }
} else {
  console.log('  ❌ Service account key file not found');
  console.log('     Create service account at: https://console.cloud.google.com/\n');
  checks.push(false);
}

// Check 3: Python installed
console.log('[3/5] Checking Python installation...');
const pythonCheck = spawn('python', ['--version']);
pythonCheck.on('close', (code) => {
  if (code === 0) {
    console.log('  ✅ Python installed\n');
    checks.push(true);
  } else {
    console.log('  ❌ Python not found in PATH\n');
    checks.push(false);
  }

  continueChecks();
});

function continueChecks() {
  // Check 4: Earth Engine API installed
  console.log('[4/5] Checking Earth Engine API...');
  const eeCheck = spawn('python', ['-c', 'import ee; print(ee.__version__)']);
  let eeOutput = '';

  eeCheck.stdout.on('data', (data) => {
    eeOutput += data.toString();
  });

  eeCheck.on('close', (code) => {
    if (code === 0) {
      console.log(`  ✅ Earth Engine API installed (v${eeOutput.trim()})\n`);
      checks.push(true);
    } else {
      console.log('  ❌ Earth Engine API not installed');
      console.log('     Install with: python -m pip install earthengine-api\n');
      checks.push(false);
    }

    finalizeChecks();
  });
}

function finalizeChecks() {
  // Check 5: Test authentication (if all previous checks pass)
  console.log('[5/5] Testing GEE authentication...');

  if (checks.every(c => c)) {
    const keyPathPosix = keyPath.replace(/\\/g, '/');
    const testAuth = spawn('python', [
      '-c',
      `import ee; ee.Initialize(credentials=ee.ServiceAccountCredentials(None, '${keyPathPosix}'), project='${projectId}'); print('OK')`
    ]);

    let authOutput = '';
    let authError = '';

    testAuth.stdout.on('data', (data) => {
      authOutput += data.toString();
    });

    testAuth.stderr.on('data', (data) => {
      authError += data.toString();
    });

    testAuth.on('close', (code) => {
      if (code === 0 && authOutput.includes('OK')) {
        console.log('  ✅ GEE authentication successful\n');
        checks.push(true);
        printSummary();
      } else {
        console.log('  ❌ GEE authentication failed');
        console.log(`     Error: ${authError.substring(0, 200)}`);
        console.log('     Make sure service account is registered at: https://code.earthengine.google.com/\n');
        checks.push(false);
        printSummary();
      }
    });
  } else {
    console.log('  ⏭️  Skipped (previous checks failed)\n');
    checks.push(false);
    printSummary();
  }
}

function printSummary() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const passed = checks.filter(c => c).length;
  const total = checks.length;

  if (passed === total) {
    console.log('✅ ALL CHECKS PASSED');
    console.log('\nYou can now run fire data backfill:');
    console.log('  node historical/ingest_runner.cjs --signal gee_fire --countries Sudan,Ethiopia\n');
  } else {
    console.log(`❌ ${total - passed} of ${total} checks failed\n`);
    console.log('NEXT STEPS:');

    if (!checks[0]) {
      console.log('1. Add GEE credentials to .env file');
    }
    if (!checks[1]) {
      console.log('2. Create service account and download key (see GOOGLE_EARTH_ENGINE_SETUP.md)');
    }
    if (!checks[2]) {
      console.log('3. Install Python (https://www.python.org/downloads/)');
    }
    if (!checks[3]) {
      console.log('4. Install Earth Engine API: python -m pip install earthengine-api');
    }
    if (!checks[4]) {
      console.log('5. Register service account at https://code.earthengine.google.com/');
    }
    console.log('\nDetailed setup instructions: GOOGLE_EARTH_ENGINE_SETUP.md\n');
  }
}
