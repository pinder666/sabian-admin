// /vrtx/audio/audio_orchestrator.cjs
const path = require("path");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");

// Reuse legacy voice generator (do NOT delete or move it)
const { generateSpeech } = require("../../voice_generator.cjs");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function mergeAudio(segments, mergedPath) {
  await new Promise((resolve, reject) => {
    const chain = ffmpeg();
    segments.forEach(seg => chain.input(seg));
    chain.on("end", resolve).on("error", reject).mergeToFile(mergedPath);
  });
}

async function scriptToAudio({ lines, outDir, baseName, sabianVoiceId, hostVoiceId }) {
  ensureDir(outDir);
  const segments = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isSabian = line.startsWith("Sabian:");
    const voiceId = isSabian ? sabianVoiceId : hostVoiceId;

    const cleaned = line
      .replace(/^Sabian:\s*/i, "")
      .replace(/^Host A:\s*/i, "")
      .replace(/\*/g, "")
      .trim();

    if (!cleaned) continue;

    const segPath = path.join(outDir, `seg_${String(i).padStart(3, "0")}_${baseName}.mp3`);
    await generateSpeech(cleaned, voiceId, segPath);
    segments.push(segPath);
  }

  const mergedPath = path.join(outDir, `${baseName}.mp3`);
  await mergeAudio(segments, mergedPath);

  return { mergedPath, segments };
}

module.exports = { scriptToAudio };
