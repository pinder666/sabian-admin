// sabian_core/earnings_loop_runner.cjs

const fs = require("fs");
const path = require("path");

const runIntegration = require("./revenue_intelligence_core.cjs");
const runML = require("./revenue_ml_model.cjs");

const outputFile = path.join(__dirname, "company_earnings_data.json");
const insightsFile = path.join(__dirname, "learned_insights.json");

async function runLoop() {
  try {
    console.log("[🧠] Sabian Revenue Loop: INIT");

    const merged = await runIntegration();
    console.log(`[📥] Merged ${merged.count} revenue records.`);

    const insights = await runML(outputFile);
    fs.writeFileSync(insightsFile, JSON.stringify(insights, null, 2));
    console.log(`[🔁] Updated ${insights.length} strategic insights.`);

    // Trigger all predictive, strategic, and sovereign-grade functions
    insights.forEach((insight) => {
      const tags = generateStrategicTags(insight);
      insight.tags = tags;
    });

    fs.writeFileSync(insightsFile, JSON.stringify(insights, null, 2));
    console.log(`[🚀] Strategic layer enriched.`);
  } catch (err) {
    console.error("[❌] Loop failure:", err.message);
  }
}

function generateStrategicTags(insight) {
  const tags = [];
  const value = parseFloat(String(insight.value || "").replace(/[^\d.\-]/g, "")) || 0;


  if (insight.indicator.includes("Revenue") && value < 0) tags.push("revenue_decline");
  if (insight.indicator.includes("Revenue") && value > 1000000000) tags.push("billion_dollar_stream");
  if (insight.company.includes("Inc")) tags.push("public_company");
  if (insight.fiscal_period?.toLowerCase().includes("q1")) tags.push("start_of_cycle");

  // Simulate deep pattern triggers
  if (tags.includes("revenue_decline")) {
    tags.push("predict_layoffs");
    tags.push("restructure_advice");
  }
  if (tags.includes("billion_dollar_stream")) {
    tags.push("acquisition_target");
    tags.push("market_leader");
  }
  return tags;
}

if (require.main === module) {
  runLoop();
  setInterval(runLoop, 4 * 60 * 60 * 1000); // every 4h
}

module.exports = runLoop;
