const fs = require('fs');
const path = require('path');

function simulateFailures() {
  console.log('🔧 Simulating core file failures...');

  const coreFiles = [
    'config.json',
    'user_data.json'
  ];

  coreFiles.forEach(file => {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`❌ Deleted ${file} to simulate failure.`);
    }
  });

  console.log('✅ Failures simulated. Run sabian_wizard.cjs to trigger auto-repair + escalation.');
}

simulateFailures();
