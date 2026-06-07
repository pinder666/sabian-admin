require('dotenv').config();
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { generateSpeech } = require('./voice_generator.cjs');

const script = `
Host A: Sabian — the fashion industry loses more money to inefficiency than competition. What does PNSIQ actually do about it?

Sabian: It reads every order, every receivable, every unit in inventory. It reads court records, port data, factory on-time rates. And it connects what the brand can see to what the brand can't see — before the money is lost.

Host A: How does that help a CEO?

Sabian: The CEO doesn't dig through six systems to find the problem. The problem surfaces with the action already built. A dispute ready to file. An outreach ready to send. A buyer already matched to the inventory nobody knew how to move.

Host A: And what does that actually look like every day?

Sabian: One screen. Every signal that matters. Every decision ready. The CEO approves or rejects — and the business moves.
`;

async function generateLandingAudio() {
  const SABIAN_VOICE = process.env.SABIAN_VOICE_ID;
  const HOST_A_VOICE = process.env.HOST_A_US_ID;

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const audioDir = path.join(__dirname, 'audio_sessions');
  if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir);

  const dialogueLines = script
    .split('\n')
    .map(l => l.trim())
    .filter(l => /^host a:/i.test(l) || /^sabian:/i.test(l));

  const segDir = path.join(audioDir, `landing_segs_${ts}`);
  if (!fs.existsSync(segDir)) fs.mkdirSync(segDir, { recursive: true });

  const segments = [];
  for (let i = 0; i < dialogueLines.length; i++) {
    const isSabian = /^sabian:/i.test(dialogueLines[i]);
    const voiceId  = isSabian ? SABIAN_VOICE : HOST_A_VOICE;
    const spoken   = dialogueLines[i]
      .replace(/^host a:\s*/i, '')
      .replace(/^sabian:\s*/i, '')
      .trim();
    if (!spoken) continue;
    console.log(`🎙️ Generating line ${i + 1}: ${spoken.substring(0, 50)}...`);
    const segPath = path.join(segDir, `seg_${String(i).padStart(3, '0')}.mp3`);
    await generateSpeech(spoken, voiceId, segPath);
    segments.push(segPath);
  }

  const audioPath = path.join(audioDir, `landing_pnsiq_${ts}.mp3`);
  await new Promise((resolve, reject) => {
    const chain = ffmpeg();
    segments.forEach(s => chain.input(s));
    chain.on('end', resolve).on('error', reject).mergeToFile(audioPath);
  });

  segments.forEach(s => { try { fs.unlinkSync(s); } catch (_) {} });
  try { fs.rmdirSync(segDir); } catch (_) {}

  console.log(`✅ Landing audio generated: ${audioPath}`);

  const transcriptDir = path.join(__dirname, 'transcripts');
  if (!fs.existsSync(transcriptDir)) fs.mkdirSync(transcriptDir);
  fs.writeFileSync(path.join(transcriptDir, `landing_pnsiq_${ts}.txt`), script.trim());
}

generateLandingAudio().catch(console.error);
