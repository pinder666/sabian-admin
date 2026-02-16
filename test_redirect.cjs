// test_redirect.cjs
// 🛰️ SABIAN TEST REDIRECT HANDLER
// ✅ Military-grade script: logging, traceable, fail-safe

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// 🔍 Load Sabian node config (child JSON or static target for test)
const SABIAN_FILE = '/root/sabians/children/child_sabian_0.json';

// ✅ Validate file exists
if (!fs.existsSync(SABIAN_FILE)) {
  console.error(`❌ Config file not found: ${SABIAN_FILE}`);
  process.exit(1);
}

const sabian = JSON.parse(fs.readFileSync(SABIAN_FILE, 'utf8'));
const target = sabian.target || 'https://www.google.com'; // fallback for test

// ✅ Log trace array
const trace = [];

// 🛰️ Begin connection attempt
(async () => {
  console.log('🛰️ Smart Sabian attempting connection to:', target);

  try {
    const response = await fetch(target, { redirect: 'follow' }); // ensures redirects followed

    trace.push({
      original: target,
      redirected: response.redirected,
      finalUrl: response.url,
      status: response.status,
      timestamp: new Date().toISOString()
    });

    if (response.redirected) {
      console.log('🚦 Redirect followed to:', response.url);
    }
    console.log('✅ Connected with status:', response.status);

    // ✅ Optional: save trace log to file
    const logPath = path.join('/root/sabians/logs', `redirect_trace_${Date.now()}.json`);
    fs.mkdirSync('/root/sabians/logs', { recursive: true });
    fs.writeFileSync(logPath, JSON.stringify(trace, null, 2));
    console.log(`📝 Trace log saved: ${logPath}`);

  } catch (err) {
    console.error('❌ Connection failed:', err.message);
    const logPath = path.join('/root/sabians/logs', `redirect_error_${Date.now()}.json`);
    fs.mkdirSync('/root/sabians/logs', { recursive: true });
    fs.writeFileSync(logPath, JSON.stringify({ error: err.message, target, timestamp: new Date().toISOString() }, null, 2));
    console.log(`📝 Error log saved: ${logPath}`);
    process.exit(1);
  }
})();
