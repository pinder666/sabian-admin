// sabian_core/revenue_streams/imf_global_revenue.cjs

const https = require("https");

module.exports = async function fetchData() {
  const dataset = "WEO"; // World Economic Outlook
  const countries = ["USA", "CHN", "IND", "DEU", "BRA"];
  const indicators = [
    { id: "NGDPD", label: "Nominal GDP (USD Billions)" },
    { id: "GGX_NGDP", label: "Govt Revenue % of GDP" }
  ];

  try {
    const results = [];

    for (const country of countries) {
      for (const indicator of indicators) {
        const url = `https://www.imf.org/external/datamapper/api/${indicator.id}/${dataset}/${country}`;
        const json = await fetchJson(url);

        const years = Object.keys(json?.values || {}).sort().reverse();
        const latestYear = years[0];
        const value = json?.values?.[latestYear];

        results.push({
          country,
          indicator: indicator.label,
          code: indicator.id,
          year: latestYear || "N/A",
          value: value || "N/A",
          source: "IMF"
        });
      }
    }

    return { source: "IMF", data: results };
  } catch (err) {
    return { source: "IMF", error: err.message };
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
