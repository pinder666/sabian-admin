// 🎯 SABIAN INSIGHT ENGINE — OPENROUTER + AUDIO (Host A + Sabian)
// Single-file version (no external voice_generator) to eliminate hidden doubling.
// Generates script -> splits lines -> TTS per line -> merges -> saves to /my_audio

require('dotenv').config({ path: './.env' });

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');

const tone_profiles = require('./tone_profiles.cjs');
const sabian_prompt = require('./sabian_prompt.json');
const { logToHive } = require('./logger.cjs');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log("\n🎙️ SABIAN INSIGHT ENGINE — OPENROUTER + AUDIO\n");

const language = 'en';
const experience_type = 'conversational';

function safeClose() {
  try { rl.close(); } catch (_) {}
}

function normalizeDialogueLines(raw) {
  return raw
    .split('\n')
    .map(l => l.trim().replace(/^[-–—•"']+\s*/, "")) // strip bullets/quotes/dashes
    .filter(l => l.startsWith("Sabian:") || l.startsWith("Host A:"));
}

async function mergeAudio(segments, mergedPath) {
  await new Promise((resolve, reject) => {
    const chain = ffmpeg();
    segments.forEach(seg => chain.input(seg));
    chain.on('end', resolve).on('error', reject).mergeToFile(mergedPath);
  });
}

// ✅ Inline ElevenLabs TTS (so there is only ONE place audio is generated)
async function generateSpeech(text, voiceId, outputPath) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("Missing ELEVENLABS_API_KEY in .env");
  if (!voiceId) throw new Error("Missing voiceId for ElevenLabs");
  const cleanText = (text ?? "").toString().trim();
  if (!cleanText) throw new Error("generateSpeech called with empty text");

  // Debug file so we can prove what was sent for THIS mp3
  const debugPath = outputPath.replace(/\.mp3$/i, ".txt");
  fs.writeFileSync(
    debugPath,
    [
      `voiceId=${voiceId}`,
      `output=${outputPath}`,
      `len=${cleanText.length}`,
      `preview=${cleanText.slice(0, 180)}`,
      ``,
      `---FULL_TEXT---`,
      cleanText
    ].join("\n"),
    "utf8"
  );

  // Ensure we are overwriting (never appending)
  if (fs.existsSync(outputPath)) {
    try { fs.unlinkSync(outputPath); } catch (_) {}
  }

  const res = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      text: cleanText,
      model_id: process.env.ELEVENLABS_MODEL_ID || "eleven_monolingual_v1",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 }
    },
    {
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg"
      },
      responseType: "arraybuffer",
      timeout: 120000
    }
  );

  fs.writeFileSync(outputPath, Buffer.from(res.data), { flag: "w" });
  console.log(`✅ Audio file saved as ${outputPath}`);
}

rl.question("Enter business name: ", (business_name) => {
  rl.question("What problem should Sabian solve?: ", async (business_problem) => {
    try {
      if (!process.env.OPENROUTER_API_KEY) throw new Error("Missing OPENROUTER_API_KEY in .env");
      if (!process.env.SABIAN_VOICE_ID) throw new Error("Missing SABIAN_VOICE_ID in .env");
      if (!process.env.HOST_A_US_ID) throw new Error("Missing HOST_A_US_ID in .env");

      const profile = tone_profiles[`${experience_type}_${language}`] || tone_profiles['conversational_en'];

      const PRIME_DIRECTIVE =
        "Sabian’s mission: help this business maximize revenue, reduce leaks, unlock hidden opportunities, solve problems faster and smarter across all domains.";

      const current_topic = `Sabian must help ${business_name} solve: ${business_problem}`;

      const formatting_guardrails = `
OUTPUT RULES (MANDATORY):
- Dialogue ONLY.
- Every line MUST start with exactly "Host A:" or "Sabian:".
- No bullets, no quotes, no markdown, no headings.
- Host A opens the show.
- Host A ends with: "Sixty seconds. Excellent work."
- Keep to ~60–90 seconds of spoken audio.
`;

      const prompt = `
Identity: ${JSON.stringify(sabian_prompt.identity)}
Directives: ${JSON.stringify(sabian_prompt.directives)}
Personality: ${JSON.stringify(sabian_prompt.personality)}
Simulation: ${JSON.stringify(sabian_prompt.simulation)}
VoiceScript: ${JSON.stringify(sabian_prompt.voiceScript)}
Intel: ${JSON.stringify(sabian_prompt.intel)}
Instructions: ${sabian_prompt.instructions}

Experience Enhancers: ${JSON.stringify(sabian_prompt.experience_enhancers)}

PRIME DIRECTIVE: ${PRIME_DIRECTIVE}

Format:
- Podcast: Sabian Insights
- Host A = human interviewer | Sabian = Host B
- Dialogue style: ${profile.prompt}
- Topic: ${current_topic}

${formatting_guardrails}
`;

      const url = `https://openrouter.ai/api/v1/chat/completions`;
      const data = {
        model: "deepseek/deepseek-r1-0528:free",
        messages: [
          { role: "system", content: "You are Sabian. Follow output rules exactly." },
          { role: "user", content: prompt }
        ]
      };

      const headers = {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      };

      const response = await axios.post(url, data, { headers });
      const raw = response.data.choices?.[0]?.message?.content || "";

      console.log("\n🧠 SABIAN PODCAST SCRIPT:\n\n" + raw);

      logToHive({
        source: "sabian_insight_feed",
        level: "info",
        event: "script_generated",
        data: { business_name, business_problem, preview: raw.slice(0, 300) },
        tags: ["script", "openrouter"]
      });

      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const audioFolder = path.join(__dirname, 'my_audio');
      if (!fs.existsSync(audioFolder)) fs.mkdirSync(audioFolder);

      const scriptPath = path.join(audioFolder, `script_openrouter_${ts}.txt`);
      fs.writeFileSync(scriptPath, raw, 'utf8');

      const lines = normalizeDialogueLines(raw);
      if (!lines.length) throw new Error("No valid dialogue lines found (expected Host A:/Sabian:).");

      const audioSegments = [];
      const mergedPath = path.join(audioFolder, `sabian_openrouter_${ts}.mp3`);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        const voiceId = line.startsWith("Sabian:")
          ? process.env.SABIAN_VOICE_ID
          : process.env.HOST_A_US_ID;

        const cleanedLine = line
          .replace(/^Sabian:\s*/i, "")
          .replace(/^Host A:\s*/i, "")
          .replace(/\*/g, "")
          .trim();

        if (!cleanedLine) continue;

        // IMPORTANT: unique, deterministic filename for this segment
        const segPath = path.join(audioFolder, `seg_${i}_${ts}.mp3`);
        await generateSpeech(cleanedLine, voiceId, segPath);
        audioSegments.push(segPath);
      }

      await mergeAudio(audioSegments, mergedPath);

      console.log("\n🎧 Audio saved:");
      console.log("- Merged Podcast:", mergedPath);
      console.log("- Script:", scriptPath);

      logToHive({
        source: "sabian_insight_feed",
        level: "complete",
        event: "audio_generated",
        data: { business_name, business_problem, mergedPath, scriptPath },
        tags: ["audio", "elevenlabs", "ffmpeg"]
      });

      safeClose();
    } catch (err) {
      console.error("❌ Error:", err.response?.data || err.message);
      logToHive({
        source: "sabian_insight_feed",
        level: "error",
        event: "engine_failure",
        data: { message: err.message, details: err.response?.data || null },
        tags: ["error"]
      });
      safeClose();
    }
  });
});