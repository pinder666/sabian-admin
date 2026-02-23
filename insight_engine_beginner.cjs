// SABIAN INSIGHT ENGINE — MILITARY GRADE AUDIO PODCAST SYSTEM (60 Second Insights)

require('dotenv').config({ path: './.env' });

const readline = require('readline');
const fs = require('fs');
const axios = require('axios');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { v4: uuidv4 } = require('uuid');
const { createClient } = require('@supabase/supabase-js');

const { generateSpeech } = require('./voice_generator.cjs');
const { logToHive } = require('./logger.cjs');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Supabase (optional – won’t crash if missing)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase =
  SUPABASE_URL && SUPABASE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_KEY)
    : null;

async function logUserToSupabase({ name, email, business_name, problem }) {
  if (!supabase) {
    console.log("ℹ️ Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing). Skipping user log.");
    return;
  }

  const { error } = await supabase.from('users').insert([
    { name, email, business_name, problem }
  ]);

  if (error) {
    console.error("❌ Supabase insert error:", error.message);
  } else {
    console.log("✅ User logged to Supabase.");
  }
}

function safeClose() {
  try { rl.close(); } catch (_) {}
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

// optional beep
try { process.stdout.write("\u0007"); } catch (_) {}

async function runFlow({ business_name, business_problem, user_name, user_email }) {
  // Hard fail if Gemini key missing (since this file is Gemini-based)
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY in .env");
  }

  const prompt = `🎮 DIRECTIVE: Generate a 60-second business strategy script for audio, starring two AI voices: Host A (the user's advocate) and Sabian (strategic AI brain).

This is not a chatbot. This is a high-pressure scripted performance.

📌 CHARACTERS:
Host A — Not the business owner. She may say "${user_name}’s business" or "the business." Ends with: “Sixty seconds. Excellent work.”

Sabian — No fluff. Speaks directly to ${user_name}. Only mention ${user_name} once if it feels natural. Tailors insight strictly to the problem. Acknowledges pressure. No enterprise solutions if business is small. Keeps logic actionable.

🔹 Host A opens with a fixed intro: "Welcome to 60 Second Insights. Today we’re helping ${user_name}’s business, ${business_name}. The challenge: ${business_problem}. Sabian, we have 60 seconds."
Sabian responds first, directly referencing the problem. Host A challenges vague logic. Both push for sharp insight.

📊 RULES:
- Dialogue only. No narration.
- Sabian starts. Host A ends with "Sixty seconds. Excellent work."
- Must feel mid-momentum at the 60s mark.
- Use realistic voice rhythm, energy, skepticism, urgency.
- No added issues or assumptions. Stay focused on the provided problem.
- Limit the entire script to 900 characters or less.
- Label each line exactly: "Sabian:" or "Host A:".

Now write the script.`;

  // 1) Generate script via Gemini
  const llmResponse = await axios.post(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + process.env.GEMINI_API_KEY,
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }]
    },
    { headers: { "Content-Type": "application/json" } }
  );

  const raw = llmResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

  if (!raw || !raw.toLowerCase().includes("sabian")) {
    throw new Error("Sabian did not respond (empty or invalid script).");
  }

  // 2) Prepare folders + write script
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const audioFolder = path.join(__dirname, 'my_audio');
  if (!fs.existsSync(audioFolder)) fs.mkdirSync(audioFolder);

  const scriptPath = path.join(audioFolder, `script_${ts}.txt`);
  fs.writeFileSync(scriptPath, raw, 'utf8');

  // 3) Segment generation (NO hardcoded intro/outro)
  const allLines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const audioSegments = [];

  const mergedPath = path.join(audioFolder, `sabian_podcast_full_${ts}.mp3`);

  // Ensure voice IDs exist
  if (!process.env.HOST_A_US_ID) throw new Error("Missing HOST_A_US_ID in .env");
  if (!process.env.SABIAN_VOICE_ID) throw new Error("Missing SABIAN_VOICE_ID in .env");

  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i];

    const speakerVoice =
      line.startsWith("Sabian:")
        ? process.env.SABIAN_VOICE_ID
        : process.env.HOST_A_US_ID;

    const cleanedLine = line
      .replace(/^Sabian:\s*/i, "")
      .replace(/^Host A:\s*/i, "")
      .replace(/\*/g, "")
      .trim();

    if (!cleanedLine) continue;

    const segmentPath = path.join(audioFolder, `segment_${i}_${ts}.mp3`);

    try {
      await generateSpeech(cleanedLine, speakerVoice, segmentPath);
      audioSegments.push(segmentPath);
    } catch (err) {
      console.error(`❌ Failed to generate segment ${i}:`, err.message);
    }
  }

  // 4) Merge
  await new Promise((resolve, reject) => {
    const ffmpegChain = ffmpeg();
    audioSegments.forEach(seg => ffmpegChain.input(seg));

    ffmpegChain
      .on('end', resolve)
      .on('error', reject)
      .mergeToFile(mergedPath);
  });

  console.log("\n🎧 Audio saved:");
  console.log("- Merged Podcast:", mergedPath);
  console.log("- Script:", scriptPath);

  // 5) Cleanup segments (keep merged + script)
  audioSegments.forEach(file => {
    if (file === mergedPath) return;
    fs.unlink(file, err => {
      if (err) console.error("❌ Failed to delete " + file + ":", err.message);
    });
  });

  // 6) Hive log
  logToHive({
    source: 'sabian_wizard',
    level: 'complete',
    event: '🧠 60 Second Insight Ritual Complete',
    data: {
      session_id,
      business_name,
      business_problem,
      user_name,
      user_email,
      preview: raw.slice(0, 300) + (raw.length > 300 ? '...' : ''),
      mergedPath
    },
    tags: ['first_contact', 'audio', 'insight']
  });

  console.log("\n🔁 Send this teaser to a friend. Real insight cuts deep.");
}

rl.question("Enter business name: ", (business_name) => {
  rl.question("What problem should Sabian solve?: ", (business_problem) => {
    console.log("🔄 One moment — Sabian is preparing your custom insight session...");

    setTimeout(() => {
      rl.question("Just before we begin — what’s your first name?: ", (user_name) => {
        rl.question("And what email should we send your insight to?: ", async (user_email) => {
          try {
            await logUserToSupabase({
              name: user_name,
              email: user_email,
              business_name,
              problem: business_problem
            });

            await runFlow({ business_name, business_problem, user_name, user_email });
            safeClose();
          } catch (err) {
            console.error("❌ Error:", err.response?.data || err.message);
            safeClose();
          }
        });
      });
    }, 900);
  });
});