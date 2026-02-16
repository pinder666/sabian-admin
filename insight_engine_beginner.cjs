//SABIAN INSIGHT ENGINE — MILITARY GRADE AUDIO PODCAST SYSTEM (60 Second Insights)

require('dotenv').config();
const readline = require('readline');
const fs = require('fs');
const axios = require('axios');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { v4: uuidv4 } = require('uuid');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { generateSpeech } = require('./voice_generator.cjs');
const { logToHive } = require('./logger.cjs');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function logUserToSupabase({ name, email, business_name, problem }) {
  const { error } = await supabase.from('users').insert([
    { name, email, business_name, problem }
  ]);
  if (error) {
    console.error("❌ Supabase insert error:", error.message);
  } else {
    console.log("✅ User logged to Supabase.");
  }
}

console.log("\n🎤 SABIAN INSIGHT ENGINE — 60 SECOND INSIGHTS INITIATED\n");
const session_id = uuidv4();
logToHive({
  source: 'sabian_wizard',
  level: 'start',
  event: '🌀 First Contact Sequence Initiated',
  data: { session_id },
  tags: ['onboarding', 'first_contact']
});

try { console.log("\u0007"); } catch (_) {}

rl.question("Enter business name: ", business_name => {
  rl.question("What problem should Sabian solve?: ", business_problem => {
    console.log("🔄 One moment — Sabian is preparing your custom insight session...");
    setTimeout(() => {
  (async () => {
    rl.question("Just before we begin — what’s your first name?: ", user_name => {
      rl.question("And what email should we send your insight to?: ", async user_email => {
        await logUserToSupabase({
          name: user_name,
          email: user_email,
          business_name,
          problem: business_problem
        });

        // You can now continue with your logic below (e.g., AI prompt, audio, etc.)

      }); // closes rl.question (email)
    }); // closes rl.question (name)
  })(); // closes async IIFE
}, 900); // closes setTimeout


  }); // closes rl.question (business_problem)
}); // closes rl.question (business_name)

        // ... continue your code ...



          // CONTINUE your script logic here...

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
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=" + process.env.GEMINI_API_KEY,
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
              const audioFolder = path.join(__dirname, 'my_audio');
              if (!fs.existsSync(audioFolder)) fs.mkdirSync(audioFolder);

              const scriptPath = path.join(audioFolder, 'script_' + ts + '.txt');
              fs.writeFileSync(scriptPath, raw);

              const intro = `Welcome to 60 Second Insights. I’m your host, Natalie joined by Sabian. Today, we’re helping ${user_name}’s business, ${business_name}. Their challenge: ${business_problem}. Sabian, care to shed some light in 60 seconds?`;
              const outro = `Times up! — “ If you like what you heard, share this with friends. Then sign up and become a member so we can give you real insights. We look forward to taking your business to another level with you`;

              const allLines = raw.split('\n').filter(Boolean);
              const audioSegments = [];

              const introPath = path.join(audioFolder, 'intro_' + ts + '.mp3');
              const outroPath = path.join(audioFolder, 'outro_' + ts + '.mp3');
              const mergedPath = path.join(audioFolder, 'sabian_podcast_full_' + ts + '.mp3');

              await generateSpeech(intro, process.env.HOST_A_US_ID, introPath);
              audioSegments.push(introPath);

               for (let i = 0; i < allLines.length; i++) {
  const line = allLines[i];
  const speaker = line.startsWith("Sabian:") ? process.env.SABIAN_VOICE_ID : process.env.HOST_A_US_ID;

  const cleanedLine = line
    .replace(/^Sabian:\s*/i, "")
    .replace(/^Host A:\s*/i, "")
    .replace(/\*/g, "") // removes asterisks
    .trim();

  const segmentPath = path.join(audioFolder, 'segment_' + i + '_' + ts + '.mp3');

  try {
    await generateSpeech(cleanedLine, speaker, segmentPath);
    audioSegments.push(segmentPath);
  } catch (err) {
    console.error("Failed to generate " + segmentPath + ":", err.message);
  }
}
          



                           await generateSpeech(outro, process.env.HOST_A_US_ID, outroPath);
              audioSegments.push(outroPath);

              const ffmpegChain = ffmpeg();
              audioSegments.forEach(segment => ffmpegChain.input(segment));

              ffmpegChain
                .on('end', () => {
                  console.log("\n🎧 Audio saved:");
                  console.log("- Merged Podcast:", mergedPath);

                  // 🧹 Cleanup: delete individual segments
                  audioSegments.forEach((file, index) => {
                    if (!file.includes('merged') && !file.includes('script')) {
                      fs.unlink(file, err => {
                        if (err) console.error("Failed to delete " + file + ":", err.message);
                      });
                    }
                  });

                  logToHive({
                    source: 'sabian_wizard',
                    level: 'complete',
                    event: '🧠 60 Second Insight Ritual Complete',
                    data: { session_id, business_name, business_problem, preview: raw.slice(0, 300) + '...' },
                    tags: ['first_contact', 'audio', 'insight']
                  });
                  console.log("\n🔁 Send this teaser to a friend. Real insight cuts deep.");
                  rl.close();
                })
                .on('error', err => {
                  console.error("❌ Merge failed:", err.message);
                  rl.close();
                })
                .mergeToFile(mergedPath);
            }) // End of .then
            .catch(err => {
              console.error("❌ Error from LLM:", err.response?.data || err.message);
              rl.close();
            }); // End of .catch
        }); // End rl.question (email)
      }); // End rl.question (name)
    }, 900); // End setTimeout
  }); // End rl.question (business_problem)
}); // End rl.question (business_name)


