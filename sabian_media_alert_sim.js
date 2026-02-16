const fs = require("fs");

// Simulated media broadcast logic
function broadcastMediaAlert(level) {
  console.log(`📺 Broadcasting MEDIA ALERT — Level: ${level}`);

  const message = `
  ⚠️ PUBLIC ALERT: Threat Level ${level}
  ----------------------------------------
  This is a Level ${level} emergency alert.
  Stay informed via official sources.
  - Sabian National Security Agency
  `;

  fs.writeFileSync("media_alert_output.txt", message);
  console.log("✅ Media alert message saved to media_alert_output.txt\n");
}

// Simulate an alert (you can change this value)
broadcastMediaAlert(3);
