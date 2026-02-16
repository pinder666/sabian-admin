// sabian_core/revenue_streams/uk_eu_filings_fetcher.cjs

const https = require("https");

module.exports = async function fetchData() {
  const API_KEY = process.env.CH_API_KEY; // UK Companies House API key
  const companies = ["0001418091", "0000911147", "0000176706"]; // Example company numbers

  const results = [];

  try {
    for (const number of companies) {
      const url = `https://api.company-information.service.gov.uk/company/${number}/filing-history`;
      const json = await fetchJson(url, API_KEY);

      const filtered = (json.filing_history || []).filter((f) =>
        f.description?.includes("accounts")
      );

      for (const entry of filtered) {
        results.push({
          company_number: number,
          description: entry.description,
          filing_date: entry.date,
          type: entry.type,
          category: entry.category,
          source_url: `https://find-and-update.company-information.service.gov.uk/company/${number}/filing-history`
        });
      }
    }

    return { source: "UK_COMPANIES_HOUSE", data: results };
  } catch (err) {
    return { source: "UK_COMPANIES_HOUSE", error: err.message };
  }
};

async function fetchJson(url, apiKey) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        Authorization: "Basic " + Buffer.from(apiKey + ":").toString("base64"),
        "User-Agent": "SabianBrain/1.0"
      }
    };

    https
      .get(url, options, (res) => {
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
