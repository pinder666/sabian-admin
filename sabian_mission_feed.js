// sabian_mission_feed.js

const fs = require("fs");

// Simulated mission feed
const missions = [
  {
    id: "MISSION-001",
    objective: "Surveillance over Sector 5",
    priority: "high",
    status: "active",
    assignedDrone: "DRN-001"
  },
  {
    id: "MISSION-002",
    objective: "Supply drop to Sector 3",
    priority: "medium",
    status: "queued",
    assignedDrone: null
  }
];

// Output simulated missions
console.log("📡 SABIAN MISSION FEED ACTIVE\n");

missions.forEach((mission) => {
  console.log(`🛰️ ${mission.id} → ${mission.objective}`);
  console.log(`   Priority: ${mission.priority}`);
  console.log(`   Status: ${mission.status}`);
  console.log(`   Assigned Drone: ${mission.assignedDrone || "Pending"}`);
  console.log();
});
