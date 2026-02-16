const fs = require("fs");
const path = require("path");

const memoryFile = path.join(__dirname, "voice_memory.jsonl");
const profileFile = path.join(__dirname, "voice_profile.json");

const memoryLines = fs.readFileSync(memoryFile, "utf-8")
  .split("\n")
  .filter(Boolean)
  .map(line => {
    try {
      return JSON.parse(line);
    } catch (err) {
      console.warn("❌ Skipping invalid line:", line);
      return null;
    }
  })
  .filter(Boolean);

const phraseCount = {};
const voiceUsage = {};
const topics = {};

for (const entry of memoryLines) {
  const text = entry.text.toLowerCase();
  const voice = entry.voice_id;

  // Track most used phrases
  const phrases = text.split(/\W+/).filter(w => w.length > 3);
  for (const word of phrases) {
    phraseCount[word] = (phraseCount[word] || 0) + 1;
  }

  // Track voice style usage
  voiceUsage[voice] = (voiceUsage[voice] || 0) + 1;

  // Detect and track tag-based topics
  const tagMatch = text.match(/\[(.*?)\]/g);
  if (tagMatch) {
    for (const tag of tagMatch.map(t => t.replace(/\[|\]/g, ''))) {
      topics[tag] = (topics[tag] || 0) + 1;
    }
  }
}

// Generate a profile summary
const profile = {
  last_updated: new Date().toISOString(),
  total_segments: memoryLines.length,
  most_used_words: Object.entries(phraseCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10),
  voice_distribution: voiceUsage,
  common_topics: Object.entries(topics).sort((a, b) => b[1] - a[1])
};

fs.writeFileSync(profileFile, JSON.stringify(profile, null, 2));
console.log("🧠 Voice profile updated:", profileFile);
