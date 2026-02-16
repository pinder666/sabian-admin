require("dotenv").config();
const fs = require("fs");
const path = require("path");
const ElevenLabs = require("elevenlabs-node"); // Corrected import

// Voice IDs
const HOST_VOICE_ID = "6EW6z8IiJRtePnNUNPKW";     // Host A
const SABIAN_VOICE_ID = "UgBBYS2sOqTuMpoF3BR0";   // Sabian (Mark)

// Voice memory log path
const logPath = "./data/voice/voice_memory.jsonl";

// Load the strategy briefing
const briefText = fs.readFileSync("./strategy_brief.txt", "utf8");
const lines = briefText.split("\n").filter(Boolean);

// Alternate lines between host and Sabian
const exchanges = lines.map((line, idx) => ({
  voice_id: idx % 2 === 0 ? HOST_VOICE_ID : SABIAN_VOICE_ID,
  speaker: idx % 2 === 0 ? "Host A" : "Sabian",
  text: line,
}));

// Log to memory
function logVoiceLine(context, emotion, text) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    context,
    emotion,
    tone_score: null,
    text,
  };
  fs.appendFileSync(logPath, JSON.stringify(logEntry) + "\n");
}

// Play the full strategy briefing
async function playBrief() {
  const client = new ElevenLabs({
    apiKey: process.env.ELEVENLABS_API_KEY,
  });

  for (const part of exchanges) {
    const audio = await client.textToSpeechStream({
      voiceId: part.voice_id,
      text: part.text,
    });

    const fileName = `./podcast_audio/segment_${Date.now()}.mp3`;
    const chunks = [];

    for await (const chunk of audio) {
      chunks.push(chunk);
    }

    fs.writeFileSync(fileName, Buffer.concat(chunks));

    const context = "Defense Briefing";
    const emotion = part.speaker === "Sabian" ? "urgent" : "stern";
    logVoiceLine(context, emotion, part.text);

    console.log(`🎙️ ${part.speaker}: ${part.text.slice(0, 60)}...`);
  }

  console.log("✅ Defense podcast completed and logged.");
}

playBrief().catch(console.error);
