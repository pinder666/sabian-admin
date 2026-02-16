const fs = require("fs");

const intel = JSON.parse(fs.readFileSync("./data/intel/upgraded_strategies.json", "utf8"));

const approvedActions = [
  "deploy_relief_ops",
  "high_alert_troop_response",
  "secure_supply_routes",
  "international_condemnation",
  "monitor_only"
];

const flagged = intel.filter(entry => !approvedActions.includes(entry.strategy));

if (flagged.length > 0) {
  fs.writeFileSync("./data/intel/flagged_strategies.json", JSON.stringify(flagged, null, 2));
  console.log("🚨 Flagged unauthorized strategies. Review `flagged_strategies.json`");
} else {
  console.log("✅ All strategies verified non-lethal and approved.");
}
