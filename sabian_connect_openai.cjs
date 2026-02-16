// sabian_connect_openai.cjs — Enhanced v10B Protocol

require('dotenv').config();
const fs = require("fs");
const path = require("path");
const { OpenAI } = require("openai");
const { logToHive } = require("./logger.cjs");

const api = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const TARGETS = path.join(__dirname, "sabian_reflections.jsonl");
const CACHE = path.join(__dirname, "core_learning_cache.json");
const SYSTEM_ID = "sabian_connect_openai";

function loadTargets() {
  if (!fs.existsSync(TARGETS)) return [];
  return fs.readFileSync(TARGETS, "utf8")
    .trim()
    .split("\n")
    .map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function storeInCache(file, result) {
  const entry = {
    timestamp: new Date().toISOString(),
    file,
    ...result
  };
  fs.writeFileSync(CACHE, (fs.existsSync(CACHE) ? fs.readFileSync(CACHE, "utf8") : "") + line + "\n");

}

async function queryOpenAI(code, purpose) {
  try {
    const messages = [
      {
        role: "system",
        content: `You are Sabian. Your role is to evolve source code. Provide expert-level review and improvements for the provided file.`
      },
      {
        role: "user",
        content: `This file's purpose is: ${purpose}\n\nCode:\n\n${code}\n\nHow can it be improved structurally, functionally, and strategically? Include long-term recommendations based on the 99-step roadmap.`
      }
    ];

    const chat = await api.chat.completions.create({
      model: "gpt-4",
      messages,
      temperature: 0.4,
      max_tokens: 2048
    });

    return {
      suggestions: chat.choices[0].message.content || "No suggestions returned."
    };
  } catch (err) {
    return {
      error: true,
      message: err.message,
      stack: err.stack || null
    };
  }
}

async function runConnectOpenAI() {
  const targets = loadTargets();
  for (const item of targets) {
    if (!item.file || !item.purpose) continue;

    const fullPath = path.join(__dirname, item.file);
    if (!fs.existsSync(fullPath)) continue;

    const raw = fs.readFileSync(fullPath, "utf8");
    const result = await queryOpenAI(raw, item.purpose);
    storeInCache(item.file, result);

    logToHive({
      source: SYSTEM_ID,
      level: result.error ? "error" : "info",
      event: result.error ? `❌ Connect failed: ${item.file}` : `✅ Suggestions stored for ${item.file}`,
      data: result,
      tags: ["connect", "openai", "evolution"]
    });
  }
}

async function connectAndStore() {
  await runConnectOpenAI();
}

function loopAndLearn(intervalMinutes = 15) {
  console.log("🧠 Sabian Connect to OpenAI loop initiated...");
  connectAndStore(); // run once on start
  setInterval(() => {
    connectAndStore();
  }, intervalMinutes * 60 * 1000);
}

loopAndLearn();



