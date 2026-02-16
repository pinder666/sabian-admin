// strategy_core.js

const fs = require("fs");

const sim = JSON.parse(fs.readFileSync("./data/intel/simulated_outcomes.json", "utf-8"));

const strategy = {
  timestamp: new Date().toISOString(),
  summary: [],
  actions: []
};

// Strategic summary from recommendations
strategy.summary.push(...sim.recommendations);

// High-level actions
if (sim.highRiskZones?.length > 0) {
  strategy.actions.push("🚧 Deploy drone recon to high-risk zones.");
}

if (sim.safeZones?.length > 0) {
  strategy.actions.push("🛡 Set up civilian support and shelter infrastructure in safe zones.");
}

if (sim.recommendations.some(r => r.includes("resupply"))) {
  strategy.actions.push("📦 Prioritize medical, fuel, and food logistics to frontline units.");
}

if (strategy.actions.length === 0) {
  strategy.actions.push("📘 Maintain current posture. No further action needed.");
}

fs.writeFileSync(
  "./data/intel/strategy_recommendations.json",
  JSON.stringify(strategy, null, 2)
);

console.log("🎯 Strategic actions generated and saved.");
