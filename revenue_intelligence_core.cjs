console.log("=== STARTING REVENUE INTELLIGENCE ===");

const fs = require("fs");
const path = require("path");

const sources = [
  "sec_us_feed",
  "fred_macro_data",
  "imf_global_revenue",
  "oecd_country_data",
  "uk_eu_filings_fetcher",
  "inventory_levels",
  "process_bottlenecks",
  "asset_utilization"
];

const streamPath = path.join(__dirname, "revenue_streams");
const outputFile = path.join(__dirname, "company_earnings_data.json");

module.exports = async function integrateRevenueStreams() {
  const unified = [];

  for (const source of sources) {
    try {
      const fetch = require(path.join(streamPath, `${source}.cjs`));
      console.log(`Running ${source}...`);
      const res = await fetch();
    console.log(`Source: ${source}`);
console.log(res);


      if (res?.data && Array.isArray(res.data)) {
        const normalized = res.data.map((item) =>
          normalize(item, res.source || source)
        );
        unified.push(...normalized);
      }
    } catch (err) {
      unified.push({
        source,
        error: err.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  fs.writeFileSync(outputFile, JSON.stringify(unified, null, 2));
  return { success: true, count: unified.length };
};

function normalize(item, source) {
  return {
    company: item.company || item.country || "N/A",
    indicator: item.indicator || item.form_type || "N/A",
    value: item.reported_revenue || item.value || "N/A",
    fiscal_period: item.fiscal_period || item.year || "N/A",
    date: item.filing_date || item.date || "N/A",
    source,
    url: item.source_url || "N/A",
    currency: item.currency || "USD",
    timestamp: new Date().toISOString()
  };
}
