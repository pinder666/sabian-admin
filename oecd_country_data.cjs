// sabian_core/revenue_streams/oecd_country_data.cjs

const https = require("https");

module.exports = async function fetchData() {
  const indicators = [
    {
      id: "REV",
      label: "General Government Revenue",
      dataset: "GOV_REV"
    },
    {
      id: "GDP",
      label: "Gross Domestic Product",
      dataset: "NAAG"
    }
  ];

  const countries = ["USA", "FRA", "DEU", "JPN", "CAN"];
  const results = [];

  try {
    for (const indicator of indicators) {
      for (const country of countries) {
        const url = `https://stats.oecd.org/SDMX-JSON/data/${indicator.dataset}/${country}.${indicator.id}.T/all?startTime=2022&endTime=2024`;
        const json = await fetchJson(url);

        const series = json?.dataSets?.[0]?.series || {};
        const keys = Object.keys(series)[0];
        const obs = series[keys]?.observations || {};
        const latestKey = Object.keys(obs).pop();
        const value = obs[latestKey]?.[0];

        const year = json.structure.dimensions.observation[0].values[latestKey]?.name;

        results.push({
          country,
          indicator: indicator.label,
          code: indicator.id,
          year: year || "N/A",
          value: value || "N/A",
          source: "OECD"
        });
      }
    }

    return { source: "OECD", data: results };
  } catch (err) {
    return { source: "OECD", error: err.message };
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
