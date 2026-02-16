require('dotenv').config();
const fs = require('fs');
const axios = require('axios');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { generateSpeech } = require('./voice_generator.cjs');
const ffmpeg = require('fluent-ffmpeg');

const sabianVoiceId = process.env.SABIAN_VOICE_ID;
const hostAVoiceId = process.env.HOST_A_US_ID;
const audioFolder = path.join(__dirname, 'my_audio');
const sessionId = uuidv4();

if (!fs.existsSync(audioFolder)) fs.mkdirSync(audioFolder);

const prompt = `
Generate a realistic, 30-second audio script that demonstrates the conversational tone and dynamic of the Sabian Insights Podcast.

CHARACTERS:

- Host A: Confident, sharp, relatable. Uses plain language, asks tough, layered questions, pushes for clarity.
- Sabian: Calm, wise, factual. Speaks as the voice of the business itself. Never guesses, never jokes, never refers to itself in 3rd person. Provides direct, strategic insight.

SCENARIO:

An e-commerce business is currently generating $10,000/month in revenue. Their goal is to reach $50,000/month within the next 90 days. The business is struggling with inconsistent sales and a high rate of cancellations during the low season.

Sabian and Host A are discussing the situation, exposing the specific gaps in sales strategy and operations,hidden revenue opportunities, business revenue bottlenecks, and identifying clear, data-backed next steps to help achieve the revenue target.

"This is a new conversational session. Do not reuse prior examples, cached training responses, or generic content. Generate a fresh, realistic, data-driven conversation based strictly on this session's information."

REQUIREMENTS:

- Natural, realistic back-and-forth conversation.
- Focus on sales improvement, retention, and reducing low season cancellations.
- Sabian speaks only facts, no speculation, no mystical language.
- Host A challenges weak answers, represents the business owner's doubts.
- Plain language — no jargon, no AI self-references.
- No filler like background music cues or sound effects.
- End the sample naturally, mid-discussion, as if it's a real podcast segment.

Label lines as:
Sabian: [dialogue]
Host A: [dialogue]
`;

axios.post(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${process.env.GEMINI_API_KEY}`,
  {
    contents: [{ role: "user", parts: [{ text: prompt }] }]
  },
  { headers: { "Content-Type": "application/json" } }
)
.then(async response => {
  const raw = response.data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (!raw.toLowerCase().includes("sabian")) {
    console.error("❌ Sabian did not respond.");
    return;
  }

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const scriptPath = path.join(audioFolder, `showcase_script_${ts}.txt`);
  fs.writeFileSync(scriptPath, raw);

  const allLines = raw.split('\n').filter(Boolean);
  const audioSegments = [];

  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i];
    const speaker = line.startsWith("Sabian:") ? sabianVoiceId : hostAVoiceId;
    const cleanedLine = line.replace(/^Sabian:\s*/i, "").replace(/^Host A:\s*/i, "").trim();

    const segmentPath = path.join(audioFolder, `segment_${i}_${ts}.mp3`);

    try {
      await generateSpeech(cleanedLine, speaker, segmentPath);
      audioSegments.push(segmentPath);
    } catch (err) {
      console.error(`Failed to generate ${segmentPath}:`, err.message);
    }
  }

  const mergedPath = path.join(audioFolder, `sabian_showcase_${ts}.mp3`);

  const ffmpegChain = ffmpeg();
  audioSegments.forEach(segment => ffmpegChain.input(segment));

  ffmpegChain
    .on('end', () => {
      console.log(`\n🎧 Showcase audio saved: ${mergedPath}`);
      audioSegments.forEach(file => {
        if (!file.includes('showcase_script')) {
          fs.unlink(file, err => {
            if (err) console.error("Failed to delete", file, err.message);
          });
        }
      });
    })
    .on('error', err => {
      console.error("❌ Merge failed:", err.message);
    })
    .mergeToFile(mergedPath);
})
.catch(err => {
  console.error("❌ Error from Gemini:", err.response?.data || err.message);
});
