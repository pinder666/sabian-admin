 // elon_data_orbit.cjs (Updated: No CMD spam, silent spawn)

const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const SOURCES = [
  {
    name: "Teslarati",
    url: "https://www.teslarati.com",
    selector: "article h3",
    extract: ($, el) => $(el).text().trim(),
  },
  {
    name: "Electrek",
    url: "https://electrek.co",
    selector: "h2.post-title",
    extract: ($, el) => $(el).text().trim(),
  },
  {
    name: "SpaceNews",
    url: "https://spacenews.com",
    selector: "article h3.entry-title",
    extract: ($, el) => $(el).text().trim(),
  },
];

const LOG_FILE = path.join(__dirname, "../logs/elon_scrape.log");
const OUTPUT_FILE = path.join(__dirname, "../data/tesla_insight_raw.json");

function log(message) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(LOG_FILE, `[${timestamp}] ${message}\n`);
}

async function scrapeSource(source) {
  try {
    const res = await axios.get(source.url, { timeout: 10000 });
    const $ = cheerio.load(res.data);
    const items = [];
    $(source.selector).each((i, el) => {
      const content = source.extract($, el);
      if (content && content.length > 10) {
        items.push({
          source: source.name,
          url: source.url,
          content,
          timestamp: new Date().toISOString(),
        });
      }
    });
    log(`✅ Fetched ${items.length} items from ${source.name}`);
    return items.slice(0, 5); // top 5 per source
  } catch (err) {
    log(`❌ Error fetching ${source.name}: ${err.message}`);
    return [];
  }
}

async function runIntelSweep() {
  log("🔍 Starting Elon Data Orbit sweep...");
  const allData = [];
  for (const source of SOURCES) {
    const items = await scrapeSource(source);
    allData.push(...items);
  }

  try {
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allData, null, 2));
    log(`🧠 Saved ${allData.length} items to ${OUTPUT_FILE}`);
  } catch (err) {
    log(`❌ Failed to write JSON output: ${err.message}`);
  }

  log("✅ Elon Data Orbit sweep complete.");

  // 🔁 Trigger insight engine silently
  const child = spawn("node", ["sabian_core/insight_engine.cjs"], {
    env: { ...process.env, SABIAN_VAULT_PASS: "yourpass" },
    stdio: "ignore",
    detached: true,
  });
  child.unref();
}

runIntelSweep();
