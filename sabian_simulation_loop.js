const { exec } = require('child_process');
const path = require('path');

// 6 hours = 6 * 60 * 60 * 1000 ms
const SIX_HOURS = 6 * 60 * 60 * 1000;

const runSabianSimulation = () => {
  console.log('🧠 Running Sabian Simulation Cycle...');

  exec('node sabian_simulation_engine.js', (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ Simulation Error: ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`❗ STDERR: ${stderr}`);
      return;
    }
    console.log(`✅ Simulation Complete:\n${stdout}`);
  });
};

// Run once at start
runSabianSimulation();

// Schedule every 6 hours
setInterval(runSabianSimulation, SIX_HOURS);
