const fs = require("fs");
const path = require("path");
require("dotenv").config();
const twilio = require("twilio");

const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

const civilians = [
  { name: "John Doe", number: "+447700900001", location: "Zone Alpha" },
  { name: "Amina Bello", number: "+447700900002", location: "Zone Bravo" },
];

function sendAlert(person) {
  const msg = `⚠️ ALERT: ${person.name}, evacuate immediately from ${person.location}. This is a verified Sabian emergency protocol.`;

  client.messages
    .create({
      body: msg,
      from: process.env.TWILIO_FROM,
      to: person.number,
    })
    .then(() => console.log(`📤 Alert sent to ${person.name}`))
    .catch(err => console.error("❌ SMS Error:", err.message));
}

// Simulated threat scan data
function checkThreatLevel() {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, "threat_scan.json")));
  const level = data.threatLevel;

  console.log(`🧪 Threat Level: ${level}%`);

  if (level >= 80) {
    console.log("🚨 Triggering evacuation...");
    civilians.forEach(sendAlert);
  }
}

setInterval(checkThreatLevel, 10000); // Every 10s
