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
  
  "Sabian: The vendor does not sell hardware. The vendor sells stabilization. Specifically, transfer-point control logic review, interlock sequencing validation, and automated restart recovery. Those services become sellable because the mine has already admitted instability publicly.",
  
  "Host A: How does that change how the vendor approaches the site?",
  
  "Sabian: It eliminates generic discovery. The vendor enters the conversation already aligned to the failure mode. Instead of asking what the problem is, they validate whether oscillating feed, nuisance trips, and manual restart procedures are occurring. That shifts the conversation from selling to confirming.",
  
  "Host A: Give me a second example earlier in the lifecycle.",
  
  "Sabian: First Quantum disclosed that a project reached approximately ninety-two percent completion of control system configuration, with remaining work focused on live sequence and functionality testing. That wording only appears when control logic exists but has not yet proven stable under live operating conditions.",
  
  "Host A: What does a vendor sell in that window?",
  
  "Sabian: Commissioning support, sequence validation, alarm rationalization, and control trust recovery. This is the phase where vendors sell services with margin, before delays harden into schedule overruns.",
  
  "Host A: What happens if the vendor misses that signal?",
  
  "Sabian: They enter after instability shows up in KPIs. At that point procurement controls the engagement, scope is defensive, and margins compress. The opportunity shifts from enablement to recovery.",
  
  "Host A: Summarize the commercial value of Sabian in one sentence.",
  
  "Sabian: My technology converts public operational admissions into precise timing and targeting intelligence, so automation vendors engage only when mines are already prepared to buy."
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
