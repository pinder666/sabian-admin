const pm2 = require("pm2");

const subsystems = [
  "sabian-map",
  "sabian-mission",
  "sabian-threatscan",
  "sabian-intel",
  "sabian-fusion",
  "sabian-brief",
  "sabian-voice",
  "sabian-multichannel",
  "sabian-wizard",
  "sabian-object-tracker",
  "sabian-propaganda",
  "sabian-evacuator",
  "sabian-infra"
];

console.log("🧠 SABIAN DEFENSE CORE CONTROLLER ACTIVE\n");

function checkStatus() {
  pm2.connect(err => {
    if (err) {
      console.error("❌ Could not connect to PM2:", err);
      process.exit(2);
    }

    pm2.list((err, list) => {
      if (err) {
        console.error("❌ Failed to retrieve process list:", err);
        pm2.disconnect();
        return;
      }

      console.log("🔍 Subsystem Health Check:\n");

      subsystems.forEach(name => {
        const instance = list.find(p => p.name === name);
        if (!instance) {
          console.log(`❌ ${name} is NOT running.`);
        } else {
          const uptime = (Date.now() - instance.pm2_env.pm_uptime) / 1000;
          console.log(`✅ ${name} | Uptime: ${Math.floor(uptime)}s | Status: ${instance.pm2_env.status}`);
        }
      });

      pm2.disconnect();
    });
  });
}

// Run every 30 seconds
setInterval(checkStatus, 30000);

// Run once on start
checkStatus();
