// sabian_defense_voice.js
require("dotenv").config();
const fs = require("fs");
const axios = require("axios");
const { exec } = require("child_process");

const API_KEY = process.env.ELEVENLABS_API_KEY;
const SABIAN_VOICE_ID = "UgBBYS2sOqTuMpoF3BR0";  // Mark - Sabian
const HOST_VOICE_ID = "6EW6z8IiJRtePnNUNPKW";    // Bill Oxley - Host A

// 🎙️ Host sets the tone: urgent war room command briefing
const hostPrompt = `
Sabian. This is not a drill.

We have less than 30 minutes. We need clarity. We need accuracy.

A high-level assassination just triggered emergency protocol. I need your full strategic assessment on the Burkina Faso region — now.

No delays. No theories. Only what you know for sure.

Sabian... what are your current defense recommendations?
`;

// 🧠 Sabian responds with authority and calm military precision
const sabianPromptIntro = `
You are Sabian — the world's most advanced, non-lethal strategic AI.

You are being interrogated by Command Host A in a secure war room under emergency protocol.

This is your moment of highest clarity.

Deliver your Burkina Faso strategic defense recommendations with absolute precision. No speculation. No filler. You are being broadcast to the Joint African Defense Council.

Respond with bulletproof data, urgent insights, and clear action items. You understand the stakes.
`;

const sabianBriefText = fs.readFileSync("./data/intel/strategy_brief.txt", "utf-8");
const sabianFullText = `${sabianPromptIntro}\n\n${sabianBriefText}`;

async function generateSegment(text, voiceId, outputPath) {
  const response = await axios({
    method: "POST",
    url: `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    headers: {
      "xi-api-key": API_KEY,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    data: {
      text: text,
      voice_settings: {
        stability: 0.4,
        similarity_boost: 0.8,
      },
    },
    responseType: "stream",
  });

  const writer = fs.createWriteStream(outputPath);
  response.data.pipe(writer);
  return new Promise((resolve) => writer.on("finish", resolve));
}

(async () => {
  console.log("🎙️ Generating Host segment...");
  await generateSegment(hostPrompt, HOST_VOICE_ID, "./data/intel/host_intro.mp3");

  console.log("🎙️ Generating Sabian response...");
  await generateSegment(sabianFullText, SABIAN_VOICE_ID, "./data/intel/sabian_response.mp3");

  console.log("🎧 Merging segments into final podcast...");
  exec(
    `ffmpeg -y -i "concat:data/intel/host_intro.mp3|data/intel/sabian_response.mp3" -acodec copy data/intel/briefing_sabian.mp3`,
    (err) => {
      if (err) {
        console.error("❌ Failed to merge audio:", err.message);
      } else {
        console.log("✅ briefing_sabian.mp3 generated successfully.");
      }
    }
  );
})();
