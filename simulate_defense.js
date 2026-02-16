// simulate_defense.js

const fs = require("fs");

const intel = JSON.parse(fs.readFileSync("./data/intel/fused_intel.json", "utf-8"));

const simulation = {
  timestamp: new Date().toISOString(),
  safeZones: [],
  highRiskZones: [],
  recommendations: []
};

// Simulate safe zones based on civilian movement
if (intel.civilians?.length) {
  intel.civilians.forEach((report) => {
    simulation.safeZones.push({
      lat: report.location.lat + 0.05,
      lon: report.location.lon + 0.05,
      reason: "Civilian migration observed. Recommend temporary safe zone."
    });
  });
}

// Simulate threat zones from drone + signal data
if (intel.drones?.detected?.length > 0) {
  simulation.highRiskZones.push({
    region: intel.region || "Northern Border",
    threats: intel.drones.detected.length,
    reason: "Multiple drone-detected objects. Possible hostile presence."
  });
}

if (intel.signals?.riskLevel === "HIGH") {
  simulation.recommendations.push("🚨 Mobilize defensive units in the north. Risk flagged via intercepted signals.");
}

if (intel.logistics?.some(item => item.status === "LOW")) {
  simulation.recommendations.push("🔻 Initiate rapid supply chain resupply. Logistics are degraded.");
}

if (simulation.recommendations.length === 0) {
  simulation.recommendations.push("✅ No critical threats. Continue monitoring.");
}

fs.writeFileSync(
  "./data/intel/simulated_outcomes.json",
  JSON.stringify(simulation, null, 2)
);

console.log("🧪 Simulation complete — outcomes saved.");
