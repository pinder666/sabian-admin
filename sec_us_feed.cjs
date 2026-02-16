// sabian_core/revenue_streams/sec_us_feed.cjs

const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { JSDOM } = require("jsdom");

const EDGAR_BASE = "https://www.sec.gov";
const HEADERS = { "User-Agent": "SabianBrain/1.0 (revenue@sabian.ai)" };
const FORM_TYPES = ["10-K", "10-Q", "8-K"];
const OUTPUT_PATH = path.join(__dirname, "..", "company_earnings_data.json");
const LOG_PATH = path.join(__dirname, "..", "logs", "sec_edgar.jsonl");

module.exports = async function fetchData() {
  try {
    const indexUrl = await getLatestMasterIndexURL();
    const rawIndex = await fetchUrl(indexUrl);
    const filings = extractRelevantFilings(rawIndex);
    const results = [];

    for (const filing of filings) {
      const fullUrl = `${EDGAR_BASE}/Archives/${filing.url}`;
      const content = await fetchUrl(fullUrl);
      const revenue = extractRevenue(content);

      const record = {
        company: filing.company,
        cik: filing.cik,
        form_type: filing.form_type,
        filing_date: filing.date_filed,
        reported_revenue: revenue.amount,
        currency: "USD",
        fiscal_period: revenue.period,
        source_url: fullUrl,
        hash: hashObject(filing),
        timestamp: new Date().toISOString()
      };

      results.push(record);
      logStructured(record);
    }

    saveData(results);
    return { source: "SEC_EDGAR", count: results.length };
  } catch (err) {
    return { source: "SEC_EDGAR", error: err.message };
  }
};

async function getLatestMasterIndexURL() {
  const now = new Date();
  const year = now.getFullYear();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return `https://www.sec.gov/Archives/edgar/daily-index/${year}/QTR${q}/master.idx`;
}

function extractRelevantFilings(indexData) {
  const lines = indexData.split("\n").slice(11);
  return lines
    .map((line) => {
      const [cik, company, form_type, date_filed, url] = line.split("|");
      return { cik, company, form_type, date_filed, url };
    })
    .filter((f) => FORM_TYPES.includes(f.form_type));
}

async function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: HEADERS }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

function extractRevenue(html) {
  try {
    const dom = new JSDOM(html);
    const text = dom.window.document.body.textContent;
    const match = text.match(/(Revenue|Sales)[^\d]*([\$]?\d[\d,\.]+[MB]?)\s*(for|in)?\s*(Q\d|\w+\s\d{4})?/i);
    return {
      amount: match?.[2] || "N/A",
      period: match?.[4] || "Unknown"
    };
  } catch {
    return { amount: "N/A", period: "Unknown" };
  }
}

function logStructured(record) {
  fs.appendFileSync(LOG_PATH, JSON.stringify(record) + "\n");
}

function saveData(data) {
  const existing = fs.existsSync(OUTPUT_PATH)
    ? JSON.parse(fs.readFileSync(OUTPUT_PATH))
    : [];
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify([...existing, ...data], null, 2));
}

function hashObject(obj) {
  return crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}
