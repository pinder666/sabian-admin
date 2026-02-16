const fs = require("fs");

const intel = JSON.parse(fs.readFileSync("./data/intel/labeled_intel.json", "utf8"));

const strategyMap = {
  "fatal_attack": "high_alert_troop_response",
  "humanitarian_crisis": "deploy_relief_ops",
  "child_military_use": "international_condemnation",
  "aid_disruption": "secure_supply_routes"
};

const upgraded = intel.map(entry => {
  const strategy = strategyMap[entry.label] || "monitor_only";
  return { ...entry, strategy };
});

fs.writeFileSync("./data/intel/upgraded_strategies.json", JSON.stringify(upgraded, null, 2));

console.log("✅ Strategies upgraded and saved to `upgraded_strategies.json`");
