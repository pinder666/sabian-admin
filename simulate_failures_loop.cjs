const fs = require('fs');
const path = require('path');

function simulateFailuresLoop() {
  const filesToBreak = ['config.json', 'user_data.json'];
  setInterval(() => {
    const file = filesToBreak[Math.floor(Math.random() * filesToBreak.length)];
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`[SIM TEST] ❌ Deleted ${file} to simulate failure.`);
    }
  }, 2 * 60 * 1000); // Every 2 minutes
}

simulateFailuresLoop();
