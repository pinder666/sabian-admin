// sabian_core/revenue_streams/fred_macro_data.cjs

const https = require("https");

module.exports = async function fetchData() {
  const FRED_API_KEY = process.env.FRED_API_KEY;
  const indicators = [
    { id: "GDP", label: "US Gross Domestic Product" },
    { id: "CPILFESL", label: "Core Inflation" },
    { id: "UNRATE", label: "Unemployment Rate" },
    { id: "FEDFUNDS", label: "Federal Funds Rate" }
  ];

  try {
    const results = [];

    for (const indicator of indicators) {
      const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${indicator.id}&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=1`;
      const json = await fetchJson(url);

      const latest = json.observations?.[0] || {};
      results.push({
        indicator: indicator.label,
        code: indicator.id,
        date: latest.date || "N/A",
        value: latest.value || "N/A",
        source: "FRED"
      });
    }

    return { source: "FRED", data: results };
  } catch (err) {
    return { source: "FRED", error: err.message };
  }
};

async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}
