// sabian_voice.cjs

require("dotenv").config();
const fs = require("fs");
const axios = require("axios");

const briefingText = fs.readFileSync("./data/intel/briefing.txt", "utf-8").trim();
const voiceId = process.env.SABIAN_VOICE_ID;
const apiKey = process.env.ELEVENLABS_API_KEY;

const outputPath = "./data/intel/briefing_sabian.mp3";

async function generateVoice() {
  try {
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        text: briefingText,
        model_id: "eleven_monolingual_v1",
        voice_settings: {
          stability: 0.75,
          similarity_boost: 0.85
        }
      },
      {
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          "Accept": "audio/mpeg"
        },
        responseType: "arraybuffer"
      }
    );

    fs.writeFileSync(outputPath, response.data);
    console.log("🎧 Sabian briefing audio saved to:", outputPath);
  } catch (err) {
 const errorData = err.response?.data;
if (errorData instanceof Buffer) {
  console.error("❌ Failed to generate voice:", JSON.parse(errorData.toString()));
} else {
  console.error("❌ Failed to generate voice:", errorData || err.message);
}

generateVoice();
