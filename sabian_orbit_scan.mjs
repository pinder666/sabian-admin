// sabian_orbit_scan.mjs
// 🔒 MILITARY-GRADE SABIAN ORBIT INTELLIGENCE SYSTEM — v2 LIVE AUTONOMOUS LOOP

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import Parser from 'rss-parser';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const cheerio = require('cheerio');
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 🔧 CONFIG
const CONFIG = {
  missionName: 'sabian_orbit_scan',
  memoryPath: path.join(__dirname, 'brain_memory.jsonl'),
  loopIntervalMinutes: 10,
  rssFeeds: [
    { name: 'WAM UAE', url: 'https://wam.ae/en/rss.xml', region: 'UAE' }
  ],
  htmlFeeds: [
    { name: 'AfDB News', url: 'https://www.afdb.org/en/news-and-events/news', region: 'Africa', selector: '.views-row' },
    { name: 'SADC News', url: 'https://www.sadc.int/latest-news', region: 'SADC', selector: '.views-row' }
  ],
  staticSources: [
    {
      name: 'Open Meteo Climate Forecast',
      url: 'https://api.open-meteo.com/v1/forecast?latitude=25.276987&longitude=55.296249&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto',
      region: 'UAE',
      type: 'climate'
    },
    {
      name: 'Namibia Energy Profile (IRENA)',
      url: 'https://www.irena.org/Statistics/View-Data-by-Country/Namibia',
      region: 'Namibia',
      type: 'energy',
      scrape: true,
      selector: 'main'
    }
  ]
};

// 🧠 MEMORY LOG
function logToMemory(entry) {
  const record = {
    ...entry,
    timestamp: new Date().toISOString(),
    missionId: crypto.randomUUID(),
    source: entry.source || 'unknown',
    agent: CONFIG.missionName,
    status: 'active'
  };
  try {
    fs.appendFileSync(CONFIG.memoryPath, JSON.stringify(record) + '\n');
    console.log(`[🧠] Memory logged: ${record.summary?.slice(0, 60)}...`);
  } catch (err) {
    console.error('[❌] Memory write failed:', err.message);
  }
}

// 📡 RSS
async function scanRSS() {
  const parser = new Parser();
  for (const feed of CONFIG.rssFeeds) {
    try {
      const data = await parser.parseURL(feed.url);
      for (const item of data.items.slice(0, 5)) {
        logToMemory({
          region: feed.region,
          source: feed.name,
          summary: item.title,
          url: item.link,
          tags: ['rss', 'gov', 'intel'],
          confidence: 0.91
        });
      }
    } catch (err) {
      console.warn(`[⚠️] RSS failed: ${feed.name}`, err.message);
    }
  }
}

// 🧬 HTML SCRAPE
async function scanHTML() {
  for (const feed of CONFIG.htmlFeeds) {
    try {
      const res = await fetch(feed.url);
      const html = await res.text();
      const $ = cheerio.load(html);
      $(feed.selector).slice(0, 5).each((_, el) => {
        const content = $(el).text().trim().replace(/\s+/g, ' ');
        if (content.length > 50) {
          logToMemory({
            region: feed.region,
            source: feed.name,
            summary: content,
            tags: ['html', 'policy', 'intel'],
            confidence: 0.86
          });
        }
      });
    } catch (err) {
      console.warn(`[⚠️] HTML scan failed: ${feed.name}`, err.message);
    }
  }
}

// 🌐 OPEN DATA/APIs
async function scanStaticSources() {
  for (const src of CONFIG.staticSources) {
    try {
      const res = await fetch(src.url);
      if (src.scrape) {
        const html = await res.text();
        const $ = cheerio.load(html);
        const raw = $(src.selector).text().trim().replace(/\s+/g, ' ');
        logToMemory({
          region: src.region,
          source: src.name,
          summary: raw.slice(0, 250),
          tags: [src.type, 'scrape'],
          confidence: 0.75
        });
      } else {
        const data = await res.json();
        const keys = Object.keys(data.daily);
        const sample = keys.map(k => `${k}: ${data.daily[k][0]}`).join(', ');
        logToMemory({
          region: src.region,
          source: src.name,
          summary: `Climate data — ${sample}`,
          tags: ['climate', 'api'],
          confidence: 0.96
        });
      }
    } catch (err) {
      console.warn(`[⚠️] Static fetch failed: ${src.name}`, err.message);
    }
  }
}

// 🔁 LOOP
async function sabianLoop() {
  console.log(`\n[🔁] SABIAN ORBIT CYCLE — ${new Date().toISOString()}`);
  await scanRSS();
  await scanHTML();
  await scanStaticSources();
  console.log(`[✅] INTEL CYCLE COMPLETE — sleeping ${CONFIG.loopIntervalMinutes} min`);
}

// 🔒 SELF CHECK
function selfCheck() {
  if (!fs.existsSync(CONFIG.memoryPath)) {
    fs.writeFileSync(CONFIG.memoryPath, '');
  }
}

// 🚀 START
(async () => {
  console.log(`[🛰️] SABIAN ORBIT SYSTEM BOOTING`);
  selfCheck();
  await sabianLoop();
  setInterval(sabianLoop, CONFIG.loopIntervalMinutes * 60 * 1000);
})();
