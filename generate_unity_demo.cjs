require('dotenv').config();
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { v4: uuidv4 } = require('uuid');
const { generateSpeech } = require('./voice_generator.cjs');
const { logToHive } = require('./logger.cjs');

const session_id = uuidv4();
const experience = "EV";
const audioFolder = path.join(__dirname, 'my_audio');
if (!fs.existsSync(audioFolder)) fs.mkdirSync(audioFolder);
const ts = new Date().toISOString().replace(/[:.]/g, "-");
const script = [
 "Host A: Sabian, lets use a real disclosure and show exactly how an automation vendor turns it into revenue.",
  
  "Sabian: Nordic Mining disclosed significant operational and technical difficulties during ramp-up at the Engebø processing plant, including lower throughput, uptime loss, bottlenecks, and material handling constraints. That disclosure alone tells a control vendor the operation is compensating manually and the control layer is not stabilizing flow.",
  
  "Host A: Translate that directly into a vendor sales angle.",
  
  
  
];













(async function run() {
  const audioSegments = [];
  const mergedPath = path.join(audioFolder, `sabian_testdemo_${experience.toLowerCase()}_${ts}.mp3`);
  const scriptPath = path.join(audioFolder, `script_${experience}_${ts}.txt`);
  fs.writeFileSync(scriptPath, script.join("\n"));

  for (let i = 0; i < script.length; i++) {
    const line = script[i];
    const isSabian = line.startsWith("Sabian:");
    const voiceId = isSabian ? process.env.SABIAN_VOICE_ID : process.env.HOST_A_US_ID;

    const cleaned = line
      .replace(/^Sabian:\s*/i, "")
      .replace(/^Host A:\s*/i, "")
      .trim();

    const segmentPath = path.join(audioFolder, `seg_${i}_${ts}.mp3`);
    try {
      await generateSpeech(cleaned, voiceId, segmentPath);
      audioSegments.push(segmentPath);
    } catch (err) {
      console.error(`❌ Audio gen failed for segment ${i}:`, err.message);
    }
  }

  const chain = ffmpeg();
  audioSegments.forEach(seg => chain.input(seg));

  chain
    .on('end', () => {
      console.log(`🎧 EV Demo Audio Saved: ${mergedPath}`);
      logToHive({
        source: 'sabian_test_demo',
        level: 'complete',
        event: `✅ EV Audio Demo Complete`,
        data: { experience, session_id },
        tags: ['demo', 'audio']
      });
    })
    .on('error', err => {
      console.error("❌ Merge failed:", err.message);
    })
    .mergeToFile(mergedPath);
})();
