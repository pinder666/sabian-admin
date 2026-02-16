// sabian_drone_core.js
// Live Drone Telemetry Simulator for Sabian

const fs = require('fs');
const path = require('path');

const telemetryPath = path.join(__dirname, 'drone_logs', 'sample_telemetry.json');
const userDataPath = path.join(__dirname, 'user_data.json');

// Simulate live telemetry updates
function simulateLiveDroneSession() {
  const raw = fs.readFileSync(telemetryPath);
  const telemetry = JSON.parse(raw);

  let index = 0;
  const interval = setInterval(() => {
    if (index >= telemetry.flight_path.length) {
      console.log('✅ Simulation complete.');
      clearInterval(interval);
      return;
    }

    const point = telemetry.flight_path[index];
    const partial = {
      ...telemetry,
      flight_path: telemetry.flight_path.slice(0, index + 1)
    };

    try {
      const userData = JSON.parse(fs.readFileSync(userDataPath));
      userData[0].drone_telemetry = partial;
      fs.writeFileSync(userDataPath, JSON.stringify(userData, null, 2));
      console.log(`📡 Updated to point ${index + 1}/${telemetry.flight_path.length}`);
    } catch (err) {
      console.error('❌ Failed to write user data:', err.message);
    }

    index++;
  }, 1000); // update every second
}

simulateLiveDroneSession();
