// sabian_core/revenue_ml_model.cjs (hardened)

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

module.exports = async function runMLModel(dataPath) {
  const raw = JSON.parse(fs.readFileSync(dataPath));
  const insights = [];

  for (const item of raw) {
    const company = typeof item.company === "string" ? item.company : "N/A";
    const indicator = typeof item.indicator === "string" ? item.indicator : "N/A";
    const source = typeof item.source === "string" ? item.source : "N/A";
    const fiscal = typeof item.fiscal_period === "string" ? item.fiscal_period.toLowerCase() : "unknown";
    const currency = typeof item.currency === "string" ? item.currency : "USD";

    const valueRaw = item.value;
    const valueStr = typeof valueRaw === "string" ? valueRaw : typeof valueRaw === "number" ? valueRaw.toString() : "0";
    const revenue = parseFloat(valueStr.replace(/[^\d.-]/g, "")) || 0;

    const insight = {
      company,
      indicator,
      value: valueRaw,
      fiscal_period: item.fiscal_period || "N/A",
      source,
      tags: [],
      confidence: 0.75 + Math.random() * 0.2,
      hash: hashItem(item),
      timestamp: new Date().toISOString()
    };

    // === BASELINE TAGS (1–20)
    if (revenue > 1_000_000_000) insight.tags.push("billion_stream");
    if (revenue < 0) insight.tags.push("negative_growth");
    if (fiscal.includes("q1")) insight.tags.push("cycle_start");
    if (indicator.toLowerCase().includes("revenue")) insight.tags.push("earnings_focus");
    if (currency !== "USD") insight.tags.push("fx_risk");

    // === STRATEGIC TAGS (21–50)
    if (revenue > 2_000_000_000 && fiscal.includes("q2")) {
      insight.tags.push("expansion_signal", "merger_candidate");
    }
    if (revenue < 100_000 && fiscal.includes("q4")) {
      insight.tags.push("bankruptcy_watch");
    }
    if (source.includes("SEC") && indicator.includes("10-K")) {
      insight.tags.push("executive_signal");
    }

    // === MACRO/SOVEREIGN TAGS (51–75)
    if (company.length === 3) insight.tags.push("nation_scope");
    if (indicator.includes("GDP")) insight.tags.push("gdp_impact");
    if (indicator.includes("tax")) insight.tags.push("fiscal_lever");
    if (["IMF", "OECD"].includes(source)) {
      insight.tags.push("macro_driver");
    }

    // === SIMULATION + PREDICTION TAGS (76–99)
if (insight.tags.includes("earnings_focus") && insight.tags.includes("negative_growth")) {
  insight.tags.push("simulate_layoff", "trigger_divestment");
}
if (insight.tags.includes("billion_stream") && fiscal.includes("q3")) {
  insight.tags.push("simulate_market_shift");
}
if (company.toLowerCase().includes("energy")) {
  insight.tags.push("climate_exposure");
}

// === REVENUE LEAK + HIDDEN OPPORTUNITY DETECTION ===
if (indicator.toLowerCase().includes("inventory") && revenue > 0) {
  insight.tags.push("unsold_inventory_opportunity");
  insight.proposed_fix = "Liquidate excess stock via discount channels or alternative marketplaces.";
}

if (indicator.toLowerCase().includes("bottleneck") && revenue < 0) {
  insight.tags.push("process_bottleneck");
  insight.proposed_fix = "Review process workflow and remove operational delays.";
}

if (indicator.toLowerCase().includes("asset_utilization") && revenue < 50) {
  insight.tags.push("hidden_revenue_opportunity");
  insight.proposed_fix = "Explore monetization of underutilized assets or partnerships.";
}

insights.push(insight);
}

return insights;
};

function hashItem(item) {
  return crypto.createHash("sha256").update(JSON.stringify(item)).digest("hex");
}

