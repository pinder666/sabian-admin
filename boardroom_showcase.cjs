// 🧠 SABIAN INSIGHT ENGINE — 60 SECOND INSIGHTS INITIATED

require('dotenv').config();
const readline = require('readline');
const fs = require('fs');
const axios = require('axios');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { v4: uuidv4 } = require('uuid');
const { generateSpeech } = require('./voice_generator.cjs');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const audioFolder = path.join(__dirname, 'my_audio');
if (!fs.existsSync(audioFolder)) fs.mkdirSync(audioFolder);

console.log("\n🎤 SABIAN INSIGHT ENGINE — 60 SECOND INSIGHTS INITIATED\n");
const session_id = uuidv4();

rl.question("Enter business name: ", business_name => {
  rl.question("What problem should Sabian solve?: ", business_problem => {
    console.log("🔄 One moment — Sabian is preparing your custom insight session...");
    setTimeout(() => {
      rl.question("Just before we begin — what’s your first name?: ", user_name => {
        rl.question("And what email should we send your insight to?: ", user_email => {
          const prompt = `🎮 DIRECTIVE: Generate a 60-second business strategy script for audio, starring two AI voices: Host A (the user's advocate) and Sabian (strategic AI brain).

This is not a chatbot. This is a high-pressure scripted performance.

📌 CHARACTERS:
Host A — Not the business owner. She may say "${user_name}’s club" or "the club." Ends with: “Sixty seconds. Excellent work.”

Sabian — No fluff. Speaks directly to ${user_name}. Only mention ${user_name} once if it feels natural. Tailors insight strictly to the problem. Acknowledges pressure. No enterprise solutions if business is small. Keeps logic actionable.

🔹 Host A opens with a fixed intro: "Welcome to 60 Second Insights. I’m your host. Today we’re helping ${user_name}’s business, ${business_name}. The challenge: ${business_problem}. Sabian, we have 60 seconds."
Sabian responds first, directly referencing the problem. Host A challenges vague logic. Both push for sharp insight.

📊 RULES:
- Dialogue only. No narration.
- Sabian starts. Host A ends with "Sixty seconds. Excellent work."
- Must feel mid-momentum at the 60s mark.
- Use realistic voice rhythm, energy, skepticism, urgency.
- No added issues or assumptions. Stay focused on the provided problem.
- Limit the entire script to 900 characters or less.

Label lines: "Sabian:" or "Host A:". Now write the script.`;

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
              rl.close();
              return;
            }

            const ts = new Date().toISOString().replace(/[:.]/g, "-");
            const scriptPath = path.join(audioFolder, `transcript_${ts}.txt`);
            fs.writeFileSync(scriptPath, raw);

            const intro = `Welcome to 60 Second Insights, with Sabian. I’m your host. Today, we’re helping ${user_name}’s business, ${business_name}. The challenge: ${business_problem}. Sabian,my friend you have 60 seconds.`;
            const outro = `Thanks for listening! — “ remember unlock your free, 3-day trial at sabian.ai. Hear your business talk for the first time. See you on the inside.`;

            const allLines = raw.split('\n').filter(Boolean);
            const audioSegments = [];

            const introPath = path.join(audioFolder, `intro_${ts}.mp3`);
            const outroPath = path.join(audioFolder, `outro_${ts}.mp3`);
            const mergedPath = path.join(audioFolder, `sabian_podcast_full_${ts}.mp3`);

            await generateSpeech(intro, process.env.HOST_A_US_ID, introPath);
            audioSegments.push(introPath);

            for (let i = 0; i < allLines.length; i++) {
              const line = allLines[i];
              const speaker = line.startsWith("Sabian:") ? process.env.SABIAN_VOICE_ID : process.env.HOST_A_US_ID;
              const cleanedLine = line.replace(/^\w+:\s*/, '').trim();
              const segmentPath = path.join(audioFolder, `segment_${i}_${ts}.mp3`);
              try {
                await generateSpeech(cleanedLine, speaker, segmentPath);
                audioSegments.push(segmentPath);
              } catch (err) {
                console.error(`Failed to generate ${segmentPath}:`, err.message);
              }
            }

            await generateSpeech(outro, process.env.HOST_A_US_ID, outroPath);
            audioSegments.push(outroPath);

            const ffmpegChain = ffmpeg();
            audioSegments.forEach(segment => ffmpegChain.input(segment));

            ffmpegChain
              .on('end', () => {
                console.log(`\n🎧 Audio saved: ${mergedPath}`);
                rl.close();
              })
              .on('error', err => {
                console.error("❌ Merge failed:", err.message);
                rl.close();
              })
              .mergeToFile(mergedPath);
          })
          .catch(err => {
            console.error("❌ Error from Gemini:", err.response?.data || err.message);
            rl.close();
          });
        });
      });
    }, 900);
  });
});
