const fs = require("fs");

const intel = JSON.parse(fs.readFileSync("./data/intel/upgraded_strategies.json", "utf8"));

const threatCounts = {};
intel.forEach(entry => {
  const label = entry.label || "uncategorized";
  threatCounts[label] = (threatCounts[label] || 0) + 1;
});

const total = Object.values(threatCounts).reduce((a, b) => a + b, 0);

const forecast = Object.entries(threatCounts).map(([label, count]) => {
  return {
    threat: label,
    probability: ((count / total) * 100).toFixed(2) + "%"
  };
});

fs.writeFileSync("./data/intel/threat_forecast.json", JSON.stringify(forecast, null, 2));
console.log("✅ Threat forecast generated and saved to `threat_forecast.json`");
